// HTML 上の要素を取得
// ベンチマーク開始ボタン、ログ表示エリア、各表示欄を参照する
const startBenchmark = document.getElementById("start-benchmark");
const log = document.getElementById("log");

const displaySingleScore = document.getElementById("display-single-score");
const displayMultiScore = document.getElementById("display-multi-score");

// ベンチマークで使う定数
// 対象の数値は素因数分解の負荷をかけるための固定値
const FACTORIZATION_TARGET = 1145141919810;
const BENCHMARK_DURATION_MS = 10_000;

// 利用可能な CPU コア数を基に、マルチスレッド側のワーカー数を決定する
// ただし最低 2 つは使うようにする
const MULTI_WORKER_COUNT = Math.max(2, navigator.hardwareConcurrency || 4);

// 指定された数値の素因数分解を行い、因数の配列を返す
// 例: 12 => [2, 2, 3]
function primeFactorization(num) {
  const factors = [];
  let divisor = 2;

  while (divisor * divisor <= num) {
    while (num % divisor === 0) {
      factors.push(divisor);
      num /= divisor;
    }
    divisor++;
  }

  if (num > 1) {
    factors.push(num);
  }

  return factors;
}

// ログ表示欄にメッセージを出す
function updateLog(message) {
  log.textContent = message;
}

// UI の更新を最優先にするため、次のフレームまで待機させる
function waitForUi() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// シングルスレッドでベンチマークを実行する
async function runSingleBenchmark() {
  const deadline = performance.now() + BENCHMARK_DURATION_MS;
  let count = 0;

  while (performance.now() < deadline) {
    for (let i = 0; i < 1000 && performance.now() < deadline; i++) {
      primeFactorization(FACTORIZATION_TARGET);
      count++;
    }
    updateLog(`シングル計測中: ${count.toLocaleString()} 回`);
    await waitForUi();
  }

  return count;
}

// Worker 用のソースコードを Blob から生成する
// Web Worker 内で同じ素因数分解を実行できるようにするため
function createBenchmarkWorkerUrl() {
  const workerSource = `
${primeFactorization.toString()}

self.onmessage = (event) => {
  const { duration, target } = event.data;
  const deadline = performance.now() + duration;
  let count = 0;

  while (performance.now() < deadline) {
    primeFactorization(target);
    count++;
  }

  self.postMessage({ count });
};
`;

  return URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
}

// 1 つの Worker に対してベンチマークを実行する
function runWorkerBenchmark(workerUrl) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl);

    worker.onmessage = (event) => {
      worker.terminate();
      resolve(event.data.count);
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Worker benchmark failed"));
    };

    worker.postMessage({ duration: BENCHMARK_DURATION_MS, target: FACTORIZATION_TARGET });
  });
}

// マルチスレッドでベンチマークを実行する
// CPU コア数ごとに分割して並列処理を行う
async function runMultiBenchmark() {
  if (typeof Worker === "undefined") {
    throw new Error("このブラウザは Web Worker に対応していません");
  }

  const workerUrl = createBenchmarkWorkerUrl();
  let completedWorkers = 0;

  const tasks = Array.from({ length: MULTI_WORKER_COUNT }, (_, index) => {
    return runWorkerBenchmark(workerUrl).then((count) => {
      completedWorkers++;
      updateLog(`マルチ: ${completedWorkers} / ${MULTI_WORKER_COUNT} workers`);
      return count;
    });
  });

  try {
    const results = await Promise.all(tasks);
    return results.reduce((total, count) => total + count, 0);
  } finally {
    // Blob URL は使い終わったら破棄する
    URL.revokeObjectURL(workerUrl);
  }
}

// 「開始」ボタンを押したときの処理
startBenchmark.addEventListener("click", async () => {
  startBenchmark.disabled = true;

  try {
    updateLog("シングル計測を開始中...");
    const singleCount = await runSingleBenchmark();
    displaySingleScore.textContent = singleCount.toLocaleString();

    updateLog("マルチ計測中...");
    await waitForUi();
    const multiCount = await runMultiBenchmark();
    displayMultiScore.textContent = multiCount.toLocaleString();

    updateLog(`終了！`);

  } catch (error) {
    updateLog(`計測に失敗しました: ${error.message}`);
  } finally {
    // 二重実行防止のため、終了時にボタンを再度有効化する
    startBenchmark.disabled = false;
  }
});
