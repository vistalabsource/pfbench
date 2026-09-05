const startBenchmark = document.getElementById("start-benchmark");
const log = document.getElementById("log");
const benchTime = document.getElementById("bench-time");
const benchScoreSingle = document.getElementById("bench-score-single");
const benchScoreMulti = document.getElementById("bench-score-multi");
const resultScore = document.getElementById("result-score");

const FACTORIZATION_TARGET = 1145141919810;
const BENCHMARK_ITERATIONS = 364364;
const MULTI_WORKER_COUNT = Math.max(2, navigator.hardwareConcurrency || 4);

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

function updateLog(message) {
  log.value = message;
}

function waitForUi() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function calculateScore(seconds) {
  return Math.max(0, Math.min(50, 50 - Math.round(seconds)));
}

function clampScore(score, maxScore) {
  return Math.max(0, Math.min(maxScore, Math.round(score)));
}

function calculateAdjustedScore(seconds) {
  return clampScore(calculateScore(seconds) - Math.trunc(seconds), 50);
}

function calculateTotalScore(singleScore, multiScore, totalSeconds) {
  return clampScore(singleScore + multiScore - Math.trunc(totalSeconds), 100);
}

async function runSingleBenchmark() {
  const startTime = performance.now();
  let result = 0;

  for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
    result += primeFactorization(FACTORIZATION_TARGET).length;

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

async function runMultiBenchmark() {
  if (typeof Worker === "undefined") {
    throw new Error("このブラウザは Web Worker に対応していません");
  }

  const startTime = performance.now();
  const workerUrl = createBenchmarkWorkerUrl();
  let completedWorkers = 0;

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
    URL.revokeObjectURL(workerUrl);
  }
}

startBenchmark.addEventListener("click", async () => {
  startBenchmark.disabled = true;

  const totalStartTime = performance.now();

  try {
    updateLog("シングル計測を開始中...");
    const single = await runSingleBenchmark();
    const singleScore = calculateAdjustedScore(single.seconds);

    updateLog("マルチ計測を開始中...");
    await waitForUi();
    const multi = await runMultiBenchmark();
    const multiScore = calculateAdjustedScore(multi.seconds);

    if (single.result !== multi.result) {
      throw new Error("シングルとマルチの計算結果が一致しません");
    }

    const totalSeconds = (performance.now() - totalStartTime) / 1000;
    const totalScore = calculateTotalScore(singleScore, multiScore, totalSeconds);
    updateLog(
      `終了！\n\n\n---\nシングル: ${single.seconds.toFixed(3)} 秒\nマルチ: ${multi.seconds.toFixed(3)} 秒 (${multi.workers} workers)\n---\nシングル得点: ${singleScore} / 50\nマルチ得点: ${multiScore} / 50\n---\n総合得点: ${totalScore} / 100\n---`
    );
  } catch (error) {
    updateLog(`計測に失敗しました: ${error.message}`);
  } finally {
    startBenchmark.disabled = false;
  }
});
