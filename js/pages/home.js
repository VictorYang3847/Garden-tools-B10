import {
  targetB10,
  targetB10WithoutMargin,
  weibullEta,
  failureRate,
} from "../calculator.js";

let currentModel = null;
let onSaveCallback = null;

// 产品信息字段定义
const PRODUCT_INFO_FIELDS = [
  { id: "product-model-name", key: "modelName", label: "型号名称", type: "text" },
  { id: "product-project-code", key: "projectCode", label: "项目编号", type: "text" },
  { id: "product-voltage", key: "voltage", label: "电压(V)", type: "number", unit: "V" },
  { id: "product-power", key: "power", label: "功率(W)", type: "number", unit: "W" },
  { id: "product-blade-type", key: "bladeType", label: "刀片类型", type: "text" },
  { id: "product-blade-length", key: "bladeLength", label: "刀片长度(mm)", type: "number", unit: "mm" },
  { id: "product-stroke-rate", key: "strokeRate", label: "往复次数", type: "number" },
  { id: "product-analyst", key: "analyst", label: "分析师", type: "text" },
  { id: "product-note", key: "note", label: "备注", type: "textarea" },
];

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;
  const template = document.getElementById("home-template");
  const content = template.content.cloneNode(true);
  container.appendChild(content);

  loadValuesFromModel();
  loadProductInfoFromModel();
  updateProductInfoSummary();
  bindEvents();
  bindProductInfoEvents();
  calculate();
}

function loadValuesFromModel() {
  const hc = currentModel?.homeCalc;
  if (!hc) return;
  const fields = [
    ["home-warranty-years", "warrantyYears"],
    ["home-hours-per-year", "hoursPerYear"],
    ["home-allow-fail-rate", "allowFailRate"],
    ["home-beta", "beta"],
    ["home-safety-margin", "safetyMargin"],
    ["home-time", "time"],
  ];
  fields.forEach(([domId, field]) => {
    const el = document.getElementById(domId);
    if (el && hc[field] !== undefined && hc[field] !== null) {
      el.value = hc[field];
    }
  });
}

function saveValuesToModel() {
  if (!currentModel) return;
  const hc = currentModel.homeCalc || {};
  hc.warrantyYears = Number(document.getElementById("home-warranty-years")?.value) || 0;
  hc.hoursPerYear = Number(document.getElementById("home-hours-per-year")?.value) || 0;
  hc.allowFailRate = Number(document.getElementById("home-allow-fail-rate")?.value) || 0;
  hc.beta = Number(document.getElementById("home-beta")?.value) || 0;
  hc.safetyMargin = Number(document.getElementById("home-safety-margin")?.value) || 0;
  hc.time = Number(document.getElementById("home-time")?.value) || 0;
  currentModel.homeCalc = hc;
  if (typeof onSaveCallback === "function") {
    onSaveCallback({ homeCalc: hc });
  }
}

function gammaApprox(x) {
  if (x <= 0) return Infinity;
  if (x === 1) return 1;
  if (x < 1) {
    return gammaApprox(x + 1) / x;
  }
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
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

function calcMtbf(eta, beta) {
  if (eta <= 0 || beta <= 0) return 0;
  return eta * gammaApprox(1 + 1 / beta);
}

function bindEvents() {
  const ids = [
    "home-warranty-years",
    "home-hours-per-year",
    "home-allow-fail-rate",
    "home-beta",
    "home-safety-margin",
    "home-time",
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => {
        saveValuesToModel();
        calculate();
      });
    }
  });

  const formulaToggle = document.getElementById("home-formula-toggle");
  const formulaContent = document.getElementById("home-formula-content");
  if (formulaToggle && formulaContent) {
    formulaToggle.addEventListener("click", () => {
      const isHidden = formulaContent.style.display === "none";
      formulaContent.style.display = isHidden ? "" : "none";
      formulaToggle.textContent = isHidden ? "📐 收起公式" : "📐 查看计算公式";
    });
  }
}

function calculate() {
  const warrantyYears = Number(document.getElementById("home-warranty-years")?.value) || 0;
  const hoursPerYear = Number(document.getElementById("home-hours-per-year")?.value) || 0;
  const allowFailRate = Number(document.getElementById("home-allow-fail-rate")?.value) || 0;
  const beta = Number(document.getElementById("home-beta")?.value) || 0;
  const safetyMargin = Number(document.getElementById("home-safety-margin")?.value) || 0;
  const t = Number(document.getElementById("home-time")?.value) || 0;

  const twEl = document.getElementById("home-tw");
  const b10El = document.getElementById("home-b10");
  const b10NoMarginEl = document.getElementById("home-b10-no-margin");
  const etaEl = document.getElementById("home-eta");
  const mtbfEl = document.getElementById("home-mtbf");
  const reliabilityTEl = document.getElementById("home-reliability-t");
  const failureTEl = document.getElementById("home-failure-t");

  if (warrantyYears <= 0 || hoursPerYear <= 0 || allowFailRate <= 0 || beta <= 0) {
    [twEl, b10El, b10NoMarginEl, etaEl, mtbfEl, reliabilityTEl, failureTEl].forEach((el) => {
      if (el) el.textContent = "—";
    });
    return;
  }

  const tw = warrantyYears * hoursPerYear;
  const fw = allowFailRate / 100;
  const margin = safetyMargin / 100;

  const b10WithMargin = targetB10(tw, fw, beta, margin);
  const b10NoMargin = targetB10WithoutMargin(tw, fw, beta);
  const eta = weibullEta(b10WithMargin, beta);
  const mtbf = calcMtbf(eta, beta);
  const ft = failureRate(t, b10WithMargin, beta);
  const rt = 1 - ft;

  if (twEl) twEl.textContent = tw.toFixed(0);
  if (b10El) b10El.textContent = b10WithMargin.toFixed(1);
  if (b10NoMarginEl) b10NoMarginEl.textContent = b10NoMargin.toFixed(1);
  if (etaEl) etaEl.textContent = eta.toFixed(1);
  if (mtbfEl) mtbfEl.textContent = mtbf.toFixed(1);
  if (reliabilityTEl) reliabilityTEl.textContent = (rt * 100).toFixed(2);
  if (failureTEl) failureTEl.textContent = (ft * 100).toFixed(2);
}

// ========== 产品信息相关函数 ==========

function loadProductInfoFromModel() {
  const productInfo = currentModel?.productInfo || {};
  PRODUCT_INFO_FIELDS.forEach(({ id, key, type }) => {
    const el = document.getElementById(id);
    if (!el) return;
    // 型号名称字段：优先使用 productInfo.modelName，为空时回退到 model.name，保持与顶部型号选择器对齐
    let value = productInfo[key];
    if (key === "modelName" && (value === undefined || value === null || value === "")) {
      value = currentModel?.name ?? "";
    }
    if (value !== undefined && value !== null) {
      if (type === "number") {
        el.value = value;
      } else {
        el.value = value;
      }
    }
  });
}

function saveProductInfoToModel() {
  if (!currentModel) return;

  const productInfo = {};
  PRODUCT_INFO_FIELDS.forEach(({ id, key, type }) => {
    const el = document.getElementById(id);
    if (el) {
      if (type === "number") {
        productInfo[key] = Number(el.value) || 0;
      } else {
        productInfo[key] = el.value || "";
      }
    }
  });

  productInfo.updatedAt = new Date().toISOString();
  currentModel.productInfo = productInfo;

  // 同步型号名称到 model.name（与顶部型号选择器对齐）
  const newName = productInfo.modelName || "";
  const nameChanged = newName && newName !== currentModel.name;
  if (nameChanged) {
    currentModel.name = newName;
  }

  if (typeof onSaveCallback === "function") {
    // 传入 name 字段，app.js 的 saveModel 回调会调用 refreshAllSelectors 刷新顶部型号选择器
    const payload = { productInfo };
    if (nameChanged) payload.name = newName;
    onSaveCallback(payload);
  }
}

function updateProductInfoSummary() {
  const summaryEl = document.getElementById("product-info-summary");
  if (!summaryEl) return;

  const nameEl = document.getElementById("product-model-name");
  const codeEl = document.getElementById("product-project-code");
  const modelName = (nameEl?.value || "").trim() || currentModel?.name || "未命名型号";
  const projectCode = (codeEl?.value || "").trim();

  summaryEl.textContent = projectCode
    ? `${modelName} | ${projectCode}`
    : modelName;
}

function toggleProductInfoCollapse() {
  const card = document.querySelector(".product-info-card.collapsible");
  if (!card) return;
  const isCollapsed = card.dataset.collapsed === "true";
  card.dataset.collapsed = isCollapsed ? "false" : "true";
  const indicator = card.querySelector(".collapse-indicator");
  if (indicator) {
    indicator.textContent = isCollapsed ? "▼" : "▶";
  }
}

function bindProductInfoEvents() {
  // 折叠/展开：点击卡片标题切换
  const header = document.getElementById("product-info-header");
  if (header) {
    header.addEventListener("click", toggleProductInfoCollapse);
  }

  // 自动保存：编辑任意字段后立即保存并更新摘要
  PRODUCT_INFO_FIELDS.forEach(({ id }) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => {
        saveProductInfoToModel();
        updateProductInfoSummary();
        // 型号名称变化时，同步更新顶部型号选择器（由 onSaveCallback 触发 refreshAllSelectors）
        // 注意：不在此处刷新页面，避免输入框失焦
      });
    }
  });
}
