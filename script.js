// HTML 上の要素を取得
// ベンチマーク開始ボタン、ログ表示エリア、各表示欄を参照する
const startBenchmark = document.getElementById("start-benchmark");
const log = document.getElementById("log");

const displaySingleSeconds = document.getElementById("display-single-second");
const displayMultiSeconds = document.getElementById("display-multi-second");

const displaySingleScore = document.getElementById("display-single-score");
const displayMultiScore = document.getElementById("display-multi-score");
const displayTotalScore = document.getElementById("display-total-score");

// ベンチマークで使う定数
// 対象の数値は素因数分解の負荷をかけるための固定値
const FACTORIZATION_TARGET = 1145141919810;
const BENCHMARK_ITERATIONS = 364364;

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

// 秒数からスコアを算出する
// 0〜50 の範囲に収める
function calculateScore(seconds) {
  return Math.max(0, Math.min(50, 50 - Math.round(seconds)));
}

// スコアを指定範囲内に丸める補助関数
function clampScore(score, maxScore) {
  return Math.max(0, Math.min(maxScore, Math.round(score)));
}

// 調整済みスコアを算出する
function calculateAdjustedScore(seconds) {
  return clampScore(Math.trunc(calculateScore(seconds) - seconds), 50);
}

// 総合スコアを計算する
// シングル、マルチ、全体処理時間のバランスを重視する
function calculateTotalScore(singleScore, multiScore, totalSeconds) {
  return clampScore(singleScore + multiScore - Math.trunc(totalSeconds), 100);
}

// シングルスレッドでベンチマークを実行する
async function runSingleBenchmark() {
  const startTime = performance.now();
  let result = 0;

  for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
    // 1 回ごとに素因数分解を行い、因数の個数を加算する
    result += primeFactorization(FACTORIZATION_TARGET).length;

    // 途中経過をログに出し、UI の描画を空ける
    if (i % 1000 === 0 || i === BENCHMARK_ITERATIONS - 1) {
      updateLog(`シングル: ${i + 1} / ${BENCHMARK_ITERATIONS}`);
      await waitForUi();
    }
  }

  const endTime = performance.now();
  return {
    result,
    seconds: (endTime - startTime) / 1000,
  };
}

// Worker 用のソースコードを Blob から生成する
// Web Worker 内で同じ素因数分解を実行できるようにするため
function createBenchmarkWorkerUrl() {
  const workerSource = `
${primeFactorization.toString()}

self.onmessage = (event) => {
  const { iterations, target } = event.data;
  let result = 0;

  for (let i = 0; i < iterations; i++) {
    result += primeFactorization(target).length;
  }

  self.postMessage({ result });
};
`;

  return URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
}

// 1 つの Worker に対してベンチマークを実行する
function runWorkerBenchmark(workerUrl, iterations) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl);

    worker.onmessage = (event) => {
      worker.terminate();
      resolve(event.data.result);
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Worker benchmark failed"));
    };

    worker.postMessage({
      iterations,
      target: FACTORIZATION_TARGET,
    });
  });
}

// マルチスレッドでベンチマークを実行する
// CPU コア数ごとに分割して並列処理を行う
async function runMultiBenchmark() {
  if (typeof Worker === "undefined") {
    throw new Error("このブラウザは Web Worker に対応していません");
  }

  const startTime = performance.now();
  const workerUrl = createBenchmarkWorkerUrl();
  let completedWorkers = 0;

  // ワーカー数で処理を分割し、余りは前のワーカーに配分する
  const baseIterations = Math.floor(BENCHMARK_ITERATIONS / MULTI_WORKER_COUNT);
  const remainder = BENCHMARK_ITERATIONS % MULTI_WORKER_COUNT;
  const tasks = Array.from({ length: MULTI_WORKER_COUNT }, (_, index) => {
    const iterations = baseIterations + (index < remainder ? 1 : 0);

    return runWorkerBenchmark(workerUrl, iterations).then((result) => {
      completedWorkers++;
      updateLog(`マルチ: ${completedWorkers} / ${MULTI_WORKER_COUNT} workers`);
      return result;
    });
  });

  try {
    const results = await Promise.all(tasks);
    const endTime = performance.now();

    return {
      result: results.reduce((total, result) => total + result, 0),
      seconds: (endTime - startTime) / 1000,
      workers: MULTI_WORKER_COUNT,
    };
  } finally {
    // Blob URL は使い終わったら破棄する
    URL.revokeObjectURL(workerUrl);
  }
}

// 「開始」ボタンを押したときの処理
startBenchmark.addEventListener("click", async () => {
  startBenchmark.disabled = true;

  const totalStartTime = performance.now();

  try {
    updateLog("シングル計測を開始中...");
    const single = await runSingleBenchmark();
    const singleScore = calculateAdjustedScore(single.seconds);
    displaySingleSeconds.textContent = single.seconds.toFixed(3);
    displaySingleScore.textContent = singleScore;

    updateLog("マルチ計測を開始中...");
    await waitForUi();
    const multi = await runMultiBenchmark();
    const multiScore = calculateAdjustedScore(multi.seconds);
    displayMultiSeconds.textContent = multi.seconds.toFixed(3);
    displayMultiScore.textContent = multiScore;

    // シングルとマルチの最終結果が一致しているか確認
    if (single.result !== multi.result) {
      throw new Error("シングルとマルチの計算結果が一致しません");
    }

    const totalSeconds = (performance.now() - totalStartTime) / 1000;
    const totalScore = calculateTotalScore(singleScore, multiScore, totalSeconds);

    updateLog(`終了！`);

    displayTotalScore.textContent = totalScore;

  } catch (error) {
    updateLog(`計測に失敗しました: ${error.message}`);
  } finally {
    // 二重実行防止のため、終了時にボタンを再度有効化する
    startBenchmark.disabled = false;
  }
});
