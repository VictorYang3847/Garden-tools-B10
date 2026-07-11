import { html, render as litRender } from 'lit-html';
import { live } from 'lit-html/directives/live.js';

let onSaveCallback = null;
let currentModel = null;
let deratingData = null;

const COMPONENT_TYPES = [
  { value: "resistor", label: "电阻", stress: ["temp", "current", "power"] },
  { value: "capacitor", label: "电容", stress: ["temp", "voltage"] },
  { value: "inductor", label: "电感", stress: ["temp", "current"] },
  { value: "diode", label: "二极管", stress: ["temp", "current", "voltage", "power"] },
  { value: "transistor", label: "晶体管", stress: ["temp", "voltage", "current", "power"] },
  { value: "ic", label: "IC", stress: ["temp", "voltage", "power"] },
  { value: "connector", label: "连接器", stress: ["temp", "current"] },
  { value: "relay", label: "继电器", stress: ["temp", "voltage", "current", "power"] },
];

const DERATING_STANDARDS = {
  "mil-hdbk-217": {
    name: "Mil-Hdbk-217",
    temp: { level1: 0.7, level2: 0.8, level3: 0.9 },
    voltage: { level1: 0.6, level2: 0.7, level3: 0.8 },
    current: { level1: 0.5, level2: 0.7, level3: 0.85 },
    power: { level1: 0.5, level2: 0.7, level3: 0.85 },
  },
  "gjb-z35": {
    name: "GJB/Z 35",
    temp: { level1: 0.65, level2: 0.75, level3: 0.85 },
    voltage: { level1: 0.55, level2: 0.65, level3: 0.75 },
    current: { level1: 0.45, level2: 0.6, level3: 0.75 },
    power: { level1: 0.45, level2: 0.6, level3: 0.75 },
  },
  custom: {
    name: "自定义",
    temp: { level1: 0.7, level2: 0.8, level3: 0.9 },
    voltage: { level1: 0.6, level2: 0.7, level3: 0.8 },
    current: { level1: 0.5, level2: 0.7, level3: 0.85 },
    power: { level1: 0.5, level2: 0.7, level3: 0.85 },
  },
};

function genId() {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getComponentType(typeValue) {
  return COMPONENT_TYPES.find((t) => t.value === typeValue) || COMPONENT_TYPES[0];
}

function getStandard(standardKey) {
  return DERATING_STANDARDS[standardKey] || DERATING_STANDARDS["mil-hdbk-217"];
}

function calculateDeratingLevel(ratio, limits) {
  if (ratio <= limits.level1) return 1;
  if (ratio <= limits.level2) return 2;
  if (ratio <= limits.level3) return 3;
  return 0;
}

function getStatusFromLevel(level) {
  if (level === 1 || level === 2) return "pass";
  if (level === 3) return "warning";
  return "fail";
}

function getOverallStatus(component) {
  const type = getComponentType(component.type);
  const standard = getStandard(deratingData.standard);
  let worstLevel = 1;

  for (const stress of type.stress) {
    const ratio = component[`${stress}DeratingRatio`] ?? 0;
    const limits = standard[stress];
    if (limits) {
      const level = calculateDeratingLevel(ratio, limits);
      if (level === 0) return "fail";
      if (level > worstLevel) worstLevel = level;
    }
  }

  return getStatusFromLevel(worstLevel);
}

function getWorstDeratingRatio(component) {
  const type = getComponentType(component.type);
  let worst = 0;
  for (const stress of type.stress) {
    const ratio = component[`${stress}DeratingRatio`] ?? 0;
    if (ratio > worst) worst = ratio;
  }
  return worst;
}

function createNewComponent() {
  return {
    id: genId(),
    name: "",
    type: "resistor",
    ratedTemp: 125,
    operatingTemp: 55,
    tempDeratingRatio: 0,
    ratedVoltage: 50,
    operatingVoltage: 24,
    voltageDeratingRatio: 0,
    ratedCurrent: 1,
    operatingCurrent: 0.5,
    currentDeratingRatio: 0,
    ratedPower: 1,
    operatingPower: 0.5,
    powerDeratingRatio: 0,
    tempLevel: 0,
    voltageLevel: 0,
    currentLevel: 0,
    powerLevel: 0,
    overallStatus: "pass",
  };
}

function updateComponentCalculations(comp) {
  const standard = getStandard(deratingData.standard);
  const type = getComponentType(comp.type);

  if (comp.ratedTemp > 0) {
    comp.tempDeratingRatio = comp.operatingTemp / comp.ratedTemp;
    comp.tempLevel = calculateDeratingLevel(comp.tempDeratingRatio, standard.temp);
  } else {
    comp.tempDeratingRatio = 0;
    comp.tempLevel = 1;
  }

  if (comp.ratedVoltage > 0) {
    comp.voltageDeratingRatio = comp.operatingVoltage / comp.ratedVoltage;
    comp.voltageLevel = calculateDeratingLevel(comp.voltageDeratingRatio, standard.voltage);
  } else {
    comp.voltageDeratingRatio = 0;
    comp.voltageLevel = 1;
  }

  if (comp.ratedCurrent > 0) {
    comp.currentDeratingRatio = comp.operatingCurrent / comp.ratedCurrent;
    comp.currentLevel = calculateDeratingLevel(comp.currentDeratingRatio, standard.current);
  } else {
    comp.currentDeratingRatio = 0;
    comp.currentLevel = 1;
  }

  if (comp.ratedPower > 0) {
    comp.powerDeratingRatio = comp.operatingPower / comp.ratedPower;
    comp.powerLevel = calculateDeratingLevel(comp.powerDeratingRatio, standard.power);
  } else {
    comp.powerDeratingRatio = 0;
    comp.powerLevel = 1;
  }

  comp.overallStatus = getOverallStatus(comp);
}

function formatRatio(ratio) {
  return (ratio * 100).toFixed(1) + "%";
}

function levelLabel(level) {
  if (level === 1) return "Ⅰ级";
  if (level === 2) return "Ⅱ级";
  if (level === 3) return "Ⅲ级";
  return "超限";
}

function statusDot(status) {
  return html`<span class="status-dot status-${status}"></span>`;
}

function statusLabel(status) {
  const labels = { pass: "合格", warning: "警告", fail: "不合格" };
  return labels[status] || status;
}

function renderRow(comp, index) {
  const type = getComponentType(comp.type);
  const standard = getStandard(deratingData.standard);
  const worstRatio = getWorstDeratingRatio(comp);
  const worstLevel = comp.overallStatus === "pass" ? (worstRatio <= standard.temp.level1 ? 1 : 2) : (comp.overallStatus === "warning" ? 3 : 0);

  const showTemp = type.stress.includes("temp");
  const showVoltage = type.stress.includes("voltage");
  const showCurrent = type.stress.includes("current");
  const showPower = type.stress.includes("power");

  const level1Limit = standard[worstRatio === comp.tempDeratingRatio && showTemp ? "temp" : showVoltage && worstRatio === comp.voltageDeratingRatio ? "voltage" : showCurrent && worstRatio === comp.currentDeratingRatio ? "current" : "power"]?.level1 ?? 0.7;
  const level2Limit = standard[worstRatio === comp.tempDeratingRatio && showTemp ? "temp" : showVoltage && worstRatio === comp.voltageDeratingRatio ? "voltage" : showCurrent && worstRatio === comp.currentDeratingRatio ? "current" : "power"]?.level2 ?? 0.8;
  const level3Limit = standard[worstRatio === comp.tempDeratingRatio && showTemp ? "temp" : showVoltage && worstRatio === comp.voltageDeratingRatio ? "voltage" : showCurrent && worstRatio === comp.currentDeratingRatio ? "current" : "power"]?.level3 ?? 0.9;

  return html`
    <tr data-id="${comp.id}">
      <td class="derating-index">${index + 1}</td>
      <td><input type="text" class="item-input" data-field="name" .value=${live(comp.name)} placeholder="元器件名称" @input=${_onFieldChange} /></td>
      <td>
        <select class="item-input derating-type-select" data-field="type" .value=${live(comp.type)} @change=${_onFieldChange}>
          ${COMPONENT_TYPES.map((t) => html`<option value="${t.value}">${t.label}</option>`)}
        </select>
      </td>
      <td class="col-temp" style="${showTemp ? "" : "display: none;"}">
        <input type="number" class="item-input derating-num-input" data-field="ratedTemp" .value=${live(String(comp.ratedTemp))} min="0" step="1" @input=${_onFieldChange} />
      </td>
      <td class="col-temp" style="${showTemp ? "" : "display: none;"}">
        <input type="number" class="item-input derating-num-input" data-field="operatingTemp" .value=${live(String(comp.operatingTemp))} min="0" step="1" @input=${_onFieldChange} />
      </td>
      <td class="col-temp derating-ratio-cell" style="${showTemp ? "" : "display: none;"}">
        <span class="ratio-text level-${comp.tempLevel}">${formatRatio(comp.tempDeratingRatio)}</span>
      </td>
      <td class="col-voltage" style="${showVoltage ? "" : "display: none;"}">
        <input type="number" class="item-input derating-num-input" data-field="ratedVoltage" .value=${live(String(comp.ratedVoltage))} min="0" step="0.1" @input=${_onFieldChange} />
      </td>
      <td class="col-voltage" style="${showVoltage ? "" : "display: none;"}">
        <input type="number" class="item-input derating-num-input" data-field="operatingVoltage" .value=${live(String(comp.operatingVoltage))} min="0" step="0.1" @input=${_onFieldChange} />
      </td>
      <td class="col-voltage derating-ratio-cell" style="${showVoltage ? "" : "display: none;"}">
        <span class="ratio-text level-${comp.voltageLevel}">${formatRatio(comp.voltageDeratingRatio)}</span>
      </td>
      <td class="col-current" style="${showCurrent ? "" : "display: none;"}">
        <input type="number" class="item-input derating-num-input" data-field="ratedCurrent" .value=${live(String(comp.ratedCurrent))} min="0" step="0.01" @input=${_onFieldChange} />
      </td>
      <td class="col-current" style="${showCurrent ? "" : "display: none;"}">
        <input type="number" class="item-input derating-num-input" data-field="operatingCurrent" .value=${live(String(comp.operatingCurrent))} min="0" step="0.01" @input=${_onFieldChange} />
      </td>
      <td class="col-current derating-ratio-cell" style="${showCurrent ? "" : "display: none;"}">
        <span class="ratio-text level-${comp.currentLevel}">${formatRatio(comp.currentDeratingRatio)}</span>
      </td>
      <td class="col-power" style="${showPower ? "" : "display: none;"}">
        <input type="number" class="item-input derating-num-input" data-field="ratedPower" .value=${live(String(comp.ratedPower))} min="0" step="0.01" @input=${_onFieldChange} />
      </td>
      <td class="col-power" style="${showPower ? "" : "display: none;"}">
        <input type="number" class="item-input derating-num-input" data-field="operatingPower" .value=${live(String(comp.operatingPower))} min="0" step="0.01" @input=${_onFieldChange} />
      </td>
      <td class="col-power derating-ratio-cell" style="${showPower ? "" : "display: none;"}">
        <span class="ratio-text level-${comp.powerLevel}">${formatRatio(comp.powerDeratingRatio)}</span>
      </td>
      <td class="derating-limit-cell">${(level1Limit * 100).toFixed(0)}%</td>
      <td class="derating-limit-cell">${(level2Limit * 100).toFixed(0)}%</td>
      <td class="derating-limit-cell">${(level3Limit * 100).toFixed(0)}%</td>
      <td class="derating-level-cell">
        <span class="level-badge level-${worstLevel === 0 ? 0 : worstLevel}">${levelLabel(worstLevel === 0 ? 0 : worstLevel)}</span>
      </td>
      <td class="derating-status-cell">
        ${statusDot(comp.overallStatus)}
        <span>${statusLabel(comp.overallStatus)}</span>
      </td>
      <td class="derating-action-cell">
        <button type="button" class="derating-delete-btn" data-action="delete" title="删除" @click=${_onDeleteClick}>🗑️</button>
      </td>
    </tr>
  `;
}

// current render context for event handlers
let _container = null;

function _onFieldChange(e) {
  const input = e.target;
  if (!input.matches("[data-field]")) return;
  const tr = input.closest("tr");
  if (!tr) return;
  const id = tr.dataset.id;
  const field = input.dataset.field;
  const comp = deratingData.components.find((c) => c.id === id);
  if (!comp) return;

  if (input.type === "number") {
    comp[field] = Number(input.value) || 0;
  } else {
    comp[field] = input.value;
  }

  if (field === "type") {
    updateComponentCalculations(comp);
    saveData();
    renderTable(_container);
    renderStats(_container);
    renderMarginAnalysis(_container);
    return;
  }

  updateComponentCalculations(comp);
  saveData();

  const ratioCell = tr.querySelector(`.col-${field.replace(/^rated|^operating/, "").toLowerCase()}.derating-ratio-cell .ratio-text`);
  const statusCell = tr.querySelector(".derating-status-cell");
  const levelCell = tr.querySelector(".derating-level-cell .level-badge");

  if (field.startsWith("ratedTemp") || field.startsWith("operatingTemp")) {
    const tempRatioCell = tr.querySelector(".col-temp.derating-ratio-cell .ratio-text");
    if (tempRatioCell) {
      tempRatioCell.textContent = formatRatio(comp.tempDeratingRatio);
      tempRatioCell.className = `ratio-text level-${comp.tempLevel}`;
    }
  }
  if (field.startsWith("ratedVoltage") || field.startsWith("operatingVoltage")) {
    const voltRatioCell = tr.querySelector(".col-voltage.derating-ratio-cell .ratio-text");
    if (voltRatioCell) {
      voltRatioCell.textContent = formatRatio(comp.voltageDeratingRatio);
      voltRatioCell.className = `ratio-text level-${comp.voltageLevel}`;
    }
  }
  if (field.startsWith("ratedCurrent") || field.startsWith("operatingCurrent")) {
    const currRatioCell = tr.querySelector(".col-current.derating-ratio-cell .ratio-text");
    if (currRatioCell) {
      currRatioCell.textContent = formatRatio(comp.currentDeratingRatio);
      currRatioCell.className = `ratio-text level-${comp.currentLevel}`;
    }
  }
  if (field.startsWith("ratedPower") || field.startsWith("operatingPower")) {
    const powRatioCell = tr.querySelector(".col-power.derating-ratio-cell .ratio-text");
    if (powRatioCell) {
      powRatioCell.textContent = formatRatio(comp.powerDeratingRatio);
      powRatioCell.className = `ratio-text level-${comp.powerLevel}`;
    }
  }

  if (statusCell) {
    statusCell.innerHTML = `<span class="status-dot status-${comp.overallStatus}"></span><span>${statusLabel(comp.overallStatus)}</span>`;
  }

  renderStats(_container);
  renderMarginAnalysis(_container);
}

function _onDeleteClick(e) {
  const btn = e.target.closest("[data-action='delete']");
  if (!btn) return;
  const tr = btn.closest("tr");
  if (!tr) return;
  const id = tr.dataset.id;
  if (!id) return;
  if (!confirm("确定要删除这个元器件吗？")) return;
  deratingData.components = deratingData.components.filter((c) => c.id !== id);
  saveData();
  renderTable(_container);
  renderStats(_container);
  renderMarginAnalysis(_container);
}

function renderTable(container) {
  const tbody = container.querySelector("#derating-table-body");
  const emptyState = container.querySelector("#derating-empty-state");
  const countEl = container.querySelector("#derating-component-count");
  const items = deratingData.components || [];

  countEl.textContent = items.length;

  if (!items || items.length === 0) {
    litRender(html``, tbody);
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";
  litRender(html`${items.map((item, index) => renderRow(item, index))}`, tbody);
}

function updateTableHeaderVisibility(container) {
  const firstComp = deratingData.components?.[0];
  if (!firstComp) return;

  const type = getComponentType(firstComp.type);
  const stresses = type.stress;

  const headers = container.querySelectorAll(".derating-table thead th");
  headers.forEach((th) => {
    if (th.classList.contains("col-temp")) {
      th.style.display = stresses.includes("temp") ? "" : "none";
    }
    if (th.classList.contains("col-voltage")) {
      th.style.display = stresses.includes("voltage") ? "" : "none";
    }
    if (th.classList.contains("col-current")) {
      th.style.display = stresses.includes("current") ? "" : "none";
    }
    if (th.classList.contains("col-power")) {
      th.style.display = stresses.includes("power") ? "" : "none";
    }
  });
}

function calculateStats() {
  const items = deratingData.components || [];
  let pass = 0;
  let warning = 0;
  let fail = 0;

  for (const comp of items) {
    if (comp.overallStatus === "pass") pass++;
    else if (comp.overallStatus === "warning") warning++;
    else fail++;
  }

  return { pass, warning, fail, total: items.length };
}

function renderStats(container) {
  const stats = calculateStats();
  container.querySelector("#derating-pass-count").textContent = stats.pass;
  container.querySelector("#derating-warning-count").textContent = stats.warning;
  container.querySelector("#derating-fail-count").textContent = stats.fail;
  drawPieChart(container, stats);
}

function drawPieChart(container, stats) {
  const canvas = container.querySelector("#derating-pie-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const total = stats.total;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (total === 0) {
    ctx.fillStyle = "var(--surface-2)";
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 100, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "var(--text-muted)";
    ctx.font = "14px var(--font)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("暂无数据", canvas.width / 2, canvas.height / 2);
    return;
  }

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 100;
  const innerRadius = 60;

  const segments = [
    { value: stats.pass, color: "#34d399" },
    { value: stats.warning, color: "#fbbf24" },
    { value: stats.fail, color: "#f87171" },
  ];

  let startAngle = -Math.PI / 2;

  for (const seg of segments) {
    if (seg.value === 0) continue;

    const sliceAngle = (seg.value / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();

    startAngle = endAngle;
  }

  ctx.fillStyle = "var(--text)";
  ctx.font = "bold 28px var(--font)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(total, centerX, centerY - 8);

  ctx.fillStyle = "var(--text-muted)";
  ctx.font = "12px var(--font)";
  ctx.fillText("元器件总数", centerX, centerY + 16);
}

function renderMarginAnalysis(container) {
  const items = deratingData.components || [];
  const thermalContainer = container.querySelector("#derating-thermal-margin");
  const electricalContainer = container.querySelector("#derating-electrical-margin");

  if (items.length === 0) {
    thermalContainer.innerHTML = '<div class="margin-empty-hint">暂无数据</div>';
    electricalContainer.innerHTML = '<div class="margin-empty-hint">暂无数据</div>';
    container.querySelector("#derating-avg-thermal-margin").textContent = "—";
    container.querySelector("#derating-avg-electrical-margin").textContent = "—";
    container.querySelector("#derating-min-margin-component").textContent = "—";
    return;
  }

  let thermalMargins = [];
  let electricalMargins = [];
  let minMargin = Infinity;
  let minMarginComp = "";

  for (const comp of items) {
    const type = getComponentType(comp.type);

    if (type.stress.includes("temp") && comp.ratedTemp > 0) {
      const thermalMargin = ((comp.ratedTemp - comp.operatingTemp) / comp.ratedTemp) * 100;
      thermalMargins.push(thermalMargin);
      if (thermalMargin < minMargin) {
        minMargin = thermalMargin;
        minMarginComp = comp.name || "未命名";
      }
    }

    let maxElectricalRatio = 0;
    for (const stress of type.stress) {
      if (stress === "temp") continue;
      const ratio = comp[`${stress}DeratingRatio`] ?? 0;
      if (ratio > maxElectricalRatio) maxElectricalRatio = ratio;
    }
    if (maxElectricalRatio > 0) {
      const elecMargin = (1 - maxElectricalRatio) * 100;
      electricalMargins.push(elecMargin);
      if (elecMargin < minMargin) {
        minMargin = elecMargin;
        minMarginComp = comp.name || "未命名";
      }
    }
  }

  thermalContainer.innerHTML = thermalMargins.length > 0
    ? thermalMargins.map((m, i) => {
        const comp = items.filter((c) => getComponentType(c.type).stress.includes("temp"))[i];
        const name = comp?.name || "未命名";
        const color = m >= 30 ? "var(--success)" : m >= 15 ? "var(--warning)" : "var(--danger)";
        return `
          <div class="margin-bar-item">
            <div class="margin-bar-label">${escapeHtml(name)}</div>
            <div class="margin-bar-track">
              <div class="margin-bar-fill" style="width: ${Math.min(m, 100)}%; background: ${color};"></div>
            </div>
            <div class="margin-bar-value">${m.toFixed(1)}%</div>
          </div>
        `;
      }).join("")
    : '<div class="margin-empty-hint">暂无温度数据</div>';

  electricalContainer.innerHTML = electricalMargins.length > 0
    ? electricalMargins.map((m, i) => {
        const comp = items.filter((c) => getComponentType(c.type).stress.some((s) => s !== "temp"))[i];
        const name = comp?.name || "未命名";
        const color = m >= 40 ? "var(--success)" : m >= 20 ? "var(--warning)" : "var(--danger)";
        return `
          <div class="margin-bar-item">
            <div class="margin-bar-label">${escapeHtml(name)}</div>
            <div class="margin-bar-track">
              <div class="margin-bar-fill" style="width: ${Math.min(m, 100)}%; background: ${color};"></div>
            </div>
            <div class="margin-bar-value">${m.toFixed(1)}%</div>
          </div>
        `;
      }).join("")
    : '<div class="margin-empty-hint">暂无电气数据</div>';

  const avgThermal = thermalMargins.length > 0 ? thermalMargins.reduce((a, b) => a + b, 0) / thermalMargins.length : 0;
  const avgElectrical = electricalMargins.length > 0 ? electricalMargins.reduce((a, b) => a + b, 0) / electricalMargins.length : 0;

  container.querySelector("#derating-avg-thermal-margin").textContent = thermalMargins.length > 0 ? avgThermal.toFixed(1) + "%" : "—";
  container.querySelector("#derating-avg-electrical-margin").textContent = electricalMargins.length > 0 ? avgElectrical.toFixed(1) + "%" : "—";
  container.querySelector("#derating-min-margin-component").textContent = minMarginComp || "—";
}

function saveData() {
  if (onSaveCallback && currentModel) {
    const updated = {
      ...currentModel,
      modules: {
        ...currentModel.modules,
        derating: deratingData,
      },
    };
    onSaveCallback(updated);
  }
}

function handleAddComponent(container) {
  const newComp = createNewComponent();
  updateComponentCalculations(newComp);
  deratingData.components.push(newComp);
  saveData();
  renderTable(container);
  renderStats(container);
  renderMarginAnalysis(container);

  const tbody = container.querySelector("#derating-table-body");
  const lastRow = tbody.lastElementChild;
  if (lastRow) {
    const firstInput = lastRow.querySelector("input[data-field='name']");
    if (firstInput) firstInput.focus();
  }
}

function handleStandardChange(container, e) {
  const standard = e.target.value;
  deratingData.standard = standard;

  for (const comp of deratingData.components) {
    updateComponentCalculations(comp);
  }

  saveData();
  renderTable(container);
  renderStats(container);
  renderMarginAnalysis(container);
}

function exportCsv() {
  if (!deratingData.components || deratingData.components.length === 0) {
    alert("暂无数据可导出");
    return;
  }

  const standard = getStandard(deratingData.standard);
  const headers = [
    "序号",
    "元器件名称",
    "类型",
    "额定温度(°C)",
    "工作温度(°C)",
    "温度降额比",
    "额定电压(V)",
    "工作电压(V)",
    "电压降额比",
    "额定电流(A)",
    "工作电流(A)",
    "电流降额比",
    "额定功率(W)",
    "工作功率(W)",
    "功率降额比",
    "Ⅰ级上限",
    "Ⅱ级上限",
    "Ⅲ级上限",
    "整体状态",
  ];

  const typeLabels = {};
  for (const t of COMPONENT_TYPES) {
    typeLabels[t.value] = t.label;
  }

  const rows = deratingData.components.map((comp, idx) => {
    const worstRatio = getWorstDeratingRatio(comp);
    const type = getComponentType(comp.type);
    const mainStress = type.stress.find((s) => comp[`${s}DeratingRatio`] === worstRatio) || "temp";
    const limits = standard[mainStress];

    return [
      idx + 1,
      comp.name,
      typeLabels[comp.type] || comp.type,
      comp.ratedTemp,
      comp.operatingTemp,
      (comp.tempDeratingRatio * 100).toFixed(1) + "%",
      comp.ratedVoltage,
      comp.operatingVoltage,
      (comp.voltageDeratingRatio * 100).toFixed(1) + "%",
      comp.ratedCurrent,
      comp.operatingCurrent,
      (comp.currentDeratingRatio * 100).toFixed(1) + "%",
      comp.ratedPower,
      comp.operatingPower,
      (comp.powerDeratingRatio * 100).toFixed(1) + "%",
      limits ? (limits.level1 * 100).toFixed(0) + "%" : "—",
      limits ? (limits.level2 * 100).toFixed(0) + "%" : "—",
      limits ? (limits.level3 * 100).toFixed(0) + "%" : "—",
      statusLabel(comp.overallStatus),
    ];
  });

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        })
        .join(",")
    ),
  ].join("\n");

  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `降额分析报告_${standard.name}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function bindEvents(container) {
  const addBtn = container.querySelector("#derating-add-component");
  addBtn.addEventListener("click", () => handleAddComponent(container));

  const emptyAddBtn = container.querySelector("#derating-empty-add-btn");
  emptyAddBtn.addEventListener("click", () => handleAddComponent(container));

  const standardSelect = container.querySelector("#derating-standard-select");
  standardSelect.addEventListener("change", (e) => handleStandardChange(container, e));

  const exportBtn = container.querySelector("#derating-export-report");
  exportBtn.addEventListener("click", exportCsv);
}

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;
  _container = container;

  deratingData = model?.modules?.derating || { components: [], standard: "mil-hdbk-217" };
  if (!deratingData.components) deratingData.components = [];
  if (!deratingData.standard) deratingData.standard = "mil-hdbk-217";

  for (const comp of deratingData.components) {
    updateComponentCalculations(comp);
  }

  const stats = calculateStats();

  const tpl = html`
    <div class="module-page derating-page">
      <div class="module-header">
        <h2>降额裕度</h2>
        <p>元器件降额设计分析与裕度评估</p>
      </div>
      <div class="module-content">
        <div class="derating-toolbar">
          <div class="derating-toolbar-left">
            <label class="selector-group">
              <span class="selector-label">降额标准</span>
              <select id="derating-standard-select" class="header-select" .value=${live(deratingData.standard)} @change=${(e) => handleStandardChange(container, e)}>
                <option value="mil-hdbk-217">Mil-Hdbk-217</option>
                <option value="gjb-z35">GJB/Z 35</option>
                <option value="custom">自定义</option>
              </select>
            </label>
          </div>
          <div class="derating-toolbar-right">
            <button type="button" class="btn-icon btn-primary" id="derating-add-component" @click=${() => handleAddComponent(container)}>
              <span>➕</span>
              <span class="btn-text">添加元器件</span>
            </button>
            <button type="button" class="btn-icon" id="derating-export-report" @click=${exportCsv}>
              <span>📄</span>
              <span class="btn-text">生成报告</span>
            </button>
          </div>
        </div>

        <div class="derating-table-card card">
          <div class="card-header">
            <h3>降额检查清单</h3>
            <div class="card-actions">
              <span class="selector-label" style="font-size: 0.8rem; color: var(--text-muted);">共 <span id="derating-component-count">${deratingData.components.length}</span> 个元器件</span>
            </div>
          </div>
          <div class="card-body" style="padding: 0;">
            <div class="derating-table-container table-wrap">
              <table class="data-table derating-table">
                <thead>
                  <tr>
                    <th style="width: 50px;">序号</th>
                    <th style="min-width: 150px;">元器件名称</th>
                    <th style="width: 100px;">类型</th>
                    <th class="col-temp" style="width: 130px;">额定温度 (°C)</th>
                    <th class="col-temp" style="width: 130px;">工作温度 (°C)</th>
                    <th class="col-temp" style="width: 110px;">温度降额比</th>
                    <th class="col-voltage" style="width: 120px;">额定电压 (V)</th>
                    <th class="col-voltage" style="width: 120px;">工作电压 (V)</th>
                    <th class="col-voltage" style="width: 110px;">电压降额比</th>
                    <th class="col-current" style="width: 120px;">额定电流 (A)</th>
                    <th class="col-current" style="width: 120px;">工作电流 (A)</th>
                    <th class="col-current" style="width: 110px;">电流降额比</th>
                    <th class="col-power" style="width: 120px;">额定功率 (W)</th>
                    <th class="col-power" style="width: 120px;">工作功率 (W)</th>
                    <th class="col-power" style="width: 110px;">功率降额比</th>
                    <th style="width: 90px;">Ⅰ级上限</th>
                    <th style="width: 90px;">Ⅱ级上限</th>
                    <th style="width: 90px;">Ⅲ级上限</th>
                    <th style="width: 90px;">降额等级</th>
                    <th style="width: 90px;">状态</th>
                    <th style="width: 70px;">操作</th>
                  </tr>
                </thead>
                <tbody id="derating-table-body">
                </tbody>
              </table>
              <div class="derating-empty-state empty-state" id="derating-empty-state" style="${deratingData.components.length === 0 ? '' : 'display: none;'}">
                <div class="empty-icon">📋</div>
                <h3>暂无元器件数据</h3>
                <p>点击「添加元器件」按钮开始创建您的第一个元器件条目。</p>
                <button type="button" class="btn-primary" id="derating-empty-add-btn" @click=${() => handleAddComponent(container)}>添加第一个元器件</button>
              </div>
            </div>
          </div>
        </div>

        <div class="derating-bottom-grid">
          <div class="card derating-stats-card">
            <div class="card-header">
              <h3>降额统计</h3>
            </div>
            <div class="card-body">
              <div class="metrics-grid derating-stats-metrics">
                <div class="metric-card derating-stat-pass">
                  <div class="metric-label">合格</div>
                  <div class="metric-value" id="derating-pass-count">${stats.pass}</div>
                </div>
                <div class="metric-card derating-stat-warning">
                  <div class="metric-label">警告</div>
                  <div class="metric-value" id="derating-warning-count">${stats.warning}</div>
                </div>
                <div class="metric-card derating-stat-fail">
                  <div class="metric-label">不合格</div>
                  <div class="metric-value" id="derating-fail-count">${stats.fail}</div>
                </div>
              </div>
              <div class="derating-pie-container">
                <canvas id="derating-pie-canvas" width="300" height="300"></canvas>
              </div>
              <div class="derating-legend">
                <div class="legend-item">
                  <span class="legend-dot" style="background: var(--success);"></span>
                  <span>合格 (Ⅰ/Ⅱ级)</span>
                </div>
                <div class="legend-item">
                  <span class="legend-dot" style="background: var(--warning);"></span>
                  <span>警告 (Ⅲ级)</span>
                </div>
                <div class="legend-item">
                  <span class="legend-dot" style="background: var(--danger);"></span>
                  <span>不合格</span>
                </div>
              </div>
            </div>
          </div>

          <div class="card derating-margin-card">
            <div class="card-header">
              <h3>裕度分析</h3>
            </div>
            <div class="card-body">
              <div class="margin-section">
                <h4 class="margin-section-title">热裕度</h4>
                <div class="margin-bars" id="derating-thermal-margin">
                  <div class="margin-empty-hint">暂无数据</div>
                </div>
              </div>
              <div class="margin-section">
                <h4 class="margin-section-title">电气裕度</h4>
                <div class="margin-bars" id="derating-electrical-margin">
                  <div class="margin-empty-hint">暂无数据</div>
                </div>
              </div>
              <div class="margin-summary">
                <div class="margin-summary-item">
                  <span class="summary-label">平均热裕度</span>
                  <span class="summary-value" id="derating-avg-thermal-margin">—</span>
                </div>
                <div class="margin-summary-item">
                  <span class="summary-label">平均电气裕度</span>
                  <span class="summary-value" id="derating-avg-electrical-margin">—</span>
                </div>
                <div class="margin-summary-item">
                  <span class="summary-label">最低裕度器件</span>
                  <span class="summary-value" id="derating-min-margin-component">—</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  litRender(tpl, container);

  renderTable(container);
  renderStats(container);
  renderMarginAnalysis(container);
}
