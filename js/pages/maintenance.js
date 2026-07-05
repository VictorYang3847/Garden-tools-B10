import { genId } from "../store.js?v=1.0.4";
import { fmt, pct } from "../utils.js?v=1.0.4";

let currentModel = null;
let onSaveCallback = null;

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;
  const template = document.getElementById("maintenance-template");
  const content = template.content.cloneNode(true);
  container.appendChild(content);

  ensureMaintenanceData();
  bindEvents();
  renderAvailability();
  renderSparesTable();
  renderStrategy();
}

function ensureMaintenanceData() {
  if (!currentModel.modules) currentModel.modules = {};
  if (!currentModel.modules.maintenance) {
    currentModel.modules.maintenance = {
      availability: {
        mtbf: 1000,
        mttr: 2,
        detectionTime: 0.5,
        pmInterval: 500,
        pmTime: 1,
        logisticsDelay: 24,
      },
      spares: [
        {
          id: genId(),
          name: "电机组件",
          mtbf: 10000,
          annualHours: 2000,
          unitCount: 10,
          supportYears: 5,
          confidence: 0.9,
          demand: 0,
          spareCount: 0,
          shortageRate: 0,
        },
      ],
      strategy: {
        targetReliability: 0.9,
        beta: 2,
        eta: 1000,
        pmCost: 1000,
        failureCost: 5000,
      },
    };
  }
  const m = currentModel.modules.maintenance;
  if (!m.availability) m.availability = defaultAvailability();
  if (!Array.isArray(m.spares)) m.spares = [];
  if (!m.strategy) m.strategy = defaultStrategy();
}

function defaultAvailability() {
  return {
    mtbf: 1000,
    mttr: 2,
    detectionTime: 0.5,
    pmInterval: 500,
    pmTime: 1,
    logisticsDelay: 24,
  };
}

function defaultStrategy() {
  return {
    targetReliability: 0.9,
    beta: 2,
    eta: 1000,
    pmCost: 1000,
    failureCost: 5000,
  };
}

function save() {
  if (!onSaveCallback || !currentModel) return;
  onSaveCallback(currentModel);
}

function getMaint() {
  return currentModel.modules.maintenance;
}

function bindEvents() {
  const tabs = document.querySelectorAll(".maintenance-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });

  bindAvailabilityEvents();
  bindSparesEvents();
  bindStrategyEvents();
}

function switchTab(tabName) {
  const tabs = document.querySelectorAll(".maintenance-tab");
  tabs.forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });

  const contents = document.querySelectorAll(".maintenance-tab-content");
  contents.forEach((c) => {
    c.style.display = c.id === `mt-tab-${tabName}` ? "" : "none";
  });

  if (tabName === "availability") {
    setTimeout(() => drawAvailabilityChart(), 50);
  }
}

function bindAvailabilityEvents() {
  const avail = getMaint().availability;

  const inputs = [
    { id: "mt-avail-mtbf", field: "mtbf" },
    { id: "mt-avail-mttr", field: "mttr" },
    { id: "mt-avail-detection", field: "detectionTime" },
    { id: "mt-avail-pm-interval", field: "pmInterval" },
    { id: "mt-avail-pm-time", field: "pmTime" },
    { id: "mt-avail-logistics", field: "logisticsDelay" },
  ];

  inputs.forEach(({ id, field }) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = avail[field];
      el.addEventListener("input", () => {
        const val = parseFloat(el.value);
        avail[field] = Number.isFinite(val) && val >= 0 ? val : 0;
        save();
        renderAvailability();
      });
    }
  });
}

function calcAvailability() {
  const a = getMaint().availability;
  const mtbf = a.mtbf || 0;
  const mttr = a.mttr || 0;
  const detection = a.detectionTime || 0;
  const pmInterval = a.pmInterval || 0;
  const pmTime = a.pmTime || 0;
  const logistics = a.logisticsDelay || 0;

  const inherent = mtbf > 0 ? mtbf / (mtbf + mttr) : 0;

  const failureRate = mtbf > 0 ? 1 / mtbf : 0;
  const pmRate = pmInterval > 0 ? 1 / pmInterval : 0;
  const mtbm = failureRate + pmRate > 0 ? 1 / (failureRate + pmRate) : 0;

  const mdt = mttr + logistics + detection;

  const achieved = mtbm > 0 ? mtbm / (mtbm + mdt) : 0;

  const availFactor = pmInterval > 0 ? pmInterval / (pmInterval + pmTime) : 1;
  const operational = mtbf > 0 ? (mtbf * availFactor) / (mtbf * availFactor + mdt) : 0;

  return {
    inherent,
    achieved,
    operational,
    mtbf,
    mttr,
    mtbm,
    mdt,
  };
}

function renderAvailability() {
  const result = calcAvailability();

  const setVal = (id, val, fmtFn) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtFn ? fmtFn(val) : val;
  };

  setVal("mt-avail-inherent", result.inherent, (v) => pct(v, 2));
  setVal("mt-avail-achieved", result.achieved, (v) => pct(v, 2));
  setVal("mt-avail-operational", result.operational, (v) => pct(v, 2));
  setVal("mt-avail-mtbf-val", result.mtbf, (v) => fmt(v, 1));
  setVal("mt-avail-mttr-val", result.mttr, (v) => fmt(v, 2));
  setVal("mt-avail-mtbm", result.mtbm, (v) => fmt(v, 1));
  setVal("mt-avail-mdt", result.mdt, (v) => fmt(v, 2));

  const canvas = document.getElementById("mt-avail-chart");
  if (canvas && canvas.offsetParent !== null) {
    drawAvailabilityChart();
  }
}

function drawAvailabilityChart() {
  const canvas = document.getElementById("mt-avail-chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const padding = { top: 40, right: 40, bottom: 50, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#1a2332";
  ctx.fillRect(0, 0, width, height);

  const result = calcAvailability();
  const data = [
    { label: "固有可用度", value: result.inherent, color: "#3b9eff" },
    { label: "可达可用度", value: result.achieved, color: "#34d399" },
    { label: "使用可用度", value: result.operational, color: "#fbbf24" },
  ];

  ctx.strokeStyle = "#2d3a4f";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 5; i++) {
    const y = padding.top + (chartH / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.stroke();

    const val = 1 - i * 0.2;
    ctx.fillStyle = "#8b9cb3";
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText((val * 100).toFixed(0) + "%", padding.left - 8, y + 4);
  }

  const barWidth = chartW / data.length * 0.5;
  const barGap = chartW / data.length;

  data.forEach((d, i) => {
    const x = padding.left + barGap * i + (barGap - barWidth) / 2;
    const barH = chartH * d.value;
    const y = padding.top + chartH - barH;

    const gradient = ctx.createLinearGradient(0, y, 0, y + barH);
    gradient.addColorStop(0, d.color);
    gradient.addColorStop(1, d.color + "44");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    const radius = 6;
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + barWidth - radius, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
    ctx.lineTo(x + barWidth, y + barH);
    ctx.lineTo(x, y + barH);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();

    ctx.fillStyle = "#e8edf4";
    ctx.font = "bold 13px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText((d.value * 100).toFixed(1) + "%", x + barWidth / 2, y - 8);

    ctx.fillStyle = "#8b9cb3";
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.fillText(d.label, x + barWidth / 2, padding.top + chartH + 20);
  });

  ctx.strokeStyle = "#8b9cb3";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.lineTo(padding.left + chartW, padding.top + chartH);
  ctx.stroke();

  ctx.fillStyle = "#e8edf4";
  ctx.font = "12px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("可用度类型", padding.left + chartW / 2, height - 10);
}

function bindSparesEvents() {
  const addBtn = document.getElementById("mt-spares-add");
  if (addBtn) {
    addBtn.addEventListener("click", () => addSpare());
  }

  const tbody = document.getElementById("mt-spares-tbody");
  if (tbody) {
    tbody.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest("[data-delete]");
      if (deleteBtn) {
        const id = deleteBtn.dataset.delete;
        deleteSpare(id);
      }
    });

    tbody.addEventListener("change", (e) => {
      const row = e.target.closest("[data-id]");
      if (!row) return;
      const id = row.dataset.id;
      const field = e.target.dataset.field;
      if (!field) return;

      const spares = getMaint().spares;
      const spare = spares.find((s) => s.id === id);
      if (!spare) return;

      if (field === "name") {
        spare.name = e.target.value;
      } else if (field === "confidence") {
        spare.confidence = parseFloat(e.target.value) || 0.9;
      } else {
        const val = parseFloat(e.target.value);
        spare[field] = Number.isFinite(val) && val >= 0 ? val : 0;
      }

      calcSpareDemand(spare);
      save();
      renderSparesTable();
    });
  }
}

function calcSpareDemand(spare) {
  const lambda = spare.mtbf > 0 ? 1 / spare.mtbf : 0;
  const totalTime = spare.annualHours * spare.unitCount * spare.supportYears;
  const mu = lambda * totalTime;

  const zMap = { 0.9: 1.28, 0.95: 1.645, 0.99: 2.33 };
  const z = zMap[spare.confidence] || 1.28;

  const spareCount = Math.ceil(mu + z * Math.sqrt(Math.max(mu, 0)));
  const shortageRate = mu > 0 ? Math.max(0, 1 - poissonCDF(spareCount - 1, mu)) : 0;
  const turnover = spareCount > 0 ? mu / spareCount : 0;

  spare.demand = mu;
  spare.spareCount = spareCount;
  spare.shortageRate = shortageRate;
  spare.turnover = turnover;
}

function poissonCDF(k, mu) {
  if (k < 0 || mu <= 0) return 0;
  let sum = 0;
  let term = Math.exp(-mu);
  sum += term;
  for (let i = 1; i <= k; i++) {
    term *= mu / i;
    sum += term;
    if (term < 1e-15) break;
  }
  return Math.min(sum, 1);
}

function addSpare() {
  const spares = getMaint().spares;
  const newSpare = {
    id: genId(),
    name: "新备件",
    mtbf: 5000,
    annualHours: 2000,
    unitCount: 10,
    supportYears: 5,
    confidence: 0.9,
    demand: 0,
    spareCount: 0,
    shortageRate: 0,
  };
  calcSpareDemand(newSpare);
  spares.push(newSpare);
  save();
  renderSparesTable();
}

function deleteSpare(id) {
  const spares = getMaint().spares;
  getMaint().spares = spares.filter((s) => s.id !== id);
  save();
  renderSparesTable();
}

function renderSparesTable() {
  const tbody = document.getElementById("mt-spares-tbody");
  const emptyState = document.getElementById("mt-spares-empty");
  if (!tbody) return;

  const spares = getMaint().spares;

  spares.forEach((s) => calcSpareDemand(s));

  if (spares.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) emptyState.style.display = "";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  let html = "";
  spares.forEach((s, idx) => {
    html += `
      <tr data-id="${s.id}">
        <td>${idx + 1}</td>
        <td>
          <input type="text" class="item-input" data-field="name" value="${escapeHtml(s.name || "")}" />
        </td>
        <td>
          <input type="number" class="item-input" data-field="mtbf" value="${s.mtbf}" min="0" step="1" />
        </td>
        <td>
          <input type="number" class="item-input" data-field="annualHours" value="${s.annualHours}" min="0" step="1" />
        </td>
        <td>
          <input type="number" class="item-input" data-field="unitCount" value="${s.unitCount}" min="0" step="1" />
        </td>
        <td>
          <input type="number" class="item-input" data-field="supportYears" value="${s.supportYears}" min="0" step="1" />
        </td>
        <td>
          <select class="item-input" data-field="confidence">
            <option value="0.9" ${s.confidence === 0.9 ? "selected" : ""}>90%</option>
            <option value="0.95" ${s.confidence === 0.95 ? "selected" : ""}>95%</option>
            <option value="0.99" ${s.confidence === 0.99 ? "selected" : ""}>99%</option>
          </select>
        </td>
        <td style="text-align: center; font-weight: 600; color: var(--accent);">${fmt(s.demand, 1)}</td>
        <td style="text-align: center; font-weight: 600; color: var(--success);">${s.spareCount}</td>
        <td style="text-align: center; color: ${s.shortageRate > 0.1 ? 'var(--warning)' : 'var(--text-muted)'};">${pct(s.shortageRate, 2)}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-icon btn-sm btn-danger" data-delete="${s.id}" title="删除" style="padding: 0.25rem 0.5rem;">
            <span>🗑️</span>
          </button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function bindStrategyEvents() {
  const strat = getMaint().strategy;

  const inputs = [
    { id: "mt-strat-target-rel", field: "targetReliability" },
    { id: "mt-strat-beta", field: "beta" },
    { id: "mt-strat-eta", field: "eta" },
    { id: "mt-strat-pm-cost", field: "pmCost" },
    { id: "mt-strat-failure-cost", field: "failureCost" },
  ];

  inputs.forEach(({ id, field }) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = strat[field];
      el.addEventListener("input", () => {
        const val = parseFloat(el.value);
        strat[field] = Number.isFinite(val) && val >= 0 ? val : 0;
        save();
        renderStrategy();
      });
    }
  });
}

function calcStrategy() {
  const s = getMaint().strategy;
  const targetR = s.targetReliability || 0.9;
  const beta = s.beta || 1;
  const eta = s.eta || 1000;
  const pmCost = s.pmCost || 0;
  const failureCost = s.failureCost || 0;

  let optimalInterval = 0;
  if (targetR > 0 && targetR < 1 && beta > 0 && eta > 0) {
    optimalInterval = eta * Math.pow(-Math.log(targetR), 1 / beta);
  }

  const annualHours = 8760;
  const annualPmCount = optimalInterval > 0 ? annualHours / optimalInterval : 0;
  const annualPmCost = annualPmCount * pmCost;

  const mtbf = eta * gamma(1 + 1 / beta);
  const annualFailures = mtbf > 0 ? annualHours / mtbf : 0;
  const annualFailureCost = annualFailures * failureCost;

  const totalCost = annualPmCost + annualFailureCost;

  return {
    optimalInterval,
    annualPmCount,
    annualPmCost,
    annualFailures,
    annualFailureCost,
    totalCost,
  };
}

function gamma(x) {
  if (x <= 0) return Infinity;
  if (x === 1) return 1;
  if (x < 1) return gamma(x + 1) / x;
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
  if (x < 0.5) {
    return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

function renderStrategy() {
  const result = calcStrategy();

  const setVal = (id, val, fmtFn) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtFn ? fmtFn(val) : val;
  };

  setVal("mt-strat-optimal-interval", result.optimalInterval, (v) => fmt(v, 1));
  setVal("mt-strat-annual-pm", result.annualPmCount, (v) => fmt(v, 2));
  setVal("mt-strat-pm-cost-annual", result.annualPmCost, (v) => fmt(v, 0));
  setVal("mt-strat-annual-failures", result.annualFailures, (v) => fmt(v, 2));
  setVal("mt-strat-failure-cost-annual", result.annualFailureCost, (v) => fmt(v, 0));
  setVal("mt-strat-total-cost", result.totalCost, (v) => fmt(v, 0));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
