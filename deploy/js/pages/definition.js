import {
  calculateAll,
  confidenceToMargin,
  defaultModelDefinition,
  defaultModelRecord,
} from "../calculator.js";
import { mergeInputs } from "../store.js";
import { fmt, pct, toast } from "../utils.js";

let form = null;
let onSaveCallback = null;

export function initDefinitionPage(onSave) {
  onSaveCallback = onSave;
  form = document.getElementById("definition-form");

  form.confidence.addEventListener("change", () => {
    form.safetyMargin.value = confidenceToMargin(Number(form.confidence.value)) * 100;
  });

  form.warrantyYears.addEventListener("input", updateWarrantyHours);
  form.hoursPerYear.addEventListener("input", updateWarrantyHours);
  form.batteryCycles.addEventListener("input", updateBatteryEquiv);
  form.batteryHoursPerCycle.addEventListener("input", updateBatteryEquiv);

  document.getElementById("def-calculate").addEventListener("click", onCalculate);
  document.getElementById("def-save").addEventListener("click", onSaveForm);
  document.getElementById("def-reset").addEventListener("click", onReset);
  document.getElementById("copy-summary").addEventListener("click", onCopySummary);
}

function readRecord() {
  const fd = new FormData(form);
  return {
    modelName: fd.get("modelName") || "",
    projectCode: fd.get("projectCode") || "",
    voltage: Number(fd.get("voltage")),
    power: Number(fd.get("power")) || 0,
    bladeType: fd.get("bladeType"),
    bladeLength: Number(fd.get("bladeLength")) || 0,
    strokeRate: Number(fd.get("strokeRate")) || 0,
    analyst: fd.get("analyst") || "",
    note: fd.get("note") || "",
    updatedAt: new Date().toISOString(),
  };
}

function readDefinition() {
  const fd = new FormData(form);
  return {
    scenarioName: fd.get("scenarioName") || "",
    scenarioNote: fd.get("scenarioNote") || "",
    hoursPerYear: Number(fd.get("hoursPerYear")),
    dutyCycle: Number(fd.get("dutyCycle")) || 0,
    continuousRunMin: Number(fd.get("continuousRunMin")) || 0,
    warrantyYears: Number(fd.get("warrantyYears")),
    acceptableFailureRate: Number(fd.get("acceptableFailureRate")),
    confidence: Number(fd.get("confidence")),
    safetyMargin: Number(fd.get("safetyMargin")),
    failureDefinition: fd.get("failureDefinition"),
    performanceThreshold: Number(fd.get("performanceThreshold")) || 70,
    beta: Number(fd.get("beta")),
    parts: {
      motor: {
        included: fd.get("motorIncluded") === "on",
        b10: Number(fd.get("motorB10")),
        type: fd.get("motorType"),
      },
      battery: {
        included: fd.get("batteryIncluded") === "on",
        cycles: Number(fd.get("batteryCycles")),
        hoursPerCycle: Number(fd.get("batteryHoursPerCycle")),
        capacity: Number(fd.get("batteryCapacity")) || 0,
      },
      gearbox: {
        included: fd.get("gearboxIncluded") === "on",
        b10: Number(fd.get("gearboxB10")),
      },
      blade: {
        included: fd.get("bladeIncluded") === "on",
        b10: Number(fd.get("bladeB10")),
        material: fd.get("bladeMaterial") || "",
      },
      bearing: {
        included: fd.get("bearingIncluded") === "on",
        b10: Number(fd.get("bearingB10")),
        model: fd.get("bearingModel") || "",
      },
    },
  };
}

export function readModelFromForm() {
  return {
    record: readRecord(),
    definition: readDefinition(),
  };
}

export function fillDefinitionForm(model) {
  const { record, definition: def } = model;

  form.modelName.value = record.modelName ?? model.name;
  form.projectCode.value = record.projectCode ?? "";
  form.voltage.value = record.voltage;
  form.power.value = record.power;
  form.bladeType.value = record.bladeType;
  form.bladeLength.value = record.bladeLength;
  form.strokeRate.value = record.strokeRate;
  form.analyst.value = record.analyst ?? "";
  form.note.value = record.note ?? "";

  form.scenarioName.value = def.scenarioName;
  form.scenarioNote.value = def.scenarioNote ?? "";
  form.hoursPerYear.value = def.hoursPerYear;
  form.dutyCycle.value = def.dutyCycle;
  form.continuousRunMin.value = def.continuousRunMin;
  form.warrantyYears.value = def.warrantyYears;
  form.acceptableFailureRate.value = def.acceptableFailureRate;
  form.confidence.value = String(def.confidence);
  form.safetyMargin.value = def.safetyMargin;
  form.failureDefinition.value = def.failureDefinition;
  form.performanceThreshold.value = def.performanceThreshold;
  form.beta.value = def.beta;

  form.motorIncluded.checked = def.parts.motor.included;
  form.motorB10.value = def.parts.motor.b10;
  form.motorType.value = def.parts.motor.type;
  form.batteryIncluded.checked = def.parts.battery.included;
  form.batteryCycles.value = def.parts.battery.cycles;
  form.batteryHoursPerCycle.value = def.parts.battery.hoursPerCycle;
  form.batteryCapacity.value = def.parts.battery.capacity;
  form.gearboxIncluded.checked = def.parts.gearbox.included;
  form.gearboxB10.value = def.parts.gearbox.b10;
  form.bladeIncluded.checked = def.parts.blade.included;
  form.bladeB10.value = def.parts.blade.b10;
  form.bladeMaterial.value = def.parts.blade.material ?? "";
  form.bearingIncluded.checked = def.parts.bearing.included;
  form.bearingB10.value = def.parts.bearing.b10;
  form.bearingModel.value = def.parts.bearing.model ?? "";

  updateBatteryEquiv();
  updateWarrantyHours();

  if (model.lastResult) {
    renderResults(model, model.lastResult);
  } else {
    document.getElementById("definition-results").hidden = true;
  }
}

function updateWarrantyHours() {
  const years = Number(form.warrantyYears.value) || 0;
  const hy = Number(form.hoursPerYear.value) || 0;
  document.getElementById("warranty-hours-display").textContent = fmt(years * hy, 0);
}

function updateBatteryEquiv() {
  const cycles = Number(form.batteryCycles.value) || 0;
  const hpc = Number(form.batteryHoursPerCycle.value) || 0;
  document.getElementById("battery-equiv").textContent = fmt(cycles * hpc, 1);
}

function renderChart(parts, targetB10, bottleneckId) {
  const chartBars = document.getElementById("chart-bars");
  chartBars.innerHTML = "";
  const maxVal = Math.max(
    targetB10,
    ...parts.filter((p) => p.included).map((p) => p.equivHours),
    1
  );

  for (const part of parts) {
    if (!part.included) continue;
    const row = document.createElement("div");
    row.className = "chart-row" + (part.id === bottleneckId ? " bottleneck" : "");
    row.innerHTML = `
      <span class="chart-label">${part.name}</span>
      <div class="chart-track"><div class="chart-fill" style="width:${(part.equivHours / maxVal) * 100}%"></div></div>
      <span class="chart-value">${
        part.id === "battery"
          ? `${fmt(part.b10, 0)} 循环 (${fmt(part.equivHours, 1)} h)`
          : `${fmt(part.equivHours, 0)} h`
      }</span>`;
    chartBars.appendChild(row);
  }

  const targetRow = document.createElement("div");
  targetRow.className = "chart-row target-line";
  targetRow.innerHTML = `
    <span class="chart-label">目标 B10</span>
    <div class="chart-track"><div class="chart-fill target" style="width:${(targetB10 / maxVal) * 100}%"></div></div>
    <span class="chart-value">${fmt(targetB10, 0)} h</span>`;
  chartBars.appendChild(targetRow);
}

function buildSummary(model, inputs, result) {
  const lines = [
    "=== 测试标准 / 产品定义 ===",
    `项目型号: ${model.name}`,
    `场景: ${inputs.scenarioName} (${inputs.hoursPerYear} h/年)`,
    `保修: ${inputs.warrantyYears} 年, 累计 ${fmt(result.tw, 0)} h`,
    `可接受失效率: ${inputs.acceptableFailureRate}%`,
    `β = ${inputs.beta}, 安全余量 ${inputs.safetyMargin}%`,
    "",
    `目标整机 B10: ${fmt(result.b10Target, 1)} h (含余量)`,
    `零件合成 B10: ${fmt(result.b10Parts, 1)} h`,
    `瓶颈零件: ${result.bottleneck?.name ?? "—"}`,
    `目标差距: ${fmt(result.gap, 1)} h`,
    `保修末预测失效率: ${pct(result.fAtWarranty)}`,
    `验证结果: ${result.pass ? "通过" : "未通过"}`,
    "",
    "零件明细:",
  ];

  for (const p of result.partEntries) {
    if (!p.included) continue;
    const val =
      p.id === "battery"
        ? `${fmt(p.b10, 0)} 循环 → ${fmt(p.equivHours, 1)} h`
        : `${fmt(p.equivHours, 0)} h`;
    const mark = p.id === result.bottleneck?.id ? " ← 瓶颈" : "";
    lines.push(`  ${p.name}: ${val}${mark}`);
  }

  return lines.join("\n");
}

export function renderResults(model, result) {
  const inputs = mergeInputs(model.record, model.definition);
  const section = document.getElementById("definition-results");
  section.hidden = false;

  document.getElementById("result-target-b10").textContent = fmt(result.b10Target, 0);
  document.getElementById("result-parts-b10").textContent = fmt(result.b10Parts, 0);
  document.getElementById("result-bottleneck").textContent = result.bottleneck?.name ?? "—";
  document.getElementById("result-gap").textContent = fmt(result.gap, 0);
  document.getElementById("result-gap").className =
    "metric-value " + (result.gap >= 0 ? "pass" : "fail");
  document.getElementById("result-f-warranty").textContent = pct(result.fAtWarranty);
  document.getElementById("result-b10-calc").textContent = fmt(result.b10Calc, 0);
  document.getElementById("result-tw").textContent = fmt(result.tw, 0);
  document.getElementById("result-min-no-margin").textContent = fmt(result.b10MinNoMargin, 0);
  document.getElementById("result-min-with-margin").textContent = fmt(result.b10MinWithMargin, 0);

  const banner = document.getElementById("status-banner");
  banner.className = "status-banner " + (result.pass ? "pass" : "fail");
  banner.textContent = result.pass
    ? `验证通过：保修末 ${fmt(result.tw, 0)} h 时预测失效率 ${pct(result.fAtWarranty)} ≤ 目标 ${inputs.acceptableFailureRate}%`
    : `未通过：保修末 ${fmt(result.tw, 0)} h 时预测失效率 ${pct(result.fAtWarranty)} > 目标 ${inputs.acceptableFailureRate}%。瓶颈「${result.bottleneck?.name ?? "—"}」需从 ${fmt(result.bottleneck?.equivHours ?? 0, 0)} h 提升至 ≥ ${fmt(result.b10MinWithMargin, 0)} h（含余量）`;

  renderChart(result.partEntries, result.b10Target, result.bottleneck?.id);
  document.getElementById("copy-summary").dataset.summary = buildSummary(model, inputs, result);
}

function onCalculate() {
  const data = readModelFromForm();
  const inputs = mergeInputs(data.record, data.definition);
  const result = calculateAll(inputs);
  const model = { name: data.record.modelName, record: data.record, definition: data.definition };
  renderResults(model, result);
  onSaveCallback?.({ ...data, lastResult: result, auto: true });
  document.getElementById("definition-results").scrollIntoView({ behavior: "smooth" });
}

function onSaveForm() {
  const data = readModelFromForm();
  onSaveCallback?.({ ...data, auto: false });
  toast(document.getElementById("def-save"), "已保存", 1500);
}

function onReset() {
  fillDefinitionForm({
    name: "HT-550-Li",
    record: defaultModelRecord("HT-550-Li"),
    definition: defaultModelDefinition(),
    lastResult: null,
  });
}

async function onCopySummary() {
  const btn = document.getElementById("copy-summary");
  const text = btn.dataset.summary;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast(btn, "已复制", 1500);
  } catch {
    toast(btn, "复制失败", 1500);
  }
}

export function getLastResultFromForm() {
  const data = readModelFromForm();
  const inputs = mergeInputs(data.record, data.definition);
  return calculateAll(inputs);
}
