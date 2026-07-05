import { genId } from "../store.js?v=1.0.4";

const title = "环境适应性分析";
const description = "环境应力筛选、温度循环分析、振动分析与环境试验标准查询";

const COFFIN_MANSON_C = 10000;

let currentModel = null;
let onSaveCallback = null;
let activeTab = "thermal-cycle";
let activeVibType = "sine";

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

function getData() {
  if (!currentModel?.modules?.environment) {
    return null;
  }
  return currentModel.modules.environment;
}

function saveData(data) {
  if (!currentModel) return;
  if (!currentModel.modules) {
    currentModel.modules = {};
  }
  currentModel.modules.environment = data;
  if (onSaveCallback) {
    onSaveCallback(currentModel);
  }
}

function ensureData() {
  let data = getData();
  if (!data) {
    data = defaultEnvironmentData();
    saveData(data);
  }
  if (!data.thermalCycle) {
    data.thermalCycle = defaultThermalCycle();
  }
  if (!data.vibration) {
    data.vibration = defaultVibration();
  }
  if (!data.envStresses || !Array.isArray(data.envStresses)) {
    data.envStresses = defaultEnvStresses();
  }
  if (!data.standards || !Array.isArray(data.standards)) {
    data.standards = defaultStandards();
  }
  saveData(data);
  return data;
}

function defaultEnvironmentData() {
  return {
    thermalCycle: defaultThermalCycle(),
    vibration: defaultVibration(),
    envStresses: defaultEnvStresses(),
    standards: defaultStandards(),
  };
}

function defaultThermalCycle() {
  return {
    tempHigh: 85,
    tempLow: -40,
    rampRate: 5,
    cycles: 100,
    holdTime: 30,
    coffinMansonN: 2.5,
    deltaT: 0,
    cycleDamage: 0,
    totalDamage: 0,
    equivalentLife: 0,
    predictedLife: 0,
  };
}

function defaultVibration() {
  return {
    type: "sine",
    freqStart: 10,
    freqEnd: 2000,
    amplitude: 5,
    psd: 0.1,
    grms: 0,
    direction: "x",
    duration: 60,
    stressLevel: "",
    fatigueDamage: 0,
    suggestedLevel: "",
  };
}

function defaultEnvStresses() {
  return [
    { id: genId(), type: "temperature", name: "温度", level: "ground_fixed", piE: 1.5, standard: "IEC 60068-2-1/2", note: "" },
    { id: genId(), type: "humidity", name: "湿度", level: "moderate", piE: 1.2, standard: "IEC 60068-2-30", note: "" },
    { id: genId(), type: "salt_spray", name: "盐雾", level: "low", piE: 2.0, standard: "IEC 60068-2-11", note: "" },
    { id: genId(), type: "dust", name: "粉尘", level: "low", piE: 1.3, standard: "IEC 60068-2-68", note: "" },
    { id: genId(), type: "vibration", name: "振动", level: "low", piE: 2.0, standard: "IEC 60068-2-6", note: "" },
    { id: genId(), type: "shock", name: "冲击", level: "low", piE: 1.5, standard: "IEC 60068-2-27", note: "" },
  ];
}

function defaultStandards() {
  return [
    { id: genId(), code: "IEC 60068-2-1", name: "低温试验", category: "IEC 60068", scope: "非散热试件", items: "温度范围、持续时间" },
    { id: genId(), code: "IEC 60068-2-2", name: "高温试验", category: "IEC 60068", scope: "非散热试件", items: "温度范围、持续时间" },
    { id: genId(), code: "IEC 60068-2-14", name: "温度变化试验", category: "IEC 60068", scope: "温度循环", items: "温变率、循环次数" },
    { id: genId(), code: "IEC 60068-2-30", name: "湿热试验", category: "IEC 60068", scope: "恒定/交变湿热", items: "温度、湿度、持续时间" },
    { id: genId(), code: "IEC 60068-2-6", name: "正弦振动试验", category: "IEC 60068", scope: "振动耐久", items: "频率范围、加速度幅值" },
    { id: genId(), code: "IEC 60068-2-64", name: "随机振动试验", category: "IEC 60068", scope: "宽带随机振动", items: "PSD谱、Grms、持续时间" },
    { id: genId(), code: "IEC 60068-2-27", name: "冲击试验", category: "IEC 60068", scope: "半正弦冲击", items: "峰值加速度、持续时间" },
    { id: genId(), code: "IEC 60068-2-11", name: "盐雾试验", category: "IEC 60068", scope: "腐蚀防护", items: "盐雾浓度、试验时间" },
    { id: genId(), code: "GJB 150.3A", name: "高温试验", category: "GJB 150", scope: "军用装备", items: "高温贮存、高温工作" },
    { id: genId(), code: "GJB 150.4A", name: "低温试验", category: "GJB 150", scope: "军用装备", items: "低温贮存、低温工作" },
    { id: genId(), code: "GJB 150.16A", name: "振动试验", category: "GJB 150", scope: "军用装备", items: "正弦、随机振动" },
    { id: genId(), code: "MIL-STD-810H", name: "环境工程考虑和实验室试验", category: "MIL-STD-810", scope: "美军标环境试验", items: "温度、湿度、振动、冲击等" },
    { id: genId(), code: "GB/T 2423.1", name: "低温试验方法", category: "GB/T 2423", scope: "电工电子产品", items: "温度范围、持续时间" },
    { id: genId(), code: "GB/T 2423.2", name: "高温试验方法", category: "GB/T 2423", scope: "电工电子产品", items: "温度范围、持续时间" },
    { id: genId(), code: "GB/T 2423.10", name: "振动试验方法", category: "GB/T 2423", scope: "电工电子产品", items: "正弦振动" },
    { id: genId(), code: "GB/T 2423.22", name: "温度变化试验", category: "GB/T 2423", scope: "电工电子产品", items: "温度循环" },
  ];
}

const envLevelOptions = [
  { value: "ground_benign", label: "地面良好 (π_E=1.0)", piE: 1.0 },
  { value: "ground_fixed", label: "地面固定 (π_E=1.5)", piE: 1.5 },
  { value: "ground_mobile", label: "地面移动 (π_E=3.0)", piE: 3.0 },
  { value: "outdoor", label: "户外 (π_E=4.0)", piE: 4.0 },
  { value: "naval", label: "舰载 (π_E=5.0)", piE: 5.0 },
  { value: "airborne", label: "机载 (π_E=7.0)", piE: 7.0 },
  { value: "low", label: "低 (π_E=1.2)", piE: 1.2 },
  { value: "moderate", label: "中 (π_E=2.0)", piE: 2.0 },
  { value: "high", label: "高 (π_E=4.0)", piE: 4.0 },
];

export function render(container, model) {
  currentModel = model;
  const data = ensureData();
  activeVibType = data.vibration?.type || "sine";

  const template = document.getElementById("environment-template");
  if (!template) {
    container.innerHTML = `<div class="error-state"><h3>模板未找到</h3><p>environment-template 不存在</p></div>`;
    return;
  }

  const clone = template.content.cloneNode(true);
  container.innerHTML = "";
  container.appendChild(clone);

  bindEvents(container, data);
  renderThermalCycle(container, data);
  renderVibration(container, data);
  renderEnvStresses(container, data);
  renderStandards(container, data, "all", "");
  drawThermalCurve(container, data.thermalCycle);
}

function bindEvents(container, data) {
  const tabs = container.querySelectorAll(".env-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      switchTab(container, tabName, data);
    });
  });

  const vibTypeBtns = container.querySelectorAll(".vib-type-btn");
  vibTypeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      switchVibrationType(container, type, data);
    });
  });

  const thermalCalcBtn = container.querySelector("#env-thermal-calc");
  if (thermalCalcBtn) {
    thermalCalcBtn.addEventListener("click", () => {
      calculateThermalCycle(container, data);
    });
  }

  const thermalResetBtn = container.querySelector("#env-thermal-reset");
  if (thermalResetBtn) {
    thermalResetBtn.addEventListener("click", () => {
      resetThermalCycle(container, data);
    });
  }

  const vibCalcBtn = container.querySelector("#env-vib-calc");
  if (vibCalcBtn) {
    vibCalcBtn.addEventListener("click", () => {
      calculateVibration(container, data);
    });
  }

  const vibResetBtn = container.querySelector("#env-vib-reset");
  if (vibResetBtn) {
    vibResetBtn.addEventListener("click", () => {
      resetVibration(container, data);
    });
  }

  const thermalForm = container.querySelector("#env-thermal-form");
  if (thermalForm) {
    thermalForm.addEventListener("input", (e) => {
      const name = e.target.name;
      const value = parseFloat(e.target.value);
      if (name && !isNaN(value) && data.thermalCycle) {
        data.thermalCycle[name] = value;
        saveData(data);
      }
    });
  }

  const sineForm = container.querySelector("#env-sine-form");
  if (sineForm) {
    sineForm.addEventListener("input", (e) => {
      const name = e.target.name;
      const value = e.target.type === "number" ? parseFloat(e.target.value) : e.target.value;
      if (name && data.vibration) {
        if (e.target.type === "number" && isNaN(value)) return;
        data.vibration[name] = value;
        saveData(data);
      }
    });
  }

  const randomForm = container.querySelector("#env-random-form");
  if (randomForm) {
    randomForm.addEventListener("input", (e) => {
      const name = e.target.name;
      const value = e.target.type === "number" ? parseFloat(e.target.value) : e.target.value;
      if (name && data.vibration) {
        if (e.target.type === "number" && isNaN(value)) return;
        data.vibration[name] = value;
        saveData(data);
      }
    });
  }

  const stressTbody = container.querySelector("#env-stress-tbody");
  if (stressTbody) {
    stressTbody.addEventListener("change", (e) => {
      const target = e.target;
      const row = target.closest("tr");
      if (!row) return;
      const id = row.dataset.id;
      const field = target.dataset.field;
      if (!id || !field) return;

      const stress = data.envStresses.find((s) => s.id === id);
      if (!stress) return;

      let value = target.value;
      if (field === "piE") {
        value = parseFloat(value) || 1.0;
      }
      stress[field] = value;

      if (field === "level") {
        const levelOpt = envLevelOptions.find((o) => o.value === value);
        if (levelOpt) {
          stress.piE = levelOpt.piE;
          const piEInput = row.querySelector('[data-field="piE"]');
          if (piEInput) piEInput.value = levelOpt.piE;
        }
      }

      saveData(data);
    });
  }

  const categorySelect = container.querySelector("#env-standard-category");
  const searchInput = container.querySelector("#env-standard-search");
  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
      filterStandards(container, data);
    });
  }
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      filterStandards(container, data);
    });
  }
}

function switchTab(container, tabName, data) {
  activeTab = tabName;

  const tabs = container.querySelectorAll(".env-tab");
  tabs.forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });

  const tabContents = container.querySelectorAll(".env-tab-content");
  tabContents.forEach((tc) => {
    tc.style.display = "none";
  });

  const activeContent = container.querySelector(`#env-tab-${tabName}`);
  if (activeContent) {
    activeContent.style.display = "";
  }

  if (tabName === "thermal-cycle") {
    drawThermalCurve(container, data.thermalCycle);
  }
}

function switchVibrationType(container, type, data) {
  activeVibType = type;
  if (data.vibration) {
    data.vibration.type = type;
    saveData(data);
  }

  const btns = container.querySelectorAll(".vib-type-btn");
  btns.forEach((b) => {
    b.classList.toggle("active", b.dataset.type === type);
  });

  const sineCard = container.querySelector("#env-sine-card");
  const randomCard = container.querySelector("#env-random-card");
  if (sineCard) sineCard.style.display = type === "sine" ? "" : "none";
  if (randomCard) randomCard.style.display = type === "random" ? "" : "none";
}

function renderThermalCycle(container, data) {
  const tc = data.thermalCycle;
  if (!tc) return;

  const form = container.querySelector("#env-thermal-form");
  if (form) {
    form.tempHigh.value = tc.tempHigh ?? 85;
    form.tempLow.value = tc.tempLow ?? -40;
    form.rampRate.value = tc.rampRate ?? 5;
    form.cycles.value = tc.cycles ?? 100;
    form.holdTime.value = tc.holdTime ?? 30;
    form.coffinMansonN.value = tc.coffinMansonN ?? 2.5;
  }

  updateThermalResults(container, tc);
}

function updateThermalResults(container, tc) {
  const deltaTEl = container.querySelector("#env-delta-t");
  const cycleDamageEl = container.querySelector("#env-cycle-damage");
  const totalDamageEl = container.querySelector("#env-total-damage");
  const predictedLifeEl = container.querySelector("#env-predicted-life");
  const equivLifeEl = container.querySelector("#env-equiv-life");
  const statusBanner = container.querySelector("#env-thermal-status");

  if (deltaTEl) deltaTEl.textContent = tc.deltaT ? tc.deltaT.toFixed(1) : "—";
  if (cycleDamageEl) cycleDamageEl.textContent = tc.cycleDamage ? tc.cycleDamage.toExponential(2) : "—";
  if (totalDamageEl) {
    totalDamageEl.textContent = tc.totalDamage ? tc.totalDamage.toFixed(4) : "—";
    totalDamageEl.classList.remove("pass", "fail");
    if (tc.totalDamage > 0) {
      totalDamageEl.classList.add(tc.totalDamage < 1 ? "pass" : "fail");
    }
  }
  if (predictedLifeEl) predictedLifeEl.textContent = tc.predictedLife ? tc.predictedLife.toFixed(0) : "—";
  if (equivLifeEl) equivLifeEl.textContent = tc.equivalentLife ? tc.equivalentLife.toFixed(1) : "—";

  if (statusBanner && tc.totalDamage > 0) {
    statusBanner.style.display = "";
    if (tc.totalDamage < 0.3) {
      statusBanner.className = "status-banner pass";
      statusBanner.textContent = `累积损伤 ${tc.totalDamage.toFixed(4)}，远低于 1.0，寿命裕度充足。`;
    } else if (tc.totalDamage < 1) {
      statusBanner.className = "status-banner pass";
      statusBanner.textContent = `累积损伤 ${tc.totalDamage.toFixed(4)}，低于 1.0，满足要求。`;
    } else {
      statusBanner.className = "status-banner fail";
      statusBanner.textContent = `累积损伤 ${tc.totalDamage.toFixed(4)}，已超过 1.0，存在失效风险！`;
    }
  } else if (statusBanner) {
    statusBanner.style.display = "none";
  }
}

function calculateThermalCycle(container, data) {
  const tc = data.thermalCycle;
  if (!tc) return;

  const deltaT = tc.tempHigh - tc.tempLow;
  tc.deltaT = deltaT;

  const n = tc.coffinMansonN || 2.5;
  const Nf = COFFIN_MANSON_C / Math.pow(deltaT, n);
  tc.predictedLife = Math.max(1, Math.floor(Nf));

  const cycleDamage = 1 / Nf;
  tc.cycleDamage = cycleDamage;

  const totalDamage = (tc.cycles || 0) * cycleDamage;
  tc.totalDamage = totalDamage;

  const rampTime = (2 * deltaT) / (tc.rampRate || 1);
  const cycleTimeMinutes = rampTime + 2 * (tc.holdTime || 0);
  const cyclesPerYear = (365 * 24 * 60) / cycleTimeMinutes;
  tc.equivalentLife = (Nf / cyclesPerYear) * 8760;

  saveData(data);
  updateThermalResults(container, tc);
  drawThermalCurve(container, tc);
}

function resetThermalCycle(container, data) {
  data.thermalCycle = defaultThermalCycle();
  saveData(data);
  renderThermalCycle(container, data);
  drawThermalCurve(container, data.thermalCycle);
}

function drawThermalCurve(container, tc) {
  const canvas = container.querySelector("#env-thermal-canvas");
  if (!canvas || !tc) return;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 30, right: 30, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#1a2332";
  ctx.fillRect(0, 0, width, height);

  const tHigh = tc.tempHigh ?? 85;
  const tLow = tc.tempLow ?? -40;
  const rampRate = tc.rampRate ?? 5;
  const holdTime = tc.holdTime ?? 30;
  const deltaT = tHigh - tLow;
  const rampTime = deltaT / rampRate;
  const cycleTime = 2 * rampTime + 2 * holdTime;

  const numCycles = 3;
  const totalTime = numCycles * cycleTime;

  const tempMin = tLow - 10;
  const tempMax = tHigh + 10;

  ctx.strokeStyle = "#2d3a4f";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 5; i++) {
    const y = padding.top + (chartH * i) / 5;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    const temp = tempMax - ((tempMax - tempMin) * i) / 5;
    ctx.fillStyle = "#8b9cb3";
    ctx.font = "11px Segoe UI";
    ctx.textAlign = "right";
    ctx.fillText(temp.toFixed(0) + "°C", padding.left - 8, y + 4);
  }

  for (let i = 0; i <= numCycles; i++) {
    const x = padding.left + (chartW * i) / numCycles;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, height - padding.bottom);
    ctx.stroke();

    const time = (i * totalTime) / numCycles;
    ctx.fillStyle = "#8b9cb3";
    ctx.font = "11px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(time.toFixed(0) + " min", x, height - padding.bottom + 18);
  }

  const points = [];
  for (let c = 0; c < numCycles; c++) {
    const baseTime = c * cycleTime;
    points.push({ t: baseTime, temp: tLow });
    points.push({ t: baseTime + rampTime, temp: tHigh });
    points.push({ t: baseTime + rampTime + holdTime, temp: tHigh });
    points.push({ t: baseTime + rampTime + holdTime + rampTime, temp: tLow });
    points.push({ t: baseTime + cycleTime, temp: tLow });
  }

  ctx.strokeStyle = "#3b9eff";
  ctx.lineWidth = 2;
  ctx.beginPath();

  points.forEach((p, i) => {
    const x = padding.left + (p.t / totalTime) * chartW;
    const y = padding.top + ((tempMax - p.temp) / (tempMax - tempMin)) * chartH;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "#3b9eff";
  ctx.font = "bold 11px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("温度循环曲线 (示意)", width / 2, 18);

  ctx.fillStyle = "#8b9cb3";
  ctx.font = "11px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("时间 (min)", width / 2, height - 8);

  ctx.save();
  ctx.translate(14, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#8b9cb3";
  ctx.font = "11px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("温度 (°C)", 0, 0);
  ctx.restore();
}

function renderVibration(container, data) {
  const vib = data.vibration;
  if (!vib) return;

  const sineForm = container.querySelector("#env-sine-form");
  if (sineForm) {
    sineForm.freqStart.value = vib.freqStart ?? 10;
    sineForm.freqEnd.value = vib.freqEnd ?? 2000;
    sineForm.amplitude.value = vib.amplitude ?? 5;
    sineForm.direction.value = vib.direction ?? "x";
    sineForm.duration.value = vib.duration ?? 60;
  }

  const randomForm = container.querySelector("#env-random-form");
  if (randomForm) {
    randomForm.freqStart.value = vib.freqStart ?? 10;
    randomForm.freqEnd.value = vib.freqEnd ?? 2000;
    randomForm.psd.value = vib.psd ?? 0.1;
    randomForm.duration.value = vib.duration ?? 60;
  }

  switchVibrationType(container, vib.type || "sine", data);
  updateVibrationResults(container, vib);
}

function updateVibrationResults(container, vib) {
  const grmsEl = container.querySelector("#env-grms");
  const stressEl = container.querySelector("#env-stress-level");
  const fatigueEl = container.querySelector("#env-fatigue-damage");
  const suggestedEl = container.querySelector("#env-suggested-level");

  if (grmsEl) {
    grmsEl.textContent = vib.grms ? vib.grms.toFixed(2) : "—";
  }
  if (stressEl) {
    stressEl.textContent = vib.stressLevel || "—";
  }
  if (fatigueEl) {
    fatigueEl.textContent = vib.fatigueDamage ? vib.fatigueDamage.toFixed(4) : "—";
  }
  if (suggestedEl) {
    suggestedEl.textContent = vib.suggestedLevel || "—";
  }
}

function calculateVibration(container, data) {
  const vib = data.vibration;
  if (!vib) return;

  const freqRange = (vib.freqEnd || 0) - (vib.freqStart || 0);

  if (vib.type === "random") {
    const psd = vib.psd || 0;
    vib.grms = Math.sqrt(psd * Math.max(1, freqRange));
  } else {
    vib.grms = (vib.amplitude || 0) * 0.707;
  }

  const grms = vib.grms || 0;
  if (grms < 1) {
    vib.stressLevel = "低";
    vib.suggestedLevel = "等级 1 - 通用室内";
  } else if (grms < 5) {
    vib.stressLevel = "中";
    vib.suggestedLevel = "等级 2 - 工业/车载";
  } else if (grms < 15) {
    vib.stressLevel = "高";
    vib.suggestedLevel = "等级 3 - 军用/航空";
  } else {
    vib.stressLevel = "极高";
    vib.suggestedLevel = "等级 4 - 严苛环境";
  }

  const durationHours = (vib.duration || 0) / 60;
  const stressFactor = grms / 5;
  vib.fatigueDamage = Math.min(1, durationHours * stressFactor * 0.01);

  saveData(data);
  updateVibrationResults(container, vib);
}

function resetVibration(container, data) {
  data.vibration = defaultVibration();
  saveData(data);
  renderVibration(container, data);
}

function renderEnvStresses(container, data) {
  const tbody = container.querySelector("#env-stress-tbody");
  const countEl = container.querySelector("#env-stress-count");
  if (!tbody || !data.envStresses) return;

  if (countEl) {
    countEl.textContent = data.envStresses.length;
  }

  tbody.innerHTML = data.envStresses
    .map((s, idx) => {
      const levelOptions = envLevelOptions
        .map((opt) => `<option value="${opt.value}" ${s.level === opt.value ? "selected" : ""}>${opt.label}</option>`)
        .join("");

      return `
        <tr data-id="${s.id}">
          <td>${idx + 1}</td>
          <td>${escapeHtml(s.name || s.type)}</td>
          <td>
            <select class="form-input" data-field="level" style="font-size: 0.78rem; padding: 0.3rem 0.5rem;">
              ${levelOptions}
            </select>
          </td>
          <td>
            <input type="number" class="form-input" data-field="piE" value="${s.piE ?? 1.0}" min="0.1" step="0.1" style="font-size: 0.78rem; padding: 0.3rem 0.5rem; width: 80px;" />
          </td>
          <td>
            <input type="text" class="form-input" data-field="standard" value="${escapeHtml(s.standard || "")}" style="font-size: 0.78rem; padding: 0.3rem 0.5rem;" />
          </td>
          <td>
            <input type="text" class="form-input" data-field="note" value="${escapeHtml(s.note || "")}" style="font-size: 0.78rem; padding: 0.3rem 0.5rem;" />
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderStandards(container, data, category, search) {
  const tbody = container.querySelector("#env-standards-tbody");
  const emptyEl = container.querySelector("#env-standards-empty");
  if (!tbody || !data.standards) return;

  let filtered = data.standards;
  if (category && category !== "all") {
    filtered = filtered.filter((s) => s.category === category);
  }
  if (search && search.trim()) {
    const keyword = search.trim().toLowerCase();
    filtered = filtered.filter(
      (s) =>
        (s.code && s.code.toLowerCase().includes(keyword)) ||
        (s.name && s.name.toLowerCase().includes(keyword)) ||
        (s.scope && s.scope.toLowerCase().includes(keyword))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  tbody.innerHTML = filtered
    .map((s, idx) => {
      const categoryBadge = getCategoryBadge(s.category);
      return `
        <tr>
          <td>${idx + 1}</td>
          <td style="font-weight: 600; color: var(--accent);">${escapeHtml(s.code || "")}</td>
          <td>${escapeHtml(s.name || "")}</td>
          <td>${categoryBadge}</td>
          <td>${escapeHtml(s.scope || "")}</td>
          <td>${escapeHtml(s.items || "")}</td>
        </tr>
      `;
    })
    .join("");
}

function getCategoryBadge(category) {
  const colorMap = {
    "IEC 60068": "#3b9eff",
    "GJB 150": "#fbbf24",
    "MIL-STD-810": "#f87171",
    "GB/T 2423": "#34d399",
  };
  const color = colorMap[category] || "#8b9cb3";
  return `<span class="category-badge" style="background: ${color}22; color: ${color}; border: 1px solid ${color}44;">${escapeHtml(category || "")}</span>`;
}

function filterStandards(container, data) {
  const categorySelect = container.querySelector("#env-standard-category");
  const searchInput = container.querySelector("#env-standard-search");
  const category = categorySelect ? categorySelect.value : "all";
  const search = searchInput ? searchInput.value : "";
  renderStandards(container, data, category, search);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
