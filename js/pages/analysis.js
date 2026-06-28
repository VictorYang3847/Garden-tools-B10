import { mergeInputs, genId } from "../store.js";
import { calculateAll, calcAnalysisResult, weibullCdf, defaultAnalysisBatch } from "../calculator.js";
import { fmt, pct, toast } from "../utils.js";

let currentModel = null;
let onSaveCallback = null;
let activeBatchId = null;

const PART_LABELS = {
  product: "整机",
  motor: "电机",
  battery: "电池包",
  gearbox: "齿轮箱/传动",
  blade: "刀片组件",
  bearing: "轴承",
};

export function initAnalysisPage(onSave) {
  onSaveCallback = onSave;

  const newBatchBtn = document.getElementById("ana-new-batch");
  const importBtn = document.getElementById("ana-import");
  const importFile = document.getElementById("ana-import-file");
  const downloadTemplateBtn = document.getElementById("ana-download-template");
  const emptyDownloadTemplateBtn = document.getElementById("empty-download-template");
  const addItemBtn = document.getElementById("ana-add-item");
  const deleteBatchBtn = document.getElementById("ana-batch-delete");
  const batchTabs = document.getElementById("batch-tabs");
  const itemsTbody = document.getElementById("items-tbody");

  if (newBatchBtn) newBatchBtn.addEventListener("click", newBatch);
  if (importBtn) importBtn.addEventListener("click", () => importFile?.click());
  if (importFile) importFile.addEventListener("change", importCsv);
  if (downloadTemplateBtn) downloadTemplateBtn.addEventListener("click", downloadCsvTemplate);
  if (emptyDownloadTemplateBtn) emptyDownloadTemplateBtn.addEventListener("click", downloadCsvTemplate);
  if (addItemBtn) addItemBtn.addEventListener("click", addItem);
  if (deleteBatchBtn) deleteBatchBtn.addEventListener("click", deleteBatch);

  ["batch-name", "batch-part", "batch-date", "batch-note"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", updateBatchFromForm);
  });

  if (batchTabs) {
    batchTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".batch-tab");
      if (!tab) return;
      activeBatchId = tab.dataset.id;
      saveAndRefresh();
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
      updateCharts();
    });

    itemsTbody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action='delete']");
      if (!btn) return;
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const batch = getActiveBatch();
      if (!batch) return;
      batch.items = batch.items.filter((i) => i.id !== id);
      saveAndRefresh();
    });
  }
}

function getDefinitionResult(model) {
  if (model.lastResult) return model.lastResult;
  try {
    const inputs = mergeInputs(model.record, model.definition);
    return calculateAll(inputs);
  } catch {
    return null;
  }
}

function getTargetB10(model) {
  const result = getDefinitionResult(model);
  return result?.b10Target ?? null;
}

function newBatch() {
  if (!currentModel) return;
  const num = currentModel.analysis.batches.length + 1;
  const batch = defaultAnalysisBatch(`试验批次 ${num}`);
  currentModel.analysis.batches.push(batch);
  activeBatchId = batch.id;
  saveAndRefresh();
}

function deleteBatch() {
  if (!activeBatchId) return;
  if (!confirm("确定删除该试验批次？此操作不可恢复。")) return;
  currentModel.analysis.batches = currentModel.analysis.batches.filter(
    (b) => b.id !== activeBatchId
  );
  activeBatchId = currentModel.analysis.batches[0]?.id ?? null;
  saveAndRefresh();
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
  saveAndRefresh();
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
      const num = currentModel.analysis.batches.length + 1;
      const batch = defaultAnalysisBatch(`导入批次 ${num}`);
      batch.items = items;
      currentModel.analysis.batches.push(batch);
      activeBatchId = batch.id;
      saveAndRefresh();
      toast(document.getElementById("ana-import"), `导入 ${items.length} 条`, 1500);
    } catch (err) {
      alert("导入失败：" + err.message);
    }
    e.target.value = "";
  };
  reader.readAsText(file);
}

function getActiveBatch() {
  return currentModel.analysis.batches.find((b) => b.id === activeBatchId);
}

function updateBatchFromForm() {
  const batch = getActiveBatch();
  if (!batch) return;
  batch.name = document.getElementById("batch-name").value;
  batch.part = document.getElementById("batch-part").value;
  batch.startDate = document.getElementById("batch-date").value;
  batch.note = document.getElementById("batch-note").value;
  renderBatchTabs();
  autoSave();
}

function autoSave() {
  if (!onSaveCallback || !currentModel) return;
  onSaveCallback({
    record: currentModel.record,
    definition: currentModel.definition,
    planning: currentModel.planning,
    analysis: currentModel.analysis,
    lastResult: currentModel.lastResult,
  });
}

function saveAndRefresh() {
  autoSave();
  renderAnalysisPage(currentModel);
}

function renderBatchTabs() {
  const container = document.getElementById("batch-tabs");
  const batches = currentModel.analysis.batches;
  if (batches.length === 0) {
    container.innerHTML =
      '<p class="hint" style="margin-top: 0.75rem;">暂无批次，点击「新建批次」开始录入试验数据。</p>';
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
  document.getElementById("batch-detail-section").hidden = !hasBatch;
  document.getElementById("batch-items-section").hidden = !hasBatch;
  if (!batch) return;

  document.getElementById("batch-name").value = batch.name;
  document.getElementById("batch-part").value = batch.part;
  document.getElementById("batch-date").value = batch.startDate;
  document.getElementById("batch-note").value = batch.note || "";

  renderItemsTable(batch);
}

function renderItemsTable(batch) {
  const tbody = document.getElementById("items-tbody");
  const empty = document.getElementById("items-empty");

  if (!batch.items || batch.items.length === 0) {
    tbody.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

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

function updateSummary(analysisResult) {
  const result = getDefinitionResult(currentModel);
  document.getElementById("ana-model-name").textContent = currentModel.name;
  document.getElementById("ana-target-b10").textContent = result
    ? fmt(result.b10Target, 0) + " h"
    : "—";

  const fit = analysisResult?.fit;
  if (fit && fit.b10 != null) {
    document.getElementById("ana-actual-b10").textContent = fmt(fit.b10, 1) + " h";
    document.getElementById("ana-actual-b10").style.color = analysisResult.pass
      ? "var(--success)"
      : "var(--danger)";
    document.getElementById("ana-result").textContent = analysisResult.pass ? "通过 ✓" : "未通过 ✗";
    document.getElementById("ana-result").style.color = analysisResult.pass
      ? "var(--success)"
      : "var(--danger)";
    document.getElementById("ana-fit-summary").style.display = "grid";
    document.getElementById("ana-beta").textContent = fmt(fit.beta, 2);
    document.getElementById("ana-eta").textContent = fmt(fit.eta, 0) + " h";
    document.getElementById("ana-r2").textContent = fmt(fit.rSquared, 3);
    document.getElementById("ana-samples").textContent = analysisResult.totalSamples;
    document.getElementById("ana-failures").textContent = analysisResult.failureCount;
  } else {
    document.getElementById("ana-actual-b10").textContent = "—";
    document.getElementById("ana-actual-b10").style.color = "";
    document.getElementById("ana-result").textContent = "—";
    document.getElementById("ana-result").style.color = "";
    document.getElementById("ana-fit-summary").style.display = "none";
  }
}

function drawWeibullPlot(fit, targetB10) {
  const canvas = document.getElementById("weibull-canvas");
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

  ctx.strokeStyle = "var(--border)";
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, plotW, plotH);

  if (!fit || !fit.points || fit.points.length < 2) {
    ctx.fillStyle = "var(--text-muted)";
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
  const yMin = Math.min(...ys, -3);
  const yMax = Math.max(...ys, 1);

  const xScale = (x) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
  const yScale = (y) => padT + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

  ctx.strokeStyle = "rgba(45, 58, 79, 0.5)";
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

  ctx.fillStyle = "var(--text-muted)";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i <= 5; i++) {
    const xVal = xMin + ((xMax - xMin) / 5) * i;
    ctx.fillText(fmt(Math.exp(xVal), 0), padL + (plotW / 5) * i, padT + plotH + 15);
  }
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const yVal = yMin + ((yMax - yMin) / 4) * i;
    const pctVal = (1 - Math.exp(-Math.exp(yVal))) * 100;
    ctx.fillText(fmt(pctVal, 1) + "%", padL - 5, padT + plotH - (plotH / 4) * i + 4);
  }

  if (fit.beta && fit.eta) {
    ctx.strokeStyle = "var(--accent)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const xStart = xMin;
    const xEnd = xMax;
    const yStart = fit.beta * xStart - fit.beta * Math.log(fit.eta);
    const yEnd = fit.beta * xEnd - fit.beta * Math.log(fit.eta);
    ctx.moveTo(xScale(xStart), yScale(yStart));
    ctx.lineTo(xScale(xEnd), yScale(yEnd));
    ctx.stroke();
  }

  if (targetB10 && targetB10 > 0) {
    ctx.strokeStyle = "var(--danger)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    const xTarget = Math.log(targetB10);
    const yTarget = Math.log(Math.log(1 / 0.9));
    if (xTarget >= xMin && xTarget <= xMax) {
      ctx.beginPath();
      ctx.moveTo(xScale(xTarget), padT);
      ctx.lineTo(xScale(xTarget), padT + plotH);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  ctx.fillStyle = "var(--success)";
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(xScale(p.x), yScale(p.y), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "var(--text)";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("失效时间 (h)", w / 2, h - 5);
  ctx.save();
  ctx.translate(15, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("累积失效概率", 0, 0);
  ctx.restore();
}

function drawCdfPlot(fit, targetB10) {
  const canvas = document.getElementById("cdf-canvas");
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

  ctx.strokeStyle = "var(--border)";
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, plotW, plotH);

  if (!fit || !fit.beta || !fit.eta) {
    ctx.fillStyle = "var(--text-muted)";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("数据不足，无法拟合", w / 2, h / 2);
    return;
  }

  const tMax = fit.eta * 2;
  const tMin = 0;

  const xScale = (t) => padL + ((t - tMin) / (tMax - tMin)) * plotW;
  const yScale = (p) => padT + plotH - p * plotH;

  ctx.strokeStyle = "rgba(45, 58, 79, 0.5)";
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

  ctx.fillStyle = "var(--text-muted)";
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

  ctx.strokeStyle = "var(--accent)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let first = true;
  for (let i = 0; i <= 100; i++) {
    const t = tMin + ((tMax - tMin) / 100) * i;
    const p = weibullCdf(t, fit.eta, fit.beta);
    if (first) {
      ctx.moveTo(xScale(t), yScale(p));
      first = false;
    } else {
      ctx.lineTo(xScale(t), yScale(p));
    }
  }
  ctx.stroke();

  if (targetB10 && targetB10 > 0) {
    ctx.strokeStyle = "var(--danger)";
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
    ctx.fillStyle = "var(--danger)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`目标 B10: ${fmt(targetB10, 0)}h`, xScale(targetB10) + 5, yScale(0.1) - 5);
  }

  if (fit.points) {
    ctx.fillStyle = "var(--success)";
    for (const p of fit.points) {
      if (p.t <= tMax) {
        ctx.beginPath();
        ctx.arc(xScale(p.t), yScale(p.rank), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.fillStyle = "var(--text)";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("时间 (h)", w / 2, h - 5);
  ctx.save();
  ctx.translate(15, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("累积失效概率 F(t)", 0, 0);
  ctx.restore();
}

function renderFailureCharts(analysisResult) {
  const section = document.getElementById("failure-mode-section");
  if (!analysisResult || analysisResult.failureCount === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  const modeEl = document.getElementById("failure-mode-chart");
  const partEl = document.getElementById("failure-part-chart");

  modeEl.innerHTML = renderBarChartFromObj(analysisResult.failureModes, "失效模式");
  partEl.innerHTML = renderBarChartFromObj(analysisResult.partFailures, "失效零件", PART_LABELS);
}

function renderBarChartFromObj(obj, title, labelMap = {}) {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return '<p class="hint">暂无数据</p>';
  }
  const max = Math.max(...entries.map((e) => e[1]));
  return entries
    .map(([key, val]) => {
      const label = labelMap[key] || key;
      const pct = (val / max) * 100;
      return `
      <div class="chart-row">
        <span class="chart-label">${escapeHtml(label)}</span>
        <div class="chart-track"><div class="chart-fill" style="width:${pct}%"></div></div>
        <span class="chart-value">${val} 次</span>
      </div>`;
    })
    .join("");
}

function updateCharts() {
  const targetB10 = getTargetB10(currentModel);
  const analysisResult = calcAnalysisResult(currentModel.analysis.batches, targetB10);

  updateSummary(analysisResult);

  const hasData = analysisResult.fit && analysisResult.fit.points && analysisResult.fit.points.length >= 2;
  document.getElementById("analysis-charts-section").hidden = !hasData;

  if (hasData) {
    drawWeibullPlot(analysisResult.fit, targetB10);
    drawCdfPlot(analysisResult.fit, targetB10);
  }

  renderFailureCharts(analysisResult);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderAnalysisPage(model) {
  currentModel = model;

  if (!activeBatchId || !model.analysis.batches.find((b) => b.id === activeBatchId)) {
    activeBatchId = model.analysis.batches[0]?.id ?? null;
  }

  const targetB10 = getTargetB10(model);
  const analysisResult = calcAnalysisResult(model.analysis.batches, targetB10);

  updateSummary(analysisResult);
  renderBatchTabs();
  renderBatchDetail();

  const hasData = analysisResult.fit && analysisResult.fit.points && analysisResult.fit.points.length >= 2;
  document.getElementById("analysis-charts-section").hidden = !hasData;
  if (hasData) {
    drawWeibullPlot(analysisResult.fit, targetB10);
    drawCdfPlot(analysisResult.fit, targetB10);
  }

  renderFailureCharts(analysisResult);
}
