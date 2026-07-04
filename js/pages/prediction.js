let onSaveCallback = null;
let currentModel = null;
let predictionData = null;
let activePredTab = "prediction";
let allocationData = null;

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
    }
  }

  updateComponentCalculations(component);
  saveData();
  renderTable(container);
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

  let totalScore = 0;
  allocationData.subsystems.forEach((s) => {
    s.totalScore = (s.complexity || 0) + (s.maturity || 0) + (s.environment || 0) + (s.mission || 0);
    totalScore += s.totalScore;
  });

  const targetB10 = allocationData.targetB10 || 150;
  allocationData.subsystems.forEach((s) => {
    s.weight = totalScore > 0 ? s.totalScore / totalScore : 0;
    if (allocationData.systemStructure === "series") {
      s.allocB10 = s.weight > 0 ? targetB10 / s.weight : 0;
    } else {
      s.allocB10 = s.weight > 0 ? targetB10 * s.weight : 0;
    }
  });

  let calcSysB10 = 0;
  if (allocationData.systemStructure === "series") {
    let sumInvB10 = 0;
    allocationData.subsystems.forEach((s) => {
      if (s.allocB10 > 0) sumInvB10 += 1 / s.allocB10;
    });
    calcSysB10 = sumInvB10 > 0 ? 1 / sumInvB10 : 0;
  } else {
    let sumR = 1;
    allocationData.subsystems.forEach((s) => {
      const r = Math.exp(-Math.pow(1 / (s.allocB10 || 1), allocationData.beta || 2.2) * Math.pow(1, allocationData.beta || 2.2));
      sumR *= (1 - r);
    });
    const sysR = 1 - sumR;
    if (sysR > 0 && sysR < 1) {
      const t = 1;
      const lambda = -Math.log(sysR) / t;
      calcSysB10 = -Math.log(0.9) / lambda;
    }
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
}

function deleteAllocationSubsystem(container, id) {
  if (!confirm("确定要删除这个子系统吗？")) return;
  allocationData.subsystems = allocationData.subsystems.filter((s) => s.id !== id);
  calcAllocation();
  saveData();
  renderAllocationTable(container);
  renderAllocationResults(container);
  drawPieChart(container);
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
  saveData();
  renderAllocationTable(container);
  renderAllocationResults(container);
  drawPieChart(container);
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
}

function handleBetaChange(container, e) {
  const val = Number(e.target.value) || 2.2;
  allocationData.beta = Math.max(0.1, val);
  calcAllocation();
  saveData();
  renderAllocationTable(container);
  renderAllocationResults(container);
  drawPieChart(container);
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
  updateResults(container);

  initAllocationUI(container);

  requestAnimationFrame(() => {
    drawBarChart(container);
    drawSystemDiagram(container);
  });
}
