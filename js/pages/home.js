import {
  targetB10,
  targetB10WithoutMargin,
  weibullEta,
  failureRate,
  calcMtbf,
} from "../calculator.js";

let currentModel = null;
let onSaveCallback = null;

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;
  const template = document.getElementById("home-template");
  const content = template.content.cloneNode(true);
  container.appendChild(content);

  bindEvents();
  calculate();
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
      el.addEventListener("input", calculate);
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
