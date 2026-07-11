import { html, render as litRender } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { getCustomComponentLibrary, setCustomComponentLibrary, getHomeB10, getCurrentProduct, getProductShared, getComponents, ensureComponentRegistered } from "../store.js";
import { gammaApprox, K10 } from "../calculator.js";

let onSaveCallback = null;
let currentModel = null;
let predictionData = null;
let activePredTab = "prediction";
let allocationData = null;
let predFormulaExpanded = false;
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
  { id: 'ic-motor-drv', name: '电机驱动IC', category: 'electronic', type: 'ic_analog', lambdaBase: 0.6, desc: 'BLDC电机驱动芯片，大电流发热' },
  { id: 'mosfet', name: 'MOS管', category: 'electronic', type: 'transistor', lambdaBase: 0.3, desc: '功率MOSFET，结温敏感' },
  { id: 'diode', name: '二极管', category: 'electronic', type: 'diode', lambdaBase: 0.1, desc: '普通硅二极管' },
  { id: 'inductor-common', name: '普通电感', category: 'electronic', type: 'inductor', lambdaBase: 0.03, desc: '通用功率电感' },
  { id: 'hall-sensor', name: '霍尔传感器', category: 'electronic', type: 'sensor', lambdaBase: 0.2, desc: '电机位置检测霍尔元件' },
  { id: 'imu-sensor', name: 'IMU姿态传感器', category: 'electronic', type: 'sensor', lambdaBase: 0.15, desc: '加速度+陀螺仪，割草机器人导航用' },
  { id: 'bearing-ball', name: '滚珠轴承 608', category: 'mechanical', type: 'other', lambdaBase: 0.5, desc: '深沟球轴承，转速负载相关' },
  { id: 'bearing-highspeed', name: '高速滚珠轴承', category: 'mechanical', type: 'other', lambdaBase: 1.2, desc: '吹风机高转速电机轴承，dmn值高' },
  { id: 'gear-steel', name: '齿轮(渗碳淬火)', category: 'mechanical', type: 'other', lambdaBase: 0.8, desc: '渗碳淬火钢制齿轮，接触疲劳' },
  { id: 'gear-plastic', name: '塑料齿轮(POM)', category: 'mechanical', type: 'other', lambdaBase: 1.5, desc: 'POM/尼龙塑料齿轮，磨损+热变形' },
  { id: 'spring', name: '弹簧', category: 'mechanical', type: 'other', lambdaBase: 0.2, desc: '疲劳失效为主' },
  { id: 'seal', name: '密封圈', category: 'mechanical', type: 'other', lambdaBase: 0.3, desc: '橡胶密封件，老化失效' },
  { id: 'seal-ipx5', name: '防水密封圈(IPX5)', category: 'mechanical', type: 'other', lambdaBase: 0.5, desc: '割草机器人户外防水，硅胶密封圈' },
  { id: 'fan-impeller', name: '离心风轮', category: 'mechanical', type: 'other', lambdaBase: 0.8, desc: '吹风机离心风叶，动平衡+疲劳' },
  { id: 'mower-blade', name: '割草刀片', category: 'mechanical', type: 'other', lambdaBase: 1.0, desc: '合金钢割草刀片，磨损+冲击' },
  { id: 'mower-wheel', name: '行走轮', category: 'mechanical', type: 'other', lambdaBase: 0.4, desc: '割草机驱动轮，磨损+承载' },
  { id: 'heater-element', name: '发热丝/加热芯', category: 'electronic', type: 'other', lambdaBase: 1.5, desc: '吹风机加热丝，高温氧化+振动' },
  { id: 'charging-contact', name: '充电对接触点', category: 'electromechanical', type: 'connector', lambdaBase: 1.0, desc: '割草机器人自动充电触点，氧化+脏污' },
  { id: 'boundary-coil', name: '边界线感应线圈', category: 'electronic', type: 'sensor', lambdaBase: 0.1, desc: '割草机器人边界检测，电磁感应' },
  { id: 'collision-sensor', name: '碰撞传感器', category: 'electromechanical', type: 'sensor', lambdaBase: 0.4, desc: '割草机碰撞检测，机械微动+缓冲' },
  { id: 'rain-sensor', name: '雨水传感器', category: 'electronic', type: 'sensor', lambdaBase: 0.25, desc: '割草机雨水检测，电极式/电容式' },
  { id: 'lift-sensor', name: '抬升/跌落传感器', category: 'electromechanical', type: 'sensor', lambdaBase: 0.3, desc: '割草机抬升检测，红外/机械开关' },
  { id: 'switch-micro', name: '微动开关', category: 'electromechanical', type: 'relay', lambdaBase: 0.5, desc: '机械开关，触点磨损' },
  { id: 'switch-trigger', name: '扳机开关/调速开关', category: 'electromechanical', type: 'relay', lambdaBase: 0.8, desc: '吹风机扳机调速开关，大电流电弧' },
  { id: 'relay', name: '继电器', category: 'electromechanical', type: 'relay', lambdaBase: 0.8, desc: '电磁继电器，触点寿命' },
  { id: 'connector', name: '连接器', category: 'electromechanical', type: 'connector', lambdaBase: 0.1, desc: '接插件，插拔磨损' },
  { id: 'motor', name: '无刷电机', category: 'electromechanical', type: 'other', lambdaBase: 2.0, desc: '无刷直流电机，轴承+绕组' },
  { id: 'motor-blower', name: '吹风机高速无刷电机', category: 'electromechanical', type: 'other', lambdaBase: 3.5, desc: '10万转以上高速电机，轴承+风磨' },
  { id: 'motor-wheel', name: '行走轮电机', category: 'electromechanical', type: 'other', lambdaBase: 1.8, desc: '割草机行走驱动电机，负载+粉尘' },
  { id: 'motor-mower', name: '割草刀盘电机', category: 'electromechanical', type: 'other', lambdaBase: 2.5, desc: '割草机刀盘驱动电机，冲击负载' },
  { id: 'battery-pack', name: '锂电池包', category: 'electromechanical', type: 'other', lambdaBase: 1.2, desc: '18650/21700电芯组，循环衰减' },
  { id: 'air-filter', name: '进风滤网/滤芯', category: 'mechanical', type: 'other', lambdaBase: 0.6, desc: '吹风机进风过滤，堵塞导致过热' },
];

let customComponentLibrary = [];
let currentLibCategory = 'all';
let currentLibKeyword = '';
let deratingModule = null;
let deratingInitialized = false;

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

/** 渲染零部件下拉提示列表（供预测和分配模块共用） */
function renderComponentDatalists() {
  const product = getCurrentProduct();
  if (!product) return html``;
  const components = getComponents(product.id);
  if (components.length === 0) return html``;
  const options = components.map((c) => html`<option value="${c.name}"></option>`);
  return html`
    <datalist id="pred-component-list">${options}</datalist>
    <datalist id="alloc-component-list">${options}</datalist>
  `;
}

function createNewComponent(type = "resistor") {
  const lambdaBase = COMPONENT_BASE_LAMBDA[type] ?? 0.1;
  const component = {
    id: genId(),
    componentId: null,
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
    return totalLambda / (n * sum);
  } else if (structure === "vote23") {
    if (totalLambda <= 0) return 0;
    const unitLambda = totalLambda / 3;
    return (6 / 5) * unitLambda;
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

function renderComponentRow(item, index, container) {
  const typeOptions = Object.entries(COMPONENT_TYPE_LABELS).map(([val, label]) => 
    html`<option value="${val}" ?selected=${item.type === val}>${label}</option>`
  );

  return html`
    <tr data-id="${item.id}">
      <td class="pred-index">${index + 1}</td>
      <td><input type="text" class="item-input" data-field="name" list="pred-component-list" .value=${live(item.name)} placeholder="元器件名称" @input=${(e) => handleInputChange(container, e)} /></td>
      <td>
        <select class="item-input pred-type-select" data-field="type" @change=${(e) => handleInputChange(container, e)}>
          ${typeOptions}
        </select>
      </td>
      <td><input type="number" class="item-input pred-num-input" data-field="quantity" .value=${live(String(item.quantity))} min="1" step="1" @input=${(e) => handleInputChange(container, e)} /></td>
      <td><input type="number" class="item-input pred-num-input" data-field="lambdaBase" .value=${live(String(item.lambdaBase))} min="0" step="0.01" @input=${(e) => handleInputChange(container, e)} /></td>
      <td><input type="number" class="item-input pred-num-input" data-field="temperature" .value=${live(String(item.temperature))} step="1" @input=${(e) => handleInputChange(container, e)} /></td>
      <td class="pred-factor-cell">${item.piT?.toFixed(3) || "-"}</td>
      <td><input type="number" class="item-input pred-num-input" data-field="piS" .value=${live(String(item.piS))} min="0" step="0.1" @input=${(e) => handleInputChange(container, e)} /></td>
      <td><input type="number" class="item-input pred-num-input" data-field="piQ" .value=${live(String(item.piQ))} min="0" step="0.1" @input=${(e) => handleInputChange(container, e)} /></td>
      <td class="pred-lambda-cell">${(item.lambdaOp / 1000)?.toFixed(4) || "-"}</td>
      <td class="pred-action-cell">
        <button type="button" class="pred-delete-btn" @click=${(e) => handleDeleteClick(container, e, item.id)} title="删除">🗑️</button>
      </td>
    </tr>
  `;
}

function renderTable(container) {
  const tbody = container.querySelector("#pred-table-body");
  const emptyState = container.querySelector("#pred-empty-state");
  const countSpan = container.querySelector("#pred-component-count");

  if (!predictionData.components || predictionData.components.length === 0) {
    litRender(html``, tbody);
    emptyState.style.display = "block";
    countSpan.textContent = "0";
    return;
  }

  emptyState.style.display = "none";
  countSpan.textContent = predictionData.components.length;
  
  litRender(
    predictionData.components.map((item, index) => renderComponentRow(item, index, container)),
    tbody
  );
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
  if (lambdaOpCell) lambdaOpCell.textContent = (component.lambdaOp / 1000).toFixed(4);
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

  // 当 name 字段变更时，自动注册零部件到产品级注册表
  if (field === "name" && input.value && input.value.trim()) {
    const product = getCurrentProduct();
    if (product) {
      component.componentId = ensureComponentRegistered(product.id, input.value.trim(), {
        category: component.category || "other",
        type: component.type || "other",
        lambdaBase: component.lambdaBase ?? null,
      });
    }
  }

  updateComponentCalculations(component);
  updateRowDisplay(tr, component);
  saveData();
  updateResults(container);
  drawBarChart(container);
  drawSystemDiagram(container);
}

function handleDeleteClick(container, e, componentId) {
  e.stopPropagation();
  if (!confirm("确定要删除这个元器件吗？")) return;

  predictionData.components = predictionData.components.filter((c) => c.id !== componentId);
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

  if (totalLambdaEl) totalLambdaEl.textContent = (totalLambda / 1000).toFixed(4);
  if (sysLambdaEl) sysLambdaEl.textContent = (sysLambda / 1000).toFixed(4);
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
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y - size / 2);
    ctx.lineTo(x + size, y + size / 2);
  } else {
    ctx.moveTo(x + size, y);
    ctx.lineTo(x - size, y - size / 2);
    ctx.lineTo(x - size, y + size / 2);
  }
  ctx.closePath();
  ctx.fill();
}

function loadCustomComponents() {
  try {
    // 从 store.js 统一读取（参与导入导出和云同步）
    const stored = getCustomComponentLibrary();
    customComponentLibrary = Array.isArray(stored) ? stored : [];
  } catch (e) {
    customComponentLibrary = [];
  }
}

function saveCustomComponents() {
  try {
    setCustomComponentLibrary(customComponentLibrary);
  } catch (e) {
    console.error('保存自定义元器件失败:', e);
  }
}

function getAllLibraryComponents() {
  const productComponents = [];
  const currentProduct = getCurrentProduct();
  if (currentProduct) {
    const shared = getProductShared(currentProduct.id);
    if (shared.components && shared.components.length > 0) {
      productComponents.push(...shared.components.map(c => ({ ...c, _isProductShared: true })));
    }
  }
  return [...COMPONENT_LIBRARY, ...customComponentLibrary, ...productComponents];
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
    const isProductShared = comp._isProductShared;
    return `
      <div class="lib-component-card" data-comp-id="${comp.id}" title="点击添加到BOM">
        <div class="lib-comp-header">
          <span class="lib-comp-name">${escapeHtml(comp.name)}</span>
          ${isCustom ? '<span class="lib-comp-custom-tag">自定义</span>' : ''}
          ${isProductShared ? '<span class="lib-comp-product-tag">产品共享</span>' : ''}
        </div>
        <div class="lib-comp-category">
          <span class="lib-cat-badge lib-cat-${comp.category}">${categoryLabel}</span>
          <span class="lib-type-label">${typeLabel}</span>
        </div>
        <div class="lib-comp-lambda">
          <span class="lambda-label">λb</span>
          <span class="lambda-value">${(comp.lambdaBase / 1000).toFixed(4)}</span>
          <span class="lambda-unit">10⁻⁶/h</span>
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

  // 注册到产品级零部件注册表
  const product = getCurrentProduct();
  if (product) {
    newComponent.componentId = ensureComponentRegistered(product.id, comp.name, {
      category: comp.category || "other",
      type: comp.type || "other",
      lambdaBase: comp.lambdaBase ?? null,
    });
  }

  predictionData.components.push(newComponent);
  saveData();
  renderTable(container);
  updateResults(container);
  drawBarChart(container);
  drawSystemDiagram(container);

  showToast(container, `已添加: ${comp.name}`);
}

// ========== 注册表导入功能 ==========

let _registryImportTarget = 'prediction'; // 'prediction' | 'allocation'
let _registryImportKeyword = '';

function openRegistryImport(container, target) {
  _registryImportTarget = target;
  _registryImportKeyword = '';
  const modal = container.querySelector('#registry-import-modal');
  if (modal) {
    modal.style.display = 'flex';
    const searchInput = container.querySelector('#registry-import-search');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    renderRegistryImportList(container);
  }
}

function closeRegistryImport(container) {
  const modal = container.querySelector('#registry-import-modal');
  if (modal) modal.style.display = 'none';
}

function renderRegistryImportList(container) {
  const listEl = container.querySelector('#registry-import-list');
  if (!listEl) return;

  const product = getCurrentProduct();
  if (!product) {
    listEl.innerHTML = '<div class="lib-empty-state"><p>请先选择产品</p></div>';
    return;
  }

  let components = getComponents(product.id);
  if (_registryImportKeyword && _registryImportKeyword.trim()) {
    const kw = _registryImportKeyword.trim().toLowerCase();
    components = components.filter(c =>
      c.name.toLowerCase().includes(kw) ||
      (c.description && c.description.toLowerCase().includes(kw))
    );
  }

  if (components.length === 0) {
    listEl.innerHTML = `
      <div class="lib-empty-state">
        <div class="lib-empty-icon">📋</div>
        <p>暂无已注册零部件</p>
        <p style="font-size: 0.8rem; color: var(--text-muted);">请先在首页「零部件管理」中添加，或在各模块中输入零部件名称自动注册</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = components.map(comp => {
    const categoryLabel = COMPONENT_CATEGORY_LABELS[comp.category] || comp.category || '其他';
    const typeLabel = COMPONENT_TYPE_LABELS[comp.type] || comp.type || '其他';
    const lambdaStr = comp.lambdaBase != null ? (comp.lambdaBase / 1000).toFixed(4) : '-';
    return `
      <div class="lib-component-card" data-comp-id="${comp.id}" title="点击添加">
        <div class="lib-comp-header">
          <span class="lib-comp-name">${escapeHtml(comp.name)}</span>
        </div>
        <div class="lib-comp-category">
          <span class="lib-cat-badge lib-cat-${comp.category || 'other'}">${categoryLabel}</span>
          <span class="lib-type-label">${typeLabel}</span>
        </div>
        <div class="lib-comp-lambda">
          <span class="lambda-label">λb</span>
          <span class="lambda-value">${lambdaStr}</span>
          <span class="lambda-unit">10⁻⁶/h</span>
        </div>
        ${comp.description ? `<div class="lib-comp-desc">${escapeHtml(comp.description)}</div>` : ''}
        <div class="lib-comp-add-btn"><span>➕</span> 添加</div>
      </div>
    `;
  }).join('');
}

function handleRegistryImportClick(container, compId) {
  const product = getCurrentProduct();
  if (!product) return;
  const components = getComponents(product.id);
  const comp = components.find(c => c.id === compId);
  if (!comp) return;

  if (_registryImportTarget === 'prediction') {
    // 添加到预计 BOM 表
    const newComponent = createNewComponent(comp.type || 'other');
    newComponent.name = comp.name;
    newComponent.componentId = comp.id;
    if (comp.lambdaBase != null) {
      newComponent.lambdaBase = comp.lambdaBase;
    }
    newComponent.lambdaOp = calcLambdaOp(newComponent);
    predictionData.components.push(newComponent);
    saveData();
    renderTable(container);
    updateResults(container);
    drawBarChart(container);
    drawSystemDiagram(container);
    showToast(container, `已添加: ${comp.name}`);
  } else if (_registryImportTarget === 'allocation') {
    // 添加为分配子系统
    const newSub = {
      id: genId(),
      componentId: comp.id,
      name: comp.name,
      complexity: 5,
      maturity: 5,
      environment: 5,
      mission: 5,
    };
    allocationData.subsystems.push(newSub);
    calcAllocation();
    saveData();
    renderAllocationTable(container);
    renderAllocationResults(container);
    drawPieChart(container);
    renderFmeaComparison(container);
    renderPredComparison(container);
    showToast(container, `已添加子系统: ${comp.name}`);
  }
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
  const addBtn = container.querySelector("#pred-add-component");
  addBtn.addEventListener("click", () => handleAddComponent(container));

  const emptyAddBtn = container.querySelector("#pred-empty-add-btn");
  emptyAddBtn.addEventListener("click", () => handleAddComponent(container));

  const calculateBtn = container.querySelector("#pred-calculate");
  calculateBtn.addEventListener("click", () => handleCalculate(container));

  // 注册表导入按钮（预计）
  const importPredBtn = container.querySelector("#pred-import-registry");
  if (importPredBtn) {
    importPredBtn.addEventListener("click", () => openRegistryImport(container, 'prediction'));
  }

  // 注册表导入弹窗事件
  const regImportClose = container.querySelector("#registry-import-close");
  if (regImportClose) regImportClose.addEventListener("click", () => closeRegistryImport(container));
  const regImportOverlay = container.querySelector("#registry-import-overlay");
  if (regImportOverlay) regImportOverlay.addEventListener("click", () => closeRegistryImport(container));
  const regImportSearch = container.querySelector("#registry-import-search");
  if (regImportSearch) {
    regImportSearch.addEventListener("input", (e) => {
      _registryImportKeyword = e.target.value;
      renderRegistryImportList(container);
    });
  }
  const regImportList = container.querySelector("#registry-import-list");
  if (regImportList) {
    regImportList.addEventListener("click", (e) => {
      const card = e.target.closest("[data-comp-id]");
      if (!card) return;
      handleRegistryImportClick(container, card.dataset.compId);
    });
  }

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
      targetB10: getHomeB10(currentModel),
      confidence: 0.9,
      systemStructure: "series",
      beta: 2.2,
      subsystems: [],
    };
  } else {
    if (!predictionData.allocation.targetB10 || predictionData.allocation.targetB10 === 150) {
      predictionData.allocation.targetB10 = getHomeB10(currentModel);
    }
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
  const targetB10 = allocationData.targetB10 || getHomeB10(currentModel);
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
    litRender(html``, tbody);
    emptyState.style.display = "block";
    countSpan.textContent = "0";
    return;
  }

  emptyState.style.display = "none";
  countSpan.textContent = allocationData.subsystems.length;
  
  litRender(
    allocationData.subsystems.map((item, index) => renderAllocationRow(item, index, container)),
    tbody
  );
}

function renderAllocationRow(item, index, container) {
  const weightPercent = item.weight ? (item.weight * 100).toFixed(2) : "0.00";
  const allocB10 = item.allocB10 ? item.allocB10.toFixed(1) : "0.0";
  const lambda = item.lambda ? item.lambda.toFixed(2) : "0.00";
  const totalScore = item.totalScore || 0;

  return html`
    <tr data-id="${item.id}">
      <td class="alloc-index">${index + 1}</td>
      <td><input type="text" class="item-input" data-field="name" list="alloc-component-list" .value=${live(item.name)} placeholder="子系统名称" @input=${(e) => handleAllocationInputChange(container, e)} /></td>
      <td><input type="number" class="item-input alloc-num-input" data-field="complexity" .value=${live(String(item.complexity || 0))} min="1" max="10" step="1" @input=${(e) => handleAllocationInputChange(container, e)} /></td>
      <td><input type="number" class="item-input alloc-num-input" data-field="maturity" .value=${live(String(item.maturity || 0))} min="1" max="10" step="1" @input=${(e) => handleAllocationInputChange(container, e)} /></td>
      <td><input type="number" class="item-input alloc-num-input" data-field="environment" .value=${live(String(item.environment || 0))} min="1" max="10" step="1" @input=${(e) => handleAllocationInputChange(container, e)} /></td>
      <td><input type="number" class="item-input alloc-num-input" data-field="mission" .value=${live(String(item.mission || 0))} min="1" max="10" step="1" @input=${(e) => handleAllocationInputChange(container, e)} /></td>
      <td class="alloc-score-cell">${totalScore}</td>
      <td class="alloc-weight-cell">${weightPercent}%</td>
      <td class="alloc-b10-cell">${allocB10}</td>
      <td class="alloc-lambda-cell">${lambda}</td>
      <td class="alloc-action-cell">
        <button type="button" class="alloc-delete-btn" @click=${(e) => handleAllocationDeleteClick(container, e, item.id)} title="删除">🗑️</button>
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
  if (calcB10El) calcB10El.textContent = (allocationData?.calcSysB10 || 0).toFixed(1);
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
    componentId: null,
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
    if (b10Cell) b10Cell.textContent = (subsystem.allocB10 || 0).toFixed(1);
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

  // 当 name 字段变更时，自动注册零部件到产品级注册表
  if (field === "name" && input.value && input.value.trim()) {
    const product = getCurrentProduct();
    if (product) {
      subsystem.componentId = ensureComponentRegistered(product.id, input.value.trim());
    }
  }

  calcAllocation();
  updateAllAllocationRows(container);
  saveData();
  renderAllocationResults(container);
  drawPieChart(container);
  renderFmeaComparison(container);
  renderPredComparison(container);
}

function handleAllocationDeleteClick(container, e, subsystemId) {
  e.stopPropagation();
  deleteAllocationSubsystem(container, subsystemId);
}

function handleTargetB10Change(container, e) {
  const val = Number(e.target.value) || 0;
  allocationData.targetB10 = Math.max(1, parseFloat(val.toFixed(1)));
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

async function ensureDeratingRendered(container) {
  const deratingContainer = container.querySelector("#pred-tab-derating");
  if (!deratingContainer) return;
  if (!deratingModule) {
    deratingModule = await import("./derating.js");
  }
  if (!deratingInitialized) {
    deratingModule.init(currentModel, onSaveCallback);
    deratingInitialized = true;
  }
  litRender(html``, deratingContainer);
  deratingModule.render(deratingContainer, currentModel);
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
  const tabDerating = container.querySelector("#pred-tab-derating");

  if (tabName === "derating") {
    if (tabDerating) tabDerating.style.display = "block";
    if (tabPrediction) tabPrediction.style.display = "none";
    if (tabAllocation) tabAllocation.style.display = "none";
    ensureDeratingRendered(container);
  } else if (tabName === "prediction") {
    if (tabDerating) tabDerating.style.display = "none";
    if (tabPrediction) tabPrediction.style.display = "block";
    if (tabAllocation) tabAllocation.style.display = "none";
    requestAnimationFrame(() => {
      drawBarChart(container);
      drawSystemDiagram(container);
    });
  } else {
    if (tabDerating) tabDerating.style.display = "none";
    if (tabPrediction) tabPrediction.style.display = "none";
    if (tabAllocation) tabAllocation.style.display = "block";
    requestAnimationFrame(() => {
      drawPieChart(container);
    });
  }
}

function bindAllocationEvents(container) {
  const addBtn = container.querySelector("#alloc-add-subsystem");
  if (addBtn) {
    addBtn.addEventListener("click", () => addAllocationSubsystem(container));
  }

  const emptyAddBtn = container.querySelector("#alloc-empty-add-btn");
  if (emptyAddBtn) {
    emptyAddBtn.addEventListener("click", () => addAllocationSubsystem(container));
  }

  // 注册表导入按钮（分配）
  const importAllocBtn = container.querySelector("#alloc-import-registry");
  if (importAllocBtn) {
    importAllocBtn.addEventListener("click", () => openRegistryImport(container, 'allocation'));
  }

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

function getFmeaSubsystemData(subsystemName, subsystemComponentId) {
  if (!currentModel?.modules?.fmea?.items) return null;

  // 优先使用 componentId 精确匹配
  let items = [];
  if (subsystemComponentId) {
    items = currentModel.modules.fmea.items.filter(item =>
      item.componentId && item.componentId === subsystemComponentId
    );
  }

  // 降级：字符串模糊匹配，并自动补全 componentId
  if (items.length === 0 && subsystemName) {
    items = currentModel.modules.fmea.items.filter(item =>
      item.function && item.function.includes(subsystemName)
    );
    // 自动补全 componentId
    if (items.length > 0) {
      const product = getCurrentProduct();
      if (product) {
        for (const item of items) {
          if (!item.componentId && item.function) {
            item.componentId = ensureComponentRegistered(product.id, item.function);
          }
        }
      }
    }
  }

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
    const fmeaInfo = getFmeaSubsystemData(s.name, s.componentId);
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
    targetB10Input.value = Number(allocationData.targetB10).toFixed(1);
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

function renderTemplate(container) {
  const typeOptions = Object.entries(COMPONENT_TYPE_LABELS).map(([val, label]) => 
    html`<option value="${val}" ?selected=${predictionData.systemStructure === val}>${label}</option>`
  );

  litRender(html`
    <div class="module-page prediction-page">
      ${renderComponentDatalists()}
      <div class="module-header">
        <h2>可靠性预测</h2>
        <p>基于零部件失效率的系统可靠性预计与计算（简化版 MIL-HDBK-217）</p>
      </div>
      <div class="module-content">
        <div class="prediction-tabs">
          <button type="button" class="pred-tab ${activePredTab === 'derating' ? 'active' : ''}" @click=${() => switchPredTab(container, 'derating')}>降额裕度</button>
          <button type="button" class="pred-tab ${activePredTab === 'prediction' ? 'active' : ''}" @click=${() => switchPredTab(container, 'prediction')}>可靠性预计</button>
          <button type="button" class="pred-tab ${activePredTab === 'allocation' ? 'active' : ''}" @click=${() => switchPredTab(container, 'allocation')}>可靠性分配</button>
        </div>

        <div id="pred-tab-derating" class="pred-tab-content" style="display: ${activePredTab === 'derating' ? 'block' : 'none'};">
          <!-- 降额裕度模块容器，由 JS 动态渲染 -->
        </div>

        <div id="pred-tab-prediction" class="pred-tab-content" style="display: ${activePredTab === 'prediction' ? 'block' : 'none'};">
          <div class="prediction-toolbar">
            <div class="prediction-structure-select">
              <label class="selector-group">
                <span class="selector-label">系统结构</span>
                <select id="pred-structure-select" class="header-select" @change=${(e) => handleStructureChange(container, e)}>
                  <option value="series" ?selected=${predictionData.systemStructure === 'series'}>串联系统</option>
                  <option value="parallel" ?selected=${predictionData.systemStructure === 'parallel'}>并联系统</option>
                  <option value="vote23" ?selected=${predictionData.systemStructure === 'vote23'}>2/3 表决系统</option>
                </select>
              </label>
              <div class="parallel-count-group" id="parallel-count-group" style="display: ${predictionData.systemStructure === 'parallel' ? 'block' : 'none'};">
                <label class="selector-group">
                  <span class="selector-label">并联数量</span>
                  <input type="number" id="pred-parallel-count" class="form-input" min="2" .value=${live(String(predictionData.parallelCount))} @input=${(e) => handleParallelCountChange(container, e)} style="width: 80px;" />
                </label>
              </div>
            </div>
            <div class="prediction-toolbar-right">
              <button type="button" class="btn-icon" id="pred-import-registry" title="从首页零部件注册表批量导入">
                <span>📥</span>
                <span class="btn-text">从注册表导入</span>
              </button>
              <button type="button" class="btn-icon" id="pred-component-library">
                <span>📚</span>
                <span class="btn-text">元器件库</span>
              </button>
              <button type="button" class="btn-icon" id="pred-add-component">
                <span>➕</span>
                <span class="btn-text">添加元器件</span>
              </button>
              <button type="button" class="btn-icon btn-primary" id="pred-calculate">
                <span>🔢</span>
                <span class="btn-text">计算</span>
              </button>
            </div>
          </div>

          <div class="pred-components-card card">
            <div class="card-header">
              <h3>元器件清单</h3>
              <div class="card-actions">
                <span class="selector-label" style="font-size: 0.8rem; color: var(--text-muted);">共 <span id="pred-component-count">${predictionData.components?.length || 0}</span> 种元器件</span>
              </div>
            </div>
            <div class="card-body" style="padding: 0;">
              <div class="pred-table-container table-wrap">
                <table class="data-table pred-table">
                  <thead>
                    <tr>
                      <th style="width: 50px;">序号</th>
                      <th style="min-width: 150px;">元器件名称</th>
                      <th style="width: 120px;">类型</th>
                      <th style="width: 80px;">数量</th>
                      <th style="width: 120px;">基础失效率λ(10⁻⁶/h)<span class="help-icon" data-tooltip="基础失效率：元器件在标准条件（25°C、额定应力）下的失效率，单位10⁻⁶/h。可从元器件手册或MIL-HDBK-217查得">?</span></th>
                      <th style="width: 100px;">工作温度(°C)</th>
                      <th style="width: 90px;">π_T<span class="help-icon" data-tooltip="温度加速系数：基于Arrhenius模型计算，工作温度越高值越大。25°C时=1.0，每升高10°C约增大1.5~2倍">?</span></th>
                      <th style="width: 90px;">π_S<span class="help-icon" data-tooltip="应力降额系数：实际工作应力与额定应力之比的相关因子。默认1.0，降额设计时<1.0，过载时>1.0">?</span></th>
                      <th style="width: 90px;">π_Q<span class="help-icon" data-tooltip="质量等级系数：反映元器件质量水平。军用级0.3~0.5，工业级1.0，民用级1.5~2.0">?</span></th>
                      <th style="width: 130px;">工作失效率(10⁻⁶/h)</th>
                      <th style="width: 70px;">操作</th>
                    </tr>
                  </thead>
                  <tbody id="pred-table-body">
                  </tbody>
                </table>
                <div class="pred-empty-state empty-state" id="pred-empty-state" style="display: ${!predictionData.components || predictionData.components.length === 0 ? 'block' : 'none'};">
                  <div class="empty-icon">📋</div>
                  <h3>暂无元器件数据</h3>
                  <p>点击「添加元器件」按钮开始创建您的第一个元器件条目。</p>
                  <button type="button" class="btn-primary" id="pred-empty-add-btn">添加第一个元器件</button>
                </div>
              </div>
            </div>
          </div>

          <div class="pred-bottom-grid">
            <div class="card pred-diagram-card">
              <div class="card-header">
                <h3>系统结构示意图</h3>
              </div>
              <div class="card-body">
                <div class="pred-diagram-container" id="pred-diagram-container">
                  <canvas id="pred-diagram-canvas" width="500" height="200"></canvas>
                </div>
              </div>
            </div>

            <div class="card pred-results-card">
              <div class="card-header">
                <h3>计算结果</h3>
              </div>
              <div class="card-body">
                <div class="metrics-grid">
                  <div class="metric-card">
                    <div class="metric-label">元器件总失效率 (Σλ)</div>
                    <div class="metric-value" id="pred-total-lambda">${(getTotalLambda() / 1000).toFixed(4)}</div>
                    <div class="metric-unit">10⁻⁶/h</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">系统失效率 λs</div>
                    <div class="metric-value" id="pred-sys-lambda">${(calcSystemLambda() / 1000).toFixed(4)}</div>
                    <div class="metric-unit">10⁻⁶/h</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">系统 MTBF</div>
                    <div class="metric-value" id="pred-mtbf-hours">${calcMtbfHours() > 0 ? formatNumber(calcMtbfHours()) : '—'}</div>
                    <div class="metric-unit">小时</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">系统 MTBF</div>
                    <div class="metric-value" id="pred-mtbf-years">${calcMtbfHours() > 0 ? (calcMtbfHours() / HOURS_PER_YEAR).toFixed(2) : '—'}</div>
                    <div class="metric-unit">年</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">等效 B10 寿命</div>
                    <div class="metric-value" id="pred-equiv-b10">—</div>
                    <div class="metric-unit">小时</div>
                  </div>
                  <div class="metric-card">
                    <div class="metric-label">等效失效率 λ</div>
                    <div class="metric-value" id="pred-equiv-lambda">—</div>
                    <div class="metric-unit">10⁻⁶/h</div>
                  </div>
                </div>

                <div class="pred-beta-section" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
                  <div class="form-row">
                    <div class="form-group">
                      <label>Weibull 形状参数 β<span class="help-icon" data-tooltip="Weibull形状参数：β>1磨损失效(典型2.0~2.5)，β=1随机失效，β<1早期失效。用于从MTBF反算等效B10">?</span></label>
                      <input type="number" id="pred-beta" class="form-input" min="0.1" step="0.1" value="2.2" style="width: 100px;" />
                    </div>
                  </div>
                </div>

                <div class="pred-reliability-section">
                  <h4 style="margin: 1rem 0 0.75rem; font-size: 0.9rem;">可靠度 R(t) = e^(-λt)</h4>
                  <div class="form-row">
                    <div class="form-group">
                      <label>任务时间 t (小时)</label>
                      <input type="number" id="pred-mission-time" class="form-input" min="0" .value=${live(String(predictionData.missionTime))} step="100" @input=${(e) => handleMissionTimeChange(container, e)} />
                    </div>
                    <div class="form-group">
                      <label>可靠度 R(t)</label>
                      <div class="readonly-value" id="pred-reliability-value">${(calcReliability(predictionData.missionTime) * 100).toFixed(4)}%</div>
                    </div>
                  </div>
                </div>

                <div class="pred-chart-section">
                  <h4 style="margin: 1rem 0 0.75rem; font-size: 0.9rem;">元器件失效率占比</h4>
                  <div class="pred-chart-container">
                    <canvas id="pred-bar-canvas" width="400" height="200"></canvas>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="card pred-formula-card">
            <div class="card-header">
              <h3>计算公式与原理说明</h3>
              <button type="button" class="formula-toggle" id="pred-formula-toggle" @click=${() => { predFormulaExpanded = !predFormulaExpanded; renderTemplate(container); }}>${predFormulaExpanded ? ' 收起' : '📐 展开公式'}</button>
            </div>
            ${predFormulaExpanded ? html`
              <div class="card-body">
                <div class="formula-content formula-grid" id="pred-formula-content">
                  <div class="formula-item">
                    <h4>① 工作失效率</h4>
                    <div class="formula-equation">λ<sub>op</sub> = λ<sub>b</sub> × π<sub>T</sub> × π<sub>S</sub> × π<sub>Q</sub> × N</div>
                  </div>
                  <div class="formula-item">
                    <h4>② 温度系数</h4>
                    <div class="formula-equation">π<sub>T</sub> = exp[E<sub>a</sub>/k × (1/T<sub>ref</sub> - 1/T<sub>op</sub>)]</div>
                  </div>
                  <div class="formula-item">
                    <h4>③ 系统失效率（串联）</h4>
                    <div class="formula-equation">λ<sub>s</sub> = Σ λ<sub>op,i</sub></div>
                  </div>
                  <div class="formula-item">
                    <h4>④ 系统 MTBF</h4>
                    <div class="formula-equation">MTBF = 1 / λ<sub>s</sub></div>
                  </div>
                  <div class="formula-item">
                    <h4>⑤ 等效特征寿命 η</h4>
                    <div class="formula-equation">η = MTBF / Γ(1 + 1/β)</div>
                  </div>
                  <div class="formula-item">
                    <h4>⑥ 等效 B10 寿命</h4>
                    <div class="formula-equation">B10 = η × [ln(10/9)]<sup>1/β</sup></div>
                  </div>
                  <div class="formula-item">
                    <h4>⑦ t 时刻可靠度</h4>
                    <div class="formula-equation">R(t) = exp(-λ<sub>s</sub> × t)</div>
                  </div>
                  <div class="formula-item">
                    <h4>⑧ 失效率 ↔ B10 转换</h4>
                    <div class="formula-equation">λ = ln(10/9) / B10 × 10⁶</div>
                  </div>
                  <div class="formula-item formula-item-wide">
                    <h4>计算流程</h4>
                    <div class="formula-equation" style="text-align: left; font-size: 0.88rem;">
                      各零件 λ<sub>b</sub> → 乘以修正系数得 λ<sub>op</sub> → 求和得 λ<sub>s</sub> → 反算 MTBF → Weibull 转换得 η → 反算等效 B10
                    </div>
                    <div class="formula-vars-inline" style="margin-top: 0.5rem;">
                      <span class="var-chip"><b>λ<sub>b</sub></b>基础失效率</span>
                      <span class="var-chip"><b>π<sub>T</sub></b>温度系数</span>
                      <span class="var-chip"><b>π<sub>S</sub></b>应力系数</span>
                      <span class="var-chip"><b>π<sub>Q</sub></b>质量系数</span>
                      <span class="var-chip"><b>N</b>数量</span>
                      <span class="var-chip"><b>E<sub>a</sub></b>激活能(eV)</span>
                      <span class="var-chip"><b>β</b>形状参数</span>
                    </div>
                  </div>
                  <div class="formula-item formula-item-wide">
                    <h4>失效率与 B10 寿命的关系</h4>
                    <div class="formula-explanation">
                      <p><b>B10 寿命</b>是指产品累积失效概率达到 10% 时对应的工作时间，即此时可靠度 R = 90%。它是工程中衡量产品寿命的常用指标，尤其在机械和机电产品中广泛使用。</p>
                      <p><b>失效率 λ</b>是单位时间内发生失效的概率。在指数分布假设下，失效率恒定，此时 MTBF = 1/λ，且 B10 与 λ 有直接关系：</p>
                      <div class="formula-equation" style="margin: 0.5rem 0;">B10 = -ln(0.9) / λ ≈ 0.10536 / λ</div>
                      <p>在本工具中，系统等效 B10 的计算更为精确：先通过各零件失效率求和得到系统失效率 λ<sub>s</sub>，反算出 MTBF，再利用 <b>Weibull 分布</b>（形状参数 β）将 MTBF 转换为特征寿命 η，最后由 η 反算 B10。</p>
                      <p>当 β = 1（随机失效）时，B10 = MTBF × ln(10/9) ≈ MTBF × 0.10536，与指数分布一致；当 β > 1（磨损失效）时，B10 会小于 MTBF × 0.10536，反映了耗损失效集中在后期的特点。</p>
                      <p><b>简言之</b>：零件失效率越低 → 系统失效率越低 → MTBF 越长 → 等效 B10 寿命越长。反之，B10 寿命要求越高，对零件失效率的要求也越苛刻。</p>
                    </div>
                  </div>
                </div>
              </div>
            ` : ''}
          </div>

          <div class="component-library-modal" id="component-library-modal" style="display: none;">
            <div class="component-library-overlay" id="component-library-overlay"></div>
            <div class="component-library-panel">
              <div class="component-library-header">
                <h3>📚 元器件库</h3>
                <button type="button" class="component-library-close" id="component-library-close">×</button>
              </div>
              <div class="component-library-search">
                <input type="text" id="component-library-search-input" class="form-input" placeholder="搜索元器件名称或描述..." />
              </div>
              <div class="component-library-categories">
                <button type="button" class="lib-cat-btn active" data-category="all">全部</button>
                <button type="button" class="lib-cat-btn" data-category="electronic">电子类</button>
                <button type="button" class="lib-cat-btn" data-category="mechanical">机械类</button>
                <button type="button" class="lib-cat-btn" data-category="electromechanical">机电类</button>
              </div>
              <div class="component-library-list" id="component-library-list">
              </div>
              <div class="component-library-footer">
                <button type="button" class="btn-secondary" id="add-custom-component-btn">
                  <span>➕</span>
                  <span>添加自定义元器件</span>
                </button>
              </div>
            </div>
          </div>

          <div class="custom-component-modal" id="custom-component-modal" style="display: none;">
            <div class="custom-component-overlay" id="custom-component-overlay"></div>
            <div class="custom-component-panel">
              <div class="custom-component-header">
                <h3>添加自定义元器件</h3>
                <button type="button" class="custom-component-close" id="custom-component-close">×</button>
              </div>
              <div class="custom-component-body">
                <div class="form-group">
                  <label>元器件名称</label>
                  <input type="text" id="custom-comp-name" class="form-input" placeholder="请输入元器件名称" />
                </div>
                <div class="form-group">
                  <label>类别</label>
                  <select id="custom-comp-category" class="form-input">
                    <option value="electronic">电子类</option>
                    <option value="mechanical">机械类</option>
                    <option value="electromechanical">机电类</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>类型</label>
                  <select id="custom-comp-type" class="form-input">
                    <option value="resistor">电阻</option>
                    <option value="capacitor">电容</option>
                    <option value="inductor">电感</option>
                    <option value="diode">二极管</option>
                    <option value="transistor">晶体管</option>
                    <option value="ic_digital">IC(数字)</option>
                    <option value="ic_analog">IC(模拟)</option>
                    <option value="connector">连接器</option>
                    <option value="relay">继电器</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>基础失效率 λb (10⁻⁶/h)</label>
                  <input type="number" id="custom-comp-lambda" class="form-input" min="0" step="0.01" value="0.1" />
                </div>
                <div class="form-group">
                  <label>描述</label>
                  <input type="text" id="custom-comp-desc" class="form-input" placeholder="可选：元器件描述" />
                </div>
              </div>
              <div class="custom-component-footer">
                <button type="button" class="btn-ghost" id="custom-comp-cancel">取消</button>
                <button type="button" class="btn-primary" id="custom-comp-save">保存</button>
              </div>
            </div>
          </div>
        </div>

        <div id="pred-tab-allocation" class="pred-tab-content" style="display: ${activePredTab === 'allocation' ? 'block' : 'none'};">
          <div class="card alloc-settings-card">
            <div class="card-header">
              <h3>分配设置</h3>
            </div>
            <div class="card-body">
              <div class="form-row">
                <div class="form-group">
                  <label>整机目标 B10 (小时)</label>
                  <input type="number" id="alloc-target-b10" class="form-input" min="1" .value=${live(String((allocationData?.targetB10 || 150).toFixed(1)))} step="0.1" @input=${(e) => handleTargetB10Change(container, e)} />
                </div>
                <div class="form-group">
                  <label>置信度</label>
                  <select id="alloc-confidence" class="form-input" @change=${(e) => handleConfidenceChange(container, e)}>
                    <option value="0.9" ?selected=${allocationData?.confidence === 0.9}>90%</option>
                    <option value="0.95" ?selected=${allocationData?.confidence === 0.95}>95%</option>
                    <option value="0.99" ?selected=${allocationData?.confidence === 0.99}>99%</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>系统结构</label>
                  <select id="alloc-system-structure" class="form-input" @change=${(e) => handleAllocStructureChange(container, e)}>
                    <option value="series" ?selected=${allocationData?.systemStructure === 'series'}>串联</option>
                    <option value="parallel" ?selected=${allocationData?.systemStructure === 'parallel'}>并联</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>β 形状参数</label>
                  <input type="number" id="alloc-beta" class="form-input" min="0.1" .value=${live(String(allocationData?.beta || 2.2))} step="0.1" @input=${(e) => handleBetaChange(container, e)} />
                </div>
              </div>
            </div>
          </div>

          <div class="card alloc-subsystems-card">
            <div class="card-header">
              <h3>子系统评分表</h3>
              <div class="card-actions">
                <span class="selector-label" style="font-size: 0.8rem; color: var(--text-muted);">共 <span id="alloc-subsystem-count">${allocationData?.subsystems?.length || 0}</span> 个子系统</span>
                <button type="button" class="btn-icon btn-sm" id="alloc-import-registry" title="从首页零部件注册表批量导入为子系统">
                  <span>📥</span>
                  <span class="btn-text">从注册表导入</span>
                </button>
                <button type="button" class="btn-icon btn-sm" id="alloc-add-subsystem">
                  <span>➕</span>
                  <span class="btn-text">添加子系统</span>
                </button>
              </div>
            </div>
            <div class="card-body" style="padding: 0;">
              <div class="alloc-table-container table-wrap">
                <table class="data-table alloc-table">
                  <thead>
                    <tr>
                      <th style="width: 50px;">序号</th>
                      <th style="min-width: 160px;">子系统名称</th>
                      <th style="width: 100px;">复杂度<span class="help-icon" data-tooltip="零件越多、装配越复杂，得分越高（1~10分）">?</span></th>
                      <th style="width: 110px;">成熟度(反)<span class="help-icon" data-tooltip="供应链越成熟，得分越低（1~10分，反向计分）">?</span></th>
                      <th style="width: 110px;">环境严酷度<span class="help-icon" data-tooltip="受力、温升、粉尘影响越大，得分越高（1~10分）">?</span></th>
                      <th style="width: 100px;">任务占比<span class="help-icon" data-tooltip="全程带载工作时间占比越高，得分越高（1~10分）">?</span></th>
                      <th style="width: 90px;">总分</th>
                      <th style="width: 100px;">权重占比</th>
                      <th style="width: 120px;">分配 B10 (h)</th>
                      <th style="width: 140px;">失效率 λ(10⁻⁶/h)<span class="help-icon" data-tooltip="λ = ln(10/9) / B10 × 10⁶，单位：10⁻⁶/h">?</span></th>
                      <th style="width: 70px;">操作</th>
                    </tr>
                  </thead>
                  <tbody id="alloc-table-body">
                  </tbody>
                </table>
                <div class="alloc-empty-state empty-state" id="alloc-empty-state" style="display: ${!allocationData?.subsystems || allocationData.subsystems.length === 0 ? 'block' : 'none'};">
                  <div class="empty-icon">📊</div>
                  <h3>暂无子系统数据</h3>
                  <p>点击「添加子系统」按钮开始创建您的第一个子系统条目。</p>
                  <button type="button" class="btn-primary" id="alloc-empty-add-btn">添加第一个子系统</button>
                </div>
              </div>
            </div>
          </div>

          <div class="card alloc-results-card">
            <div class="card-header">
              <h3>分配结果</h3>
            </div>
            <div class="card-body">
              <div class="metrics-grid">
                <div class="metric-card">
                  <div class="metric-label">子系统数量</div>
                  <div class="metric-value" id="alloc-subsys-count">${allocationData?.subsystems?.length || 0}</div>
                  <div class="metric-unit">个</div>
                </div>
                <div class="metric-card">
                  <div class="metric-label">权重总和</div>
                  <div class="metric-value" id="alloc-weight-sum">${((allocationData?.subsystems?.reduce((sum, s) => sum + (s.weight || 0), 0) || 0) * 100).toFixed(2)}%</div>
                  <div class="metric-unit">%</div>
                </div>
                <div class="metric-card">
                  <div class="metric-label">整机目标 B10</div>
                  <div class="metric-value" id="alloc-target-b10-display">${(allocationData?.targetB10 || 0).toFixed(1)}</div>
                  <div class="metric-unit">小时</div>
                </div>
                <div class="metric-card">
                  <div class="metric-label">计算整机 B10</div>
                  <div class="metric-value" id="alloc-calc-b10">${(allocationData?.calcSysB10 || 0).toFixed(1)}</div>
                  <div class="metric-unit">小时</div>
                </div>
              </div>

              <div class="alloc-chart-section">
                <h4 style="margin: 1rem 0 0.75rem; font-size: 0.9rem;">子系统权重占比</h4>
                <div class="alloc-chart-container">
                  <canvas id="alloc-pie-canvas" width="400" height="300"></canvas>
                </div>
              </div>
            </div>
          </div>

          <div class="card alloc-pred-compare-card">
            <div class="card-header">
              <h3>📊 与可靠性预计比对</h3>
              <span class="tp-optimize-hint">预测模块的等效B10与分配目标B10对比验证</span>
            </div>
            <div class="card-body">
              <div id="alloc-pred-compare-panel"></div>
            </div>
          </div>

          <div class="card alloc-compare-card">
            <div class="card-header">
              <h3>🔍 与 FMEA 主观失效率比对</h3>
              <span class="tp-optimize-hint">基于 FMEA 的 RPN 估算失效率，与分配结果比对验证</span>
            </div>
            <div class="card-body">
              <div id="alloc-fmea-compare-panel"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 注册表导入弹窗 -->
      <div class="component-library-modal" id="registry-import-modal" style="display: none;">
        <div class="component-library-overlay" id="registry-import-overlay"></div>
        <div class="component-library-panel">
          <div class="component-library-header">
            <h3>📥 从零部件注册表导入</h3>
            <button type="button" class="component-library-close" id="registry-import-close">×</button>
          </div>
          <div class="component-library-search">
            <input type="text" id="registry-import-search" class="form-input" placeholder="搜索零部件名称..." />
          </div>
          <div class="component-library-list" id="registry-import-list">
          </div>
          <div class="component-library-footer">
            <span class="selector-label" style="font-size: 0.8rem; color: var(--text-muted);">点击零部件卡片即可添加到当前表格</span>
          </div>
        </div>
      </div>
    </div>
  `, container);
}

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;
  deratingInitialized = false;

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

  ensureAllocationData();

  renderTemplate(container);

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
