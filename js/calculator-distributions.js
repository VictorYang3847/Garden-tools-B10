const K10 = Math.log(10 / 9);

function erf(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function inverseErf(p) {
  if (p <= -1 || p >= 1) return NaN;
  const a = 0.147;
  const sign = p < 0 ? -1 : 1;
  p = Math.abs(p);
  const ln1mp2 = Math.log(1 - p * p);
  const y1 = 2 / (Math.PI * a) + ln1mp2 / 2;
  const y2 = ln1mp2 / a;
  return sign * Math.sqrt(Math.sqrt(y1 * y1 - y2) - y1);
}

function normInv(p) {
  return Math.sqrt(2) * inverseErf(2 * p - 1);
}

function normCdf(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function prepareFailurePoints(failureTimes, censoredTimes = []) {
  const allFailures = [...failureTimes].filter((t) => t > 0).sort((a, b) => a - b);
  const allCensored = [...censoredTimes].filter((t) => t > 0);
  const n = allFailures.length + allCensored.length;
  if (allFailures.length < 2 || n < 3) {
    return { points: [], failureCount: 0, totalCount: n };
  }
  const allTimes = [
    ...allFailures.map((t) => ({ t, failed: true })),
    ...allCensored.map((t) => ({ t, failed: false })),
  ].sort((a, b) => a.t - b.t);

  const failureRanks = [];
  let prevRank = 0;
  let failureCount = 0;
  for (const item of allTimes) {
    if (item.failed) {
      failureCount++;
      const rank = (n * prevRank + 1) / (n + 1);
      failureRanks.push({ t: item.t, rank });
      prevRank = rank;
    }
  }
  return { points: failureRanks, failureCount, totalCount: n };
}

function linearRegression(xs, ys) {
  const n = xs.length;
  const sumX = xs.reduce((s, x) => s + x, 0);
  const sumY = ys.reduce((s, y) => s + y, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function calcRSquared(ys, yPred) {
  const n = ys.length;
  const yMean = ys.reduce((s, y) => s + y, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i] - yMean) ** 2;
    ssRes += (ys[i] - yPred[i]) ** 2;
  }
  return ssTot > 0 ? 1 - ssRes / ssTot : 0;
}

export function weibullBn(eta, beta, p) {
  if (eta <= 0 || beta <= 0 || p <= 0 || p >= 1) return null;
  return eta * Math.pow(-Math.log(1 - p), 1 / beta);
}

export function exponentialBn(lambda, p) {
  if (lambda <= 0 || p <= 0 || p >= 1) return null;
  return -Math.log(1 - p) / lambda;
}

export function lognormalBn(mu, sigma, p) {
  if (sigma <= 0 || p <= 0 || p >= 1) return null;
  return Math.exp(mu + sigma * normInv(p));
}

export function weibullR2(points, beta, eta) {
  if (!points || points.length < 2 || !beta || !eta) return null;
  const xs = points.map((p) => Math.log(p.t));
  const ys = points.map((p) => Math.log(Math.log(1 / (1 - p.rank))));
  const yPred = xs.map((x) => beta * x - beta * Math.log(eta));
  return calcRSquared(ys, yPred);
}

export function exponentialR2(points, lambda) {
  if (!points || points.length < 2 || !lambda) return null;
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => -Math.log(1 - p.rank));
  const yPred = xs.map((x) => lambda * x);
  return calcRSquared(ys, yPred);
}

export function lognormalR2(points, mu, sigma) {
  if (!points || points.length < 2 || !sigma) return null;
  const xs = points.map((p) => Math.log(p.t));
  const ys = points.map((p) => normInv(p.rank));
  const yPred = xs.map((x) => (x - mu) / sigma);
  return calcRSquared(ys, yPred);
}

export function fitWeibullRRX(failureTimes, censoredTimes = []) {
  const { points, failureCount, totalCount } = prepareFailurePoints(failureTimes, censoredTimes);
  if (points.length < 2) {
    return { beta: null, eta: null, b10: null, rSquared: null, points: [], failureCount, totalCount };
  }
  const xs = points.map((p) => Math.log(p.t));
  const ys = points.map((p) => Math.log(Math.log(1 / (1 - p.rank))));
  const { slope, intercept } = linearRegression(xs, ys);
  const beta = slope;
  const eta = Math.exp(-intercept / beta);
  const b10 = weibullBn(eta, beta, 0.1);
  const rSquared = weibullR2(points, beta, eta);
  const plotPoints = points.map((p) => ({
    t: p.t,
    rank: p.rank,
    x: Math.log(p.t),
    y: Math.log(Math.log(1 / (1 - p.rank))),
  }));
  return { beta, eta, b10, b50: weibullBn(eta, beta, 0.5), rSquared, points: plotPoints, failureCount, totalCount };
}

export function fitWeibullRRY(failureTimes, censoredTimes = []) {
  return fitWeibullRRX(failureTimes, censoredTimes);
}

export function fitWeibullMLE(failureTimes, censoredTimes = []) {
  const allFailures = [...failureTimes].filter((t) => t > 0).sort((a, b) => a - b);
  const allCensored = [...censoredTimes].filter((t) => t > 0);
  const nFail = allFailures.length;
  const nCens = allCensored.length;
  const n = nFail + nCens;
  if (nFail < 2 || n < 3) {
    return { beta: null, eta: null, b10: null, rSquared: null, points: [], failureCount: nFail, totalCount: n };
  }

  const { points } = prepareFailurePoints(failureTimes, censoredTimes);

  let beta = 2.2;
  for (let iter = 0; iter < 100; iter++) {
    let sumTbeta = 0;
    let sumTbetaLogT = 0;
    let sumLogT = 0;
    for (const t of allFailures) {
      sumTbeta += Math.pow(t, beta);
      sumTbetaLogT += Math.pow(t, beta) * Math.log(t);
      sumLogT += Math.log(t);
    }
    for (const t of allCensored) {
      sumTbeta += Math.pow(t, beta);
      sumTbetaLogT += Math.pow(t, beta) * Math.log(t);
    }
    const newBeta = nFail / (sumTbetaLogT / sumTbeta - sumLogT / nFail);
    if (Math.abs(newBeta - beta) < 1e-6) {
      beta = newBeta;
      break;
    }
    beta = newBeta;
  }

  let sumTbeta = 0;
  for (const t of allFailures) sumTbeta += Math.pow(t, beta);
  for (const t of allCensored) sumTbeta += Math.pow(t, beta);
  const eta = Math.pow(sumTbeta / nFail, 1 / beta);

  const b10 = weibullBn(eta, beta, 0.1);
  const rSquared = weibullR2(points, beta, eta);
  const plotPoints = points.map((p) => ({
    t: p.t,
    rank: p.rank,
    x: Math.log(p.t),
    y: Math.log(Math.log(1 / (1 - p.rank))),
  }));

  return { beta, eta, b10, b50: weibullBn(eta, beta, 0.5), rSquared, points: plotPoints, failureCount: nFail, totalCount: n };
}

export function fitExponentialRRX(failureTimes, censoredTimes = []) {
  const { points, failureCount, totalCount } = prepareFailurePoints(failureTimes, censoredTimes);
  if (points.length < 2) {
    return { lambda: null, b10: null, rSquared: null, points: [], failureCount, totalCount };
  }
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => -Math.log(1 - p.rank));
  const { slope, intercept } = linearRegression(xs, ys);
  const lambda = slope;
  if (lambda <= 0) {
    return { lambda: null, b10: null, rSquared: null, points: [], failureCount, totalCount };
  }
  const b10 = exponentialBn(lambda, 0.1);
  const rSquared = exponentialR2(points, lambda);
  const plotPoints = points.map((p) => ({
    t: p.t,
    rank: p.rank,
    x: p.t,
    y: -Math.log(1 - p.rank),
  }));
  return { lambda, b10, b50: exponentialBn(lambda, 0.5), rSquared, points: plotPoints, failureCount, totalCount };
}

export function fitExponentialMLE(failureTimes, censoredTimes = []) {
  const allFailures = [...failureTimes].filter((t) => t > 0);
  const allCensored = [...censoredTimes].filter((t) => t > 0);
  const nFail = allFailures.length;
  const nCens = allCensored.length;
  const n = nFail + nCens;
  if (nFail < 1 || n < 2) {
    return { lambda: null, b10: null, rSquared: null, points: [], failureCount: nFail, totalCount: n };
  }
  let totalTime = 0;
  for (const t of allFailures) totalTime += t;
  for (const t of allCensored) totalTime += t;
  const lambda = nFail / totalTime;
  const { points } = prepareFailurePoints(failureTimes, censoredTimes);
  const b10 = exponentialBn(lambda, 0.1);
  const rSquared = exponentialR2(points, lambda);
  const plotPoints = points.map((p) => ({
    t: p.t,
    rank: p.rank,
    x: p.t,
    y: -Math.log(1 - p.rank),
  }));
  return { lambda, b10, b50: exponentialBn(lambda, 0.5), rSquared, points: plotPoints, failureCount: nFail, totalCount: n };
}

export function fitLognormalRRX(failureTimes, censoredTimes = []) {
  const { points, failureCount, totalCount } = prepareFailurePoints(failureTimes, censoredTimes);
  if (points.length < 2) {
    return { mu: null, sigma: null, b10: null, rSquared: null, points: [], failureCount, totalCount };
  }
  const xs = points.map((p) => Math.log(p.t));
  const ys = points.map((p) => normInv(p.rank));
  const { slope, intercept } = linearRegression(xs, ys);
  const sigma = 1 / slope;
  const mu = -intercept / slope;
  if (sigma <= 0) {
    return { mu: null, sigma: null, b10: null, rSquared: null, points: [], failureCount, totalCount };
  }
  const b10 = lognormalBn(mu, sigma, 0.1);
  const rSquared = lognormalR2(points, mu, sigma);
  const plotPoints = points.map((p) => ({
    t: p.t,
    rank: p.rank,
    x: Math.log(p.t),
    y: normInv(p.rank),
  }));
  return { mu, sigma, b10, b50: lognormalBn(mu, sigma, 0.5), rSquared, points: plotPoints, failureCount, totalCount };
}

export function fitLognormalMLE(failureTimes, censoredTimes = []) {
  const allFailures = [...failureTimes].filter((t) => t > 0);
  const nFail = allFailures.length;
  const n = nFail + censoredTimes.length;
  if (nFail < 2 || n < 3) {
    return { mu: null, sigma: null, b10: null, rSquared: null, points: [], failureCount: nFail, totalCount: n };
  }

  let mu = 0;
  for (const t of allFailures) mu += Math.log(t);
  mu /= nFail;

  let sigma = 0;
  for (const t of allFailures) sigma += (Math.log(t) - mu) ** 2;
  sigma = Math.sqrt(sigma / nFail);
  if (sigma < 0.001) sigma = 0.001;

  const { points } = prepareFailurePoints(failureTimes, censoredTimes);
  const b10 = lognormalBn(mu, sigma, 0.1);
  const rSquared = lognormalR2(points, mu, sigma);
  const plotPoints = points.map((p) => ({
    t: p.t,
    rank: p.rank,
    x: Math.log(p.t),
    y: normInv(p.rank),
  }));

  return { mu, sigma, b10, b50: lognormalBn(mu, sigma, 0.5), rSquared, points: plotPoints, failureCount: nFail, totalCount: n };
}

export function exponentialCdf(t, lambda) {
  if (t <= 0 || lambda <= 0) return 0;
  return 1 - Math.exp(-lambda * t);
}

export function exponentialPdf(t, lambda) {
  if (t <= 0 || lambda <= 0) return 0;
  return lambda * Math.exp(-lambda * t);
}

export function lognormalCdf(t, mu, sigma) {
  if (t <= 0 || sigma <= 0) return 0;
  return normCdf((Math.log(t) - mu) / sigma);
}

export function lognormalPdf(t, mu, sigma) {
  if (t <= 0 || sigma <= 0) return 0;
  const z = (Math.log(t) - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (t * sigma * Math.sqrt(2 * Math.PI));
}

export function fitDistribution(distribution, method, failureTimes, censoredTimes = []) {
  const dist = (distribution || "weibull").toLowerCase();
  const meth = (method || "rrx").toLowerCase();

  if (dist === "weibull") {
    if (meth === "mle") return fitWeibullMLE(failureTimes, censoredTimes);
    return fitWeibullRRX(failureTimes, censoredTimes);
  }
  if (dist === "exponential") {
    if (meth === "mle") return fitExponentialMLE(failureTimes, censoredTimes);
    return fitExponentialRRX(failureTimes, censoredTimes);
  }
  if (dist === "lognormal") {
    if (meth === "mle") return fitLognormalMLE(failureTimes, censoredTimes);
    return fitLognormalRRX(failureTimes, censoredTimes);
  }
  return null;
}

export { K10, normInv, normCdf };
