import { genId } from "../store.js";
import { fmt } from "../utils.js";

let currentModel = null;
let onSaveCallback = null;

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;
  const template = document.getElementById("growth-template");
  const content = template.content.cloneNode(true);
  container.appendChild(content);

  ensureGrowthData();
  bindEvents();
  renderFailureTable();
  updateParamsAndChart();
}

function ensureGrowthData() {
  if (!currentModel.modules) currentModel.modules = {};
  if (!currentModel.modules.growth) {
    currentModel.modules.growth = {
      failures: [],
      model: "duane",
      targetMtbf: null,
      totalTime: null,
    };
  }
  const g = currentModel.modules.growth;
  if (!Array.isArray(g.failures)) g.failures = [];
  if (!g.model) g.model = "duane";
  if (g.targetMtbf === undefined) g.targetMtbf = null;
  if (g.totalTime === undefined) g.totalTime = null;
}

function save() {
  if (!onSaveCallback || !currentModel) return;
  onSaveCallback(currentModel);
}

function getGrowth() {
  return currentModel.modules.growth;
}

function getSortedFailures() {
  const g = getGrowth();
  return [...g.failures].sort((a, b) => a.time - b.time);
}

function getTotalTime() {
  const g = getGrowth();
  const sorted = getSortedFailures();
  if (g.totalTime && g.totalTime > 0) {
    return g.totalTime;
  }
  if (sorted.length > 0) {
    return sorted[sorted.length - 1].time;
  }
  return 0;
}

function bindEvents() {
  const modelSelect = document.getElementById("growth-model-select");
  const targetInput = document.getElementById("growth-target-mtbf");
  const totalTimeInput = document.getElementById("growth-total-time");
  const addBtn = document.getElementById("growth-add-failure");
  const emptyAddBtn = document.getElementById("growth-empty-add-btn");

  const g = getGrowth();
  if (modelSelect) {
    modelSelect.value = g.model || "duane";
    modelSelect.addEventListener("change", () => {
      g.model = modelSelect.value;
      save();
      updateModelParamsVisibility();
      updateParamsAndChart();
    });
  }

  if (targetInput) {
    targetInput.value = g.targetMtbf || "";
    targetInput.addEventListener("input", () => {
      const val = parseFloat(targetInput.value);
      g.targetMtbf = Number.isFinite(val) && val > 0 ? val : null;
      save();
      updateParamsAndChart();
    });
  }

  if (totalTimeInput) {
    totalTimeInput.value = g.totalTime || "";
    totalTimeInput.addEventListener("input", () => {
      const val = parseFloat(totalTimeInput.value);
      g.totalTime = Number.isFinite(val) && val > 0 ? val : null;
      save();
      updateParamsAndChart();
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

      const g = getGrowth();
      const failure = g.failures.find((f) => f.id === id);
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
    });
  }
}

function addFailure() {
  const g = getGrowth();
  const sorted = getSortedFailures();
  const lastTime = sorted.length > 0 ? sorted[sorted.length - 1].time : 0;
  const newTime = lastTime + (lastTime > 0 ? lastTime * 0.2 : 100);

  g.failures.push({
    id: genId(),
    time: Math.round(newTime * 10) / 10,
    failureMode: "",
  });
  save();
  renderFailureTable();
  updateParamsAndChart();
}

function deleteFailure(id) {
  const g = getGrowth();
  g.failures = g.failures.filter((f) => f.id !== id);
  save();
  renderFailureTable();
  updateParamsAndChart();
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
