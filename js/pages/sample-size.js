let activeTab = "qualification";

const Z_TABLE = {
  0.9: 1.645,
  0.95: 1.96,
  0.99: 2.576,
};

function getZValue(confidence) {
  if (Z_TABLE[confidence] !== undefined) return Z_TABLE[confidence];
  const confidences = Object.keys(Z_TABLE)
    .map(Number)
    .sort((a, b) => a - b);
  if (confidence <= confidences[0]) return Z_TABLE[confidences[0]];
  if (confidence >= confidences[confidences.length - 1]) return Z_TABLE[confidences[confidences.length - 1]];
  for (let i = 0; i < confidences.length - 1; i++) {
    const c1 = confidences[i];
    const c2 = confidences[i + 1];
    if (confidence >= c1 && confidence <= c2) {
      const t = (confidence - c1) / (c2 - c1);
      return Z_TABLE[c1] + t * (Z_TABLE[c2] - Z_TABLE[c1]);
    }
  }
  return 1.645;
}

function logCombinations(n, k) {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  k = Math.min(k, n - k);
  let result = 0;
  for (let i = 1; i <= k; i++) {
    result += Math.log((n - k + i) / i);
  }
  return result;
}

function binomialCumulative(n, k, p) {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    const logC = logCombinations(n, i);
    const logTerm = logC + i * Math.log(p) + (n - i) * Math.log(1 - p);
    sum += Math.exp(logTerm);
  }
  return sum;
}

function findSampleSizeBinomial(R, CL, r) {
  const p = 1 - R;
  const target = 1 - CL;

  if (r === 0) {
    const n = Math.log(target) / Math.log(R);
    return Math.ceil(n);
  }

  let low = r + 1;
  let high = r + 1;
  while (binomialCumulative(high, r, p) > target) {
    high *= 2;
    if (high > 10000) break;
  }

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const cum = binomialCumulative(mid, r, p);
    if (cum <= target) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

function calculateQualification() {
  const reliabilitySlider = document.getElementById("ss-qual-reliability-slider");
  const reliabilityValue = document.getElementById("ss-qual-reliability-value");
  const confidenceSlider = document.getElementById("ss-qual-confidence-slider");
  const confidenceValue = document.getElementById("ss-qual-confidence-value");
  const allowedFailuresInput = document.getElementById("ss-qual-allowed-failures");

  const R = (Number(reliabilitySlider.value) || 90) / 100;
  const CL = (Number(confidenceSlider.value) || 90) / 100;
  const r = Math.max(0, Math.min(10, Number(allowedFailuresInput.value) || 0));

  const n = findSampleSizeBinomial(R, CL, r);
  const zeroFailProb = Math.pow(R, n);

  const resultNEl = document.getElementById("ss-qual-result-n");
  const passProbEl = document.getElementById("ss-qual-pass-prob");

  if (resultNEl) resultNEl.textContent = n;
  if (passProbEl) passProbEl.textContent = (zeroFailProb * 100).toFixed(2) + "%";
}

function calculateLifeTest() {
  const precisionSlider = document.getElementById("ss-life-precision-slider");
  const precisionValue = document.getElementById("ss-life-precision-value");
  const confidenceSlider = document.getElementById("ss-life-confidence-slider");
  const confidenceValue = document.getElementById("ss-life-confidence-value");
  const failureRatioSlider = document.getElementById("ss-life-failure-ratio-slider");
  const failureRatioValue = document.getElementById("ss-life-failure-ratio-value");

  const precision = (Number(precisionSlider.value) || 20) / 100;
  const CL = (Number(confidenceSlider.value) || 90) / 100;
  const failureRatio = (Number(failureRatioSlider.value) || 60) / 100;

  const z = getZValue(CL);
  const r = Math.ceil((z / precision) * (z / precision) / 2);
  const n = Math.ceil(r / failureRatio);

  const resultNEl = document.getElementById("ss-life-result-n");
  const failureCountEl = document.getElementById("ss-life-failure-count");

  if (resultNEl) resultNEl.textContent = n;
  if (failureCountEl) failureCountEl.textContent = r;
}

function syncSliderAndNumber(sliderId, numberId, callback) {
  const slider = document.getElementById(sliderId);
  const number = document.getElementById(numberId);
  if (!slider || !number) return;

  slider.addEventListener("input", () => {
    number.value = slider.value;
    if (callback) callback();
  });

  number.addEventListener("input", () => {
    let val = Number(number.value);
    const min = Number(slider.min);
    const max = Number(slider.max);
    if (isNaN(val)) val = min;
    val = Math.max(min, Math.min(max, val));
    slider.value = val;
    if (callback) callback();
  });
}

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll(".sample-size-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
  document.querySelectorAll(".sample-size-tab-content").forEach((c) => {
    c.style.display = "none";
  });
  const tabEl = document.getElementById(`ss-tab-${tabName}`);
  if (tabEl) tabEl.style.display = "";
}

function bindEvents() {
  const toolbar = document.querySelector(".sample-size-toolbar");
  if (toolbar) {
    toolbar.addEventListener("click", (e) => {
      const tab = e.target.closest(".sample-size-tab");
      if (!tab) return;
      switchTab(tab.dataset.tab);
    });
  }

  syncSliderAndNumber("ss-qual-reliability-slider", "ss-qual-reliability-value", calculateQualification);
  syncSliderAndNumber("ss-qual-confidence-slider", "ss-qual-confidence-value", calculateQualification);

  const allowedFailuresInput = document.getElementById("ss-qual-allowed-failures");
  if (allowedFailuresInput) {
    allowedFailuresInput.addEventListener("input", () => {
      let val = Number(allowedFailuresInput.value);
      if (isNaN(val)) val = 0;
      val = Math.max(0, Math.min(10, Math.floor(val)));
      allowedFailuresInput.value = val;
      calculateQualification();
    });
  }

  const testTimeInput = document.getElementById("ss-qual-test-time");
  if (testTimeInput) {
    testTimeInput.addEventListener("input", calculateQualification);
  }

  const betaInputQual = document.getElementById("ss-qual-beta");
  if (betaInputQual) {
    betaInputQual.addEventListener("input", calculateQualification);
  }

  syncSliderAndNumber("ss-life-precision-slider", "ss-life-precision-value", calculateLifeTest);
  syncSliderAndNumber("ss-life-confidence-slider", "ss-life-confidence-value", calculateLifeTest);
  syncSliderAndNumber("ss-life-failure-ratio-slider", "ss-life-failure-ratio-value", calculateLifeTest);

  const betaInputLife = document.getElementById("ss-life-beta");
  if (betaInputLife) {
    betaInputLife.addEventListener("input", calculateLifeTest);
  }

  const qualFormulaToggle = document.getElementById("ss-qual-formula-toggle");
  const qualFormulaContent = document.getElementById("ss-qual-formula-content");
  if (qualFormulaToggle && qualFormulaContent) {
    qualFormulaToggle.addEventListener("click", () => {
      const isHidden = qualFormulaContent.style.display === "none";
      qualFormulaContent.style.display = isHidden ? "" : "none";
      qualFormulaToggle.textContent = isHidden ? "📐 收起公式" : "📐 查看计算公式";
    });
  }

  const lifeFormulaToggle = document.getElementById("ss-life-formula-toggle");
  const lifeFormulaContent = document.getElementById("ss-life-formula-content");
  if (lifeFormulaToggle && lifeFormulaContent) {
    lifeFormulaToggle.addEventListener("click", () => {
      const isHidden = lifeFormulaContent.style.display === "none";
      lifeFormulaContent.style.display = isHidden ? "" : "none";
      lifeFormulaToggle.textContent = isHidden ? "📐 收起公式" : "📐 查看计算公式";
    });
  }
}

export function init(model, onSave) {}

export function render(container, model) {
  const template = document.getElementById("sample-size-template");
  const content = template.content.cloneNode(true);
  container.appendChild(content);

  bindEvents();
  switchTab(activeTab);
  calculateQualification();
  calculateLifeTest();
}
