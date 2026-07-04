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
  const betaInput = document.getElementById("home-beta");
  const etaInput = document.getElementById("home-eta");
  const reliabilitySlider = document.getElementById("home-reliability-slider");
  const reliabilityValue = document.getElementById("home-reliability-value");
  const timeInput = document.getElementById("home-time");
  const formulaToggle = document.getElementById("home-formula-toggle");
  const formulaContent = document.getElementById("home-formula-content");

  if (betaInput) {
    betaInput.addEventListener("input", calculate);
  }
  if (etaInput) {
    etaInput.addEventListener("input", calculate);
  }
  if (reliabilitySlider) {
    reliabilitySlider.addEventListener("input", () => {
      if (reliabilityValue) {
        reliabilityValue.value = reliabilitySlider.value;
      }
      calculate();
    });
  }
  if (reliabilityValue) {
    reliabilityValue.addEventListener("input", () => {
      let val = Number(reliabilityValue.value);
      if (val < 50) val = 50;
      if (val > 99) val = 99;
      if (reliabilitySlider) {
        reliabilitySlider.value = val;
      }
      calculate();
    });
  }
  if (timeInput) {
    timeInput.addEventListener("input", calculate);
  }
  if (formulaToggle && formulaContent) {
    formulaToggle.addEventListener("click", () => {
      const isHidden = formulaContent.style.display === "none";
      formulaContent.style.display = isHidden ? "" : "none";
      formulaToggle.textContent = isHidden ? "📐 收起公式" : "📐 查看计算公式";
    });
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

function calculate() {
  const betaInput = document.getElementById("home-beta");
  const etaInput = document.getElementById("home-eta");
  const reliabilitySlider = document.getElementById("home-reliability-slider");
  const timeInput = document.getElementById("home-time");

  const b10El = document.getElementById("home-b10");
  const mtbfEl = document.getElementById("home-mtbf");
  const reliabilityTEl = document.getElementById("home-reliability-t");
  const reliabilityTPctEl = document.getElementById("home-reliability-t-pct");
  const failureTEl = document.getElementById("home-failure-t");
  const failureTPctEl = document.getElementById("home-failure-t-pct");

  if (!betaInput || !etaInput || !reliabilitySlider || !timeInput) return;

  const beta = Number(betaInput.value) || 0;
  const eta = Number(etaInput.value) || 0;
  const reliabilityPct = Number(reliabilitySlider.value) || 0;
  const t = Number(timeInput.value) || 0;

  if (beta <= 0 || eta <= 0) {
    if (b10El) b10El.textContent = "—";
    if (mtbfEl) mtbfEl.textContent = "—";
    if (reliabilityTEl) reliabilityTEl.textContent = "—";
    if (reliabilityTPctEl) reliabilityTPctEl.textContent = "—";
    if (failureTEl) failureTEl.textContent = "—";
    if (failureTPctEl) failureTPctEl.textContent = "—";
    return;
  }

  const p = 1 - reliabilityPct / 100;
  const bp = eta * Math.pow(-Math.log(1 - p), 1 / beta);
  const b10 = eta * Math.pow(-Math.log(0.9), 1 / beta);
  const mtbf = eta * gammaApprox(1 + 1 / beta);
  const rt = Math.exp(-Math.pow(t / eta, beta));
  const ft = 1 - rt;

  if (b10El) b10El.textContent = b10.toFixed(1);
  if (mtbfEl) mtbfEl.textContent = mtbf.toFixed(1);
  if (reliabilityTEl) reliabilityTEl.textContent = (rt * 100).toFixed(2);
  if (reliabilityTPctEl) reliabilityTPctEl.textContent = "%";
  if (failureTEl) failureTEl.textContent = (ft * 100).toFixed(2);
  if (failureTPctEl) failureTPctEl.textContent = "%";
}
