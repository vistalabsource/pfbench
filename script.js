const startBenchmark = document.getElementById("start-benchmark");
const log = document.getElementById("log");
const benchTime = document.getElementById("bench-time");
const benchScore = document.getElementById("bench-score");

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

startBenchmark.addEventListener("click", async () => {
  const startTime = performance.now();

  startBenchmark.disabled = true;

  let result = 0;
  for (let i = 0; i < 364364; i++) {
    result += primeFactorization(1145141919810).length;

    if (i % 1000 === 0) {
      log.value = `${i}回目のループだゾ`;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const endTime = performance.now();
  const elapsedTime = endTime - startTime;
  const seconds = elapsedTime / 1000;

  log.value = `ンァッー！`;
  benchTime.textContent = `${seconds.toFixed(3)} 秒`;
  startBenchmark.disabled = false;
});