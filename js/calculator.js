/**
 * B10 life calculator for gardening tools (Weibull model)
 */

export const K10 = Math.log(10 / 9); // ≈ 0.10536

function genId() {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function weibullEta(b10, beta) {
  return b10 / Math.pow(K10, 1 / beta);
}

export function failureRate(t, b10, beta) {
  if (t <= 0 || b10 <= 0 || beta <= 0) return 0;
  const eta = weibullEta(b10, beta);
  return 1 - Math.exp(-Math.pow(t / eta, beta));
}

export function targetB10(tw, fw, beta, margin) {
  if (tw <= 0 || fw <= 0 || fw >= 1 || beta <= 0) return 0;
  const b10Calc = tw * Math.pow(K10 / -Math.log(1 - fw), 1 / beta);
  return b10Calc * (1 + margin);
}

export function targetB10WithoutMargin(tw, fw, beta) {
  if (tw <= 0 || fw <= 0 || fw >= 1 || beta <= 0) return 0;
  return tw * Math.pow(K10 / -Math.log(1 - fw), 1 / beta);
}

export function batteryEquivB10(cycles, hoursPerCycle) {
  return cycles * hoursPerCycle;
}

export function partsB10(partValues, beta = 2.2) {
  const active = partValues.filter((p) => p.included && p.equivHours > 0);
  if (active.length === 0) {
    return { b10: 0, bottleneck: null };
  }

  let sumInv = 0;
  let maxInv = 0;
  let bottleneck = null;

  for (const part of active) {
    const inv = 1 / Math.pow(part.equivHours, beta);
    sumInv += inv;
    if (inv > maxInv) {
      maxInv = inv;
      bottleneck = part;
    }
  }

  const b10 = sumInv > 0 ? Math.pow(sumInv, -1 / beta) : 0;
  return { b10, bottleneck };
}

export function confidenceToMargin(confidence) {
  return confidence === 95 ? 0.3 : 0.2;
}

export function calculateAll(inputs) {
  const tw = inputs.warrantyYears * inputs.hoursPerYear;
  const fw = inputs.acceptableFailureRate / 100;
  const beta = inputs.beta;
  const margin = inputs.safetyMargin / 100;

  const b10Calc = targetB10WithoutMargin(tw, fw, beta);
  const b10Target = targetB10(tw, fw, beta, margin);

  const batteryEquiv = batteryEquivB10(
    inputs.parts.battery.cycles,
    inputs.parts.battery.hoursPerCycle
  );

  const partEntries = [
    {
      id: "motor",
      name: "电机",
      included: inputs.parts.motor.included,
      b10: inputs.parts.motor.b10,
      unit: "h",
      equivHours: inputs.parts.motor.b10,
    },
    {
      id: "battery",
      name: "电池包",
      included: inputs.parts.battery.included,
      b10: inputs.parts.battery.cycles,
      unit: "循环",
      equivHours: batteryEquiv,
      hoursPerCycle: inputs.parts.battery.hoursPerCycle,
    },
    {
      id: "gearbox",
      name: "齿轮箱/传动",
      included: inputs.parts.gearbox.included,
      b10: inputs.parts.gearbox.b10,
      unit: "h",
      equivHours: inputs.parts.gearbox.b10,
    },
    {
      id: "blade",
      name: "刀片组件",
      included: inputs.parts.blade.included,
      b10: inputs.parts.blade.b10,
      unit: "h",
      equivHours: inputs.parts.blade.b10,
    },
    {
      id: "bearing",
      name: "轴承",
      included: inputs.parts.bearing.included,
      b10: inputs.parts.bearing.b10,
      unit: "h",
      equivHours: inputs.parts.bearing.b10,
    },
  ];

  const { b10: b10Parts, bottleneck } = partsB10(partEntries, beta);
  const fAtWarranty = failureRate(tw, b10Parts, beta);
  const pass = fAtWarranty <= fw;
  const gap = b10Parts - b10Target;
  const b10MinNoMargin = b10Calc;
  const b10MinWithMargin = b10Target;

  return {
    tw,
    fw,
    beta,
    margin,
    b10Calc,
    b10Target,
    b10Parts,
    bottleneck,
    partEntries,
    fAtWarranty,
    pass,
    gap,
    b10MinNoMargin,
    b10MinWithMargin,
  };
}

export function defaultModelRecord(modelName = "HT-550-Li") {
  return {
    modelName,
    projectCode: "",
    voltage: 18,
    power: 450,
    bladeType: "double",
    bladeLength: 550,
    strokeRate: 3000,
    analyst: "",
    note: "",
    updatedAt: new Date().toISOString(),
  };
}

export function defaultModelDefinition() {
  return {
    scenarioName: "默认场景",
    scenarioNote: "",
    hoursPerYear: 25,
    dutyCycle: 60,
    continuousRunMin: 15,
    warrantyYears: 2,
    acceptableFailureRate: 2,
    confidence: 90,
    safetyMargin: 20,
    failureDefinition: "performance",
    performanceThreshold: 70,
    beta: 2.2,
    parts: {
      motor: { included: true, b10: 400, type: "brushless" },
      battery: { included: true, cycles: 300, hoursPerCycle: 0.5, capacity: 2.0 },
      gearbox: { included: true, b10: 350 },
      blade: { included: true, b10: 80, material: "SK5" },
      bearing: { included: true, b10: 500, model: "" },
    },
  };
}

export function calcSampleSize(targetB10, censoringType, confidence = 0.9, allowedFailures = 1) {
  if (!targetB10 || targetB10 <= 0) return { sampleSize: 0, testDuration: 0 };
  const baseSamples = { time: 12, complete: 15, failure_count: 20 };
  let n = baseSamples[censoringType] || 12;
  if (confidence >= 0.95) n = Math.ceil(n * 1.3);
  if (allowedFailures > 1) n = Math.ceil(n * (1 + allowedFailures * 0.15));
  n = Math.max(n, 5);
  const durationMultiplier = censoringType === "time" ? 1.2 : censoringType === "complete" ? 1.5 : 1.3;
  const testDuration = targetB10 * durationMultiplier;
  return { sampleSize: n, testDuration };
}

export function suggestPlanningItems(definitionResult, isWearPart = {}) {
  const items = [];
  items.push({
    id: "product",
    name: "整机",
    targetB10: definitionResult.b10Target,
    isWearPart: false,
  });
  for (const part of definitionResult.partEntries) {
    if (!part.included) continue;
    items.push({
      id: part.id,
      name: part.name,
      targetB10: part.equivHours,
      unit: part.unit,
      isWearPart: ["blade", "bearing", "gearbox"].includes(part.id),
    });
  }
  return items;
}

export function medianRank(i, n) {
  return (i - 0.3) / (n + 0.4);
}

export function weibullFit(failureTimes, censoredTimes = []) {
  const allFailures = [...failureTimes].filter((t) => t > 0).sort((a, b) => a - b);
  const allCensored = [...censoredTimes].filter((t) => t > 0);
  const n = allFailures.length + allCensored.length;
  if (allFailures.length < 2 || n < 3) {
    return { beta: null, eta: null, b10: null, rSquared: null, points: [] };
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
    } else {
      prevRank = prevRank;
    }
  }
  if (failureRanks.length < 2) {
    return { beta: null, eta: null, b10: null, rSquared: null, points: [] };
  }
  const xs = failureRanks.map((p) => Math.log(p.t));
  const ys = failureRanks.map((p) => Math.log(Math.log(1 / (1 - p.rank))));
  const nPoints = xs.length;
  const sumX = xs.reduce((s, x) => s + x, 0);
  const sumY = ys.reduce((s, y) => s + y, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);
  const beta = (nPoints * sumXY - sumX * sumY) / (nPoints * sumXX - sumX * sumX);
  const alpha = (sumY - beta * sumX) / nPoints;
  const eta = Math.exp(-alpha / beta);
  const b10 = eta * Math.pow(K10, 1 / beta);
  const yMean = sumY / nPoints;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < nPoints; i++) {
    const yPred = alpha + beta * xs[i];
    ssTot += (ys[i] - yMean) ** 2;
    ssRes += (ys[i] - yPred) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const points = failureRanks.map((p) => ({
    t: p.t,
    rank: p.rank,
    x: Math.log(p.t),
    y: Math.log(Math.log(1 / (1 - p.rank))),
  }));
  return { beta, eta, b10, rSquared, points, failureCount, totalCount: n };
}

export function weibullCdf(t, eta, beta) {
  if (t <= 0 || eta <= 0 || beta <= 0) return 0;
  return 1 - Math.exp(-Math.pow(t / eta, beta));
}

export function weibullPdf(t, eta, beta) {
  if (t <= 0 || eta <= 0 || beta <= 0) return 0;
  return (beta / eta) * Math.pow(t / eta, beta - 1) * Math.exp(-Math.pow(t / eta, beta));
}

export function calcAnalysisResult(batches, targetB10) {
  const allFailures = [];
  const allCensored = [];
  const failureModes = {};
  const partFailures = {};
  for (const batch of batches) {
    for (const item of batch.items || []) {
      if (item.failed) {
        allFailures.push(item.time);
        if (item.failureMode) {
          failureModes[item.failureMode] = (failureModes[item.failureMode] || 0) + 1;
        }
        if (item.part) {
          partFailures[item.part] = (partFailures[item.part] || 0) + 1;
        }
      } else {
        allCensored.push(item.time);
      }
    }
  }
  const fit = weibullFit(allFailures, allCensored);
  const pass = fit.b10 != null && targetB10 != null ? fit.b10 >= targetB10 : null;
  const gap = fit.b10 != null && targetB10 != null ? fit.b10 - targetB10 : null;
  return {
    fit,
    pass,
    gap,
    targetB10,
    totalSamples: allFailures.length + allCensored.length,
    failureCount: allFailures.length,
    failureModes,
    partFailures,
  };
}

export function defaultPlanningItem(id, name, targetB10 = 0) {
  return {
    id,
    name,
    targetB10,
    censoringType: "time",
    allowedFailures: 1,
    sampleSize: null,
    testDuration: null,
    benchCondition: "",
    note: "",
  };
}

export function defaultAnalysisBatch(name = "试验批次 1") {
  return {
    id: genId(),
    name,
    part: "product",
    startDate: new Date().toISOString().slice(0, 10),
    items: [],
    note: "",
  };
}

/** @deprecated use defaultModelRecord + defaultModelDefinition */
export function defaultInputs() {
  const record = defaultModelRecord();
  const definition = defaultModelDefinition();
  return {
    model: record.modelName,
    ...record,
    ...definition,
    parts: {
      ...definition.parts,
      motor: { ...definition.parts.motor },
      battery: { ...definition.parts.battery, capacity: definition.parts.battery.capacity },
      blade: { ...definition.parts.blade, material: definition.parts.blade.material },
      bearing: { ...definition.parts.bearing, model: definition.parts.bearing.model },
    },
    analyst: record.analyst,
    note: record.note,
  };
}

export {
  fitWeibullRRX,
  fitWeibullRRY,
  fitWeibullMLE,
  fitExponentialRRX,
  fitExponentialMLE,
  fitLognormalRRX,
  fitLognormalMLE,
  weibullBn,
  exponentialBn,
  lognormalBn,
  weibullR2,
  exponentialR2,
  lognormalR2,
  exponentialCdf,
  exponentialPdf,
  lognormalCdf,
  lognormalPdf,
  fitDistribution,
} from "./calculator-distributions.js?v=1.0.5";

/**
 * Gamma function (Lanczos approximation)
 * Used for MTBF = eta * Gamma(1 + 1/beta)
 */
export function gammaApprox(x) {
  if (x <= 0) return Infinity;
  if (x === 1) return 1;
  if (x < 1) {
    return gammaApprox(x + 1) / x;
  }
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

/**
 * Calculate MTBF from Weibull parameters
 * MTBF = eta * Gamma(1 + 1/beta)
 */
export function calcMtbf(eta, beta) {
  if (eta <= 0 || beta <= 0) return 0;
  return eta * gammaApprox(1 + 1 / beta);
}
