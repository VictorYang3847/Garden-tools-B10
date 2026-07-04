let onSaveCallback = null;
let currentModel = null;
let predictionData = null;
let activePredTab = "prediction";
let allocationData = null;
// 同步标志，防止预测侧与分配侧双向同步时循环触发事件
let isSyncing = false;

const K_BOLTZMANN = 8.617e-5;
const T_REF = 25 + 273.15;
const HOURS_PER_YEAR = 8760;

const COMPONENT_BASE_LAMBDA = {
  resistor: 0.02,
  capacitor: 0.05,
  inductor: 0.03,
  diode: 0.1,
  transistor: 0.2,
  ic_digital: 0.5,
  ic_analog: 0.3,
  connector: 0.05,
  relay: 0.1,
  other: 0.1,
};

const COMPONENT_EA = {
  resistor: 0.5,
  capacitor: 0.5,
  inductor: 0.5,
  diode: 0.7,
  transistor: 0.7,
  ic_digital: 0.7,
  ic_analog: 0.7,
  connector: 0.5,
  relay: 0.7,
  other: 0.6,
};

const COMPONENT_TYPE_LABELS = {
  resistor: "电阻",
  capacitor: "电容",
  inductor: "电感",
  diode: "二极管",
  transistor: "晶体管",
  ic_digital: "IC(数字)",
  ic_analog: "IC(模拟)",
  connector: "连接器",
  relay: "继电器",
  other: "其他",
};

const COMPONENT_CATEGORY_LABELS = {
  electronic: "电子类",
  mechanical: "机械类",
  electromechanical: "机电类",
};

const COMPONENT_LIBRARY = [
  { id: 'r-carbon', name: '碳膜电阻', category: 'electronic', type: 'resistor', lambdaBase: 0.02, desc: '通用碳膜电阻，民用级' },
  { id: 'r-metal', name: '金属膜电阻', category: 'electronic', type: 'resistor', lambdaBase: 0.01, desc: '高精度金属膜电阻，工业级' },
  { id: 'c-ceramic', name: '陶瓷电容', category: 'electronic', type: 'capacitor', lambdaBase: 0.03, desc: 'MLCC多层陶瓷电容' },
  { id: 'c-electrolytic', name: '电解电容', category: 'electronic', type: 'capacitor', lambdaBase: 0.1, desc: '铝电解电容，温度敏感' },
  { id: 'ic-mcu', name: 'MCU芯片', category: 'electronic', type: 'ic_digital', lambdaBase: 0.3, desc: '通用微控制器，数字IC' },
  { id: 'ic-power', name: '电源管理IC', category: 'electronic', type: 'ic_analog', lambdaBase: 0.5, desc: '模拟电源管理芯片' },
  { id: 'mosfet', name: 'MOS管', category: 'electronic', type: 'transistor', lambdaBase: 0.3, desc: '功率MOSFET，结温敏感' },
  { id: 'diode', name: '二极管', category: 'electronic', type: 'diode', lambdaBase: 0.1, desc: '普通硅二极管' },
  { id: 'inductor-common', name: '普通电感', category: 'electronic', type: 'inductor', lambdaBase: 0.03, desc: '通用功率电感' },
  { id: 'bearing-ball', name: '滚珠轴承 608', category: 'mechanical', type: 'other', lambdaBase: 0.5, desc: '深沟球轴承，转速负载相关' },
  { id: 'gear-steel', name: '齿轮(渗碳淬火)', category: 'mechanical', type: 'other', lambdaBase: 0.8, desc: '渗碳淬火钢制齿轮，接触疲劳' },
  { id: 'spring', name: '弹簧', category: 'mechanical', type: 'other', lambdaBase: 0.2, desc: '疲劳失效为主' },
  { id: 'seal', name: '密封圈', category: 'mechanical', type: 'other', lambdaBase: 0.3, desc: '橡胶密封件，老化失效' },
  { id: 'switch-micro', name: '微动开关', category: 'electromechanical', type: 'relay', lambdaBase: 0.5, desc: '机械开关，触点磨损' },
  { id: 'relay', name: '继电器', category: 'electromechanical', type: 'relay', lambdaBase: 0.8, desc: '电磁继电器，触点寿命' },
  { id: 'connector', name: '连接器', category: 'electromechanical', type: 'connector', lambdaBase: 0.1, desc: '接插件，插拔磨损' },
  { id: 'motor', name: '无刷电机', category: 'electromechanical', type: 'other', lambdaBase: 2.0, desc: '无刷直流电机，轴承+绕组' },
];

let customComponentLibrary = [];
let currentLibCategory = 'all';
let currentLibKeyword = '';

const CHART_COLORS = [
  "#3b9eff",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#a78bfa",
  "#fb923c",
  "#2dd4bf",
  "#f472b6",
  "#818cf8",
  "#facc15",
];

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

function calcPiT(type, temperatureC) {
  const ea = COMPONENT_EA[type] || 0.6;
  const tOp = temperatureC + 273.15;
  if (tOp <= 0) return 1;
  return Math.exp((ea / K_BOLTZMANN) * (1 / T_REF - 1 / tOp));
}

function calcLambdaOp(component) {
  const piT = calcPiT(component.type, component.temperature);
  const lambdaBase = component.lambdaBase ?? COMPONENT_BASE_LAMBDA[component.type] ?? 0.1;
  const piS = component.piS ?? 1.0;
  const piQ = component.piQ ?? 1.0;
  const quantity = component.quantity ?? 1;
  return lambdaBase * piT * piS * piQ * quantity;
}

function createNewComponent(type = "resistor") {
  const lambdaBase = COMPONENT_BASE_LAMBDA[type] ?? 0.1;
  const component = {
    id: genId(),
    name: COMPONENT_TYPE_LABELS[type] || "新元器件",
    type: type,
    quantity: 1,
    lambdaBase: lambdaBase,
    temperature: 25,
    piT: 1.0,
    piS: 1.0,
    piQ: 1.0,
    lambdaOp: lambdaBase,
  };
  component.lambdaOp = calcLambdaOp(component);
  return component;
}

function getTotalLambda() {
  if (!predictionData || !predictionData.components) return 0;
  return predictionData.components.reduce((sum, c) => sum + (c.lambdaOp || 0), 0);
}

function calcSystemLambda() {
  const totalLambda = getTotalLambda();
  const structure = predictionData?.systemStructure || "series";

  if (structure === "series") {
    return totalLambda;
  } else if (structure === "parallel") {
    const n = predictionData?.parallelCount || 2;
    if (totalLambda <= 0) return 0;
    let sum = 0;
    for (let k = 1; k <= n; k++) {
      sum += Math.pow(-1, k + 1) * (1 / k) * combination(n, k);
    }
    return totalLambda / sum;
  } else if (structure === "vote23") {
    if (totalLambda <= 0) return 0;
    const unitLambda = totalLambda / 3;
    return (18 / 11) * unitLambda;
  }
  return totalLambda;
}

function combination(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return result;
}

function calcReliability(tHours) {
  const sysLambdaFit = calcSystemLambda();
  const sysLambdaPerHour = sysLambdaFit * 1e-9;
  return Math.exp(-sysLambdaPerHour * tHours);
}

function calcMtbfHours() {
  const sysLambdaFit = calcSystemLambda();
  if (sysLambdaFit <= 0) return 0;
  const sysLambdaPerHour = sysLambdaFit * 1e-9;
  return 1 / sysLambdaPerHour;
}

// Gamma函数近似（Lanczos逼近），用于Weibull分布等效B10反算
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

function renderComponentRow(item, index) {
  const typeOptions = Object.entries(COMPONENT_TYPE_LABELS)
    .map(([val, label]) => `<option value="${val}" ${item.type === val ? "selected" : ""}>${label}</option>`)
    .join("");

  return `
    <tr data-id="${item.id}">
      <td class="pred-index">${index + 1}</td>
      <td><input type="text" class="item-input" data-field="name" value="${escapeHtml(item.name)}" placeholder="元器件名称" /></td>
      <td>
        <select class="item-input pred-type-select" data-field="type">
          ${typeOptions}
        </select>
      </td>
      <td><input type="number" class="item-input pred-num-input" data-field="quantity" value="${item.quantity}" min="1" step="1" /></td>
      <td><input type="number" class="item-input pred-num-input" data-field="lambdaBase" value="${item.lambdaBase}" min="0" step="0.01" /></td>
      <td><input type="number" class="item-input pred-num-input" data-field="temperature" value="${item.temperature}" step="1" /></td>
      <td class="pred-factor-cell">${item.piT?.toFixed(3) || "-"}</td>
      <td><input type="number" class="item-input pred-num-input" data-field="piS" value="${item.piS}" min="0" step="0.1" /></td>
      <td><input type="number" class="item-input pred-num-input" data-field="piQ" value="${item.piQ}" min="0" step="0.1" /></td>
      <td class="pred-lambda-cell">${item.lambdaOp?.toFixed(4) || "-"}</td>
      <td class="pred-action-cell">
        <button type="button" class="pred-delete-btn" data-action="delete" title="删除">🗑️</button>
      </td>
    </tr>
  `;
}

function renderTable(container) {
  const tbody = container.querySelector("#pred-table-body");
  const emptyState = container.querySelector("#pred-empty-state");
  const countSpan = container.querySelector("#pred-component-count");

  if (!predictionData.components || predictionData.components.length === 0) {
    tbody.innerHTML = "";
    emptyState.style.display = "block";
    countSpan.textContent = "0";
    return;
  }

  emptyState.style.display = "none";
  countSpan.textContent = predictionData.components.length;
  tbody.innerHTML = predictionData.components
    .map((item, index) => renderComponentRow(item, index))
    .join("");
}

function saveData() {
  if (onSaveCallback && currentModel) {
    const updated = {
      ...currentModel,
      modules: {
        ...currentModel.modules,
        prediction: predictionData,
      },
    };
    onSaveCallback(updated);
  }
}

function updateComponentCalculations(component) {
  component.piT = calcPiT(component.type, component.temperature);
  component.lambdaOp = calcLambdaOp(component);
}

function updateRowDisplay(tr, component) {
  const piTCell = tr.querySelector(".pred-factor-cell");
  const lambdaOpCell = tr.querySelector(".pred-lambda-cell");
  if (piTCell) piTCell.textContent = component.piT.toFixed(3);
  if (lambdaOpCell) lambdaOpCell.textContent = component.lambdaOp.toFixed(4);
}

function handleInputChange(container, e) {
  const input = e.target;
  if (!input.matches("[data-field]")) return;

  const tr = input.closest("tr");
  if (!tr) return;

  const id = tr.dataset.id;
  const field = input.dataset.field;
  const component = predictionData.components.find((c) => c.id === id);
  if (!component) return;

  if (input.type === "number") {
    component[field] = Number(input.value) || 0;
  } else {
    component[field] = input.value;
  }

  if (field === "type") {
    const baseLambda = COMPONENT_BASE_LAMBDA[component.type];
    if (baseLambda !== undefined) {
      component.lambdaBase = baseLambda;
      const lambdaBaseInput = tr.querySelector("input[data-field='lambdaBase']");
      if (lambdaBaseInput) lambdaBaseInput.value = component.lambdaBase;
    }
  }

  updateComponentCalculations(component);
  updateRowDisplay(tr, component);
  saveData();
  updateResults(container);
  drawBarChart(container);
  drawSystemDiagram(container);
}

function handleDeleteClick(container, e) {
  const btn = e.target.closest("[data-action='delete']");
  if (!btn) return;

  const tr = btn.closest("tr");
  if (!tr) return;

  const id = tr.dataset.id;
  if (!id) return;

  if (!confirm("确定要删除这个元器件吗？")) return;

  predictionData.components = predictionData.components.filter((c) => c.id !== id);
  saveData();
  renderTable(container);
  updateResults(container);
  drawBarChart(container);
  drawSystemDiagram(container);
}

function handleAddComponent(container) {
  const newComponent = createNewComponent("resistor");
  predictionData.components.push(newComponent);
  saveData();
  renderTable(container);

  const tbody = container.querySelector("#pred-table-body");
  const lastRow = tbody.lastElementChild;
  if (lastRow) {
    const firstInput = lastRow.querySelector("input[data-field='name']");
    if (firstInput) firstInput.focus();
  }
  updateResults(container);
  drawBarChart(container);
}

function handleStructureChange(container, e) {
  const structure = e.target.value;
  predictionData.systemStructure = structure;

  const parallelGroup = container.querySelector("#parallel-count-group");
  if (structure === "parallel") {
    parallelGroup.style.display = "block";
  } else {
    parallelGroup.style.display = "none";
  }

  saveData();
  updateResults(container);
  drawSystemDiagram(container);

  // 同步系统结构到分配侧（避免循环触发）
  if (isSyncing) return;
  // vote23 在分配侧不支持，映射为 series
  const allocStructure = structure === "vote23" ? "series" : structure;
  allocationData.systemStructure = allocStructure;
  isSyncing = true;
  const allocStructureSelect = container.querySelector("#alloc-system-structure");
  if (allocStructureSelect) allocStructureSelect.value = allocStructure;
  isSyncing = false;
  // 如果当前在分配Tab，刷新分配结果
  if (activePredTab === "allocation") {
    calcAllocation();
    renderAllocationTable(container);
    renderAllocationResults(container);
  }
}

function handleParallelCountChange(container, e) {
  const count = Math.max(2, Number(e.target.value) || 2);
  predictionData.parallelCount = count;
  saveData();
  updateResults(container);
  drawSystemDiagram(container);
}

function handleMissionTimeChange(container, e) {
  const t = Number(e.target.value) || 0;
  predictionData.missionTime = t;
  const reliability = calcReliability(t);
  const reliabilityEl = container.querySelector("#pred-reliability-value");
  if (reliabilityEl) {
    reliabilityEl.textContent = (reliability * 100).toFixed(4) + "%";
  }
  saveData();
}

function handleCalculate(container) {
  predictionData.components.forEach((c) => updateComponentCalculations(c));
  saveData();
  renderTable(container);
  updateResults(container);
  drawBarChart(container);
  drawSystemDiagram(container);
}

function updateResults(container) {
  const totalLambda = getTotalLambda();
  const sysLambda = calcSystemLambda();
  const mtbfHours = calcMtbfHours();
  const mtbfYears = mtbfHours / HOURS_PER_YEAR;
  const missionTime = predictionData.missionTime || 10000;
  const reliability = calcReliability(missionTime);

  const totalLambdaEl = container.querySelector("#pred-total-lambda");
  const sysLambdaEl = container.querySelector("#pred-sys-lambda");
  const mtbfHoursEl = container.querySelector("#pred-mtbf-hours");
  const mtbfYearsEl = container.querySelector("#pred-mtbf-years");
  const reliabilityEl = container.querySelector("#pred-reliability-value");
  const missionTimeInput = container.querySelector("#pred-mission-time");

  if (totalLambdaEl) totalLambdaEl.textContent = totalLambda.toFixed(4);
  if (sysLambdaEl) sysLambdaEl.textContent = sysLambda.toFixed(4);
  if (mtbfHoursEl) {
    mtbfHoursEl.textContent = mtbfHours > 0 ? formatNumber(mtbfHours) : "-";
  }
  if (mtbfYearsEl) {
    mtbfYearsEl.textContent = mtbfYears > 0 ? mtbfYears.toFixed(2) : "-";
  }
  if (reliabilityEl) {
    reliabilityEl.textContent = (reliability * 100).toFixed(4) + "%";
  }
  if (missionTimeInput && !missionTimeInput.matches(":focus")) {
    missionTimeInput.value = missionTime;
  }

  // 等效B10计算：基于Weibull分布从MTBF反算B10寿命和等效失效率
  const predBeta = Number(container.querySelector("#pred-beta")?.value) || 0;
  if (predBeta > 0 && mtbfHours > 0) {
    const K10 = Math.log(10 / 9); // ≈ 0.10536
    const eta = mtbfHours / gammaApprox(1 + 1 / predBeta);
    const equivB10 = eta * Math.pow(K10, 1 / predBeta);
    const equivLambda = equivB10 > 0 ? (0.10536 / equivB10) * 1000000 : 0;
    const b10El = container.querySelector("#pred-equiv-b10");
    const lambdaEl = container.querySelector("#pred-equiv-lambda");
    if (b10El) b10El.textContent = equivB10.toFixed(1);
    if (lambdaEl) lambdaEl.textContent = equivLambda.toFixed(2);
  } else {
    const b10El = container.querySelector("#pred-equiv-b10");
    const lambdaEl = container.querySelector("#pred-equiv-lambda");
    if (b10El) b10El.textContent = "—";
    if (lambdaEl) lambdaEl.textContent = "—";
  }

  // 如果当前在分配Tab，刷新与可靠性预计比对的面板
  if (activePredTab === "allocation") {
    renderPredComparison(container);
  }
}

function formatNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
  return num.toFixed(0);
}

function drawBarChart(container) {
  const canvas = container.querySelector("#pred-bar-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);

  if (!predictionData.components || predictionData.components.length === 0) {
    ctx.fillStyle = "#8b9cb3";
    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("暂无数据", width / 2, height / 2);
    return;
  }

  const totalLambda = getTotalLambda();
  if (totalLambda <= 0) {
    ctx.fillStyle = "#8b9cb3";
    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("失效率为零", width / 2, height / 2);
    return;
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const components = predictionData.components;
  const barCount = components.length;
  const barGap = 8;
  const barWidth = Math.max(20, (chartWidth - barGap * (barCount - 1)) / barCount);

  ctx.strokeStyle = "#2d3a4f";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();

  const maxValue = Math.max(...components.map((c) => c.lambdaOp / totalLambda * 100));
  const yTicks = 5;

  ctx.fillStyle = "#8b9cb3";
  ctx.font = "10px 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= yTicks; i++) {
    const y = padding.top + chartHeight - (chartHeight * i / yTicks);
    const value = (maxValue * i / yTicks).toFixed(1) + "%";
    ctx.fillText(value, padding.left - 5, y);

    ctx.strokeStyle = "rgba(45, 58, 79, 0.5)";
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }

  components.forEach((comp, i) => {
    const x = padding.left + i * (barWidth + barGap);
    const valuePercent = (comp.lambdaOp / totalLambda) * 100;
    const barHeight = (valuePercent / maxValue) * chartHeight;
    const y = padding.top + chartHeight - barHeight;

    const color = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#8b9cb3";
    ctx.font = "10px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const label = comp.name.length > 6 ? comp.name.slice(0, 6) + "..." : comp.name;
    ctx.fillText(label, x + barWidth / 2, padding.top + chartHeight + 5);

    ctx.fillStyle = "#e8edf4";
    ctx.fillText(valuePercent.toFixed(1) + "%", x + barWidth / 2, y - 15);
  });
}

function drawSystemDiagram(container) {
  const canvas = container.querySelector("#pred-diagram-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);

  const structure = predictionData?.systemStructure || "series";
  const components = predictionData?.components || [];
  const compCount = components.length || 1;

  ctx.strokeStyle = "#3b9eff";
  ctx.fillStyle = "#1a2332";
  ctx.lineWidth = 2;

  if (structure === "series") {
    drawSeriesDiagram(ctx, width, height, compCount, components);
  } else if (structure === "parallel") {
    const n = predictionData?.parallelCount || 2;
    drawParallelDiagram(ctx, width, height, n, components);
  } else if (structure === "vote23") {
    drawVote23Diagram(ctx, width, height, components);
  }
}

function drawSeriesDiagram(ctx, width, height, count, components) {
  const startX = 30;
  const endX = width - 30;
  const y = height / 2;
  const boxWidth = Math.min(80, (endX - startX - 40) / count - 15);
  const boxHeight = 40;
  const gap = (endX - startX - boxWidth * count) / (count + 1);

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#3b9eff";

  ctx.beginPath();
  ctx.moveTo(startX, y);
  ctx.lineTo(startX + gap, y);
  ctx.stroke();

  for (let i = 0; i < count; i++) {
    const x = startX + gap + i * (boxWidth + gap);
    const label = components[i]?.name?.slice(0, 4) || `C${i + 1}`;

    ctx.fillStyle = "#1a2332";
    ctx.strokeStyle = "#3b9eff";
    ctx.fillRect(x, y - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeRect(x, y - boxHeight / 2, boxWidth, boxHeight);

    ctx.fillStyle = "#e8edf4";
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + boxWidth / 2, y);

    if (i < count - 1) {
      ctx.strokeStyle = "#3b9eff";
      ctx.beginPath();
      ctx.moveTo(x + boxWidth, y);
      ctx.lineTo(x + boxWidth + gap, y);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = "#3b9eff";
  ctx.beginPath();
  ctx.moveTo(endX - gap, y);
  ctx.lineTo(endX, y);
  ctx.stroke();

  drawArrow(ctx, startX, y, "left");
  drawArrow(ctx, endX, y, "right");

  ctx.fillStyle = "#8b9cb3";
  ctx.font = "10px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("输入", startX - 5, y + 25);
  ctx.fillText("输出", endX + 5, y + 25);
}

function drawParallelDiagram(ctx, width, height, n, components) {
  const centerX = width / 2;
  const startX = 40;
  const endX = width - 40;
  const totalHeight = height - 60;
  const unitHeight = totalHeight / n;
  const boxWidth = 80;
  const boxHeight = Math.min(35, unitHeight - 15);

  ctx.strokeStyle = "#3b9eff";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(startX, 30);
  ctx.lineTo(startX, height - 30);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(endX, 30);
  ctx.lineTo(endX, height - 30);
  ctx.stroke();

  for (let i = 0; i < n; i++) {
    const y = 30 + unitHeight * (i + 0.5);
    const label = i < components.length ? components[i]?.name?.slice(0, 4) : `U${i + 1}`;

    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(centerX - boxWidth / 2, y);
    ctx.stroke();

    ctx.fillStyle = "#1a2332";
    ctx.strokeStyle = "#3b9eff";
    ctx.fillRect(centerX - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeRect(centerX - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);

    ctx.fillStyle = "#e8edf4";
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, centerX, y);

    ctx.strokeStyle = "#3b9eff";
    ctx.beginPath();
    ctx.moveTo(centerX + boxWidth / 2, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }

  drawArrow(ctx, startX, height / 2, "left");
  drawArrow(ctx, endX, height / 2, "right");

  ctx.fillStyle = "#8b9cb3";
  ctx.font = "10px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("输入", startX - 5, height - 10);
  ctx.fillText("输出", endX + 5, height - 10);
}

function drawVote23Diagram(ctx, width, height, components) {
  const centerX = width / 2;
  const startX = 40;
  const endX = width - 40;
  const positions = [0.25, 0.5, 0.75];
  const boxWidth = 70;
  const boxHeight = 35;

  ctx.strokeStyle = "#3b9eff";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(startX, height / 2);
  ctx.lineTo(startX + 30, height / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(startX + 30, height * 0.25);
  ctx.lineTo(startX + 30, height * 0.75);
  ctx.stroke();

  for (let i = 0; i < 3; i++) {
    const y = height * positions[i];
    const label = i < components.length ? components[i]?.name?.slice(0, 4) : `U${i + 1}`;

    ctx.beginPath();
    ctx.moveTo(startX + 30, y);
    ctx.lineTo(centerX - boxWidth / 2 - 20, y);
    ctx.stroke();

    ctx.fillStyle = "#1a2332";
    ctx.strokeStyle = "#3b9eff";
    ctx.fillRect(centerX - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeRect(centerX - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);

    ctx.fillStyle = "#e8edf4";
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, centerX, y);

    ctx.strokeStyle = "#3b9eff";
    ctx.beginPath();
    ctx.moveTo(centerX + boxWidth / 2, y);
    ctx.lineTo(endX - 50, y);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(endX - 50, height * 0.25);
  ctx.lineTo(endX - 50, height * 0.75);
  ctx.stroke();

  const voteX = endX - 50;
  const voteY = height / 2;
  const voteWidth = 50;
  const voteHeight = 40;

  ctx.fillStyle = "#243044";
  ctx.strokeStyle = "#fbbf24";
  ctx.fillRect(endX - 50, voteY - voteHeight / 2, voteWidth, voteHeight);
  ctx.strokeRect(endX - 50, voteY - voteHeight / 2, voteWidth, voteHeight);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 11px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("2/3", endX - 25, voteY);

  ctx.strokeStyle = "#3b9eff";
  ctx.beginPath();
  ctx.moveTo(endX, height / 2);
  ctx.lineTo(endX, height / 2);
  ctx.stroke();

  drawArrow(ctx, startX, height / 2, "left");
  drawArrow(ctx, endX, height / 2, "right");

  ctx.fillStyle = "#8b9cb3";
  ctx.font = "10px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("输入", startX - 5, height / 2 + 25);
  ctx.fillText("输出", endX + 5, height / 2 + 25);
}

function drawArrow(ctx, x, y, direction) {
  const size = 8;
  ctx.fillStyle = "#3b9eff";
  ctx.beginPath();
  if (direction === "right") {
    ctx.moveTo(x, y);
    ctx.lineTo(x - size, y - size / 2);
    ctx.lineTo(x - size, y + size / 2);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + size, y - size / 2);
    ctx.lineTo(x + size, y + size / 2);
  }
  ctx.closePath();
  ctx.fill();
}

function loadCustomComponents() {
  try {
    const saved = localStorage.getItem('COMPONENT_LIBRARY_CUSTOM');
    if (saved) {
      customComponentLibrary = JSON.parse(saved);
    } else {
      customComponentLibrary = [];
    }
  } catch (e) {
    customComponentLibrary = [];
  }
}

function saveCustomComponents() {
  try {
    localStorage.setItem('COMPONENT_LIBRARY_CUSTOM', JSON.stringify(customComponentLibrary));
  } catch (e) {
    console.error('保存自定义元器件失败:', e);
  }
}

function getAllLibraryComponents() {
  return [...COMPONENT_LIBRARY, ...customComponentLibrary];
}

function getFilteredComponents() {
  const all = getAllLibraryComponents();
  let filtered = all;

  if (currentLibCategory !== 'all') {
    filtered = filtered.filter(c => c.category === currentLibCategory);
  }

  if (currentLibKeyword && currentLibKeyword.trim()) {
    const kw = currentLibKeyword.trim().toLowerCase();
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(kw) ||
      (c.desc && c.desc.toLowerCase().includes(kw))
    );
  }

  return filtered;
}

function renderComponentLibrary(container) {
  const listEl = container.querySelector('#component-library-list');
  if (!listEl) return;

  const components = getFilteredComponents();

  if (components.length === 0) {
    listEl.innerHTML = `
      <div class="lib-empty-state">
        <div class="lib-empty-icon">🔍</div>
        <p>没有找到匹配的元器件</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = components.map(comp => {
    const categoryLabel = COMPONENT_CATEGORY_LABELS[comp.category] || comp.category;
    const typeLabel = COMPONENT_TYPE_LABELS[comp.type] || comp.type;
    const isCustom = customComponentLibrary.some(c => c.id === comp.id);
    return `
      <div class="lib-component-card" data-comp-id="${comp.id}" title="点击添加到BOM">
        <div class="lib-comp-header">
          <span class="lib-comp-name">${escapeHtml(comp.name)}</span>
          ${isCustom ? '<span class="lib-comp-custom-tag">自定义</span>' : ''}
        </div>
        <div class="lib-comp-category">
          <span class="lib-cat-badge lib-cat-${comp.category}">${categoryLabel}</span>
          <span class="lib-type-label">${typeLabel}</span>
        </div>
        <div class="lib-comp-lambda">
          <span class="lambda-label">λb</span>
          <span class="lambda-value">${comp.lambdaBase}</span>
          <span class="lambda-unit">FIT</span>
        </div>
        ${comp.desc ? `<div class="lib-comp-desc">${escapeHtml(comp.desc)}</div>` : ''}
        <div class="lib-comp-add-btn">
          <span>➕</span> 添加
        </div>
      </div>
    `;
  }).join('');
}

function openComponentLibrary(container) {
  const modal = container.querySelector('#component-library-modal');
  if (modal) {
    modal.style.display = 'flex';
    loadCustomComponents();
    renderComponentLibrary(container);
    const searchInput = container.querySelector('#component-library-search-input');
    if (searchInput) {
      searchInput.value = '';
      currentLibKeyword = '';
      searchInput.focus();
    }
  }
}

function closeComponentLibrary(container) {
  const modal = container.querySelector('#component-library-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function handleLibrarySearch(container, keyword) {
  currentLibKeyword = keyword;
  renderComponentLibrary(container);
}

function handleLibraryCategoryChange(container, category) {
  currentLibCategory = category;

  const catBtns = container.querySelectorAll('.lib-cat-btn');
  catBtns.forEach(btn => {
    if (btn.dataset.category === category) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  renderComponentLibrary(container);
}

function addComponentFromLibrary(container, compId) {
  const all = getAllLibraryComponents();
  const comp = all.find(c => c.id === compId);
  if (!comp) return;

  const newComponent = createNewComponent(comp.type);
  newComponent.name = comp.name;
  newComponent.lambdaBase = comp.lambdaBase;
  newComponent.lambdaOp = calcLambdaOp(newComponent);

  predictionData.components.push(newComponent);
  saveData();
  renderTable(container);
  updateResults(container);
  drawBarChart(container);
  drawSystemDiagram(container);

  showToast(container, `已添加: ${comp.name}`);
}

function openCustomComponentModal(container) {
  const modal = container.querySelector('#custom-component-modal');
  if (modal) {
    modal.style.display = 'flex';
    const nameInput = container.querySelector('#custom-comp-name');
    if (nameInput) nameInput.focus();
  }
}

function closeCustomComponentModal(container) {
  const modal = container.querySelector('#custom-component-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function addCustomComponent(container, data) {
  const newComp = {
    id: 'custom-' + genId(),
    name: data.name,
    category: data.category,
    type: data.type,
    lambdaBase: data.lambdaBase,
    desc: data.desc || '',
  };

  customComponentLibrary.push(newComp);
  saveCustomComponents();
  renderComponentLibrary(container);
  showToast(container, `已添加自定义元器件: ${data.name}`);
}

function showToast(container, message) {
  let toast = container.querySelector('.lib-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'lib-toast';
    container.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

function bindComponentLibraryEvents(container) {
  const libraryBtn = container.querySelector('#pred-component-library');
  if (libraryBtn) {
    libraryBtn.addEventListener('click', () => openComponentLibrary(container));
  }

  const closeBtn = container.querySelector('#component-library-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeComponentLibrary(container));
  }

  const overlay = container.querySelector('#component-library-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => closeComponentLibrary(container));
  }

  const searchInput = container.querySelector('#component-library-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => handleLibrarySearch(container, e.target.value));
  }

  const catBtns = container.querySelectorAll('.lib-cat-btn');
  catBtns.forEach(btn => {
    btn.addEventListener('click', () => handleLibraryCategoryChange(container, btn.dataset.category));
  });

  const listEl = container.querySelector('#component-library-list');
  if (listEl) {
    listEl.addEventListener('click', (e) => {
      const card = e.target.closest('.lib-component-card');
      if (card) {
        const compId = card.dataset.compId;
        if (compId) {
          addComponentFromLibrary(container, compId);
        }
      }
    });
  }

  const addCustomBtn = container.querySelector('#add-custom-component-btn');
  if (addCustomBtn) {
    addCustomBtn.addEventListener('click', () => openCustomComponentModal(container));
  }

  const customCloseBtn = container.querySelector('#custom-component-close');
  if (customCloseBtn) {
    customCloseBtn.addEventListener('click', () => closeCustomComponentModal(container));
  }

  const customOverlay = container.querySelector('#custom-component-overlay');
  if (customOverlay) {
    customOverlay.addEventListener('click', () => closeCustomComponentModal(container));
  }

  const customCancelBtn = container.querySelector('#custom-comp-cancel');
  if (customCancelBtn) {
    customCancelBtn.addEventListener('click', () => closeCustomComponentModal(container));
  }

  const customSaveBtn = container.querySelector('#custom-comp-save');
  if (customSaveBtn) {
    customSaveBtn.addEventListener('click', () => {
      const nameInput = container.querySelector('#custom-comp-name');
      const categorySelect = container.querySelector('#custom-comp-category');
      const typeSelect = container.querySelector('#custom-comp-type');
      const lambdaInput = container.querySelector('#custom-comp-lambda');
      const descInput = container.querySelector('#custom-comp-desc');

      const name = nameInput?.value?.trim();
      if (!name) {
        alert('请输入元器件名称');
        nameInput?.focus();
        return;
      }

      const lambdaBase = Number(lambdaInput?.value) || 0;
      if (lambdaBase <= 0) {
        alert('请输入有效的基础失效率');
        lambdaInput?.focus();
        return;
      }

      addCustomComponent(container, {
        name: name,
        category: categorySelect?.value || 'electronic',
        type: typeSelect?.value || 'other',
        lambdaBase: lambdaBase,
        desc: descInput?.value?.trim() || '',
      });

      closeCustomComponentModal(container);

      if (nameInput) nameInput.value = '';
      if (lambdaInput) lambdaInput.value = '0.1';
      if (descInput) descInput.value = '';
    });
  }
}

function bindEvents(container) {
  const tbody = container.querySelector("#pred-table-body");
  tbody.addEventListener("input", (e) => handleInputChange(container, e));
  tbody.addEventListener("click", (e) => handleDeleteClick(container, e));
  tbody.addEventListener("change", (e) => handleInputChange(container, e));

  const addBtn = container.querySelector("#pred-add-component");
  addBtn.addEventListener("click", () => handleAddComponent(container));

  const emptyAddBtn = container.querySelector("#pred-empty-add-btn");
  emptyAddBtn.addEventListener("click", () => handleAddComponent(container));

  const structureSelect = container.querySelector("#pred-structure-select");
  structureSelect.addEventListener("change", (e) => handleStructureChange(container, e));

  const parallelCountInput = container.querySelector("#pred-parallel-count");
  parallelCountInput.addEventListener("change", (e) => handleParallelCountChange(container, e));
  parallelCountInput.addEventListener("input", (e) => handleParallelCountChange(container, e));

  const missionTimeInput = container.querySelector("#pred-mission-time");
  missionTimeInput.addEventListener("input", (e) => handleMissionTimeChange(container, e));

  const calculateBtn = container.querySelector("#pred-calculate");
  calculateBtn.addEventListener("click", () => handleCalculate(container));

  // β参数变化时重新计算等效B10和λ
  const predBetaInput = container.querySelector("#pred-beta");
  if (predBetaInput) {
    predBetaInput.addEventListener("input", () => {
      // 触发重新计算等效B10
      updateResults(container);
      // 同步 β 到分配侧（避免循环触发）
      if (isSyncing) return;
      const betaVal = Number(predBetaInput.value) || 2.2;
      allocationData.beta = Math.max(0.1, betaVal);
      isSyncing = true;
      const allocBetaInput = container.querySelector("#alloc-beta");
      if (allocBetaInput) allocBetaInput.value = betaVal;
      isSyncing = false;
      // 如果当前在分配Tab，刷新分配结果
      if (activePredTab === "allocation") {
        calcAllocation();
        renderAllocationTable(container);
        renderAllocationResults(container);
      }
    });
  }

  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      drawBarChart(container);
      drawSystemDiagram(container);
    }, 100);
  });
}

function ensureAllocationData() {
  if (!predictionData.allocation) {
    predictionData.allocation = {
      targetB10: 150,
      confidence: 0.9,
      systemStructure: "series",
      beta: 2.2,
      subsystems: [],
    };
  }
  if (!predictionData.allocation.subsystems || predictionData.allocation.subsystems.length === 0) {
    predictionData.allocation.subsystems = [
      { id: genId(), name: "行星齿轮箱", complexity: 8, maturity: 7, environment: 9, mission: 10 },
      { id: genId(), name: "锂电池包", complexity: 6, maturity: 5, environment: 6, mission: 10 },
      { id: genId(), name: "无刷电机总成", complexity: 5, maturity: 4, environment: 6, mission: 10 },
      { id: genId(), name: "电控与操控系统", complexity: 6, maturity: 3, environment: 3, mission: 7 },
    ];
  }
  allocationData = predictionData.allocation;
  calcAllocation();
}

function calcAllocation() {
  if (!allocationData || !allocationData.subsystems || allocationData.subsystems.length === 0) {
    return;
  }

  const beta = allocationData.beta || 2.2;

  // 1. 计算各子系统综合评分和总分
  let totalScore = 0;
  allocationData.subsystems.forEach((s) => {
    s.totalScore = (s.complexity || 0) + (s.maturity || 0) + (s.environment || 0) + (s.mission || 0);
    totalScore += s.totalScore;
  });

  // 2. 计算权重
  const targetB10 = allocationData.targetB10 || 150;
  allocationData.subsystems.forEach((s) => {
    s.weight = totalScore > 0 ? s.totalScore / totalScore : 0;
  });

  // 3. 分配B10
  // Weibull串联: 1/B10_sys^β = Σ(1/B10_i^β) → B10_i = B10_sys / w_i^(1/β)
  // Weibull并联: 各子系统权重越大(越复杂)，单机B10要求可适当放宽
  if (allocationData.systemStructure === "series") {
    allocationData.subsystems.forEach((s) => {
      s.allocB10 = s.weight > 0 ? targetB10 / Math.pow(s.weight, 1 / beta) : 0;
      s.lambda = s.allocB10 > 0 ? (0.10536 / s.allocB10) * 1000000 : 0;
    });
  } else {
    // 并联：简化为 B10_i = B10_sys / w_i^(1/β) × n（n为冗余度，近似并联增益）
    const n = allocationData.subsystems.length;
    allocationData.subsystems.forEach((s) => {
      s.allocB10 = s.weight > 0 ? (targetB10 * Math.pow(n, 1 / beta)) / Math.pow(s.weight, 1 / beta) : 0;
      s.lambda = s.allocB10 > 0 ? (0.10536 / s.allocB10) * 1000000 : 0;
    });
  }

  // 4. 验算系统B10
  let calcSysB10 = 0;
  if (allocationData.systemStructure === "series") {
    // 串联验算: B10_sys = (Σ 1/B10_i^β)^(-1/β)
    let sumInvB10Beta = 0;
    allocationData.subsystems.forEach((s) => {
      if (s.allocB10 > 0) sumInvB10Beta += 1 / Math.pow(s.allocB10, beta);
    });
    calcSysB10 = sumInvB10Beta > 0 ? Math.pow(sumInvB10Beta, -1 / beta) : 0;
  } else {
    // 并联验算: R_sys(t) = 1 - Π(1 - R_i(t))
    // 用数值方法找到 R_sys = 0.9 对应的 t（即系统B10）
    const b10Reliability = 0.9;
    let lo = 1, hi = targetB10 * 10;
    for (let iter = 0; iter < 50; iter++) {
      const mid = (lo + hi) / 2;
      let prodFail = 1;
      allocationData.subsystems.forEach((s) => {
        if (s.allocB10 > 0) {
          const etaI = s.allocB10 / Math.pow(-Math.log(b10Reliability), 1 / beta);
          const rI = Math.exp(-Math.pow(mid / etaI, beta));
          prodFail *= (1 - rI);
        }
      });
      const sysR = 1 - prodFail;
      if (sysR > b10Reliability) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    calcSysB10 = (lo + hi) / 2;
  }
  allocationData.calcSysB10 = calcSysB10;
}

function renderAllocationTable(container) {
  const tbody = container.querySelector("#alloc-table-body");
  const emptyState = container.querySelector("#alloc-empty-state");
  const countSpan = container.querySelector("#alloc-subsystem-count");

  if (!allocationData?.subsystems || allocationData.subsystems.length === 0) {
    tbody.innerHTML = "";
    emptyState.style.display = "block";
    countSpan.textContent = "0";
    return;
  }

  emptyState.style.display = "none";
  countSpan.textContent = allocationData.subsystems.length;
  tbody.innerHTML = allocationData.subsystems
    .map((item, index) => renderAllocationRow(item, index))
    .join("");
}

function renderAllocationRow(item, index) {
  const weightPercent = item.weight ? (item.weight * 100).toFixed(2) : "0.00";
  const allocB10 = item.allocB10 ? item.allocB10.toFixed(2) : "0.00";
  const lambda = item.lambda ? item.lambda.toFixed(2) : "0.00";
  const totalScore = item.totalScore || 0;

  return `
    <tr data-id="${item.id}">
      <td class="alloc-index">${index + 1}</td>
      <td><input type="text" class="item-input" data-field="name" value="${escapeHtml(item.name)}" placeholder="子系统名称" /></td>
      <td><input type="number" class="item-input alloc-num-input" data-field="complexity" value="${item.complexity || 0}" min="1" max="10" step="1" /></td>
      <td><input type="number" class="item-input alloc-num-input" data-field="maturity" value="${item.maturity || 0}" min="1" max="10" step="1" /></td>
      <td><input type="number" class="item-input alloc-num-input" data-field="environment" value="${item.environment || 0}" min="1" max="10" step="1" /></td>
      <td><input type="number" class="item-input alloc-num-input" data-field="mission" value="${item.mission || 0}" min="1" max="10" step="1" /></td>
      <td class="alloc-score-cell">${totalScore}</td>
      <td class="alloc-weight-cell">${weightPercent}%</td>
      <td class="alloc-b10-cell">${allocB10}</td>
      <td class="alloc-lambda-cell">${lambda}</td>
      <td class="alloc-action-cell">
        <button type="button" class="alloc-delete-btn" data-action="delete" title="删除">🗑️</button>
      </td>
    </tr>
  `;
}

function renderAllocationResults(container) {
  const subsysCountEl = container.querySelector("#alloc-subsys-count");
  const weightSumEl = container.querySelector("#alloc-weight-sum");
  const targetB10El = container.querySelector("#alloc-target-b10-display");
  const calcB10El = container.querySelector("#alloc-calc-b10");

  const subsysCount = allocationData?.subsystems?.length || 0;
  let weightSum = 0;
  if (allocationData?.subsystems) {
    weightSum = allocationData.subsystems.reduce((sum, s) => sum + (s.weight || 0), 0);
  }

  if (subsysCountEl) subsysCountEl.textContent = subsysCount;
  if (weightSumEl) weightSumEl.textContent = (weightSum * 100).toFixed(2) + "%";
  if (targetB10El) targetB10El.textContent = (allocationData?.targetB10 || 0).toFixed(1);
  if (calcB10El) calcB10El.textContent = (allocationData?.calcSysB10 || 0).toFixed(2);
}

function drawPieChart(container) {
  const canvas = container.querySelector("#alloc-pie-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);

  if (!allocationData?.subsystems || allocationData.subsystems.length === 0) {
    ctx.fillStyle = "#8b9cb3";
    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("暂无数据", width / 2, height / 2);
    return;
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 40;
  const legendX = width - 120;
  const legendY = 30;

  let startAngle = -Math.PI / 2;
  const subsystems = allocationData.subsystems;

  subsystems.forEach((subsys, i) => {
    const sliceAngle = (subsys.weight || 0) * Math.PI * 2;
    const color = CHART_COLORS[i % CHART_COLORS.length];

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = "#1a2332";
    ctx.lineWidth = 2;
    ctx.stroke();

    startAngle += sliceAngle;
  });

  ctx.fillStyle = "#1a2332";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e8edf4";
  ctx.font = "bold 14px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("权重", centerX, centerY - 10);
  ctx.fillStyle = "#8b9cb3";
  ctx.font = "12px 'Segoe UI', sans-serif";
  ctx.fillText("分布图", centerX, centerY + 10);

  const legendItemHeight = 20;
  subsystems.forEach((subsys, i) => {
    const y = legendY + i * legendItemHeight;
    const color = CHART_COLORS[i % CHART_COLORS.length];

    ctx.fillStyle = color;
    ctx.fillRect(10, y, 12, 12);

    ctx.fillStyle = "#8b9cb3";
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const label = subsys.name.length > 8 ? subsys.name.slice(0, 8) + "..." : subsys.name;
    const weightPct = ((subsys.weight || 0) * 100).toFixed(1) + "%";
    ctx.fillText(`${label} ${weightPct}`, 28, y - 1);
  });
}

function addAllocationSubsystem(container) {
  const newSubsystem = {
    id: genId(),
    name: "新子系统",
    complexity: 5,
    maturity: 5,
    environment: 5,
    mission: 5,
  };
  allocationData.subsystems.push(newSubsystem);
  calcAllocation();
  saveData();
  renderAllocationTable(container);
  renderAllocationResults(container);
  drawPieChart(container);
  renderFmeaComparison(container);
  renderPredComparison(container);
}

function deleteAllocationSubsystem(container, id) {
  if (!confirm("确定要删除这个子系统吗？")) return;
  allocationData.subsystems = allocationData.subsystems.filter((s) => s.id !== id);
  calcAllocation();
  saveData();
  renderAllocationTable(container);
  renderAllocationResults(container);
  drawPieChart(container);
  renderFmeaComparison(container);
  renderPredComparison(container);
}

function updateAllAllocationRows(container) {
  const tbody = container.querySelector("#alloc-table-body");
  if (!tbody) return;

  const rows = tbody.querySelectorAll("tr[data-id]");
  rows.forEach((tr) => {
    const id = tr.dataset.id;
    const subsystem = allocationData.subsystems.find((s) => s.id === id);
    if (!subsystem) return;

    const scoreCell = tr.querySelector(".alloc-score-cell");
    const weightCell = tr.querySelector(".alloc-weight-cell");
    const b10Cell = tr.querySelector(".alloc-b10-cell");
    const lambdaCell = tr.querySelector(".alloc-lambda-cell");

    if (scoreCell) scoreCell.textContent = subsystem.totalScore || 0;
    if (weightCell) weightCell.textContent = ((subsystem.weight || 0) * 100).toFixed(2) + "%";
    if (b10Cell) b10Cell.textContent = (subsystem.allocB10 || 0).toFixed(2);
    if (lambdaCell) lambdaCell.textContent = (subsystem.lambda || 0).toFixed(2);

    const numInputs = tr.querySelectorAll("input.alloc-num-input");
    numInputs.forEach((inp) => {
      const field = inp.dataset.field;
      if (field && subsystem[field] !== undefined) {
        const currentVal = Number(inp.value);
        const actualVal = Number(subsystem[field]);
        if (currentVal !== actualVal) {
          inp.value = actualVal;
        }
      }
    });
  });
}

function handleAllocationInputChange(container, e) {
  const input = e.target;
  if (!input.matches("[data-field]")) return;

  const tr = input.closest("tr");
  if (!tr) return;

  const id = tr.dataset.id;
  const field = input.dataset.field;
  const subsystem = allocationData.subsystems.find((s) => s.id === id);
  if (!subsystem) return;

  if (input.type === "number") {
    let val = Number(input.value) || 0;
    val = Math.max(1, Math.min(10, val));
    subsystem[field] = val;
  } else {
    subsystem[field] = input.value;
  }

  calcAllocation();
  updateAllAllocationRows(container);
  saveData();
  renderAllocationResults(container);
  drawPieChart(container);
  renderFmeaComparison(container);
  renderPredComparison(container);
}

function handleAllocationDeleteClick(container, e) {
  const btn = e.target.closest("[data-action='delete']");
  if (!btn) return;

  const tr = btn.closest("tr");
  if (!tr) return;

  const id = tr.dataset.id;
  if (!id) return;

  deleteAllocationSubsystem(container, id);
}

function handleTargetB10Change(container, e) {
  const val = Number(e.target.value) || 0;
  allocationData.targetB10 = Math.max(1, val);
  calcAllocation();
  saveData();
  renderAllocationTable(container);
  renderAllocationResults(container);
  drawPieChart(container);
  renderFmeaComparison(container);
  renderPredComparison(container);
}

function handleConfidenceChange(container, e) {
  allocationData.confidence = Number(e.target.value) || 0.9;
  saveData();
}

function handleAllocStructureChange(container, e) {
  allocationData.systemStructure = e.target.value;
  calcAllocation();
  saveData();
  renderAllocationTable(container);
  renderAllocationResults(container);
  drawPieChart(container);
  renderFmeaComparison(container);
  renderPredComparison(container);

  // 同步系统结构到预测侧（避免循环触发）
  if (isSyncing) return;
  isSyncing = true;
  const predStructureSelect = container.querySelector("#pred-structure-select");
  if (predStructureSelect) predStructureSelect.value = allocationData.systemStructure;
  // 同步更新并联数量输入组的显示状态
  const parallelGroup = container.querySelector("#parallel-count-group");
  if (parallelGroup) {
    parallelGroup.style.display = allocationData.systemStructure === "parallel" ? "block" : "none";
  }
  updateResults(container);
  drawSystemDiagram(container);
  isSyncing = false;
}

function handleBetaChange(container, e) {
  const val = Number(e.target.value) || 2.2;
  allocationData.beta = Math.max(0.1, val);
  calcAllocation();
  saveData();
  renderAllocationTable(container);
  renderAllocationResults(container);
  drawPieChart(container);
  renderFmeaComparison(container);
  renderPredComparison(container);

  // 同步 β 到预测侧（避免循环触发）
  if (isSyncing) return;
  isSyncing = true;
  const predBetaInput = container.querySelector("#pred-beta");
  if (predBetaInput) predBetaInput.value = val;
  updateResults(container);
  isSyncing = false;
}

function switchPredTab(container, tabName) {
  activePredTab = tabName;

  const tabs = container.querySelectorAll(".pred-tab");
  tabs.forEach((tab) => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  const tabPrediction = container.querySelector("#pred-tab-prediction");
  const tabAllocation = container.querySelector("#pred-tab-allocation");

  if (tabName === "prediction") {
    tabPrediction.style.display = "block";
    tabAllocation.style.display = "none";
    requestAnimationFrame(() => {
      drawBarChart(container);
      drawSystemDiagram(container);
    });
  } else {
    tabPrediction.style.display = "none";
    tabAllocation.style.display = "block";
    requestAnimationFrame(() => {
      drawPieChart(container);
    });
  }
}

function bindAllocationEvents(container) {
  const tbody = container.querySelector("#alloc-table-body");
  if (tbody) {
    tbody.addEventListener("input", (e) => handleAllocationInputChange(container, e));
    tbody.addEventListener("click", (e) => handleAllocationDeleteClick(container, e));
    tbody.addEventListener("change", (e) => handleAllocationInputChange(container, e));
  }

  const addBtn = container.querySelector("#alloc-add-subsystem");
  if (addBtn) {
    addBtn.addEventListener("click", () => addAllocationSubsystem(container));
  }

  const emptyAddBtn = container.querySelector("#alloc-empty-add-btn");
  if (emptyAddBtn) {
    emptyAddBtn.addEventListener("click", () => addAllocationSubsystem(container));
  }

  const targetB10Input = container.querySelector("#alloc-target-b10");
  if (targetB10Input) {
    targetB10Input.addEventListener("input", (e) => handleTargetB10Change(container, e));
  }

  const confidenceSelect = container.querySelector("#alloc-confidence");
  if (confidenceSelect) {
    confidenceSelect.addEventListener("change", (e) => handleConfidenceChange(container, e));
  }

  const structureSelect = container.querySelector("#alloc-system-structure");
  if (structureSelect) {
    structureSelect.addEventListener("change", (e) => handleAllocStructureChange(container, e));
  }

  const betaInput = container.querySelector("#alloc-beta");
  if (betaInput) {
    betaInput.addEventListener("input", (e) => handleBetaChange(container, e));
  }

  const tabs = container.querySelectorAll(".pred-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      switchPredTab(container, tab.dataset.tab);
    });
  });

  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (activePredTab === "allocation") {
        drawPieChart(container);
      }
    }, 100);
  });
}

function getFmeaLambdaEstimate(occurrence) {
  const OCCURRENCE_TO_LAMBDA = {
    1: 10,
    2: 100,
    3: 500,
    4: 2000,
    5: 10000,
    6: 20000,
    7: 50000,
    8: 125000,
    9: 333333,
    10: 500000,
  };
  return OCCURRENCE_TO_LAMBDA[occurrence] || 10000;
}

function getFmeaSubsystemData(subsystemName) {
  if (!currentModel?.modules?.fmea?.items) return null;
  
  const items = currentModel.modules.fmea.items.filter(item => 
    item.function && item.function.includes(subsystemName)
  );
  
  if (items.length === 0) return null;
  
  const avgOccurrence = items.reduce((sum, item) => sum + (item.occurrence || 5), 0) / items.length;
  const avgSeverity = items.reduce((sum, item) => sum + (item.severity || 5), 0) / items.length;
  const avgRpn = items.reduce((sum, item) => sum + (item.rpn || 0), 0) / items.length;
  
  return {
    occurrence: Math.round(avgOccurrence),
    severity: Math.round(avgSeverity),
    rpn: Math.round(avgRpn),
    lambda: getFmeaLambdaEstimate(Math.round(avgOccurrence)),
    itemCount: items.length,
  };
}

// 与可靠性预计比对：将预测模块的等效B10与分配目标B10进行交叉验证
function renderPredComparison(container) {
  const panel = container.querySelector("#alloc-pred-compare-panel");
  if (!panel) return;

  // 获取预测模块的等效B10
  const predB10El = document.getElementById("pred-equiv-b10");
  const predB10Text = predB10El?.textContent || "—";
  const predB10 = parseFloat(predB10Text) || 0;

  // 获取分配模块的目标B10
  const allocB10 = allocationData?.targetB10 || 0;
  const calcSysB10 = allocationData?.calcSysB10 || 0;

  if (predB10 <= 0) {
    panel.innerHTML = `
      <div class="compare-empty" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">
        <p>请先在「可靠性预计」中添加元器件并点击计算</p>
      </div>
    `;
    return;
  }

  if (allocB10 <= 0) {
    panel.innerHTML = `
      <div class="compare-empty" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">
        <p>请先在分配设置中设定整机目标 B10</p>
      </div>
    `;
    return;
  }

  // 计算差异百分比
  const diff = Math.abs(predB10 - allocB10);
  const diffPct = allocB10 > 0 ? (diff / allocB10) * 100 : 0;

  // 一致性评价
  let consistency = "";
  let consistencyClass = "";
  if (diffPct <= 20) {
    consistency = "一致";
    consistencyClass = "consistency-good";
  } else if (diffPct <= 50) {
    consistency = "基本一致";
    consistencyClass = "consistency-fair";
  } else {
    consistency = "差异较大";
    consistencyClass = "consistency-poor";
  }

  panel.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>预计等效 B10 (h)</th>
          <th>分配目标 B10 (h)</th>
          <th>差异百分比</th>
          <th>一致性评价</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${predB10.toFixed(1)}</td>
          <td>${allocB10.toFixed(1)}</td>
          <td>${diffPct.toFixed(1)}%</td>
          <td><span class="consistency-badge ${consistencyClass}">${consistency}</span></td>
        </tr>
      </tbody>
    </table>
    <div class="compare-note" style="margin-top: 0.75rem; font-size: 0.8rem; color: var(--text-muted);">
      预测模块基于元器件失效率模型计算系统MTBF，再通过β转换为等效B10；分配模块基于评分法分配目标B10。两者差异≤20%为一致，20%~50%为基本一致，>50%建议重新评估元器件选型或分配权重。
    </div>
  `;
}

function renderFmeaComparison(container) {
  const panel = container.querySelector("#alloc-fmea-compare-panel");
  if (!panel) return;

  const subsystems = allocationData?.subsystems || [];
  const fmeaData = currentModel?.modules?.fmea;

  if (!fmeaData || !fmeaData.items || fmeaData.items.length === 0) {
    panel.innerHTML = `
      <div class="empty-state" style="padding: 1rem;">
        <div class="empty-icon">📋</div>
        <p style="margin-top: 0.5rem;">FMEA 模块暂无数据，无法进行比对</p>
        <p style="font-size: 0.8rem; color: #8b9cb3;">请先在 FMEA 模块中录入失效模式数据</p>
      </div>
    `;
    return;
  }

  if (!subsystems || subsystems.length === 0) {
    panel.innerHTML = `
      <div class="empty-state" style="padding: 1rem;">
        <div class="empty-icon">📊</div>
        <p style="margin-top: 0.5rem;">暂无子系统分配数据</p>
      </div>
    `;
    return;
  }

  const comparisonData = subsystems.map(s => {
    const fmeaInfo = getFmeaSubsystemData(s.name);
    const allocLambda = s.lambda || 0;
    const fmeaLambda = fmeaInfo?.lambda || 0;
    
    let diffPercent = 0;
    let consistency = "未知";
    let consistencyClass = "consistency-unknown";
    
    if (fmeaLambda > 0 && allocLambda > 0) {
      diffPercent = ((allocLambda - fmeaLambda) / fmeaLambda * 100).toFixed(1);
      const absDiff = Math.abs((allocLambda - fmeaLambda) / fmeaLambda * 100);
      
      if (absDiff <= 30) {
        consistency = "一致";
        consistencyClass = "consistency-match";
      } else if (absDiff <= 60) {
        consistency = "基本一致";
        consistencyClass = "consistency-close";
      } else if (absDiff <= 100) {
        consistency = "差异较大";
        consistencyClass = "consistency-warning";
      } else {
        consistency = "显著差异";
        consistencyClass = "consistency-mismatch";
      }
    } else if (fmeaLambda === 0) {
      consistency = "无匹配";
      consistencyClass = "consistency-no-match";
    }
    
    return {
      name: s.name,
      allocLambda: allocLambda.toFixed(2),
      fmeaLambda: fmeaLambda.toFixed(2),
      fmeaOccurrence: fmeaInfo?.occurrence || "-",
      fmeaRpn: fmeaInfo?.rpn || "-",
      fmeaItemCount: fmeaInfo?.itemCount || 0,
      diffPercent: diffPercent,
      consistency: consistency,
      consistencyClass: consistencyClass,
    };
  });

  const matchedCount = comparisonData.filter(d => d.consistencyClass !== "consistency-no-match").length;
  const totalCount = comparisonData.length;

  panel.innerHTML = `
    <div style="margin-bottom: 1rem; font-size: 0.85rem; color: #8b9cb3;">
      比对说明：基于 FMEA 发生度(O)估算主观失效率，与可靠性分配结果进行对比验证。
      FMEA 失效率 = f(O)，O值越高，失效率越大。匹配数：${matchedCount}/${totalCount}
    </div>
    <div class="compare-table-wrap">
      <table class="compare-table">
        <thead>
          <tr>
            <th style="min-width: 140px;">子系统名称</th>
            <th style="width: 140px;">分配失效率<br/>λ(10⁻⁶/h)</th>
            <th style="width: 140px;">FMEA主观失效率<br/>λ(10⁻⁶/h)</th>
            <th style="width: 120px;">FMEA指标<br/>(O/RPN)</th>
            <th style="width: 100px;">差异</th>
            <th style="width: 100px;">一致性评价</th>
          </tr>
        </thead>
        <tbody>
          ${comparisonData.map(d => `
            <tr>
              <td>${escapeHtml(d.name)}</td>
              <td class="compare-value">${d.allocLambda}</td>
              <td class="compare-value">${d.fmeaItemCount > 0 ? d.fmeaLambda : "-"}</td>
              <td class="compare-value">${d.fmeaItemCount > 0 ? `${d.fmeaOccurrence}/${d.fmeaRpn}` : "-"}</td>
              <td class="compare-value">${d.fmeaItemCount > 0 ? d.diffPercent + "%" : "-"}</td>
              <td><span class="consistency-badge ${d.consistencyClass}">${d.consistency}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(59, 158, 255, 0.1); border-radius: 8px; font-size: 0.8rem; color: #8b9cb3;">
      <strong style="color: #3b9eff;">一致性评价标准：</strong><br/>
      <span class="consistency-badge consistency-match" style="display: inline-block; margin-right: 0.5rem;">一致</span>差异 ≤30%<br/>
      <span class="consistency-badge consistency-close" style="display: inline-block; margin-right: 0.5rem;">基本一致</span>差异 30%~60%<br/>
      <span class="consistency-badge consistency-warning" style="display: inline-block; margin-right: 0.5rem;">差异较大</span>差异 60%~100%<br/>
      <span class="consistency-badge consistency-mismatch" style="display: inline-block; margin-right: 0.5rem;">显著差异</span>差异 >100%<br/>
    </div>
  `;
}

function initAllocationUI(container) {
  ensureAllocationData();

  const targetB10Input = container.querySelector("#alloc-target-b10");
  if (targetB10Input) {
    targetB10Input.value = allocationData.targetB10;
  }

  const confidenceSelect = container.querySelector("#alloc-confidence");
  if (confidenceSelect) {
    confidenceSelect.value = String(allocationData.confidence);
  }

  const structureSelect = container.querySelector("#alloc-system-structure");
  if (structureSelect) {
    structureSelect.value = allocationData.systemStructure;
  }

  const betaInput = container.querySelector("#alloc-beta");
  if (betaInput) {
    betaInput.value = allocationData.beta;
  }

  renderAllocationTable(container);
  renderAllocationResults(container);
  bindAllocationEvents(container);
  renderFmeaComparison(container);
  renderPredComparison(container);
}

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;

  const template = document.getElementById("prediction-template");
  if (!template) {
    container.innerHTML = '<div class="error-state"><h3>加载失败</h3><p>可靠性预测模板未找到</p></div>';
    return;
  }

  const clone = template.content.cloneNode(true);
  container.innerHTML = "";
  container.appendChild(clone);

  predictionData = model?.modules?.prediction || {
    components: [],
    systemStructure: "series",
    parallelCount: 2,
    missionTime: 10000,
  };

  if (!predictionData.components) predictionData.components = [];
  if (!predictionData.systemStructure) predictionData.systemStructure = "series";
  if (!predictionData.parallelCount) predictionData.parallelCount = 2;
  if (!predictionData.missionTime) predictionData.missionTime = 10000;

  predictionData.components.forEach((c) => updateComponentCalculations(c));

  const structureSelect = container.querySelector("#pred-structure-select");
  if (structureSelect) {
    structureSelect.value = predictionData.systemStructure;
  }

  const parallelCountInput = container.querySelector("#pred-parallel-count");
  if (parallelCountInput) {
    parallelCountInput.value = predictionData.parallelCount;
  }

  const parallelGroup = container.querySelector("#parallel-count-group");
  if (parallelGroup) {
    parallelGroup.style.display = predictionData.systemStructure === "parallel" ? "block" : "none";
  }

  const missionTimeInput = container.querySelector("#pred-mission-time");
  if (missionTimeInput) {
    missionTimeInput.value = predictionData.missionTime;
  }

  renderTable(container);
  bindEvents(container);
  bindComponentLibraryEvents(container);
  loadCustomComponents();
  updateResults(container);

  initAllocationUI(container);

  requestAnimationFrame(() => {
    drawBarChart(container);
    drawSystemDiagram(container);
  });
}
