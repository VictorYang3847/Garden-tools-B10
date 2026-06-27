/**
 * B10 life calculator for gardening tools (Weibull model)
 */

const K10 = Math.log(10 / 9); // ≈ 0.10536

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

export function partsB10(partValues) {
  const active = partValues.filter((p) => p.included && p.equivHours > 0);
  if (active.length === 0) {
    return { b10: 0, bottleneck: null };
  }

  let minB10 = Infinity;
  let bottleneck = null;

  for (const part of active) {
    if (part.equivHours < minB10) {
      minB10 = part.equivHours;
      bottleneck = part;
    }
  }

  return { b10: minB10, bottleneck };
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

  const { b10: b10Parts, bottleneck } = partsB10(partEntries);
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
    beta: 2.0,
    parts: {
      motor: { included: true, b10: 400, type: "brushless" },
      battery: { included: true, cycles: 300, hoursPerCycle: 0.5, capacity: 2.0 },
      gearbox: { included: true, b10: 350 },
      blade: { included: true, b10: 80, material: "SK5" },
      bearing: { included: true, b10: 500, model: "" },
    },
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
