import {
  calculateAll,
  confidenceToMargin,
  defaultInputs,
} from "./calculator.js";

const STORAGE_KEY = "b10-hedge-trimmer-v1";

const form = document.getElementById("calc-form");
const resultsSection = document.getElementById("results");
const chartBars = document.getElementById("chart-bars");
const statusBanner = document.getElementById("status-banner");
const copyBtn = document.getElementById("copy-summary");
const resetBtn = document.getElementById("reset-defaults");
const confidenceSelect = document.getElementById("confidence");
const marginInput = document.getElementById("safety-margin");
const batteryCycles = document.getElementById("battery-cycles");
const batteryHoursPerCycle = document.getElementById("battery-hours-per-cycle");
const batteryEquivDisplay = document.getElementById("battery-equiv");

function readForm() {
  const fd = new FormData(form);
  const confidence = Number(fd.get("confidence"));
  const marginFromForm = Number(fd.get("safetyMargin"));

  return {
    model: fd.get("model") || "",
    voltage: Number(fd.get("voltage")),
    power: Number(fd.get("power")) || 0,
    bladeType: fd.get("bladeType"),
    bladeLength: Number(fd.get("bladeLength")) || 0,
    strokeRate: Number(fd.get("strokeRate")) || 0,
    scenarioName: fd.get("scenarioName") || "",
    scenarioNote: fd.get("scenarioNote") || "",
    hoursPerYear: Number(fd.get("hoursPerYear")),
    dutyCycle: Number(fd.get("dutyCycle")) || 0,
    continuousRunMin: Number(fd.get("continuousRunMin")) || 0,
    warrantyYears: Number(fd.get("warrantyYears")),
    acceptableFailureRate: Number(fd.get("acceptableFailureRate")),
    confidence,
    safetyMargin: marginFromForm,
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
    analyst: fd.get("analyst") || "",
    note: fd.get("note") || "",
  };
}

function fillForm(data) {
  form.model.value = data.model;
  form.voltage.value = data.voltage;
  form.power.value = data.power;
  form.bladeType.value = data.bladeType;
  form.bladeLength.value = data.bladeLength;
  form.strokeRate.value = data.strokeRate;
  form.scenarioName.value = data.scenarioName;
  form.scenarioNote.value = data.scenarioNote;
  form.hoursPerYear.value = data.hoursPerYear;
  form.dutyCycle.value = data.dutyCycle;
  form.continuousRunMin.value = data.continuousRunMin;
  form.warrantyYears.value = data.warrantyYears;
  form.acceptableFailureRate.value = data.acceptableFailureRate;
  form.confidence.value = String(data.confidence);
  form.safetyMargin.value = data.safetyMargin;
  form.failureDefinition.value = data.failureDefinition;
  form.performanceThreshold.value = data.performanceThreshold;
  form.beta.value = data.beta;
  form.motorIncluded.checked = data.parts.motor.included;
  form.motorB10.value = data.parts.motor.b10;
  form.motorType.value = data.parts.motor.type;
  form.batteryIncluded.checked = data.parts.battery.included;
  form.batteryCycles.value = data.parts.battery.cycles;
  form.batteryHoursPerCycle.value = data.parts.battery.hoursPerCycle;
  form.batteryCapacity.value = data.parts.battery.capacity;
  form.gearboxIncluded.checked = data.parts.gearbox.included;
  form.gearboxB10.value = data.parts.gearbox.b10;
  form.bladeIncluded.checked = data.parts.blade.included;
  form.bladeB10.value = data.parts.blade.b10;
  form.bladeMaterial.value = data.parts.blade.material;
  form.bearingIncluded.checked = data.parts.bearing.included;
  form.bearingB10.value = data.parts.bearing.b10;
  form.bearingModel.value = data.parts.bearing.model;
  form.analyst.value = data.analyst;
  form.note.value = data.note;
  updateBatteryEquiv();
  updateWarrantyHours();
}

function fmt(n, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function pct(n, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  return (n * 100).toFixed(digits) + "%";
}

function updateWarrantyHours() {
  const years = Number(form.warrantyYears.value) || 0;
  const hy = Number(form.hoursPerYear.value) || 0;
  document.getElementById("warranty-hours-display").textContent = fmt(
    years * hy,
    0
  );
}

function updateBatteryEquiv() {
  const cycles = Number(batteryCycles.value) || 0;
  const hpc = Number(batteryHoursPerCycle.value) || 0;
  batteryEquivDisplay.textContent = fmt(cycles * hpc, 1);
}

function renderChart(parts, targetB10, bottleneckId) {
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

    const label = document.createElement("span");
    label.className = "chart-label";
    label.textContent = part.name;

    const track = document.createElement("div");
    track.className = "chart-track";

    const fill = document.createElement("div");
    fill.className = "chart-fill";
    fill.style.width = `${(part.equivHours / maxVal) * 100}%`;

    const value = document.createElement("span");
    value.className = "chart-value";
    if (part.id === "battery") {
      value.textContent = `${fmt(part.b10, 0)} 循环 (${fmt(part.equivHours, 1)} h)`;
    } else {
      value.textContent = `${fmt(part.equivHours, 0)} h`;
    }

    track.appendChild(fill);
    row.append(label, track, value);
    chartBars.appendChild(row);
  }

  const targetRow = document.createElement("div");
  targetRow.className = "chart-row target-line";
  targetRow.innerHTML = `
    <span class="chart-label">目标 B10</span>
    <div class="chart-track"><div class="chart-fill target" style="width:${(targetB10 / maxVal) * 100}%"></div></div>
    <span class="chart-value">${fmt(targetB10, 0)} h</span>
  `;
  chartBars.appendChild(targetRow);
}

function buildSummary(inputs, result) {
  const lines = [
    "=== 绿篱机 B10 分析报告 ===",
    `型号: ${inputs.model}`,
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

  if (inputs.analyst || inputs.note) {
    lines.push("", `分析人: ${inputs.analyst || "—"}`, `备注: ${inputs.note || "—"}`);
  }

  return lines.join("\n");
}

function renderResults(inputs, result) {
  resultsSection.hidden = false;

  document.getElementById("result-target-b10").textContent = fmt(result.b10Target, 0);
  document.getElementById("result-parts-b10").textContent = fmt(result.b10Parts, 0);
  document.getElementById("result-bottleneck").textContent =
    result.bottleneck?.name ?? "—";
  document.getElementById("result-gap").textContent = fmt(result.gap, 0);
  document.getElementById("result-gap").className =
    "metric-value " + (result.gap >= 0 ? "pass" : "fail");
  document.getElementById("result-f-warranty").textContent = pct(result.fAtWarranty);
  document.getElementById("result-b10-calc").textContent = fmt(result.b10Calc, 0);
  document.getElementById("result-tw").textContent = fmt(result.tw, 0);
  document.getElementById("result-min-no-margin").textContent = fmt(
    result.b10MinNoMargin,
    0
  );
  document.getElementById("result-min-with-margin").textContent = fmt(
    result.b10MinWithMargin,
    0
  );

  statusBanner.className = "status-banner " + (result.pass ? "pass" : "fail");
  statusBanner.textContent = result.pass
    ? `验证通过：保修末 ${fmt(result.tw, 0)} h 时预测失效率 ${pct(result.fAtWarranty)} ≤ 目标 ${inputs.acceptableFailureRate}%`
    : `未通过：保修末 ${fmt(result.tw, 0)} h 时预测失效率 ${pct(result.fAtWarranty)} > 目标 ${inputs.acceptableFailureRate}%。瓶颈「${result.bottleneck?.name ?? "—"}」需从 ${fmt(result.bottleneck?.equivHours ?? 0, 0)} h 提升至 ≥ ${fmt(result.b10MinWithMargin, 0)} h（含余量）`;

  renderChart(
    result.partEntries,
    result.b10Target,
    result.bottleneck?.id
  );

  copyBtn.dataset.summary = buildSummary(inputs, result);
}

function saveToStorage(inputs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  } catch {
    /* ignore quota errors */
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

function onCalculate(event) {
  event.preventDefault();
  const inputs = readForm();
  saveToStorage(inputs);
  const result = calculateAll(inputs);
  renderResults(inputs, result);
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

confidenceSelect.addEventListener("change", () => {
  const c = Number(confidenceSelect.value);
  marginInput.value = confidenceToMargin(c) * 100;
});

form.warrantyYears.addEventListener("input", updateWarrantyHours);
form.hoursPerYear.addEventListener("input", updateWarrantyHours);
batteryCycles.addEventListener("input", updateBatteryEquiv);
batteryHoursPerCycle.addEventListener("input", updateBatteryEquiv);

copyBtn.addEventListener("click", async () => {
  const text = copyBtn.dataset.summary;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "已复制";
    setTimeout(() => {
      copyBtn.textContent = "复制报告摘要";
    }, 2000);
  } catch {
    copyBtn.textContent = "复制失败";
  }
});

resetBtn.addEventListener("click", () => {
  fillForm(defaultInputs());
  localStorage.removeItem(STORAGE_KEY);
  resultsSection.hidden = true;
});

form.addEventListener("submit", onCalculate);

const saved = loadFromStorage();
fillForm(saved ?? defaultInputs());
