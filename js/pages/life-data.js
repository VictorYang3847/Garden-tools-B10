import {
  defaultAnalysisBatch,
  weibullCdf,
  exponentialCdf,
  lognormalCdf,
  fitDistribution,
} from "../calculator.js";
import { genId } from "../store.js";
import { fmt, pct, toast } from "../utils.js";

let currentModel = null;
let onSaveCallback = null;
let activeTab = "data-entry";
let activeBatchId = null;
let analysisMode = "merged"; // "merged" | "batch"
let selectedBatchIdForAnalysis = null;

const PART_LABELS = {
  product: "整机",
  motor: "电机",
  battery: "电池包",
  gearbox: "齿轮箱/传动",
  blade: "刀片组件",
  bearing: "轴承",
};

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
      analysisConfig: { distribution: "weibull", method: "rrx", analysisMode: "merged", selectedBatchId: null },
    };
  }
  const ld = currentModel.modules.lifeData;
  // 保留已有的 definition 数据（向后兼容），但不再主动初始化
  // 产品信息相关参数现在从 model.homeCalc 获取
  if (!ld.batches) ld.batches = [];
  if (!ld.analysisConfig) ld.analysisConfig = { distribution: "weibull", method: "rrx", analysisMode: "merged", selectedBatchId: null };
  activeBatchId = ld.activeBatchId || ld.batches[0]?.id || null;
  // 同步analysisMode状态
  analysisMode = ld.analysisConfig.analysisMode || "merged";
  selectedBatchIdForAnalysis = ld.analysisConfig.selectedBatchId || ld.batches[0]?.id || null;
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

// Definition-related functions removed - product definition now handled elsewhere

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
  const formulaToggle = document.getElementById("ld-formula-toggle");
  const formulaContent = document.getElementById("ld-formula-content");
  const modeMergedRadio = document.getElementById("ld-mode-merged");
  const modeBatchRadio = document.getElementById("ld-mode-batch");
  const batchSelector = document.getElementById("ld-batch-selector");
  const batchSelectorContainer = document.getElementById("ld-batch-selector-container");

  // 模式切换事件
  if (modeMergedRadio) {
    modeMergedRadio.addEventListener("change", () => {
      if (modeMergedRadio.checked) {
        analysisMode = "merged";
        currentModel.modules.lifeData.analysisConfig.analysisMode = "merged";
        if (batchSelectorContainer) batchSelectorContainer.style.display = "none";
        autoSave();
        updateAnalysisResults();
      }
    });
  }
  if (modeBatchRadio) {
    modeBatchRadio.addEventListener("change", () => {
      if (modeBatchRadio.checked) {
        analysisMode = "batch";
        currentModel.modules.lifeData.analysisConfig.analysisMode = "batch";
        renderBatchSelectorOptions();
        if (batchSelectorContainer) batchSelectorContainer.style.display = "";
        autoSave();
        updateAnalysisResults();
      }
    });
  }

  // 轮次选择事件
  if (batchSelector) {
    batchSelector.addEventListener("change", () => {
      selectedBatchIdForAnalysis = batchSelector.value;
      currentModel.modules.lifeData.analysisConfig.selectedBatchId = selectedBatchIdForAnalysis;
      autoSave();
      updateAnalysisResults();
    });
  }

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
  if (formulaToggle && formulaContent) {
    formulaToggle.addEventListener("click", () => {
      const isHidden = formulaContent.style.display === "none";
      formulaContent.style.display = isHidden ? "" : "none";
      formulaToggle.textContent = isHidden ? "📐 收起公式" : "📐 查看计算公式";
    });
  }
}

function renderAnalysisTab() {
  const config = currentModel.modules.lifeData.analysisConfig;
  const distSelect = document.getElementById("ld-distribution");
  const methodSelect = document.getElementById("ld-method");
  const reliabilityTimeInput = document.getElementById("ld-reliability-time");
  const warrantyLabel = document.getElementById("ld-reliability-warranty-label");
  const modeMergedRadio = document.getElementById("ld-mode-merged");
  const modeBatchRadio = document.getElementById("ld-mode-batch");
  const batchSelectorContainer = document.getElementById("ld-batch-selector-container");

  if (distSelect) distSelect.value = config.distribution || "weibull";
  if (methodSelect) methodSelect.value = config.method || "rrx";

  // 设置模式切换状态
  analysisMode = config.analysisMode || "merged";
  if (modeMergedRadio) modeMergedRadio.checked = analysisMode === "merged";
  if (modeBatchRadio) modeBatchRadio.checked = analysisMode === "batch";

  // 设置轮次选择器显示状态
  if (batchSelectorContainer) {
    batchSelectorContainer.style.display = analysisMode === "batch" ? "" : "none";
  }

  // 渲染轮次选择器选项
  if (analysisMode === "batch") {
    renderBatchSelectorOptions();
  }

  // 从 model.homeCalc 获取质保期参数（首页共享数据）
  const homeCalc = currentModel?.homeCalc || {};
  const warrantyYears = homeCalc.warrantyYears || 0;
  const hoursPerYear = homeCalc.hoursPerYear || 0;
  const warrantyHours = warrantyYears * hoursPerYear;

  if (reliabilityTimeInput && warrantyHours > 0) {
    reliabilityTimeInput.value = warrantyHours;
  }
  if (warrantyLabel) {
    warrantyLabel.textContent = `质保期 (${warrantyYears}年 × ${hoursPerYear}h/年)`;
  }
}

function renderBatchSelectorOptions() {
  const batchSelector = document.getElementById("ld-batch-selector");
  if (!batchSelector) return;
  const batches = currentModel.modules.lifeData.batches;

  if (batches.length === 0) {
    batchSelector.innerHTML = '<option value="">暂无批次数据</option>';
    return;
  }

  batchSelector.innerHTML = batches.map((b) =>
    `<option value="${b.id}" ${b.id === selectedBatchIdForAnalysis ? "selected" : ""}>${escapeHtml(b.name)} (${b.items?.length || 0} 条)</option>`
  ).join("");

  // 如果当前选中的批次不存在，自动选择第一个
  if (!selectedBatchIdForAnalysis || !batches.find((b) => b.id === selectedBatchIdForAnalysis)) {
    selectedBatchIdForAnalysis = batches[0]?.id;
    batchSelector.value = selectedBatchIdForAnalysis;
    currentModel.modules.lifeData.analysisConfig.selectedBatchId = selectedBatchIdForAnalysis;
  }
}

function getTargetB10() {
  // 从 model.homeCalc 获取质保期参数（首页共享数据）
  const homeCalc = currentModel?.homeCalc || {};
  const warrantyYears = homeCalc.warrantyYears || 0;
  const hoursPerYear = homeCalc.hoursPerYear || 0;

  if (warrantyYears <= 0 || hoursPerYear <= 0) return null;

  // 计算质保期等效小时数
  return warrantyYears * hoursPerYear;
}

function getFailureAndCensoredTimes() {
  const batches = currentModel.modules.lifeData.batches;
  const failures = [];
  const censored = [];

  // 根据模式决定数据处理方式
  if (analysisMode === "batch" && selectedBatchIdForAnalysis) {
    // 分轮模式：只处理选中批次的数据
    const targetBatch = batches.find((b) => b.id === selectedBatchIdForAnalysis);
    if (targetBatch && targetBatch.items) {
      for (const item of targetBatch.items) {
        if (item.time <= 0) continue;
        const failed = isItemFailed(item);
        if (failed) {
          failures.push(item.time);
        } else {
          censored.push(item.time);
        }
      }
    }
  } else {
    // 合并模式：汇总全部批次数据
    for (const batch of batches) {
      for (const item of batch.items || []) {
        if (item.time <= 0) continue;
        const failed = isItemFailed(item);
        if (failed) {
          failures.push(item.time);
        } else {
          censored.push(item.time);
        }
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

  const censoredMetric = document.getElementById("ld-metric-censored");
  const censoredCount = hasData ? fit.totalCount - fit.failureCount : 0;
  if (censoredCount > 0) {
    censoredMetric.style.display = "";
    document.getElementById("ld-censored-count").textContent = censoredCount;
  } else {
    censoredMetric.style.display = "none";
  }

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

  // 从 model.homeCalc 获取质保期参数（首页共享数据）
  const homeCalc = currentModel?.homeCalc || {};
  const warrantyYears = homeCalc.warrantyYears || 0;
  const hoursPerYear = homeCalc.hoursPerYear || 0;
  const warrantyHours = warrantyYears * hoursPerYear;

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

function isItemFailed(item) {
  if (item.failed != null) return item.failed === true;
  if (item.status != null) return item.status === "failed";
  return false;
}
