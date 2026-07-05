import { mergeInputs } from "../store.js";
import { calculateAll, calcSampleSize, defaultPlanningItem } from "../calculator.js";
import { fmt, toast } from "../utils.js";

let currentModel = null;
let onSaveCallback = null;

const PART_LABELS = {
  product: "整机",
  motor: "电机",
  battery: "电池包",
  gearbox: "齿轮箱/传动",
  blade: "刀片组件",
  bearing: "轴承",
};

export function initPlanningPage(onSave) {
  onSaveCallback = onSave;

  document.getElementById("plan-apply-global").addEventListener("click", applyGlobal);
  document.getElementById("plan-calc-all").addEventListener("click", calcAll);
  document.getElementById("plan-save").addEventListener("click", savePlanning);

  document.getElementById("planning-tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='calc']");
    if (!btn) return;
    const tr = btn.closest("tr");
    const id = tr.dataset.id;
    calcItem(id, btn);
  });

  document.getElementById("planning-tbody").addEventListener("change", (e) => {
    const el = e.target.closest("[data-field]");
    if (!el) return;
    const tr = el.closest("tr");
    const id = tr.dataset.id;
    const field = el.dataset.field;
    const planning = currentModel?.planning;
    if (!planning) return;
    const item = planning.items.find((it) => it.id === id);
    if (!item) return;
    if (el.type === "number") {
      item[field] = el.value ? Number(el.value) : null;
    } else {
      item[field] = el.value;
    }
  });
}

function getDefinitionResult(model) {
  const inputs = mergeInputs(model.record, model.definition);
  if (model.lastResult) return model.lastResult;
  try {
    return calculateAll(inputs);
  } catch {
    return null;
  }
}

function getTargetB10(itemId, result) {
  if (!result) return null;
  if (itemId === "product") return result.b10Target;
  const part = result.partEntries.find((p) => p.id === itemId);
  return part?.included ? part.equivHours : null;
}

function syncPlanningItems(model, result) {
  const planning = model.planning;
  const defaultIds = ["product", "motor", "battery", "gearbox", "blade", "bearing"];
  const expectedIds = [];
  if (result && result.partEntries) {
    expectedIds.push("product");
    for (const p of result.partEntries) {
      if (p.included) expectedIds.push(p.id);
    }
  } else {
    expectedIds.push(...defaultIds);
  }

  for (const id of expectedIds) {
    if (!planning.items.find((it) => it.id === id)) {
      planning.items.push(
        defaultPlanningItem(id, PART_LABELS[id] || id, getTargetB10(id, result) || 0)
      );
    }
  }

  planning.items = planning.items.filter((it) => expectedIds.includes(it.id));

  for (const item of planning.items) {
    const target = getTargetB10(item.id, result);
    if (target != null && target > 0) item.targetB10 = target;
    if (!item.name) item.name = PART_LABELS[item.id] || item.id;
    if (!item.censoringType) item.censoringType = "time";
  }
}

function renderSummary(model, result) {
  document.getElementById("plan-model-name").textContent = model.name;
  document.getElementById("plan-target-b10").textContent = result
    ? fmt(result.b10Target, 0) + " h"
    : "—";
  document.getElementById("plan-parts-b10").textContent = result
    ? fmt(result.b10Parts, 0) + " h"
    : "—";
  document.getElementById("plan-bottleneck").textContent = result?.bottleneck?.name ?? "—";
}

function renderTable(planning, result) {
  const tbody = document.getElementById("planning-tbody");
  tbody.innerHTML = "";

  for (const item of planning.items) {
    const target = getTargetB10(item.id, result);
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    tr.innerHTML = `
      <td><strong>${item.name}</strong></td>
      <td class="target-cell">${target != null ? fmt(target, 0) + " h" : "—"}</td>
      <td>
        <select data-field="censoringType" class="plan-select">
          <option value="time" ${item.censoringType === "time" ? "selected" : ""}>定时截尾</option>
          <option value="complete" ${item.censoringType === "complete" ? "selected" : ""}>完全失效</option>
          <option value="failure_count" ${item.censoringType === "failure_count" ? "selected" : ""}>定数截尾</option>
        </select>
      </td>
      <td>
        <input type="number" data-field="sampleSize" class="plan-input" min="1" step="1"
          value="${item.sampleSize ?? ""}" placeholder="自动" />
      </td>
      <td>
        <input type="number" data-field="testDuration" class="plan-input" min="0" step="1"
          value="${item.testDuration ?? ""}" placeholder="自动" />
      </td>
      <td>
        <input type="text" data-field="benchCondition" class="plan-input"
          value="${item.benchCondition || ""}" placeholder="台架加载条件" />
      </td>
      <td>
        <button type="button" data-action="calc" class="btn-sm btn-secondary">计算</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

function calcItem(itemId, triggerEl) {
  const planning = currentModel.planning;
  const result = getDefinitionResult(currentModel);
  const item = planning.items.find((it) => it.id === itemId);
  if (!item) return;

  const target = getTargetB10(itemId, result);
  if (!target || target <= 0) {
    alert("请先在产品定义页点击「计算测试标准」，生成目标 B10 后再进行规划。");
    return;
  }

  const confidence = Number(document.getElementById("plan-confidence").value) / 100;
  const allowedFailures = Number(document.getElementById("plan-allowed-failures").value) || 0;
  const { sampleSize, testDuration } = calcSampleSize(
    target,
    item.censoringType,
    confidence,
    allowedFailures
  );

  item.sampleSize = sampleSize;
  item.testDuration = Math.round(testDuration);
  item.allowedFailures = allowedFailures;

  renderTable(planning, result);
  if (triggerEl) toast(triggerEl, `已计算: ${sampleSize} 样本`, 1200);
}

function calcAll() {
  const result = getDefinitionResult(currentModel);
  if (!result) {
    alert("请先在产品定义页计算目标 B10");
    return;
  }

  const confidence = Number(document.getElementById("plan-confidence").value) / 100;
  const allowedFailures = Number(document.getElementById("plan-allowed-failures").value) || 0;

  for (const item of currentModel.planning.items) {
    const target = getTargetB10(item.id, result);
    if (!target || target <= 0) continue;
    const { sampleSize, testDuration } = calcSampleSize(
      target,
      item.censoringType,
      confidence,
      allowedFailures
    );
    item.sampleSize = sampleSize;
    item.testDuration = Math.round(testDuration);
    item.allowedFailures = allowedFailures;
  }

  renderTable(currentModel.planning, result);
  toast(document.getElementById("plan-calc-all"), "已计算全部", 1500);
}

function applyGlobal() {
  const censoringType = document.getElementById("plan-default-censoring").value;
  for (const item of currentModel.planning.items) {
    item.censoringType = censoringType;
  }
  const result = getDefinitionResult(currentModel);
  renderTable(currentModel.planning, result);
  toast(document.getElementById("plan-apply-global"), "已应用", 1500);
}

function savePlanning() {
  if (!onSaveCallback || !currentModel) return;
  onSaveCallback({
    record: currentModel.record,
    definition: currentModel.definition,
    planning: currentModel.planning,
    lastResult: currentModel.lastResult,
  });
  toast(document.getElementById("plan-save"), "已保存", 1500);
}

export function renderPlanningPage(model) {
  currentModel = model;
  const result = getDefinitionResult(model);

  syncPlanningItems(model, result);

  if (model.definition) {
    document.getElementById("plan-confidence").value = String(model.definition.confidence || 90);
  }

  renderSummary(model, result);
  renderTable(model.planning, result);
}
