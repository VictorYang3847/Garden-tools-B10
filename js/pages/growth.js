import { genId, getCustomImprovements, setCustomImprovements } from "../store.js";
import { fmt } from "../utils.js";

let currentModel = null;
let onSaveCallback = null;

let improvLibraryCategory = "all";
let improvLibraryKeyword = "";

const IMPROVEMENT_LIBRARY = [
  { id: 'gear-carburizing', name: '齿轮渗碳淬火', category: 'gear', improvement: '3~5倍寿命', desc: '齿面硬度提升至HRC58~62，大幅提升接触疲劳寿命', applicable: '齿轮箱齿面磨损、点蚀' },
  { id: 'gear-grease', name: '换高温合成润滑脂', category: 'gear', improvement: '1.5~2倍寿命', desc: '高温下润滑脂不流失不稀化，保持油膜强度', applicable: '高温环境齿轮箱磨损' },
  { id: 'gear-seal', name: '增加迷宫密封防尘', category: 'gear', improvement: '1.3~1.8倍寿命', desc: '阻挡粉尘侵入，减少磨粒磨损', applicable: '多粉尘环境、密封差' },
  { id: 'gear-profile', name: '齿廓修形优化', category: 'gear', improvement: '1.2~1.5倍寿命', desc: '降低齿面接触应力，减少偏磨', applicable: '齿轮偏磨、接触不良' },
  { id: 'bearing-sealed', name: '换双面密封轴承', category: 'motor', improvement: '2~3倍寿命', desc: '双面密封轴承防止粉尘和润滑脂流失', applicable: '开式轴承磨损、进灰' },
  { id: 'bearing-alignment', name: '优化装配同轴度', category: 'motor', improvement: '1.2~1.5倍寿命', desc: '减少偏心受力，降低附加载荷', applicable: '轴承偏磨、异响' },
  { id: 'bearing-grease', name: '选用高速润滑脂', category: 'motor', improvement: '1.2倍寿命', desc: '高速高温下润滑性能更好', applicable: '高转速电机' },
  { id: 'switch-agni', name: '换银镍合金触点', category: 'switch', improvement: '5倍以上寿命', desc: '银镍合金抗电弧磨损能力远强于铜镀层', applicable: '开关触点磨损、接触不良' },
  { id: 'switch-dust', name: '增加硅胶防尘罩', category: 'switch', improvement: '1.5~2倍寿命', desc: '防止粉尘进入触点区域', applicable: '多尘环境开关失效' },
  { id: 'switch-derating', name: '电流降额使用', category: 'switch', improvement: '1.5倍寿命', desc: '降低触点电流，减少电弧侵蚀', applicable: '额定电流接近上限' },
  { id: 'battery-derating', name: '放电倍率降额', category: 'battery', improvement: '1.3~1.5倍寿命', desc: '放电倍率从1C降至0.8C，降低发热和衰减', applicable: '高倍率放电应用' },
  { id: 'battery-bms', name: 'BMS策略优化', category: 'battery', improvement: '1.2倍寿命', desc: '收窄充放电截止电压，避免过充过放', applicable: 'BMS策略激进' },
  { id: 'battery-cooling', name: '电芯间散热优化', category: 'battery', improvement: '1.1~1.3倍寿命', desc: '电芯间预留散热间隙，降低工作温度', applicable: '高温环境、密集排布' },
  { id: 'pcb-coating', name: 'PCB喷涂三防漆', category: 'pcb', improvement: '1.5~2倍寿命', desc: '防潮、防霉、防盐雾，保护电路板', applicable: '潮湿、腐蚀环境' },
  { id: 'pcb-derating', name: '功率器件降额50%', category: 'pcb', improvement: '2倍以上寿命', desc: '降低结温，大幅提升器件寿命', applicable: '功率器件发热严重' },
  { id: 'pcb-heatsink', name: '增加散热片', category: 'pcb', improvement: '1.5~2倍寿命', desc: '降低器件结温，每降10℃寿命翻倍', applicable: '高温环境、散热差' },
];

const CATEGORY_LABELS = {
  gear: '齿轮磨损',
  motor: '电机轴承',
  switch: '开关触点',
  battery: '锂电池',
  pcb: 'PCB电子',
};

const PHASE_COLORS = [
  "#3b9eff",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#a78bfa",
  "#fb923c",
  "#2dd4bf",
  "#f472b6",
];

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;
  const template = document.getElementById("growth-template");
  const content = template.content.cloneNode(true);
  container.appendChild(content);

  ensurePhases();
  loadCustomImprovements();
  bindEvents();
  renderPhaseSelector();
  renderPhaseInfo();
  renderFailureTable();
  renderImprovementList();
  updateParamsAndChart();
  renderComparisonTable();
  drawComparisonChart();
  renderGrowthSummary();
}

function ensurePhases() {
  if (!currentModel.modules) currentModel.modules = {};
  if (!currentModel.modules.growth) {
    currentModel.modules.growth = {
      phases: [],
      activePhaseId: null,
      model: "duane",
      targetMtbf: null,
    };
  }
  const g = currentModel.modules.growth;
  if (!Array.isArray(g.phases)) {
    const oldFailures = Array.isArray(g.failures) ? g.failures : [];
    const oldTotalTime = g.totalTime || null;
    const firstPhaseId = genId();
    g.phases = [
      {
        id: firstPhaseId,
        name: "首轮试验",
        phaseNumber: 1,
        description: "迁移自旧数据",
        failures: oldFailures,
        totalTime: oldTotalTime,
        startDate: null,
      },
    ];
    g.activePhaseId = firstPhaseId;
  }
  if (!g.activePhaseId && g.phases.length > 0) {
    g.activePhaseId = g.phases[0].id;
  }
  if (!g.model) g.model = "duane";
  if (g.targetMtbf === undefined) g.targetMtbf = null;
  for (const phase of g.phases) {
    if (!Array.isArray(phase.failures)) phase.failures = [];
    if (!Array.isArray(phase.improvements)) phase.improvements = [];
    if (phase.totalTime === undefined) phase.totalTime = null;
    if (!phase.phaseNumber) phase.phaseNumber = 1;
    if (!phase.name) phase.name = `第${phase.phaseNumber}轮`;
  }
}

function save() {
  if (!onSaveCallback || !currentModel) return;
  onSaveCallback(currentModel);
}

function getGrowth() {
  return currentModel.modules.growth;
}

function getActivePhase() {
  const g = getGrowth();
  return g.phases.find((p) => p.id === g.activePhaseId) || g.phases[0] || null;
}

function getSortedFailures() {
  const phase = getActivePhase();
  if (!phase) return [];
  return [...phase.failures].sort((a, b) => a.time - b.time);
}

function getTotalTime() {
  const phase = getActivePhase();
  if (!phase) return 0;
  const sorted = getSortedFailures();
  if (phase.totalTime && phase.totalTime > 0) {
    return phase.totalTime;
  }
  if (sorted.length > 0) {
    return sorted[sorted.length - 1].time;
  }
  return 0;
}

function getPhaseSortedFailures(phase) {
  return [...phase.failures].sort((a, b) => a.time - b.time);
}

function getPhaseTotalTime(phase) {
  const sorted = getPhaseSortedFailures(phase);
  if (phase.totalTime && phase.totalTime > 0) {
    return phase.totalTime;
  }
  if (sorted.length > 0) {
    return sorted[sorted.length - 1].time;
  }
  return 0;
}

function renderPhaseSelector() {
  const g = getGrowth();
  const select = document.getElementById("growth-phase-select");
  if (!select) return;

  let html = "";
  g.phases.forEach((phase) => {
    const selected = phase.id === g.activePhaseId ? "selected" : "";
    html += `<option value="${phase.id}" ${selected}>第${phase.phaseNumber}轮 - ${escapeHtml(phase.name)}</option>`;
  });
  select.innerHTML = html;

  const deleteBtn = document.getElementById("growth-delete-phase");
  if (deleteBtn) {
    deleteBtn.disabled = g.phases.length <= 1;
    deleteBtn.style.opacity = g.phases.length <= 1 ? "0.5" : "1";
  }
}

function renderPhaseInfo() {
  const phase = getActivePhase();
  if (!phase) return;

  const nameInput = document.getElementById("growth-phase-name");
  const totalTimeInput = document.getElementById("growth-phase-total-time");
  const descInput = document.getElementById("growth-phase-desc");

  if (nameInput) nameInput.value = phase.name || "";
  if (totalTimeInput) totalTimeInput.value = phase.totalTime || "";
  if (descInput) descInput.value = phase.description || "";
}

function addPhase() {
  const g = getGrowth();
  const lastPhase = g.phases[g.phases.length - 1];
  const newNumber = lastPhase ? lastPhase.phaseNumber + 1 : 1;
  const newId = genId();

  g.phases.push({
    id: newId,
    name: `第${newNumber}轮试验`,
    phaseNumber: newNumber,
    description: "",
    failures: [],
    improvements: [],
    totalTime: null,
    startDate: null,
  });
  g.activePhaseId = newId;
  save();
  renderPhaseSelector();
  renderPhaseInfo();
  renderFailureTable();
  renderImprovementList();
  updateParamsAndChart();
  renderComparisonTable();
  drawComparisonChart();
  renderGrowthSummary();
}

function deletePhase() {
  const g = getGrowth();
  if (g.phases.length <= 1) return;

  if (!confirm("确定要删除当前轮次吗？此操作不可撤销。")) return;

  const idx = g.phases.findIndex((p) => p.id === g.activePhaseId);
  if (idx < 0) return;

  g.phases.splice(idx, 1);

  for (let i = idx; i < g.phases.length; i++) {
    g.phases[i].phaseNumber = i + 1;
  }

  g.activePhaseId = g.phases[Math.max(0, idx - 1)].id;
  save();
  renderPhaseSelector();
  renderPhaseInfo();
  renderFailureTable();
  renderImprovementList();
  updateParamsAndChart();
  renderComparisonTable();
  drawComparisonChart();
  renderGrowthSummary();
}

function bindEvents() {
  const modelSelect = document.getElementById("growth-model-select");
  const targetInput = document.getElementById("growth-target-mtbf");
  const addBtn = document.getElementById("growth-add-failure");
  const emptyAddBtn = document.getElementById("growth-empty-add-btn");
  const phaseSelect = document.getElementById("growth-phase-select");
  const addPhaseBtn = document.getElementById("growth-add-phase");
  const deletePhaseBtn = document.getElementById("growth-delete-phase");
  const phaseNameInput = document.getElementById("growth-phase-name");
  const phaseTotalTimeInput = document.getElementById("growth-phase-total-time");
  const phaseDescInput = document.getElementById("growth-phase-desc");

  const g = getGrowth();
  if (modelSelect) {
    modelSelect.value = g.model || "duane";
    modelSelect.addEventListener("change", () => {
      g.model = modelSelect.value;
      save();
      updateModelParamsVisibility();
      updateParamsAndChart();
      renderComparisonTable();
      drawComparisonChart();
      renderGrowthSummary();
    });
  }

  if (targetInput) {
    targetInput.value = g.targetMtbf || "";
    targetInput.addEventListener("input", () => {
      const val = parseFloat(targetInput.value);
      g.targetMtbf = Number.isFinite(val) && val > 0 ? val : null;
      save();
      updateParamsAndChart();
      renderComparisonTable();
      drawComparisonChart();
      renderGrowthSummary();
    });
  }

  if (phaseSelect) {
    phaseSelect.addEventListener("change", () => {
      g.activePhaseId = phaseSelect.value;
      save();
      renderPhaseInfo();
      renderFailureTable();
      renderImprovementList();
      updateParamsAndChart();
    });
  }

  if (addPhaseBtn) {
    addPhaseBtn.addEventListener("click", () => addPhase());
  }

  if (deletePhaseBtn) {
    deletePhaseBtn.addEventListener("click", () => deletePhase());
  }

  if (phaseNameInput) {
    phaseNameInput.addEventListener("input", () => {
      const phase = getActivePhase();
      if (phase) {
        phase.name = phaseNameInput.value;
        save();
        renderPhaseSelector();
        renderComparisonTable();
        drawComparisonChart();
      }
    });
  }

  if (phaseTotalTimeInput) {
    phaseTotalTimeInput.addEventListener("input", () => {
      const phase = getActivePhase();
      if (phase) {
        const val = parseFloat(phaseTotalTimeInput.value);
        phase.totalTime = Number.isFinite(val) && val > 0 ? val : null;
        save();
        updateParamsAndChart();
        renderComparisonTable();
        drawComparisonChart();
        renderGrowthSummary();
      }
    });
  }

  if (phaseDescInput) {
    phaseDescInput.addEventListener("input", () => {
      const phase = getActivePhase();
      if (phase) {
        phase.description = phaseDescInput.value;
        save();
      }
    });
  }

  if (addBtn) {
    addBtn.addEventListener("click", () => addFailure());
  }
  if (emptyAddBtn) {
    emptyAddBtn.addEventListener("click", () => addFailure());
  }

  const tbody = document.getElementById("growth-table-body");
  if (tbody) {
    tbody.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest("[data-delete]");
      if (deleteBtn) {
        const id = deleteBtn.dataset.delete;
        deleteFailure(id);
      }
    });

    tbody.addEventListener("change", (e) => {
      const row = e.target.closest("[data-id]");
      if (!row) return;
      const id = row.dataset.id;
      const field = e.target.dataset.field;
      if (!field) return;

      const phase = getActivePhase();
      if (!phase) return;
      const failure = phase.failures.find((f) => f.id === id);
      if (!failure) return;

      if (field === "time") {
        const val = parseFloat(e.target.value);
        failure.time = Number.isFinite(val) && val > 0 ? val : 0;
      } else if (field === "failureMode") {
        failure.failureMode = e.target.value;
      }
      save();
      renderFailureTable();
      updateParamsAndChart();
      renderComparisonTable();
      drawComparisonChart();
      renderGrowthSummary();
    });
  }

  const openLibraryBtn = document.getElementById("growth-open-library");
  if (openLibraryBtn) {
    openLibraryBtn.addEventListener("click", () => openImprovementLibrary());
  }

  const closeLibraryBtn = document.getElementById("growth-improv-library-close");
  if (closeLibraryBtn) {
    closeLibraryBtn.addEventListener("click", () => closeImprovementLibrary());
  }

  const libraryOverlay = document.getElementById("growth-improv-library-overlay");
  if (libraryOverlay) {
    libraryOverlay.addEventListener("click", () => closeImprovementLibrary());
  }

  const searchInput = document.getElementById("growth-improv-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => handleImprovSearch());
  }

  const categories = document.getElementById("growth-improv-categories");
  if (categories) {
    categories.addEventListener("click", (e) => {
      const btn = e.target.closest(".improv-cat-btn");
      if (btn) {
        handleImprovCategoryChange(btn.dataset.category);
      }
    });
  }

  const libraryList = document.getElementById("growth-improv-library-list");
  if (libraryList) {
    libraryList.addEventListener("click", (e) => {
      const addBtn = e.target.closest("[data-add-improv]");
      if (addBtn) {
        const improvId = addBtn.dataset.addImprov;
        addImprovementFromLibrary(improvId);
      }
    });
  }

  const addCustomBtn = document.getElementById("growth-add-custom-improv");
  if (addCustomBtn) {
    addCustomBtn.addEventListener("click", () => openCustomImprovementModal());
  }

  const closeCustomBtn = document.getElementById("growth-custom-improv-close");
  if (closeCustomBtn) {
    closeCustomBtn.addEventListener("click", () => closeCustomImprovementModal());
  }

  const customOverlay = document.getElementById("growth-custom-improv-overlay");
  if (customOverlay) {
    customOverlay.addEventListener("click", () => closeCustomImprovementModal());
  }

  const cancelCustomBtn = document.getElementById("growth-custom-improv-cancel");
  if (cancelCustomBtn) {
    cancelCustomBtn.addEventListener("click", () => closeCustomImprovementModal());
  }

  const saveCustomBtn = document.getElementById("growth-custom-improv-save");
  if (saveCustomBtn) {
    saveCustomBtn.addEventListener("click", () => handleSaveCustomImprovement());
  }

  const improvementList = document.getElementById("growth-improvement-list");
  if (improvementList) {
    improvementList.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest("[data-delete-improv]");
      if (deleteBtn) {
        const id = deleteBtn.dataset.deleteImprov;
        deleteImprovement(id);
      }
    });
  }
}

function addFailure() {
  const phase = getActivePhase();
  if (!phase) return;
  const sorted = getSortedFailures();
  const lastTime = sorted.length > 0 ? sorted[sorted.length - 1].time : 0;
  const newTime = lastTime + (lastTime > 0 ? lastTime * 0.2 : 100);

  phase.failures.push({
    id: genId(),
    time: Math.round(newTime * 10) / 10,
    failureMode: "",
  });
  save();
  renderFailureTable();
  updateParamsAndChart();
  renderComparisonTable();
  drawComparisonChart();
  renderGrowthSummary();
}

function deleteFailure(id) {
  const phase = getActivePhase();
  if (!phase) return;
  phase.failures = phase.failures.filter((f) => f.id !== id);
  save();
  renderFailureTable();
  updateParamsAndChart();
  renderComparisonTable();
  drawComparisonChart();
  renderGrowthSummary();
}

function renderFailureTable() {
  const tbody = document.getElementById("growth-table-body");
  const emptyState = document.getElementById("growth-empty-state");
  const countEl = document.getElementById("growth-failure-count");
  if (!tbody) return;

  const sorted = getSortedFailures();
  const totalTime = getTotalTime();

  if (countEl) {
    countEl.textContent = sorted.length;
  }

  if (sorted.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) emptyState.style.display = "";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  let html = "";
  sorted.forEach((f, idx) => {
    const cumulativeTime = f.time;
    const cumulativeN = idx + 1;
    const instantaneousMtbf = idx > 0 ? (f.time - sorted[idx - 1].time) : f.time;

    html += `
      <tr data-id="${f.id}">
        <td>${idx + 1}</td>
        <td>
          <input type="number" class="item-input" data-field="time" value="${f.time}" min="0" step="0.1" />
        </td>
        <td>
          <input type="text" class="item-input" data-field="failureMode" value="${escapeHtml(f.failureMode || "")}" placeholder="输入失效模式" />
        </td>
        <td>${fmt(cumulativeTime, 1)}</td>
        <td>${cumulativeN}</td>
        <td>${fmt(instantaneousMtbf, 1)}</td>
        <td>
          <button type="button" class="btn-icon btn-sm" data-delete="${f.id}" title="删除" style="padding: 0.25rem 0.5rem;">
            <span>🗑️</span>
          </button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function updateModelParamsVisibility() {
  const g = getGrowth();
  const duaneParams = document.getElementById("growth-duane-params");
  const crowParams = document.getElementById("growth-crow-params");
  if (duaneParams) duaneParams.style.display = g.model === "duane" ? "" : "none";
  if (crowParams) crowParams.style.display = g.model === "crowAMSAA" ? "" : "none";
}

function fitDuane(sorted, totalTime) {
  const n = sorted.length;
  if (n < 2) return null;

  const lnT = [];
  const lnN = [];
  for (let i = 0; i < n; i++) {
    if (sorted[i].time <= 0) continue;
    lnT.push(Math.log(sorted[i].time));
    lnN.push(Math.log(i + 1));
  }

  const m = lnT.length;
  if (m < 2) return null;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < m; i++) {
    sumX += lnT[i];
    sumY += lnN[i];
    sumXY += lnT[i] * lnN[i];
    sumX2 += lnT[i] * lnT[i];
  }

  const slope = (m * sumXY - sumX * sumY) / (m * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / m;
  const a = Math.exp(intercept);

  let ssRes = 0, ssTot = 0;
  const yMean = sumY / m;
  for (let i = 0; i < m; i++) {
    const yPred = intercept + slope * lnT[i];
    ssRes += (lnN[i] - yPred) * (lnN[i] - yPred);
    ssTot += (lnN[i] - yMean) * (lnN[i] - yMean);
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  const finalMtbf = totalTime > 0 && slope > 0 && slope < 1
    ? totalTime / (slope * a * Math.pow(totalTime, slope))
    : null;

  return {
    m: slope,
    a: a,
    lnA: intercept,
    finalMtbf: finalMtbf,
    r2: r2,
  };
}

function fitCrowAMSAA(sorted, totalTime) {
  const n = sorted.length;
  if (n < 2 || totalTime <= 0) return null;

  let sumLnTOverTi = 0;
  for (let i = 0; i < n; i++) {
    if (sorted[i].time > 0 && totalTime > 0) {
      sumLnTOverTi += Math.log(totalTime / sorted[i].time);
    }
  }

  const beta = sumLnTOverTi > 0 ? n / sumLnTOverTi : null;
  const lambda = beta !== null ? n / Math.pow(totalTime, beta) : null;

  let currentMtbf = null;
  if (beta !== null && lambda !== null && beta > 0 && totalTime > 0) {
    currentMtbf = 1 / (lambda * beta * Math.pow(totalTime, beta - 1));
  }

  let trend = "—";
  if (beta !== null) {
    if (beta < 1) trend = "增长中";
    else if (beta > 1) trend = "衰减中";
    else trend = "恒定";
  }

  return {
    beta: beta,
    lambda: lambda,
    currentMtbf: currentMtbf,
    trend: trend,
  };
}

function calcPhaseMetrics(phase) {
  const sorted = getPhaseSortedFailures(phase);
  const totalTime = getPhaseTotalTime(phase);
  const g = getGrowth();

  let mtbf = null;
  let b10 = null;

  if (g.model === "duane") {
    const result = fitDuane(sorted, totalTime);
    if (result && result.finalMtbf) {
      mtbf = result.finalMtbf;
    }
  } else if (g.model === "crowAMSAA") {
    const result = fitCrowAMSAA(sorted, totalTime);
    if (result && result.currentMtbf) {
      mtbf = result.currentMtbf;
    }
  }

  if (mtbf === null && sorted.length > 0) {
    mtbf = totalTime / sorted.length * 2;
  }

  if (mtbf !== null) {
    b10 = mtbf * (-Math.log(0.9));
  }

  return { mtbf, b10, failureCount: sorted.length, totalTime };
}

function estimateTimeToTarget(targetMtbf, modelType, duaneResult, crowResult, totalTime) {
  if (!targetMtbf || targetMtbf <= 0) return null;

  if (modelType === "duane" && duaneResult && duaneResult.m > 0 && duaneResult.m < 1 && duaneResult.a > 0) {
    const m = duaneResult.m;
    const a = duaneResult.a;
    const targetTime = Math.pow(1 / (a * m * targetMtbf), 1 / (m - 1));
    if (targetTime > totalTime) {
      return targetTime;
    }
    return null;
  }

  if (modelType === "crowAMSAA" && crowResult && crowResult.beta !== null && crowResult.lambda !== null && crowResult.beta > 0 && crowResult.beta < 1) {
    const beta = crowResult.beta;
    const lambda = crowResult.lambda;
    const targetTime = Math.pow(1 / (lambda * beta * targetMtbf), 1 / (beta - 1));
    if (targetTime > totalTime) {
      return targetTime;
    }
    return null;
  }

  return null;
}

function getCurrentMtbf(modelType, duaneResult, crowResult) {
  if (modelType === "duane" && duaneResult) {
    return duaneResult.finalMtbf;
  }
  if (modelType === "crowAMSAA" && crowResult) {
    return crowResult.currentMtbf;
  }
  return null;
}

function updateParamsAndChart() {
  const g = getGrowth();
  const sorted = getSortedFailures();
  const totalTime = getTotalTime();

  updateModelParamsVisibility();

  const duaneResult = fitDuane(sorted, totalTime);
  const crowResult = fitCrowAMSAA(sorted, totalTime);

  const duaneM = document.getElementById("growth-duane-m");
  const duaneA = document.getElementById("growth-duane-a");
  const duaneMtbf = document.getElementById("growth-duane-mtbf");
  const duaneR2 = document.getElementById("growth-duane-r2");

  if (duaneResult) {
    if (duaneM) duaneM.textContent = fmt(duaneResult.m, 4);
    if (duaneA) duaneA.textContent = fmt(duaneResult.a, 4);
    if (duaneMtbf) duaneMtbf.textContent = fmt(duaneResult.finalMtbf, 1);
    if (duaneR2) duaneR2.textContent = fmt(duaneResult.r2, 4);
  } else {
    if (duaneM) duaneM.textContent = "—";
    if (duaneA) duaneA.textContent = "—";
    if (duaneMtbf) duaneMtbf.textContent = "—";
    if (duaneR2) duaneR2.textContent = "—";
  }

  const crowBeta = document.getElementById("growth-crow-beta");
  const crowLambda = document.getElementById("growth-crow-lambda");
  const crowMtbf = document.getElementById("growth-crow-mtbf");
  const crowTrend = document.getElementById("growth-crow-trend");

  if (crowResult) {
    if (crowBeta) crowBeta.textContent = fmt(crowResult.beta, 4);
    if (crowLambda) crowLambda.textContent = fmt(crowResult.lambda, 6);
    if (crowMtbf) crowMtbf.textContent = fmt(crowResult.currentMtbf, 1);
    if (crowTrend) crowTrend.textContent = crowResult.trend;
  } else {
    if (crowBeta) crowBeta.textContent = "—";
    if (crowLambda) crowLambda.textContent = "—";
    if (crowMtbf) crowMtbf.textContent = "—";
    if (crowTrend) crowTrend.textContent = "—";
  }

  const targetDisplay = document.getElementById("growth-target-display");
  const currentMtbfEl = document.getElementById("growth-current-mtbf");
  const targetStatusEl = document.getElementById("growth-target-status");
  const estimatedTimeEl = document.getElementById("growth-estimated-time");
  const statusBanner = document.getElementById("growth-status-banner");

  const currentMtbf = getCurrentMtbf(g.model, duaneResult, crowResult);
  const targetMtbf = g.targetMtbf;
  const estimatedTime = estimateTimeToTarget(targetMtbf, g.model, duaneResult, crowResult, totalTime);

  if (targetDisplay) {
    targetDisplay.textContent = targetMtbf ? fmt(targetMtbf, 1) : "—";
  }
  if (currentMtbfEl) {
    currentMtbfEl.textContent = currentMtbf ? fmt(currentMtbf, 1) : "—";
  }

  let isMet = false;
  if (targetMtbf && currentMtbf) {
    isMet = currentMtbf >= targetMtbf;
  }

  if (targetStatusEl) {
    targetStatusEl.textContent = targetMtbf && currentMtbf
      ? (isMet ? "已达标" : "未达标")
      : "—";
    targetStatusEl.className = "metric-value" + (targetMtbf && currentMtbf ? (isMet ? " pass" : " fail") : "");
  }

  if (estimatedTimeEl) {
    estimatedTimeEl.textContent = estimatedTime ? fmt(estimatedTime, 1) : "—";
  }

  if (statusBanner) {
    if (targetMtbf && currentMtbf) {
      statusBanner.style.display = "";
      statusBanner.className = "status-banner " + (isMet ? "pass" : "fail");
      if (isMet) {
        statusBanner.textContent = `已达成增长目标！当前 MTBF ${fmt(currentMtbf, 1)}h ≥ 目标 ${fmt(targetMtbf, 1)}h`;
      } else if (estimatedTime) {
        const additionalTime = estimatedTime - totalTime;
        statusBanner.textContent = `未达标。当前 MTBF ${fmt(currentMtbf, 1)}h，预计还需 ${fmt(additionalTime, 1)}h 试验可达到目标（总时间约 ${fmt(estimatedTime, 1)}h）`;
      } else {
        statusBanner.textContent = `未达标。当前 MTBF ${fmt(currentMtbf, 1)}h，无法估算达标时间`;
      }
    } else {
      statusBanner.style.display = "none";
    }
  }

  drawGrowthChart(sorted, totalTime, g.model, duaneResult, crowResult, targetMtbf);
}

function drawGrowthChart(sorted, totalTime, modelType, duaneResult, crowResult, targetMtbf) {
  const canvas = document.getElementById("growth-chart-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const padding = { top: 30, right: 30, bottom: 50, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#1a2332";
  ctx.fillRect(0, 0, width, height);

  if (sorted.length === 0 || totalTime <= 0) {
    ctx.fillStyle = "#8b9cb3";
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("请添加失效数据以查看增长曲线", width / 2, height / 2);
    return;
  }

  const dataPoints = [];
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].time > 0) {
      dataPoints.push({ x: sorted[i].time, y: i + 1 });
    }
  }

  if (dataPoints.length === 0) return;

  let maxX = totalTime > dataPoints[dataPoints.length - 1].x ? totalTime : dataPoints[dataPoints.length - 1].x;
  let minX = dataPoints[0].x > 0 ? dataPoints[0].x : 1;
  let maxY = dataPoints[dataPoints.length - 1].y;
  let minY = 1;

  if (targetMtbf && modelType === "duane" && duaneResult && duaneResult.m > 0 && duaneResult.m < 1) {
    const m = duaneResult.m;
    const a = duaneResult.a;
    const tTarget = Math.pow(1 / (a * m * targetMtbf), 1 / (m - 1));
    if (tTarget > maxX) maxX = tTarget * 1.1;
  }
  if (targetMtbf && modelType === "crowAMSAA" && crowResult && crowResult.beta !== null && crowResult.beta > 0 && crowResult.beta < 1) {
    const beta = crowResult.beta;
    const lambda = crowResult.lambda;
    const tTarget = Math.pow(1 / (lambda * beta * targetMtbf), 1 / (beta - 1));
    if (tTarget > maxX) maxX = tTarget * 1.1;
  }

  const logMinX = Math.log10(minX);
  const logMaxX = Math.log10(maxX * 1.1);
  const logMinY = Math.log10(minY * 0.5);
  const logMaxY = Math.log10(maxY * 1.5);

  function xToPx(x) {
    const logX = Math.log10(x);
    return padding.left + ((logX - logMinX) / (logMaxX - logMinX)) * chartW;
  }

  function yToPx(y) {
    const logY = Math.log10(y);
    return padding.top + chartH - ((logY - logMinY) / (logMaxY - logMinY)) * chartH;
  }

  ctx.strokeStyle = "#2d3a4f";
  ctx.lineWidth = 1;

  const xTicks = generateLogTicks(minX, maxX * 1.1);
  xTicks.forEach((tick) => {
    const px = xToPx(tick);
    if (px >= padding.left && px <= padding.left + chartW) {
      ctx.beginPath();
      ctx.moveTo(px, padding.top);
      ctx.lineTo(px, padding.top + chartH);
      ctx.stroke();
    }
  });

  const yTicks = generateLogTicks(minY * 0.5, maxY * 1.5);
  yTicks.forEach((tick) => {
    const py = yToPx(tick);
    if (py >= padding.top && py <= padding.top + chartH) {
      ctx.beginPath();
      ctx.moveTo(padding.left, py);
      ctx.lineTo(padding.left + chartW, py);
      ctx.stroke();
    }
  });

  ctx.strokeStyle = "#8b9cb3";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.lineTo(padding.left + chartW, padding.top + chartH);
  ctx.stroke();

  ctx.fillStyle = "#8b9cb3";
  ctx.font = "11px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  xTicks.forEach((tick) => {
    const px = xToPx(tick);
    if (px >= padding.left && px <= padding.left + chartW) {
      ctx.fillText(formatTick(tick), px, padding.top + chartH + 18);
    }
  });

  ctx.textAlign = "right";
  yTicks.forEach((tick) => {
    const py = yToPx(tick);
    if (py >= padding.top && py <= padding.top + chartH) {
      ctx.fillText(formatTick(tick), padding.left - 8, py + 4);
    }
  });

  ctx.fillStyle = "#e8edf4";
  ctx.font = "12px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("累计时间 (h) - 对数坐标", padding.left + chartW / 2, height - 10);

  ctx.save();
  ctx.translate(18, padding.top + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("累计失效数 - 对数坐标", 0, 0);
  ctx.restore();

  if (modelType === "duane" && duaneResult && duaneResult.m > 0) {
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let first = true;
    for (let t = minX; t <= maxX * 1.1; t *= 1.02) {
      const nPred = duaneResult.a * Math.pow(t, duaneResult.m);
      if (nPred > 0) {
        const px = xToPx(t);
        const py = yToPx(nPred);
        if (first) {
          ctx.moveTo(px, py);
          first = false;
        } else {
          ctx.lineTo(px, py);
        }
      }
    }
    ctx.stroke();
  }

  if (modelType === "crowAMSAA" && crowResult && crowResult.beta !== null && crowResult.lambda !== null) {
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let first = true;
    for (let t = minX; t <= maxX * 1.1; t *= 1.02) {
      const nPred = crowResult.lambda * Math.pow(t, crowResult.beta);
      if (nPred > 0) {
        const px = xToPx(t);
        const py = yToPx(nPred);
        if (first) {
          ctx.moveTo(px, py);
          first = false;
        } else {
          ctx.lineTo(px, py);
        }
      }
    }
    ctx.stroke();
  }

  if (targetMtbf && targetMtbf > 0) {
    let targetN = null;
    let targetT = null;

    if (modelType === "duane" && duaneResult && duaneResult.m > 0 && duaneResult.m < 1 && duaneResult.a > 0) {
      targetT = Math.pow(1 / (duaneResult.a * duaneResult.m * targetMtbf), 1 / (duaneResult.m - 1));
      targetN = duaneResult.a * Math.pow(targetT, duaneResult.m);
    } else if (modelType === "crowAMSAA" && crowResult && crowResult.beta !== null && crowResult.lambda !== null && crowResult.beta > 0 && crowResult.beta < 1) {
      targetT = Math.pow(1 / (crowResult.lambda * crowResult.beta * targetMtbf), 1 / (crowResult.beta - 1));
      targetN = crowResult.lambda * Math.pow(targetT, crowResult.beta);
    }

    if (targetT && targetN && targetT > 0 && targetN > 0) {
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const px = xToPx(targetT);
      ctx.moveTo(px, padding.top);
      ctx.lineTo(px, padding.top + chartH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#fbbf24";
      ctx.font = "11px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`目标: ${fmt(targetT, 0)}h`, px, padding.top - 8);
    }
  }

  ctx.fillStyle = "#3b9eff";
  dataPoints.forEach((pt) => {
    const px = xToPx(pt.x);
    const py = yToPx(pt.y);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f1419";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

function renderComparisonTable() {
  const g = getGrowth();
  const tbody = document.getElementById("growth-comparison-body");
  if (!tbody) return;

  let html = "";
  let prevMtbf = null;

  g.phases.forEach((phase, idx) => {
    const metrics = calcPhaseMetrics(phase);
    const color = PHASE_COLORS[idx % PHASE_COLORS.length];

    let improvement = "—";
    let improvementColor = "";
    if (prevMtbf !== null && metrics.mtbf !== null && prevMtbf > 0) {
      const pct = ((metrics.mtbf - prevMtbf) / prevMtbf) * 100;
      improvement = (pct >= 0 ? "+" : "") + fmt(pct, 1) + "%";
      improvementColor = pct >= 0 ? "var(--success)" : "var(--danger)";
    }

    html += `
      <tr>
        <td style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; display: inline-block;"></span>
          <span>${escapeHtml(phase.name)}</span>
        </td>
        <td>${metrics.failureCount}</td>
        <td>${fmt(metrics.totalTime, 1)}</td>
        <td>${metrics.mtbf ? fmt(metrics.mtbf, 1) : "—"}</td>
        <td>${metrics.b10 ? fmt(metrics.b10, 1) : "—"}</td>
        <td style="font-weight: 600; color: ${improvementColor || 'inherit'};">${improvement}</td>
      </tr>
    `;

    if (metrics.mtbf !== null) {
      prevMtbf = metrics.mtbf;
    }
  });

  tbody.innerHTML = html;
}

function drawComparisonChart() {
  const g = getGrowth();
  const canvas = document.getElementById("growth-comparison-canvas");
  const legendDiv = document.getElementById("growth-comparison-legend");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const padding = { top: 30, right: 30, bottom: 50, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#1a2332";
  ctx.fillRect(0, 0, width, height);

  const validPhases = g.phases.filter((p) => p.failures.length > 0 && getPhaseTotalTime(p) > 0);

  if (validPhases.length === 0) {
    ctx.fillStyle = "#8b9cb3";
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("请添加失效数据以查看对比曲线", width / 2, height / 2);
    if (legendDiv) legendDiv.innerHTML = "";
    return;
  }

  let allMaxX = 0;
  let allMaxY = 0;
  let allMinX = Infinity;

  validPhases.forEach((phase) => {
    const sorted = getPhaseSortedFailures(phase);
    const totalTime = getPhaseTotalTime(phase);
    if (sorted.length > 0) {
      if (sorted[0].time > 0 && sorted[0].time < allMinX) allMinX = sorted[0].time;
      const maxT = totalTime > sorted[sorted.length - 1].time ? totalTime : sorted[sorted.length - 1].time;
      if (maxT > allMaxX) allMaxX = maxT;
      if (sorted.length > allMaxY) allMaxY = sorted.length;
    }
  });

  if (allMinX === Infinity) allMinX = 1;
  if (allMinX <= 0) allMinX = 1;

  const targetMtbf = g.targetMtbf;
  if (targetMtbf && targetMtbf > 0) {
    validPhases.forEach((phase) => {
      const sorted = getPhaseSortedFailures(phase);
      const totalTime = getPhaseTotalTime(phase);
      const duaneResult = fitDuane(sorted, totalTime);
      const crowResult = fitCrowAMSAA(sorted, totalTime);
      if (g.model === "duane" && duaneResult && duaneResult.m > 0 && duaneResult.m < 1) {
        const tTarget = Math.pow(1 / (duaneResult.a * duaneResult.m * targetMtbf), 1 / (duaneResult.m - 1));
        if (tTarget > allMaxX) allMaxX = tTarget * 1.1;
      }
      if (g.model === "crowAMSAA" && crowResult && crowResult.beta !== null && crowResult.beta > 0 && crowResult.beta < 1) {
        const tTarget = Math.pow(1 / (crowResult.lambda * crowResult.beta * targetMtbf), 1 / (crowResult.beta - 1));
        if (tTarget > allMaxX) allMaxX = tTarget * 1.1;
      }
    });
  }

  allMaxX *= 1.1;
  allMaxY = Math.max(allMaxY * 1.5, 2);
  const allMinY = 0.5;

  const logMinX = Math.log10(allMinX);
  const logMaxX = Math.log10(allMaxX);
  const logMinY = Math.log10(allMinY);
  const logMaxY = Math.log10(allMaxY);

  function xToPx(x) {
    const logX = Math.log10(x);
    return padding.left + ((logX - logMinX) / (logMaxX - logMinX)) * chartW;
  }

  function yToPx(y) {
    const logY = Math.log10(y);
    return padding.top + chartH - ((logY - logMinY) / (logMaxY - logMinY)) * chartH;
  }

  ctx.strokeStyle = "#2d3a4f";
  ctx.lineWidth = 1;

  const xTicks = generateLogTicks(allMinX, allMaxX);
  xTicks.forEach((tick) => {
    const px = xToPx(tick);
    if (px >= padding.left && px <= padding.left + chartW) {
      ctx.beginPath();
      ctx.moveTo(px, padding.top);
      ctx.lineTo(px, padding.top + chartH);
      ctx.stroke();
    }
  });

  const yTicks = generateLogTicks(allMinY, allMaxY);
  yTicks.forEach((tick) => {
    const py = yToPx(tick);
    if (py >= padding.top && py <= padding.top + chartH) {
      ctx.beginPath();
      ctx.moveTo(padding.left, py);
      ctx.lineTo(padding.left + chartW, py);
      ctx.stroke();
    }
  });

  ctx.strokeStyle = "#8b9cb3";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.lineTo(padding.left + chartW, padding.top + chartH);
  ctx.stroke();

  ctx.fillStyle = "#8b9cb3";
  ctx.font = "11px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  xTicks.forEach((tick) => {
    const px = xToPx(tick);
    if (px >= padding.left && px <= padding.left + chartW) {
      ctx.fillText(formatTick(tick), px, padding.top + chartH + 18);
    }
  });

  ctx.textAlign = "right";
  yTicks.forEach((tick) => {
    const py = yToPx(tick);
    if (py >= padding.top && py <= padding.top + chartH) {
      ctx.fillText(formatTick(tick), padding.left - 8, py + 4);
    }
  });

  ctx.fillStyle = "#e8edf4";
  ctx.font = "12px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("累计时间 (h) - 对数坐标", padding.left + chartW / 2, height - 10);

  ctx.save();
  ctx.translate(18, padding.top + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("累计失效数 - 对数坐标", 0, 0);
  ctx.restore();

  validPhases.forEach((phase, idx) => {
    const color = PHASE_COLORS[idx % PHASE_COLORS.length];
    const sorted = getPhaseSortedFailures(phase);
    const totalTime = getPhaseTotalTime(phase);
    const duaneResult = fitDuane(sorted, totalTime);
    const crowResult = fitCrowAMSAA(sorted, totalTime);

    if (g.model === "duane" && duaneResult && duaneResult.m > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let first = true;
      for (let t = allMinX; t <= allMaxX; t *= 1.02) {
        const nPred = duaneResult.a * Math.pow(t, duaneResult.m);
        if (nPred > 0) {
          const px = xToPx(t);
          const py = yToPx(nPred);
          if (first) {
            ctx.moveTo(px, py);
            first = false;
          } else {
            ctx.lineTo(px, py);
          }
        }
      }
      ctx.stroke();
    }

    if (g.model === "crowAMSAA" && crowResult && crowResult.beta !== null && crowResult.lambda !== null) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let first = true;
      for (let t = allMinX; t <= allMaxX; t *= 1.02) {
        const nPred = crowResult.lambda * Math.pow(t, crowResult.beta);
        if (nPred > 0) {
          const px = xToPx(t);
          const py = yToPx(nPred);
          if (first) {
            ctx.moveTo(px, py);
            first = false;
          } else {
            ctx.lineTo(px, py);
          }
        }
      }
      ctx.stroke();
    }

    const dataPoints = [];
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].time > 0) {
        dataPoints.push({ x: sorted[i].time, y: i + 1 });
      }
    }

    ctx.fillStyle = color;
    dataPoints.forEach((pt) => {
      const px = xToPx(pt.x);
      const py = yToPx(pt.y);
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0f1419";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  });

  if (targetMtbf && targetMtbf > 0) {
    const lastPhase = validPhases[validPhases.length - 1];
    if (lastPhase) {
      const sorted = getPhaseSortedFailures(lastPhase);
      const totalTime = getPhaseTotalTime(lastPhase);
      const duaneResult = fitDuane(sorted, totalTime);
      const crowResult = fitCrowAMSAA(sorted, totalTime);

      let targetT = null;
      if (g.model === "duane" && duaneResult && duaneResult.m > 0 && duaneResult.m < 1 && duaneResult.a > 0) {
        targetT = Math.pow(1 / (duaneResult.a * duaneResult.m * targetMtbf), 1 / (duaneResult.m - 1));
      } else if (g.model === "crowAMSAA" && crowResult && crowResult.beta !== null && crowResult.lambda !== null && crowResult.beta > 0 && crowResult.beta < 1) {
        targetT = Math.pow(1 / (crowResult.lambda * crowResult.beta * targetMtbf), 1 / (crowResult.beta - 1));
      }

      if (targetT && targetT > 0) {
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        const px = xToPx(targetT);
        ctx.moveTo(px, padding.top);
        ctx.lineTo(px, padding.top + chartH);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "#fbbf24";
        ctx.font = "11px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`目标: ${fmt(targetT, 0)}h`, px, padding.top - 8);
      }
    }
  }

  if (legendDiv) {
    let legendHtml = "";
    validPhases.forEach((phase, idx) => {
      const color = PHASE_COLORS[idx % PHASE_COLORS.length];
      legendHtml += `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="width: 20px; height: 2px; background: ${color}; display: inline-block;"></span>
          <span style="color: var(--text-muted);">${escapeHtml(phase.name)}</span>
        </div>
      `;
    });
    if (targetMtbf && targetMtbf > 0) {
      legendHtml += `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="width: 20px; height: 2px; background: var(--warning); border-style: dashed; display: inline-block;"></span>
          <span style="color: var(--text-muted);">目标 MTBF</span>
        </div>
      `;
    }
    legendDiv.innerHTML = legendHtml;
  }
}

function renderGrowthSummary() {
  const g = getGrowth();
  const summaryDiv = document.getElementById("growth-summary");
  if (!summaryDiv) return;

  const phases = g.phases;
  if (phases.length === 0) {
    summaryDiv.innerHTML = '<div style="color: var(--text-muted); text-align: center;">暂无数据</div>';
    return;
  }

  const firstMetrics = calcPhaseMetrics(phases[0]);
  const lastMetrics = calcPhaseMetrics(phases[phases.length - 1]);

  let totalImprovement = "—";
  let totalImprovementColor = "inherit";
  if (firstMetrics.mtbf !== null && lastMetrics.mtbf !== null && firstMetrics.mtbf > 0) {
    const pct = ((lastMetrics.mtbf - firstMetrics.mtbf) / firstMetrics.mtbf) * 100;
    totalImprovement = (pct >= 0 ? "+" : "") + fmt(pct, 1) + "%";
    totalImprovementColor = pct >= 0 ? "var(--success)" : "var(--danger)";
  }

  const targetMtbf = g.targetMtbf;
  let targetStatus = "—";
  let targetColor = "inherit";
  if (targetMtbf && lastMetrics.mtbf !== null) {
    const isMet = lastMetrics.mtbf >= targetMtbf;
    targetStatus = isMet ? "已达标 ✓" : "未达标 ✗";
    targetColor = isMet ? "var(--success)" : "var(--danger)";
  }

  summaryDiv.innerHTML = `
    <div style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--accent);">📈 增长总结</div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">初始 MTBF (首轮)</div>
        <div style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary);">${firstMetrics.mtbf ? fmt(firstMetrics.mtbf, 1) + " h" : "—"}</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">当前 MTBF (最新)</div>
        <div style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary);">${lastMetrics.mtbf ? fmt(lastMetrics.mtbf, 1) + " h" : "—"}</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">总提升幅度</div>
        <div style="font-size: 1.1rem; font-weight: 600; color: ${totalImprovementColor};">${totalImprovement}</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">目标状态</div>
        <div style="font-size: 1.1rem; font-weight: 600; color: ${targetColor};">${targetStatus}</div>
      </div>
    </div>
    <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color); font-size: 0.8rem; color: var(--text-muted);">
      共 ${phases.length} 轮试验，累计 ${phases.reduce((sum, p) => sum + p.failures.length, 0)} 次失效记录
    </div>
  `;
}

function generateLogTicks(min, max) {
  const ticks = [];
  if (min <= 0 || max <= 0 || min >= max) return [1, 10, 100];

  let startPow = Math.floor(Math.log10(min));
  let endPow = Math.ceil(Math.log10(max));

  for (let p = startPow; p <= endPow; p++) {
    const base = Math.pow(10, p);
    for (let m = 1; m <= 9; m++) {
      const val = m * base;
      if (val >= min * 0.9 && val <= max * 1.1) {
        if (m === 1 || m === 2 || m === 5) {
          ticks.push(val);
        }
      }
    }
  }
  return ticks;
}

function formatTick(val) {
  if (val >= 1000) return (val / 1000).toFixed(0) + "k";
  if (val >= 100) return val.toFixed(0);
  if (val >= 10) return val.toFixed(0);
  if (val >= 1) return val.toFixed(0);
  return val.toFixed(1);
}

let customImprovements = [];

function loadCustomImprovements() {
  try {
    // 从 store.js 统一读取（参与导入导出和云同步）
    const stored = getCustomImprovements();
    customImprovements = Array.isArray(stored) ? stored : [];
  } catch (e) {
    customImprovements = [];
  }
}

function saveCustomImprovements() {
  try {
    setCustomImprovements(customImprovements);
  } catch (e) {}
}

function getAllImprovements() {
  return [...IMPROVEMENT_LIBRARY, ...customImprovements];
}

function ensureImprovements() {
  const phase = getActivePhase();
  if (phase && !Array.isArray(phase.improvements)) {
    phase.improvements = [];
  }
}

function openImprovementLibrary() {
  const modal = document.getElementById("growth-improv-library-modal");
  if (modal) {
    modal.style.display = "flex";
    improvLibraryCategory = "all";
    improvLibraryKeyword = "";
    const searchInput = document.getElementById("growth-improv-search");
    if (searchInput) searchInput.value = "";
    updateCategoryTabs();
    renderImprovementLibrary();
  }
}

function closeImprovementLibrary() {
  const modal = document.getElementById("growth-improv-library-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

function handleImprovSearch() {
  const searchInput = document.getElementById("growth-improv-search");
  if (searchInput) {
    improvLibraryKeyword = searchInput.value.trim().toLowerCase();
    renderImprovementLibrary();
  }
}

function handleImprovCategoryChange(category) {
  improvLibraryCategory = category;
  updateCategoryTabs();
  renderImprovementLibrary();
}

function updateCategoryTabs() {
  const btns = document.querySelectorAll("#growth-improv-categories .improv-cat-btn");
  btns.forEach((btn) => {
    if (btn.dataset.category === improvLibraryCategory) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

function renderImprovementLibrary() {
  const listEl = document.getElementById("growth-improv-library-list");
  if (!listEl) return;

  const all = getAllImprovements();
  let filtered = all;

  if (improvLibraryCategory !== "all") {
    filtered = filtered.filter((item) => item.category === improvLibraryCategory);
  }

  if (improvLibraryKeyword) {
    const kw = improvLibraryKeyword;
    filtered = filtered.filter(
      (item) =>
        item.name.toLowerCase().includes(kw) ||
        (item.desc && item.desc.toLowerCase().includes(kw)) ||
        (item.applicable && item.applicable.toLowerCase().includes(kw))
    );
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="lib-empty-state">
        <div class="lib-empty-icon">🔍</div>
        <div>没有找到匹配的措施</div>
      </div>
    `;
    return;
  }

  let html = "";
  filtered.forEach((item) => {
    const isCustom = customImprovements.some((c) => c.id === item.id);
    html += `
      <div class="improv-lib-card">
        <div class="improv-lib-header">
          <div class="improv-lib-name">${escapeHtml(item.name)}</div>
          ${isCustom ? '<span class="improv-custom-tag">自定义</span>' : ""}
        </div>
        <div class="improv-lib-cat">
          <span class="improv-cat-badge improv-cat-${item.category}">${CATEGORY_LABELS[item.category] || item.category}</span>
        </div>
        <div class="improv-lib-improvement">
          <span class="improv-improvement-label">预期提升：</span>
          <span class="improv-improvement-value">${escapeHtml(item.improvement || "—")}</span>
        </div>
        <div class="improv-lib-desc">${escapeHtml(item.desc || "")}</div>
        ${item.applicable ? `<div class="improv-lib-applicable">适用：${escapeHtml(item.applicable)}</div>` : ""}
        <button type="button" class="improv-lib-add-btn" data-add-improv="${item.id}">➕ 添加到当前轮次</button>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

function addImprovementFromLibrary(improvId) {
  const phase = getActivePhase();
  if (!phase) return;
  ensureImprovements();

  const all = getAllImprovements();
  const item = all.find((i) => i.id === improvId);
  if (!item) return;

  const exists = phase.improvements.some((imp) => imp.id === improvId);
  if (exists) {
    showImprovToast("该措施已在当前轮次中");
    return;
  }

  phase.improvements.push({
    id: item.id,
    name: item.name,
    category: item.category,
    improvement: item.improvement || "",
    desc: item.desc || "",
    status: "pending",
    responsible: "",
    targetDate: "",
  });

  save();
  renderImprovementList();
  closeImprovementLibrary();
  showImprovToast("已添加改进措施");
}

function openCustomImprovementModal() {
  const modal = document.getElementById("growth-custom-improv-modal");
  if (modal) {
    modal.style.display = "flex";
    document.getElementById("growth-custom-improv-name").value = "";
    document.getElementById("growth-custom-improv-category").value = "gear";
    document.getElementById("growth-custom-improv-improvement").value = "";
    document.getElementById("growth-custom-improv-desc").value = "";
    document.getElementById("growth-custom-improv-applicable").value = "";
  }
}

function closeCustomImprovementModal() {
  const modal = document.getElementById("growth-custom-improv-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

function handleSaveCustomImprovement() {
  const name = document.getElementById("growth-custom-improv-name").value.trim();
  const category = document.getElementById("growth-custom-improv-category").value;
  const improvement = document.getElementById("growth-custom-improv-improvement").value.trim();
  const desc = document.getElementById("growth-custom-improv-desc").value.trim();
  const applicable = document.getElementById("growth-custom-improv-applicable").value.trim();

  if (!name) {
    alert("请输入措施名称");
    return;
  }

  const customItem = {
    id: "custom-" + genId(),
    name,
    category,
    improvement,
    desc,
    applicable,
    custom: true,
  };

  customImprovements.push(customItem);
  saveCustomImprovements();

  const phase = getActivePhase();
  if (phase) {
    ensureImprovements();
    phase.improvements.push({
      id: customItem.id,
      name: customItem.name,
      category: customItem.category,
      improvement: customItem.improvement,
      desc: customItem.desc,
      status: "pending",
      responsible: "",
      targetDate: "",
    });
    save();
    renderImprovementList();
  }

  closeCustomImprovementModal();
  closeImprovementLibrary();
  showImprovToast("已添加自定义措施");
}

function renderImprovementList() {
  const listEl = document.getElementById("growth-improvement-list");
  const emptyEl = document.getElementById("growth-improvement-empty");
  if (!listEl) return;

  const phase = getActivePhase();
  if (!phase) return;
  ensureImprovements();

  const improvements = phase.improvements || [];

  if (improvements.length === 0) {
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  let html = "";
  improvements.forEach((imp, idx) => {
    const statusLabels = {
      pending: "待实施",
      in_progress: "进行中",
      completed: "已完成",
    };
    const statusColors = {
      pending: "var(--warning)",
      in_progress: "var(--accent)",
      completed: "var(--success)",
    };
    html += `
      <div class="improvement-item" data-improv-id="${imp.id}">
        <div class="improvement-item-header">
          <div class="improvement-item-title">
            <span class="improvement-item-index">${idx + 1}</span>
            <span class="improvement-item-name">${escapeHtml(imp.name)}</span>
          </div>
          <div class="improvement-item-actions">
            <span class="improv-status-badge" style="background: ${statusColors[imp.status] + '20'}; color: ${statusColors[imp.status]};">${statusLabels[imp.status] || '待实施'}</span>
            <button type="button" class="btn-icon btn-sm" data-delete-improv="${imp.id}" title="删除" style="padding: 0.2rem 0.4rem;">
              <span>🗑️</span>
            </button>
          </div>
        </div>
        <div class="improvement-item-body">
          <div class="improvement-item-meta">
            <span class="improv-cat-badge improv-cat-${imp.category}">${CATEGORY_LABELS[imp.category] || imp.category}</span>
            ${imp.improvement ? `<span class="improvement-item-improvement">预期提升: ${escapeHtml(imp.improvement)}</span>` : ""}
          </div>
          ${imp.desc ? `<div class="improvement-item-desc">${escapeHtml(imp.desc)}</div>` : ""}
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

function deleteImprovement(id) {
  const phase = getActivePhase();
  if (!phase) return;
  ensureImprovements();

  if (!confirm("确定要删除这条改进措施吗？")) return;

  phase.improvements = phase.improvements.filter((imp) => imp.id !== id);
  save();
  renderImprovementList();
}

function showImprovToast(message) {
  const existing = document.querySelector(".growth-improv-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "growth-improv-toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
