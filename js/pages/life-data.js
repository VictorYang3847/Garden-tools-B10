import {
  calculateAll,
  confidenceToMargin,
  defaultModelDefinition,
  defaultModelRecord,
  defaultAnalysisBatch,
  weibullCdf,
  exponentialCdf,
  lognormalCdf,
  fitDistribution,
} from "../calculator.js";
import { mergeInputs, genId } from "../store.js";
import { fmt, pct, toast } from "../utils.js";

let currentModel = null;
let onSaveCallback = null;
let activeTab = "definition";
let activeBatchId = null;
let lastResult = null;

const PART_LABELS = {
  product: "整机",
  motor: "电机",
  battery: "电池包",
  gearbox: "齿轮箱/传动",
  blade: "刀片组件",
  bearing: "轴承",
};

const PART_DEFS = [
  { key: "motor", name: "电机", unit: "h", hasType: true, typeOptions: ["brushless", "brushed"], typeLabels: { brushless: "无刷", brushed: "有刷" } },
  { key: "battery", name: "电池包", unit: "循环", hasCapacity: true, hasHoursPerCycle: true },
  { key: "gearbox", name: "齿轮箱/传动", unit: "h" },
  { key: "blade", name: "刀片组件", unit: "h", hasMaterial: true },
  { key: "bearing", name: "轴承", unit: "h", hasModel: true },
];

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;
  const template = document.getElementById("life-data-template");
  const content = template.content.cloneNode(true);
  container.appendChild(content);

  ensureLifeData();
  bindEvents();
  renderDefinitionTab();
  renderDataEntryTab();
  renderAnalysisTab();
  switchTab(activeTab);
}

function ensureLifeData() {
  if (!currentModel.modules) currentModel.modules = {};
  if (!currentModel.modules.lifeData) {
    currentModel.modules.lifeData = {
      batches: [],
      activeBatchId: null,
      definition: defaultModelDefinition(),
      analysisConfig: { distribution: "weibull", method: "rrx" },
    };
  }
  const ld = currentModel.modules.lifeData;
  if (!ld.definition) ld.definition = defaultModelDefinition();
  if (!ld.batches) ld.batches = [];
  if (!ld.analysisConfig) ld.analysisConfig = { distribution: "weibull", method: "rrx" };
  activeBatchId = ld.activeBatchId || ld.batches[0]?.id || null;
}

function save() {
  if (!onSaveCallback || !currentModel) return;
  onSaveCallback(currentModel);
}

function autoSave() {
  save();
}

function bindEvents() {
  const toolbar = document.querySelector(".life-data-toolbar");
  if (toolbar) {
    toolbar.addEventListener("click", (e) => {
      const tab = e.target.closest(".life-data-tab");
      if (!tab) return;
      switchTab(tab.dataset.tab);
    });
  }

  bindDefinitionEvents();
  bindDataEntryEvents();
  bindAnalysisEvents();
}

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll(".life-data-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
  document.querySelectorAll(".life-data-tab-content").forEach((c) => {
    c.style.display = "none";
  });
  const tabEl = document.getElementById(`life-tab-${tabName}`);
  if (tabEl) tabEl.style.display = "";

  if (tabName === "analysis") {
    updateAnalysisResults();
  }
}

function bindDefinitionEvents() {
  const defForm = document.getElementById("ld-definition-form");
  const scenarioForm = document.getElementById("ld-scenario-form");

  if (scenarioForm) {
    scenarioForm.confidence?.addEventListener("change", () => {
      scenarioForm.safetyMargin.value = confidenceToMargin(Number(scenarioForm.confidence.value)) * 100;
    });

    scenarioForm.warrantyYears?.addEventListener("input", updateWarrantyHours);
    scenarioForm.hoursPerYear?.addEventListener("input", updateWarrantyHours);
  }

  const calcBtn = document.getElementById("ld-def-calculate");
  const calcFirstBtn = document.getElementById("ld-def-calculate-first");
  const saveBtn = document.getElementById("ld-def-save");
  const resetBtn = document.getElementById("ld-def-reset");
  const copyBtn = document.getElementById("ld-copy-summary");

  if (calcBtn) calcBtn.addEventListener("click", onCalculate);
  if (calcFirstBtn) calcFirstBtn.addEventListener("click", onCalculate);
  if (saveBtn) saveBtn.addEventListener("click", onSaveDefinition);
  if (resetBtn) resetBtn.addEventListener("click", onResetDefinition);
  if (copyBtn) copyBtn.addEventListener("click", onCopySummary);

  const partsTbody = document.getElementById("ld-parts-tbody");
  if (partsTbody) {
    partsTbody.addEventListener("change", (e) => {
      const el = e.target.closest("[data-part]");
      if (!el) return;
      const partKey = el.dataset.part;
      const field = el.dataset.field;
      const ld = currentModel.modules.lifeData;
      const part = ld.definition.parts[partKey];
      if (!part) return;

      let val = el.type === "checkbox" ? el.checked : el.value;
      if (el.type === "number") val = Number(val) || 0;
      part[field] = val;

      updateBatteryEquiv();
      autoSave();
    });
  }
}

function readRecordFromForm() {
  const form = document.getElementById("ld-definition-form");
  if (!form) return defaultModelRecord();
  const fd = new FormData(form);
  return {
    modelName: fd.get("modelName") || "",
    projectCode: fd.get("projectCode") || "",
    voltage: Number(fd.get("voltage")) || 0,
    power: Number(fd.get("power")) || 0,
    bladeType: fd.get("bladeType") || "double",
    bladeLength: Number(fd.get("bladeLength")) || 0,
    strokeRate: Number(fd.get("strokeRate")) || 0,
    analyst: fd.get("analyst") || "",
    note: fd.get("note") || "",
    updatedAt: new Date().toISOString(),
  };
}

function readDefinitionFromForm() {
  const form = document.getElementById("ld-scenario-form");
  if (!form) return defaultModelDefinition();
  const fd = new FormData(form);
  const ld = currentModel.modules.lifeData;
  return {
    scenarioName: fd.get("scenarioName") || "",
    scenarioNote: fd.get("scenarioNote") || "",
    hoursPerYear: Number(fd.get("hoursPerYear")) || 0,
    dutyCycle: Number(fd.get("dutyCycle")) || 0,
    continuousRunMin: Number(fd.get("continuousRunMin")) || 0,
    warrantyYears: Number(fd.get("warrantyYears")) || 0,
    acceptableFailureRate: Number(fd.get("acceptableFailureRate")) || 0,
    confidence: Number(fd.get("confidence")) || 90,
    safetyMargin: Number(fd.get("safetyMargin")) || 0,
    failureDefinition: fd.get("failureDefinition") || "performance",
    performanceThreshold: Number(fd.get("performanceThreshold")) || 70,
    beta: Number(fd.get("beta")) || 2.0,
    parts: ld.definition.parts,
  };
}

function updateWarrantyHours() {
  const form = document.getElementById("ld-scenario-form");
  if (!form) return;
  const years = Number(form.warrantyYears.value) || 0;
  const hy = Number(form.hoursPerYear.value) || 0;
  const el = document.getElementById("ld-warranty-hours");
  if (el) el.textContent = fmt(years * hy, 0);
}

function updateBatteryEquiv() {
  const ld = currentModel.modules.lifeData;
  const battery = ld.definition.parts.battery;
  const el = document.getElementById("ld-battery-equiv");
  if (el) {
    const equiv = (battery.cycles || 0) * (battery.hoursPerCycle || 0);
    el.textContent = `电池等效寿命：${fmt(equiv, 1)} h`;
  }
}

function renderDefinitionTab() {
  const ld = currentModel.modules.lifeData;
  const record = currentModel.record || defaultModelRecord(currentModel.name);
  const def = ld.definition;

  const form = document.getElementById("ld-definition-form");
  if (form) {
    form.modelName.value = record.modelName ?? currentModel.name ?? "";
    form.projectCode.value = record.projectCode ?? "";
    form.voltage.value = record.voltage ?? 18;
    form.power.value = record.power ?? 450;
    form.bladeType.value = record.bladeType ?? "double";
    form.bladeLength.value = record.bladeLength ?? 550;
    form.strokeRate.value = record.strokeRate ?? 3000;
    form.analyst.value = record.analyst ?? "";
    form.note.value = record.note ?? "";
  }

  const sForm = document.getElementById("ld-scenario-form");
  if (sForm) {
    sForm.scenarioName.value = def.scenarioName ?? "";
    sForm.scenarioNote.value = def.scenarioNote ?? "";
    sForm.hoursPerYear.value = def.hoursPerYear ?? 25;
    sForm.dutyCycle.value = def.dutyCycle ?? 60;
    sForm.continuousRunMin.value = def.continuousRunMin ?? 15;
    sForm.warrantyYears.value = def.warrantyYears ?? 2;
    sForm.acceptableFailureRate.value = def.acceptableFailureRate ?? 2;
    sForm.confidence.value = String(def.confidence ?? 90);
    sForm.safetyMargin.value = def.safetyMargin ?? 20;
    sForm.failureDefinition.value = def.failureDefinition ?? "performance";
    sForm.performanceThreshold.value = def.performanceThreshold ?? 70;
    sForm.beta.value = def.beta ?? 2.0;
  }

  renderPartsTable();
  updateWarrantyHours();
  updateBatteryEquiv();

  if (lastResult) {
    renderDefinitionResults(lastResult);
  }
}

function renderPartsTable() {
  const tbody = document.getElementById("ld-parts-tbody");
  if (!tbody) return;
  const ld = currentModel.modules.lifeData;
  const parts = ld.definition.parts;

  tbody.innerHTML = PART_DEFS.map((p) => {
    const part = parts[p.key];
    const checked = part.included ? "checked" : "";
    let paramHtml = "";

    if (p.key === "battery") {
      paramHtml = `
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <input type="number" data-part="${p.key}" data-field="hoursPerCycle" value="${part.hoursPerCycle || 0}" min="0" step="0.1" class="item-input" style="width: 70px;" />
          <span class="hint">h/循环</span>
          <input type="number" data-part="${p.key}" data-field="capacity" value="${part.capacity || 0}" min="0" step="0.1" class="item-input" style="width: 70px; margin-left: 0.5rem;" />
          <span class="hint">Ah</span>
        </div>`;
    } else if (p.hasType) {
      const options = p.typeOptions.map((opt) => `<option value="${opt}" ${part.type === opt ? "selected" : ""}>${p.typeLabels[opt] || opt}</option>`).join("");
      paramHtml = `<select data-part="${p.key}" data-field="type" class="item-input">${options}</select>`;
    } else if (p.hasMaterial) {
      paramHtml = `<input type="text" data-part="${p.key}" data-field="material" value="${part.material || ""}" class="item-input" placeholder="材料" />`;
    } else if (p.hasModel) {
      paramHtml = `<input type="text" data-part="${p.key}" data-field="model" value="${part.model || ""}" class="item-input" placeholder="型号" />`;
    }

    return `
      <tr>
        <td><input type="checkbox" data-part="${p.key}" data-field="included" ${checked} /></td>
        <td>${p.name}</td>
        <td><input type="number" data-part="${p.key}" data-field="${p.key === "battery" ? "cycles" : "b10"}" value="${p.key === "battery" ? part.cycles : part.b10}" min="0" step="1" class="item-input" style="width: 100%;" /></td>
        <td>${p.unit}</td>
        <td>${paramHtml}</td>
      </tr>`;
  }).join("");
}

function onCalculate() {
  const record = readRecordFromForm();
  const definition = readDefinitionFromForm();
  const inputs = mergeInputs(record, definition);
  const result = calculateAll(inputs);
  lastResult = result;

  currentModel.record = record;
  currentModel.modules.lifeData.definition = definition;
  currentModel.lastResult = result;

  renderDefinitionResults(result);
  autoSave();

  const resultsCard = document.getElementById("ld-def-results-card");
  if (resultsCard) {
    resultsCard.style.display = "";
    resultsCard.scrollIntoView({ behavior: "smooth" });
  }
  const noResults = document.getElementById("ld-def-no-results");
  if (noResults) noResults.style.display = "none";
}

function renderDefinitionResults(result) {
  document.getElementById("ld-result-target-b10").textContent = fmt(result.b10Target, 0);
  document.getElementById("ld-result-parts-b10").textContent = fmt(result.b10Parts, 0);
  document.getElementById("ld-result-bottleneck").textContent = result.bottleneck?.name ?? "—";
  document.getElementById("ld-result-gap").textContent = fmt(result.gap, 0);
  document.getElementById("ld-result-gap").className = "metric-value " + (result.gap >= 0 ? "pass" : "fail");

  const banner = document.getElementById("ld-status-banner");
  if (banner) {
    banner.className = "status-banner " + (result.pass ? "pass" : "fail");
    banner.textContent = result.pass
      ? `验证通过：保修末 ${fmt(result.tw, 0)} h 时预测失效率 ${pct(result.fAtWarranty)} ≤ 目标`
      : `未通过：保修末 ${fmt(result.tw, 0)} h 时预测失效率 ${pct(result.fAtWarranty)} > 目标。瓶颈「${result.bottleneck?.name ?? "—"}」需提升`;
  }

  renderB10Chart(result.partEntries, result.b10Target, result.bottleneck?.id);
  document.getElementById("ld-copy-summary").dataset.summary = buildSummary(result);
}

function renderB10Chart(parts, targetB10, bottleneckId) {
  const container = document.getElementById("ld-chart-bars");
  if (!container) return;
  container.innerHTML = "";

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
    container.appendChild(row);
  }

  const targetRow = document.createElement("div");
  targetRow.className = "chart-row target-line";
  targetRow.innerHTML = `
    <span class="chart-label">目标 B10</span>
    <div class="chart-track"><div class="chart-fill target" style="width:${(targetB10 / maxVal) * 100}%"></div></div>
    <span class="chart-value">${fmt(targetB10, 0)} h</span>`;
  container.appendChild(targetRow);
}

function buildSummary(result) {
  const lines = [
    "=== 寿命数据分析 - 产品定义 ===",
    `型号: ${currentModel.name}`,
    `场景: ${result.scenarioName || "默认"} (${result.hoursPerYear} h/年)`,
    `保修: ${result.warrantyYears} 年, 累计 ${fmt(result.tw, 0)} h`,
    `可接受失效率: ${result.acceptableFailureRate}%`,
    `β = ${result.beta}, 安全余量 ${result.safetyMargin}%`,
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

function onSaveDefinition() {
  const record = readRecordFromForm();
  const definition = readDefinitionFromForm();
  currentModel.record = record;
  currentModel.modules.lifeData.definition = definition;
  save();
  toast(document.getElementById("ld-def-save"), "已保存", 1500);
}

function onResetDefinition() {
  if (!confirm("确定重置为默认值？")) return;
  currentModel.modules.lifeData.definition = defaultModelDefinition();
  lastResult = null;
  renderDefinitionTab();
  const resultsCard = document.getElementById("ld-def-results-card");
  if (resultsCard) resultsCard.style.display = "none";
  const noResults = document.getElementById("ld-def-no-results");
  if (noResults) noResults.style.display = "";
  autoSave();
}

async function onCopySummary() {
  const btn = document.getElementById("ld-copy-summary");
  const text = btn?.dataset.summary;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast(btn, "已复制", 1500);
  } catch {
    toast(btn, "复制失败", 1500);
  }
}

function bindDataEntryEvents() {
  const newBatchBtn = document.getElementById("ld-new-batch");
  const importBtn = document.getElementById("ld-import");
  const importFile = document.getElementById("ld-import-file");
  const downloadTemplateBtn = document.getElementById("ld-download-template");
  const addItemBtn = document.getElementById("ld-add-item");
  const deleteBatchBtn = document.getElementById("ld-batch-delete");
  const batchTabs = document.getElementById("ld-batch-tabs");
  const itemsTbody = document.getElementById("ld-items-tbody");

  if (newBatchBtn) newBatchBtn.addEventListener("click", newBatch);
  if (importBtn) importBtn.addEventListener("click", () => importFile?.click());
  if (importFile) importFile.addEventListener("change", importCsv);
  if (downloadTemplateBtn) downloadTemplateBtn.addEventListener("click", downloadCsvTemplate);
  if (addItemBtn) addItemBtn.addEventListener("click", addItem);
  if (deleteBatchBtn) deleteBatchBtn.addEventListener("click", deleteBatch);

  ["ld-batch-name", "ld-batch-part", "ld-batch-date", "ld-batch-note"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", updateBatchFromForm);
  });

  if (batchTabs) {
    batchTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".batch-tab");
      if (!tab) return;
      activeBatchId = tab.dataset.id;
      currentModel.modules.lifeData.activeBatchId = activeBatchId;
      saveAndRefreshDataEntry();
    });
  }

  if (itemsTbody) {
    itemsTbody.addEventListener("change", (e) => {
      const el = e.target.closest("[data-field]");
      if (!el) return;
      const tr = el.closest("tr");
      const id = tr.dataset.id;
      const batch = getActiveBatch();
      if (!batch) return;
      const item = batch.items.find((i) => i.id === id);
      if (!item) return;
      let val = el.value;
      const field = el.dataset.field;
      if (field === "time") val = Number(val) || 0;
      if (field === "failed") val = val === "true";
      item[field] = val;
      autoSave();
    });

    itemsTbody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action='delete']");
      if (!btn) return;
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const batch = getActiveBatch();
      if (!batch) return;
      batch.items = batch.items.filter((i) => i.id !== id);
      saveAndRefreshDataEntry();
    });
  }
}

function getActiveBatch() {
  const batches = currentModel.modules.lifeData.batches;
  return batches.find((b) => b.id === activeBatchId) || null;
}

function newBatch() {
  const ld = currentModel.modules.lifeData;
  const num = ld.batches.length + 1;
  const batch = defaultAnalysisBatch(`试验批次 ${num}`);
  ld.batches.push(batch);
  activeBatchId = batch.id;
  ld.activeBatchId = batch.id;
  saveAndRefreshDataEntry();
}

function deleteBatch() {
  if (!activeBatchId) return;
  if (!confirm("确定删除该试验批次？此操作不可恢复。")) return;
  const ld = currentModel.modules.lifeData;
  ld.batches = ld.batches.filter((b) => b.id !== activeBatchId);
  activeBatchId = ld.batches[0]?.id ?? null;
  ld.activeBatchId = activeBatchId;
  saveAndRefreshDataEntry();
}

function addItem() {
  const batch = getActiveBatch();
  if (!batch) return;
  batch.items.push({
    id: genId(),
    time: 0,
    failed: false,
    part: "product",
    failureMode: "",
    note: "",
  });
  saveAndRefreshDataEntry();
}

function downloadCsvTemplate() {
  const csv = [
    "time,failed,part,failureMode,note",
    "120,true,blade,磨损,示例：刀片在120小时失效",
    "150,true,gearbox,齿轮断裂,",
    "200,false,product,,示例：200小时未失效（截尾）",
    "180,true,bearing,轴承抱死,",
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "试验数据模板.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importCsv(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const lines = reader.result.split(/\r?\n/).filter((l) => l.trim());
      const items = [];
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        const time = Number(cols[headers.indexOf("time")] ?? cols[0]);
        const failedStr = (cols[headers.indexOf("failed")] ?? cols[1] ?? "").toLowerCase();
        const failed = ["1", "true", "是", "失效", "fail", "failure"].includes(failedStr);
        const part = cols[headers.indexOf("part")] ?? cols[2] ?? "product";
        const failureMode = cols[headers.indexOf("failuremode")] ?? cols[3] ?? "";
        const note = cols[headers.indexOf("note")] ?? cols[4] ?? "";
        if (isFinite(time) && time > 0) {
          items.push({ id: genId(), time, failed, part, failureMode, note });
        }
      }
      if (items.length === 0) {
        alert("未解析到有效数据，请检查 CSV 格式");
        return;
      }
      const ld = currentModel.modules.lifeData;
      const num = ld.batches.length + 1;
      const batch = defaultAnalysisBatch(`导入批次 ${num}`);
      batch.items = items;
      ld.batches.push(batch);
      activeBatchId = batch.id;
      ld.activeBatchId = batch.id;
      saveAndRefreshDataEntry();
      toast(document.getElementById("ld-import"), `导入 ${items.length} 条`, 1500);
    } catch (err) {
      alert("导入失败：" + err.message);
    }
    e.target.value = "";
  };
  reader.readAsText(file);
}

function updateBatchFromForm() {
  const batch = getActiveBatch();
  if (!batch) return;
  batch.name = document.getElementById("ld-batch-name").value;
  batch.part = document.getElementById("ld-batch-part").value;
  batch.startDate = document.getElementById("ld-batch-date").value;
  batch.note = document.getElementById("ld-batch-note").value;
  renderBatchTabs();
  autoSave();
}

function saveAndRefreshDataEntry() {
  autoSave();
  renderDataEntryTab();
}

function renderDataEntryTab() {
  const ld = currentModel.modules.lifeData;
  if (!activeBatchId || !ld.batches.find((b) => b.id === activeBatchId)) {
    activeBatchId = ld.batches[0]?.id ?? null;
    ld.activeBatchId = activeBatchId;
  }

  renderBatchTabs();
  renderBatchDetail();
}

function renderBatchTabs() {
  const container = document.getElementById("ld-batch-tabs");
  const batches = currentModel.modules.lifeData.batches;
  if (!container) return;
  if (batches.length === 0) {
    container.innerHTML = '<p class="hint" style="margin-top: 0.75rem;">暂无批次，点击「新建批次」开始录入试验数据。</p>';
    return;
  }
  container.innerHTML = batches
    .map(
      (b) => `
      <button type="button" class="batch-tab ${b.id === activeBatchId ? "active" : ""}" data-id="${b.id}">
        ${escapeHtml(b.name)}
        <span class="batch-count">${b.items.length} 条</span>
      </button>`
    )
    .join("");
}

function renderBatchDetail() {
  const batch = getActiveBatch();
  const hasBatch = !!batch;
  const detailSection = document.getElementById("ld-batch-detail-section");
  const itemsSection = document.getElementById("ld-batch-items-section");
  if (detailSection) detailSection.style.display = hasBatch ? "" : "none";
  if (itemsSection) itemsSection.style.display = hasBatch ? "" : "none";
  if (!batch) return;

  document.getElementById("ld-batch-name").value = batch.name;
  document.getElementById("ld-batch-part").value = batch.part;
  document.getElementById("ld-batch-date").value = batch.startDate;
  document.getElementById("ld-batch-note").value = batch.note || "";

  renderItemsTable(batch);
}

function renderItemsTable(batch) {
  const tbody = document.getElementById("ld-items-tbody");
  const empty = document.getElementById("ld-items-empty");
  if (!tbody) return;

  if (!batch.items || batch.items.length === 0) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = batch.items
    .map((item, idx) => {
      const escaped = {
        part: escapeHtml(item.part || ""),
        failureMode: escapeHtml(item.failureMode || ""),
        note: escapeHtml(item.note || ""),
      };
      return `
      <tr data-id="${item.id}">
        <td>${idx + 1}</td>
        <td><input type="number" data-field="time" value="${item.time}" min="0" step="0.1" class="item-input" /></td>
        <td>
          <select data-field="failed" class="item-input">
            <option value="false" ${!item.failed ? "selected" : ""}>截尾/未失效</option>
            <option value="true" ${item.failed ? "selected" : ""}>失效</option>
          </select>
        </td>
        <td>
          <select data-field="part" class="item-input">
            ${Object.entries(PART_LABELS)
              .map(([k, v]) => `<option value="${k}" ${item.part === k ? "selected" : ""}>${v}</option>`)
              .join("")}
          </select>
        </td>
        <td><input type="text" data-field="failureMode" value="${escaped.failureMode}" class="item-input" placeholder="如：磨损、断裂…" /></td>
        <td><input type="text" data-field="note" value="${escaped.note}" class="item-input" placeholder="可选" /></td>
        <td><button type="button" data-action="delete" class="btn-sm btn-ghost" style="color: var(--danger);">删除</button></td>
      </tr>`;
    })
    .join("");
}

function bindAnalysisEvents() {
  const distSelect = document.getElementById("ld-distribution");
  const methodSelect = document.getElementById("ld-method");
  const reliabilityTimeInput = document.getElementById("ld-reliability-time");

  if (distSelect) {
    distSelect.addEventListener("change", () => {
      currentModel.modules.lifeData.analysisConfig.distribution = distSelect.value;
      autoSave();
      updateAnalysisResults();
    });
  }
  if (methodSelect) {
    methodSelect.addEventListener("change", () => {
      currentModel.modules.lifeData.analysisConfig.method = methodSelect.value;
      autoSave();
      updateAnalysisResults();
    });
  }
  if (reliabilityTimeInput) {
    reliabilityTimeInput.addEventListener("input", () => {
      updateReliabilityCalculator();
    });
    reliabilityTimeInput.addEventListener("change", () => {
      updateReliabilityCalculator();
    });
  }
}

function renderAnalysisTab() {
  const config = currentModel.modules.lifeData.analysisConfig;
  const distSelect = document.getElementById("ld-distribution");
  const methodSelect = document.getElementById("ld-method");
  const reliabilityTimeInput = document.getElementById("ld-reliability-time");
  const warrantyLabel = document.getElementById("ld-reliability-warranty-label");
  if (distSelect) distSelect.value = config.distribution || "weibull";
  if (methodSelect) methodSelect.value = config.method || "rrx";

  const ld = currentModel.modules.lifeData;
  const def = ld.definition;
  if (def && reliabilityTimeInput) {
    const warrantyHours = (def.warrantyYears || 0) * (def.hoursPerYear || 0);
    if (warrantyHours > 0) {
      reliabilityTimeInput.value = warrantyHours;
    }
    if (warrantyLabel) {
      warrantyLabel.textContent = `质保期 (${def.warrantyYears || 0}年 × ${def.hoursPerYear || 0}h/年)`;
    }
  }
}

function getTargetB10() {
  if (currentModel.lastResult) return currentModel.lastResult.b10Target ?? null;
  try {
    const record = currentModel.record || defaultModelRecord();
    const def = currentModel.modules.lifeData.definition;
    const inputs = mergeInputs(record, def);
    const result = calculateAll(inputs);
    return result.b10Target ?? null;
  } catch {
    return null;
  }
}

function getFailureAndCensoredTimes() {
  const batches = currentModel.modules.lifeData.batches;
  const failures = [];
  const censored = [];
  for (const batch of batches) {
    for (const item of batch.items || []) {
      if (item.failed && item.time > 0) {
        failures.push(item.time);
      } else if (!item.failed && item.time > 0) {
        censored.push(item.time);
      }
    }
  }
  return { failures, censored };
}

function updateAnalysisResults() {
  const config = currentModel.modules.lifeData.analysisConfig;
  const { failures, censored } = getFailureAndCensoredTimes();
  const targetB10 = getTargetB10();

  const fit = fitDistribution(config.distribution, config.method, failures, censored);

  updateFitMetrics(fit, config.distribution, targetB10);
  updateReliabilityCalculator(fit, config.distribution);
  drawPPPlot(fit, config.distribution);
  drawCdfPlot(fit, config.distribution, targetB10);
}

function updateFitMetrics(fit, distribution, targetB10) {
  const hasData = fit && fit.b10 != null;

  document.getElementById("ld-total-samples").textContent = hasData ? fit.totalCount : "—";
  document.getElementById("ld-failure-count").textContent = hasData ? fit.failureCount : "—";
  document.getElementById("ld-b10").textContent = hasData ? fmt(fit.b10, 1) + " h" : "—";
  document.getElementById("ld-b50").textContent = hasData && fit.b50 != null ? fmt(fit.b50, 1) + " h" : "—";
  document.getElementById("ld-r2").textContent = hasData && fit.rSquared != null ? fmt(fit.rSquared, 3) : "—";

  const betaMetric = document.getElementById("ld-metric-beta");
  const etaMetric = document.getElementById("ld-metric-eta");
  const lambdaMetric = document.getElementById("ld-metric-lambda");
  const muMetric = document.getElementById("ld-metric-mu");
  const sigmaMetric = document.getElementById("ld-metric-sigma");

  if (distribution === "weibull") {
    betaMetric.style.display = "";
    etaMetric.style.display = "";
    lambdaMetric.style.display = "none";
    muMetric.style.display = "none";
    sigmaMetric.style.display = "none";
    document.getElementById("ld-beta").textContent = hasData ? fmt(fit.beta, 2) : "—";
    document.getElementById("ld-eta").textContent = hasData ? fmt(fit.eta, 0) + " h" : "—";
  } else if (distribution === "exponential") {
    betaMetric.style.display = "none";
    etaMetric.style.display = "none";
    lambdaMetric.style.display = "";
    muMetric.style.display = "none";
    sigmaMetric.style.display = "none";
    document.getElementById("ld-lambda").textContent = hasData ? fmt(fit.lambda * 1000, 4) + " ×10⁻³/h" : "—";
  } else if (distribution === "lognormal") {
    betaMetric.style.display = "none";
    etaMetric.style.display = "none";
    lambdaMetric.style.display = "none";
    muMetric.style.display = "";
    sigmaMetric.style.display = "";
    document.getElementById("ld-mu").textContent = hasData ? fmt(fit.mu, 2) : "—";
    document.getElementById("ld-sigma").textContent = hasData ? fmt(fit.sigma, 2) : "—";
  }

  document.getElementById("ld-target-b10").textContent = targetB10 ? fmt(targetB10, 0) + " h" : "—";

  const passEl = document.getElementById("ld-result-pass");
  const gapEl = document.getElementById("ld-result-gap-analysis");
  if (hasData && targetB10) {
    const pass = fit.b10 >= targetB10;
    const gap = fit.b10 - targetB10;
    passEl.textContent = pass ? "通过 ✓" : "未通过 ✗";
    passEl.style.color = pass ? "var(--success)" : "var(--danger)";
    gapEl.textContent = fmt(gap, 1) + " h";
    gapEl.className = "metric-value " + (gap >= 0 ? "pass" : "fail");
  } else {
    passEl.textContent = "—";
    passEl.style.color = "";
    gapEl.textContent = "—";
    gapEl.className = "metric-value";
  }
}

function calculateReliability(t, fit, distribution) {
  if (!fit || t <= 0) return null;
  if (distribution === "weibull") {
    if (fit.eta == null || fit.beta == null) return null;
    return 1 - weibullCdf(t, fit.eta, fit.beta);
  } else if (distribution === "exponential") {
    if (fit.lambda == null) return null;
    return 1 - exponentialCdf(t, fit.lambda);
  } else if (distribution === "lognormal") {
    if (fit.mu == null || fit.sigma == null) return null;
    return 1 - lognormalCdf(t, fit.mu, fit.sigma);
  }
  return null;
}

function updateReliabilityCalculator(fitParam, distributionParam) {
  const config = currentModel.modules.lifeData.analysisConfig;
  const distribution = distributionParam || config.distribution || "weibull";

  let fit;
  if (fitParam) {
    fit = fitParam;
  } else {
    const { failures, censored } = getFailureAndCensoredTimes();
    fit = fitDistribution(distribution, config.method || "rrx", failures, censored);
  }

  const timeInput = document.getElementById("ld-reliability-time");
  const reliabilityEl = document.getElementById("ld-reliability-value");
  const failureRateEl = document.getElementById("ld-failure-rate-value");
  const warrantyFailureRateEl = document.getElementById("ld-warranty-failure-rate");

  if (!timeInput || !reliabilityEl || !failureRateEl || !warrantyFailureRateEl) return;

  const t = Number(timeInput.value) || 0;
  const hasData = fit && fit.b10 != null;

  if (!hasData || t <= 0) {
    reliabilityEl.textContent = "—";
    failureRateEl.textContent = "—";
    warrantyFailureRateEl.textContent = "—";
    return;
  }

  const reliability = calculateReliability(t, fit, distribution);
  if (reliability == null) {
    reliabilityEl.textContent = "—";
    failureRateEl.textContent = "—";
  } else {
    reliabilityEl.textContent = pct(reliability);
    failureRateEl.textContent = pct(1 - reliability);
  }

  const ld = currentModel.modules.lifeData;
  const def = ld.definition;
  if (def) {
    const warrantyHours = (def.warrantyYears || 0) * (def.hoursPerYear || 0);
    if (warrantyHours > 0) {
      const warrantyReliability = calculateReliability(warrantyHours, fit, distribution);
      if (warrantyReliability != null) {
        warrantyFailureRateEl.textContent = pct(1 - warrantyReliability);
      } else {
        warrantyFailureRateEl.textContent = "—";
      }
    } else {
      warrantyFailureRateEl.textContent = "—";
    }
  } else {
    warrantyFailureRateEl.textContent = "—";
  }
}

function drawPPPlot(fit, distribution) {
  const canvas = document.getElementById("ld-pp-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const padL = 60,
    padR = 20,
    padT = 20,
    padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(padL, padT, plotW, plotH);

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, plotW, plotH);

  if (!fit || !fit.points || fit.points.length < 2) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("数据不足，无法拟合", w / 2, h / 2);
    return;
  }

  const points = fit.points;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs) - 0.5;
  const xMax = Math.max(...xs) + 0.5;
  const yMin = Math.min(...ys) - 0.5;
  const yMax = Math.max(...ys) + 0.5;

  const xScale = (x) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
  const yScale = (y) => padT + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 0.5;
  for (let i = 1; i <= 5; i++) {
    const x = padL + (plotW / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
  }
  for (let i = 1; i <= 4; i++) {
    const y = padT + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i <= 5; i++) {
    const xVal = xMin + ((xMax - xMin) / 5) * i;
    let label;
    if (distribution === "exponential") {
      label = fmt(xVal, 0);
    } else {
      label = fmt(Math.exp(xVal), 0);
    }
    ctx.fillText(label, padL + (plotW / 5) * i, padT + plotH + 15);
  }
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const yVal = yMin + ((yMax - yMin) / 4) * i;
    let pctVal;
    if (distribution === "weibull") {
      pctVal = (1 - Math.exp(-Math.exp(yVal))) * 100;
    } else if (distribution === "exponential") {
      pctVal = (1 - Math.exp(-yVal)) * 100;
    } else {
      pctVal = normCdfApprox(yVal) * 100;
    }
    ctx.fillText(fmt(pctVal, 1) + "%", padL - 5, padT + plotH - (plotH / 4) * i + 4);
  }

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (distribution === "weibull") {
    const xStart = xMin;
    const xEnd = xMax;
    const yStart = fit.beta * xStart - fit.beta * Math.log(fit.eta);
    const yEnd = fit.beta * xEnd - fit.beta * Math.log(fit.eta);
    ctx.moveTo(xScale(xStart), yScale(yStart));
    ctx.lineTo(xScale(xEnd), yScale(yEnd));
  } else if (distribution === "exponential") {
    const xStart = xMin;
    const xEnd = xMax;
    const yStart = fit.lambda * xStart;
    const yEnd = fit.lambda * xEnd;
    ctx.moveTo(xScale(xStart), yScale(yStart));
    ctx.lineTo(xScale(xEnd), yScale(yEnd));
  } else if (distribution === "lognormal") {
    const xStart = xMin;
    const xEnd = xMax;
    const yStart = (xStart - fit.mu) / fit.sigma;
    const yEnd = (xEnd - fit.mu) / fit.sigma;
    ctx.moveTo(xScale(xStart), yScale(yStart));
    ctx.lineTo(xScale(xEnd), yScale(yEnd));
  }
  ctx.stroke();

  ctx.fillStyle = "#4ade80";
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 1;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(xScale(p.x), yScale(p.y), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  const xLabel = distribution === "exponential" ? "失效时间 (h)" : "失效时间 (h)";
  ctx.fillText(xLabel, w / 2, h - 5);
  ctx.save();
  ctx.translate(15, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("累积失效概率", 0, 0);
  ctx.restore();
}

function drawCdfPlot(fit, distribution, targetB10) {
  const canvas = document.getElementById("ld-cdf-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const padL = 60,
    padR = 20,
    padT = 20,
    padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(padL, padT, plotW, plotH);

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, plotW, plotH);

  if (!fit || !fit.b10) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("数据不足，无法拟合", w / 2, h / 2);
    return;
  }

  let tMax;
  if (distribution === "weibull") {
    tMax = fit.eta * 2;
  } else if (distribution === "exponential") {
    tMax = fit.b10 * 5;
  } else {
    tMax = fit.b50 ? fit.b50 * 2 : fit.b10 * 5;
  }
  const tMin = 0;

  const xScale = (t) => padL + ((t - tMin) / (tMax - tMin)) * plotW;
  const yScale = (p) => padT + plotH - p * plotH;

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 0.5;
  for (let i = 1; i <= 5; i++) {
    const x = padL + (plotW / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    const y = padT + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i <= 5; i++) {
    const tVal = tMin + ((tMax - tMin) / 5) * i;
    ctx.fillText(fmt(tVal, 0), padL + (plotW / 5) * i, padT + plotH + 15);
  }
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const pVal = i / 4;
    ctx.fillText(fmt(pVal * 100, 0) + "%", padL - 5, padT + plotH - (plotH / 4) * i + 4);
  }

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let first = true;
  for (let i = 0; i <= 100; i++) {
    const t = tMin + ((tMax - tMin) / 100) * i;
    let p;
    if (distribution === "weibull") {
      p = weibullCdf(t, fit.eta, fit.beta);
    } else if (distribution === "exponential") {
      p = exponentialCdf(t, fit.lambda);
    } else {
      p = lognormalCdf(t, fit.mu, fit.sigma);
    }
    if (first) {
      ctx.moveTo(xScale(t), yScale(p));
      first = false;
    } else {
      ctx.lineTo(xScale(t), yScale(p));
    }
  }
  ctx.stroke();

  if (targetB10 && targetB10 > 0) {
    ctx.strokeStyle = "#f87171";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    if (targetB10 <= tMax) {
      ctx.beginPath();
      ctx.moveTo(xScale(targetB10), padT);
      ctx.lineTo(xScale(targetB10), yScale(0.1));
      ctx.lineTo(padL + plotW, yScale(0.1));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "#f87171";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    if (targetB10 <= tMax) {
      ctx.fillText(`目标 B10: ${fmt(targetB10, 0)}h`, xScale(targetB10) + 5, yScale(0.1) - 5);
    }
  }

  if (fit.points) {
    ctx.fillStyle = "#4ade80";
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1;
    for (const p of fit.points) {
      if (p.t <= tMax) {
        ctx.beginPath();
        ctx.arc(xScale(p.t), yScale(p.rank), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("时间 (h)", w / 2, h - 5);
  ctx.save();
  ctx.translate(15, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("累积失效概率 F(t)", 0, 0);
  ctx.restore();
}

function normCdfApprox(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
