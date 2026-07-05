import { genId } from "../store.js";
import { fmt } from "../utils.js";

let currentModel = null;
let onSaveCallback = null;
let currentContainer = null;

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;
  currentContainer = container;
  container.innerHTML = "";

  const template = document.getElementById("weakness-template");
  if (template) {
    const content = template.content.cloneNode(true);
    container.appendChild(content);
  } else {
    buildLayout(container);
  }

  ensureWeaknessData();
  bindEvents(container);
  renderContent(container);
}

/* ---- data helpers ---- */

function ensureWeaknessData() {
  if (!currentModel.modules) currentModel.modules = {};
  if (!currentModel.modules.weakness) {
    currentModel.modules.weakness = {
      weights: { fmea: 0.4, prediction: 0.3, derating: 0.3 },
      items: [],
    };
  }
  const w = currentModel.modules.weakness;
  if (!w.weights) w.weights = { fmea: 0.4, prediction: 0.3, derating: 0.3 };
  if (!Array.isArray(w.items)) w.items = [];
}

function getWeakness() {
  return currentModel.modules.weakness;
}

function save() {
  if (!onSaveCallback || !currentModel) return;
  onSaveCallback(currentModel);
}

/* ---- escape HTML ---- */

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---- build layout (fallback when template is absent) ---- */

function buildLayout(container) {
  container.innerHTML = `
    <section class="page-section">
      <div class="section-header">
        <h2>短板分析</h2>
        <p class="section-desc">综合各模块数据，识别系统最薄弱的环节</p>
      </div>

      <div class="weakness-weights-row">
        <label>FMEA权重: <input type="range" id="wk-weight-fmea" min="0" max="1" step="0.01" /> <span id="wk-weight-fmea-val"></span></label>
        <label>预测权重: <input type="range" id="wk-weight-prediction" min="0" max="1" step="0.01" /> <span id="wk-weight-prediction-val"></span></label>
        <label>降额权重: <input type="range" id="wk-weight-derating" min="0" max="1" step="0.01" /> <span id="wk-weight-derating-val"></span></label>
      </div>

      <div id="wk-core-card" class="weakness-core-card"></div>

      <div class="table-wrap">
        <table class="data-table" id="wk-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>子系统/元器件</th>
              <th>FMEA RPN</th>
              <th>失效率 &lambda;(10&#8315;&#8310;/h)</th>
              <th>降额裕度(%)</th>
              <th>综合评分</th>
              <th>风险等级</th>
            </tr>
          </thead>
          <tbody id="wk-table-body"></tbody>
        </table>
      </div>

      <div class="weakness-charts-row" id="wk-charts-row">
        <div class="chart-panel" id="wk-bar-chart"></div>
        <div class="chart-panel" id="wk-pie-chart"></div>
      </div>
    </section>
  `;
}

/* ---- bind events ---- */

function bindEvents(container) {
  const fmeaSlider = container.querySelector("#wk-weight-fmea");
  const predSlider = container.querySelector("#wk-weight-prediction");
  const deratingSlider = container.querySelector("#wk-weight-derating");

  if (fmeaSlider) {
    fmeaSlider.addEventListener("input", () => adjustWeights("fmea"));
  }
  if (predSlider) {
    predSlider.addEventListener("input", () => adjustWeights("prediction"));
  }
  if (deratingSlider) {
    deratingSlider.addEventListener("input", () => adjustWeights("derating"));
  }
}

/* ---- weight adjustment (auto-balance to sum = 1) ---- */

function adjustWeights(changed) {
  const w = getWeakness().weights;
  const keys = ["fmea", "prediction", "derating"];
  const sliderIds = {
    fmea: "wk-weight-fmea",
    prediction: "wk-weight-prediction",
    derating: "wk-weight-derating",
  };

  const newVal = Number(document.getElementById(sliderIds[changed])?.value) || 0;
  w[changed] = newVal;

  const otherKeys = keys.filter((k) => k !== changed);
  const otherSum = otherKeys.reduce((s, k) => s + w[k], 0);
  const remaining = Math.max(0, 1 - newVal);

  if (otherSum > 0) {
    const ratio = remaining / otherSum;
    for (const k of otherKeys) {
      w[k] = Math.max(0, w[k] * ratio);
    }
  } else {
    // If others are both 0, distribute equally
    for (const k of otherKeys) {
      w[k] = remaining / otherKeys.length;
    }
  }

  // Update slider positions and labels
  for (const k of keys) {
    const slider = document.getElementById(sliderIds[k]);
    const label = document.getElementById(sliderIds[k] + "-val");
    if (slider && k !== changed) slider.value = w[k];
    if (label) label.textContent = fmt(w[k], 2);
  }
  const changedLabel = document.getElementById(sliderIds[changed] + "-val");
  if (changedLabel) changedLabel.textContent = fmt(w[changed], 2);

  save();
  renderContent(currentContainer);
}

/* ---- core computation: compute risk scores ---- */

function computeRiskItems() {
  const weights = getWeakness().weights;
  const fmeaItems = currentModel.modules?.fmea?.items || [];
  const predComponents = currentModel.modules?.prediction?.components || [];
  const deratingComponents = currentModel.modules?.derating?.components || [];

  // 1. FMEA: group by function (subsystem), take max RPN
  const fmeaMap = {};
  for (const item of fmeaItems) {
    const key = item.function || item.cause || "未知";
    const rpn = item.rpn || (item.severity || 1) * (item.occurrence || 1) * (item.detection || 1);
    if (!fmeaMap[key] || rpn > fmeaMap[key]) {
      fmeaMap[key] = rpn;
    }
  }

  // 2. Prediction: lambda per component
  const predMap = {};
  for (const comp of predComponents) {
    const key = comp.name || "未知";
    predMap[key] = comp.lambda || 0;
  }

  // 3. Derating: stress ratio -> derating margin = 1 - ratio
  const deratingMap = {};
  for (const comp of deratingComponents) {
    const key = comp.name || "未知";
    const ratio = comp.deratingRatio != null ? comp.deratingRatio
      : (comp.ratedValue && comp.ratedValue > 0 ? (comp.appliedValue || 0) / comp.ratedValue : 0);
    deratingMap[key] = 1 - ratio; // margin
  }

  // Collect all subsystem/component names
  const allKeys = new Set([
    ...Object.keys(fmeaMap),
    ...Object.keys(predMap),
    ...Object.keys(deratingMap),
  ]);

  if (allKeys.size === 0) return [];

  // Normalization helpers
  const fmeaValues = Object.values(fmeaMap);
  const maxRpn = fmeaValues.length > 0 ? Math.max(...fmeaValues) : 1;

  const predValues = Object.values(predMap);
  const maxLambda = predValues.length > 0 ? Math.max(...predValues) : 1;

  // Derating margin: already 0~1, no need for normalization
  // But we compute (1 - margin_normalized) = (1 - margin) for the formula
  // margin is already between 0 and 1; higher margin = lower risk

  const items = [];
  for (const key of allKeys) {
    const rpn = fmeaMap[key] || 0;
    const lambda = predMap[key] || 0;
    const margin = deratingMap[key] != null ? deratingMap[key] : null;

    const rpnNorm = maxRpn > 0 ? rpn / maxRpn : 0;
    const lambdaNorm = maxLambda > 0 ? lambda / maxLambda : 0;
    const marginRisk = margin != null ? (1 - margin) : 0; // lower margin = higher risk

    // If a key only appears in one source, other contributions are 0
    // But weights still apply to the full formula
    const hasFmea = fmeaMap[key] != null;
    const hasPred = predMap[key] != null;
    const hasDerating = deratingMap[key] != null;

    // Normalize weights to only active sources
    let wFmea = hasFmea ? weights.fmea : 0;
    let wPred = hasPred ? weights.prediction : 0;
    let wDerating = hasDerating ? weights.derating : 0;
    const wSum = wFmea + wPred + wDerating;
    if (wSum > 0) {
      wFmea /= wSum;
      wPred /= wSum;
      wDerating /= wSum;
    }

    const score = wFmea * rpnNorm + wPred * lambdaNorm + wDerating * marginRisk;
    const clampedScore = Math.min(1, Math.max(0, score));

    items.push({
      name: key,
      rpn,
      lambda,
      margin,
      score: clampedScore,
      fmeaContrib: wFmea * rpnNorm,
      predContrib: wPred * lambdaNorm,
      deratingContrib: wDerating * marginRisk,
    });
  }

  // Sort by score descending
  items.sort((a, b) => b.score - a.score);
  return items;
}

function riskLevel(score) {
  if (score >= 0.7) return { label: "高风险", cls: "risk-high", color: "var(--danger, #ef4444)" };
  if (score >= 0.4) return { label: "中风险", cls: "risk-medium", color: "var(--warning, #f59e0b)" };
  return { label: "低风险", cls: "risk-low", color: "var(--success, #22c55e)" };
}

/* ---- suggestion generator ---- */

function generateSuggestion(item) {
  const parts = [];
  if (item.fmeaContrib > 0.3) {
    parts.push("FMEA风险优先数较高，建议优化检测手段或降低发生度");
  }
  if (item.predContrib > 0.3) {
    parts.push("失效率偏高，建议选用更高可靠性元器件或增加冗余设计");
  }
  if (item.deratingContrib > 0.3) {
    parts.push("降额裕度不足，建议降低工作应力或选用更高规格元器件");
  }
  if (parts.length === 0) {
    parts.push("综合风险可控，持续监控即可");
  }
  return parts.join("；");
}

/* ---- rendering ---- */

function renderContent(container) {
  const items = computeRiskItems();
  getWeakness().items = items;

  renderWeightSliders(container);
  renderCoreCard(container, items);
  renderTable(container, items);
  renderBarChart(container, items);
  renderPieChart(container, items);
}

function renderWeightSliders(container) {
  const w = getWeakness().weights;
  const pairs = [
    ["wk-weight-fmea", "wk-weight-fmea-val", w.fmea],
    ["wk-weight-prediction", "wk-weight-prediction-val", w.prediction],
    ["wk-weight-derating", "wk-weight-derating-val", w.derating],
  ];
  for (const [sliderId, labelId, val] of pairs) {
    const slider = container.querySelector(`#${sliderId}`);
    const label = container.querySelector(`#${labelId}`);
    if (slider) slider.value = val;
    if (label) label.textContent = fmt(val, 2);
  }
}

function renderCoreCard(container, items) {
  const card = container.querySelector("#wk-core-card");
  if (!card) return;

  const fmeaItems = currentModel.modules?.fmea?.items || [];
  const predComponents = currentModel.modules?.prediction?.components || [];

  if (fmeaItems.length === 0 && predComponents.length === 0) {
    card.innerHTML = '<p class="hint">请先在 FMEA 和可靠性预测模块中添加数据</p>';
    return;
  }

  if (items.length === 0) {
    card.innerHTML = '<p class="hint">暂无足够数据进行分析</p>';
    return;
  }

  const core = items[0];
  const level = riskLevel(core.score);

  card.innerHTML = `
    <div class="weakness-core-mode" style="color: ${level.color}">${escapeHtml(core.name)}</div>
    <div class="weakness-core-metrics">
      <div class="metric-card">
        <div class="metric-value" style="color: ${level.color}">${fmt(core.score, 2)}</div>
        <div class="metric-label">综合风险评分</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${fmt(core.fmeaContrib, 2)}</div>
        <div class="metric-label">RPN 贡献</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${fmt(core.predContrib, 2)}</div>
        <div class="metric-label">失效率贡献</div>
      </div>
    </div>
    <div class="weakness-suggestion">${escapeHtml(generateSuggestion(core))}</div>
  `;
}

function renderTable(container, items) {
  const tbody = container.querySelector("#wk-table-body");
  if (!tbody) return;

  const fmeaItems = currentModel.modules?.fmea?.items || [];
  const predComponents = currentModel.modules?.prediction?.components || [];

  if (fmeaItems.length === 0 && predComponents.length === 0) {
    tbody.innerHTML = "";
    return;
  }

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="hint">暂无数据</td></tr>';
    return;
  }

  const isCore = (idx) => idx === 0;

  tbody.innerHTML = items
    .map((item, idx) => {
      const level = riskLevel(item.score);
      const marginDisplay = item.margin != null ? fmt(item.margin * 100, 1) : "--";
      const lambdaDisplay = item.lambda > 0 ? fmt(item.lambda * 1e6, 2) : "--";
      return `
        <tr class="${isCore(idx) ? "weakness-row-highlight" : ""}">
          <td>${idx + 1}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${item.rpn > 0 ? item.rpn : "--"}</td>
          <td>${lambdaDisplay}</td>
          <td>${marginDisplay}</td>
          <td style="color: ${level.color}; font-weight: 600;">${fmt(item.score, 2)}</td>
          <td><span class="risk-badge ${level.cls}">${level.label}</span></td>
        </tr>`;
    })
    .join("");
}

/* ---- bar chart (CSS div, similar to analysis.js renderBarChartFromObj) ---- */

function renderBarChart(container, items) {
  const panel = container.querySelector("#wk-bar-chart");
  if (!panel) return;

  const fmeaItems = currentModel.modules?.fmea?.items || [];
  const predComponents = currentModel.modules?.prediction?.components || [];

  if (fmeaItems.length === 0 && predComponents.length === 0) {
    panel.innerHTML = '<p class="hint">暂无数据</p>';
    return;
  }

  if (items.length === 0) {
    panel.innerHTML = '<p class="hint">暂无数据</p>';
    return;
  }

  const maxScore = Math.max(...items.map((i) => i.score), 0.01);

  panel.innerHTML = `
    <h4 class="chart-title">风险评分排行</h4>
    ${items
      .slice(0, 10)
      .map((item) => {
        const level = riskLevel(item.score);
        const pctVal = (item.score / maxScore) * 100;
        return `
        <div class="chart-row">
          <span class="chart-label">${escapeHtml(item.name)}</span>
          <div class="chart-track"><div class="chart-fill" style="width:${pctVal}%; background: ${level.color};"></div></div>
          <span class="chart-value">${fmt(item.score, 2)}</span>
        </div>`;
      })
      .join("")}
  `;
}

/* ---- pie chart (CSS conic-gradient) ---- */

function renderPieChart(container, items) {
  const panel = container.querySelector("#wk-pie-chart");
  if (!panel) return;

  const fmeaItems = currentModel.modules?.fmea?.items || [];
  const predComponents = currentModel.modules?.prediction?.components || [];

  if (fmeaItems.length === 0 && predComponents.length === 0) {
    panel.innerHTML = '<p class="hint">暂无数据</p>';
    return;
  }

  if (items.length === 0) {
    panel.innerHTML = '<p class="hint">暂无数据</p>';
    return;
  }

  // Count by risk level
  let high = 0, medium = 0, low = 0;
  for (const item of items) {
    if (item.score >= 0.7) high++;
    else if (item.score >= 0.4) medium++;
    else low++;
  }

  const total = items.length || 1;
  const highPct = (high / total) * 100;
  const medPct = (medium / total) * 100;
  const lowPct = (low / total) * 100;

  // Build conic-gradient
  const highColor = "var(--danger, #ef4444)";
  const medColor = "var(--warning, #f59e0b)";
  const lowColor = "var(--success, #22c55e)";

  const gradientParts = [];
  let offset = 0;
  if (highPct > 0) {
    gradientParts.push(`${highColor} ${offset}% ${offset + highPct}%`);
    offset += highPct;
  }
  if (medPct > 0) {
    gradientParts.push(`${medColor} ${offset}% ${offset + medPct}%`);
    offset += medPct;
  }
  if (lowPct > 0) {
    gradientParts.push(`${lowColor} ${offset}% ${offset + lowPct}%`);
  }

  const gradient = gradientParts.length > 0
    ? `conic-gradient(${gradientParts.join(", ")})`
    : `${lowColor}`;

  panel.innerHTML = `
    <h4 class="chart-title">风险等级分布</h4>
    <div style="display:flex; align-items:center; gap:1.5rem; justify-content:center; padding:1rem 0;">
      <div style="
        width: 140px; height: 140px; border-radius: 50%;
        background: ${gradient};
        display: flex; align-items: center; justify-content: center;
      ">
        <div style="
          width: 70px; height: 70px; border-radius: 50%;
          background: var(--card-bg, #1e293b);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.1rem; font-weight: 700;
        ">${total}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span style="width:12px;height:12px;border-radius:2px;background:${highColor};display:inline-block;"></span>
          <span>高风险: ${high} (${fmt(highPct, 1)}%)</span>
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span style="width:12px;height:12px;border-radius:2px;background:${medColor};display:inline-block;"></span>
          <span>中风险: ${medium} (${fmt(medPct, 1)}%)</span>
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span style="width:12px;height:12px;border-radius:2px;background:${lowColor};display:inline-block;"></span>
          <span>低风险: ${low} (${fmt(lowPct, 1)}%)</span>
        </div>
      </div>
    </div>
  `;
}
