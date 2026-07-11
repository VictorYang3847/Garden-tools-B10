import { html, render as litRender } from 'lit-html';
import {
  defaultAnalysisBatch,
  weibullCdf,
  exponentialCdf,
  lognormalCdf,
  fitDistribution,
  gammaApprox,
} from "../calculator.js";
import { genId, getHomeB10 } from "../store.js";
import { fmt, pct, toast } from "../utils.js";

let currentModel = null;
let onSaveCallback = null;
let activeTab = "data-entry";
let activeBatchId = null;
let analysisMode = "merged"; // "merged" | "batch"

const PART_LABELS = {
  product: "整机",
  motor: "电机",
  battery: "电池包",
  gearbox: "齿轮箱/传动",
  blade: "刀片组件",
  bearing: "轴承",
};

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;
  ensureLifeData();

  // 使用 lit-html 渲染主模板
  litRender(html`
    <div class="module-page life-data-page">
      <div class="module-header">
        <h2>寿命数据分析</h2>
        <p>基于 Weibull、指数分布、对数正态分布的寿命数据分析与 B10 寿命计算</p>
      </div>
      <div class="module-content">
        <div class="life-data-toolbar">
          <div class="life-data-tabs">
            <button type="button" class="life-data-tab active" data-tab="data-entry">数据录入</button>
            <button type="button" class="life-data-tab" data-tab="analysis">结果分析</button>
            <button type="button" class="life-data-tab" data-tab="weakness">短板分析</button>
          </div>
        </div>

        ${renderDataEntryTabContent()}

        ${renderAnalysisTabContent()}

        ${renderWeaknessTabContent()}
      </div>
    </div>
  `, container);

  bindEvents();
  renderDataEntryTab();
  renderAnalysisTab();
  switchTab(activeTab);
}

function renderDataEntryTabContent() {
  return html`
    <div class="life-data-tab-content" id="life-tab-data-entry">
      <div class="card">
        <div class="card-header">
          <h3>试验批次管理</h3>
          <div class="card-actions">
            <button type="button" class="btn-icon" id="ld-new-batch">
              <span>➕</span>
              <span class="btn-text">新建批次</span>
            </button>
            <button type="button" class="btn-icon" id="ld-import">
              <span>📥</span>
              <span class="btn-text">导入 CSV</span>
            </button>
            <input type="file" id="ld-import-file" accept=".csv" hidden />
            <button type="button" class="btn-icon" id="ld-download-template">
              <span>📄</span>
              <span class="btn-text">下载模板</span>
            </button>
            <button type="button" class="btn-icon btn-danger" id="ld-batch-delete">
              <span>🗑️</span>
              <span class="btn-text">删除批次</span>
            </button>
          </div>
        </div>
        <div class="card-body">
          <div class="batch-tabs" id="ld-batch-tabs"></div>
          <div id="ld-batch-detail-section" style="display: none;">
            <div class="form-row">
              <div class="form-group">
                <label>批次名称</label>
                <input type="text" id="ld-batch-name" class="form-input" />
              </div>
              <div class="form-group">
                <label>测试对象</label>
                <select id="ld-batch-part" class="form-input">
                  <option value="product">整机</option>
                  <option value="motor">电机</option>
                  <option value="battery">电池包</option>
                  <option value="gearbox">齿轮箱/传动</option>
                  <option value="blade">刀片组件</option>
                  <option value="bearing">轴承</option>
                </select>
              </div>
              <div class="form-group">
                <label>开始日期</label>
                <input type="date" id="ld-batch-date" class="form-input" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group full-width">
                <label>备注</label>
                <textarea id="ld-batch-note" class="form-input" rows="2"></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" id="ld-batch-items-section" style="display: none;">
        <div class="card-header">
          <h3>试验数据</h3>
          <div class="card-actions">
            <button type="button" class="btn-icon" id="ld-add-item">
              <span>➕</span>
              <span class="btn-text">添加样本</span>
            </button>
          </div>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 50px;">序号</th>
                  <th style="width: 120px;">时间 (h)</th>
                  <th style="width: 120px;">状态</th>
                  <th style="width: 150px;">零件</th>
                  <th style="min-width: 150px;">失效模式</th>
                  <th style="min-width: 180px;">备注</th>
                  <th style="width: 70px;">操作</th>
                </tr>
              </thead>
              <tbody id="ld-items-tbody"></tbody>
            </table>
          </div>
          <div class="empty-state" id="ld-items-empty" style="display: none;">
            <div class="empty-icon">📊</div>
            <h3>暂无试验数据</h3>
            <p>点击「添加样本」按钮开始录入试验数据。</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAnalysisTabContent() {
  return html`
    <div class="life-data-tab-content" id="life-tab-analysis" style="display: none;">
      <div class="card">
        <div class="card-header">
          <h3>分析配置</h3>
        </div>
        <div class="card-body">
          <!-- 模式切换 + 分布类型 + 方法选择（紧凑同一行） -->
          <div class="form-row">
            <div class="form-group">
              <label>查看模式</label>
              <div class="segmented-control" id="ld-mode-segmented">
                <button type="button" class="segmented-btn active" data-mode="merged">合并</button>
                <button type="button" class="segmented-btn" data-mode="batch">分轮</button>
              </div>
            </div>
            <div class="form-group">
              <label>分布类型</label>
              <select id="ld-distribution" class="form-input">
                <option value="weibull">Weibull 分布</option>
                <option value="exponential">指数分布</option>
                <option value="lognormal">对数正态分布</option>
              </select>
            </div>
            <div class="form-group">
              <label>参数估计方法</label>
              <select id="ld-method" class="form-input">
                <option value="rrx">RRX (X方向秩回归)</option>
                <option value="rry">RRY (Y方向秩回归)</option>
                <option value="mle">MLE (最大似然估计)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div id="ld-merged-results">
        <div class="card">
          <div class="card-header">
            <h3>拟合结果</h3>
          </div>
          <div class="card-body">
            <div class="metrics-grid" id="ld-fit-metrics">
              <div class="metric-card">
                <div class="metric-label">样本总数</div>
                <div class="metric-value" id="ld-total-samples">—</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">失效数</div>
                <div class="metric-value" id="ld-failure-count">—</div>
              </div>
              <div class="metric-card" id="ld-metric-censored" style="display: none;">
                <div class="metric-label">右删失数<span class="help-icon" data-tooltip="试验结束时仍未失效的样品，只知道寿命大于某个值">?</span></div>
                <div class="metric-value" id="ld-censored-count">—</div>
              </div>
              <div class="metric-card" id="ld-metric-beta">
                <div class="metric-label">形状参数 β<span class="help-icon" data-tooltip="β<1早期失效，β≈1偶然失效，β>1磨损失效。电动工具典型值2.0~2.5">?</span></div>
                <div class="metric-value" id="ld-beta">—</div>
              </div>
              <div class="metric-card" id="ld-metric-eta">
                <div class="metric-label">特征寿命 η<span class="help-icon" data-tooltip="可靠度为36.8%时的寿命时间，代表整体寿命量级">?</span></div>
                <div class="metric-value" id="ld-eta">—</div>
                <div class="metric-unit">h</div>
              </div>
              <div class="metric-card" id="ld-metric-lambda" style="display: none;">
                <div class="metric-label">失效率 λ</div>
                <div class="metric-value" id="ld-lambda">—</div>
                <div class="metric-unit">/h</div>
              </div>
              <div class="metric-card" id="ld-metric-mu" style="display: none;">
                <div class="metric-label">对数均值 μ</div>
                <div class="metric-value" id="ld-mu">—</div>
              </div>
              <div class="metric-card" id="ld-metric-sigma" style="display: none;">
                <div class="metric-label">对数标准差 σ</div>
                <div class="metric-value" id="ld-sigma">—</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">B10 寿命</div>
                <div class="metric-value" id="ld-b10">—</div>
                <div class="metric-unit">h</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">B50 寿命</div>
                <div class="metric-value" id="ld-b50">—</div>
                <div class="metric-unit">h</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">拟合优度 R²</div>
                <div class="metric-value" id="ld-r2">—</div>
              </div>
            </div>
            <div class="metrics-grid" id="ld-target-comparison" style="margin-top: 1rem;">
              <div class="metric-card">
                <div class="metric-label">目标 B10</div>
                <div class="metric-value" id="ld-target-b10">—</div>
                <div class="metric-unit">h</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">验证结果</div>
                <div class="metric-value" id="ld-result-pass">—</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">差距</div>
                <div class="metric-value" id="ld-result-gap-analysis">—</div>
                <div class="metric-unit">h</div>
              </div>
            </div>
            <div class="formula-section">
              <button type="button" class="formula-toggle" id="ld-formula-toggle">📐 查看计算公式</button>
              <div class="formula-content" id="ld-formula-content" style="display: none;">
                <div class="formula-item">
                  <h4>威布尔可靠度公式</h4>
                  <div class="formula-equation">R(t) = exp(-(t/η)<sup>β</sup>)</div>
                  <div class="formula-vars">
                    <div class="var-row"><span class="var-name">R(t)</span><span class="var-desc">时刻 t 的可靠度</span></div>
                    <div class="var-row"><span class="var-name">t</span><span class="var-desc">时间（小时）</span></div>
                    <div class="var-row"><span class="var-name">η</span><span class="var-desc">特征寿命（尺度参数）</span></div>
                    <div class="var-row"><span class="var-name">β</span><span class="var-desc">形状参数</span></div>
                  </div>
                </div>
                <div class="formula-item">
                  <h4>B10 寿命公式</h4>
                  <div class="formula-equation">B10 = η × [-ln(0.9)]<sup>1/β</sup></div>
                  <div class="formula-note">可靠度为90%时对应的寿命，即10%产品失效的时间</div>
                </div>
                <div class="formula-item">
                  <h4>MTBF 公式</h4>
                  <div class="formula-equation">MTBF = η × Γ(1 + 1/β)</div>
                  <div class="formula-note">平均失效前时间，Γ为伽马函数</div>
                </div>
                <div class="formula-item">
                  <h4>失效率公式</h4>
                  <div class="formula-equation">h(t) = (β/η) × (t/η)<sup>β-1</sup></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>指定时长可靠度计算器</h3>
          </div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group">
                <label>时间 t <span class="hint">(小时)</span></label>
                <div style="display: flex; gap: 0.75rem; align-items: center;">
                  <input type="number" id="ld-reliability-time" class="form-input" min="0" step="1" value="40" style="max-width: 180px;" />
                  <span class="hint" id="ld-reliability-warranty-label">质保期</span>
                </div>
              </div>
            </div>
            <div class="metrics-grid" style="margin-top: 1rem;">
              <div class="metric-card">
                <div class="metric-label">可靠度 R(t)</div>
                <div class="metric-value" id="ld-reliability-value">—</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">失效率 F(t)</div>
                <div class="metric-value" id="ld-failure-rate-value">—</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">质保期失效率</div>
                <div class="metric-value" id="ld-warranty-failure-rate">—</div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>概率图 (P-P 图)</h3>
          </div>
          <div class="card-body">
            <canvas id="ld-pp-canvas" width="700" height="400"></canvas>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>累积分布函数 (CDF)</h3>
          </div>
          <div class="card-body">
            <canvas id="ld-cdf-canvas" width="700" height="400"></canvas>
          </div>
        </div>
      </div>

      <div id="ld-batch-results" class="ld-batch-results-container"></div>
    </div>
  `;
}

function renderWeaknessTabContent() {
  return html`
    <div class="life-data-tab-content" id="life-tab-weakness" style="display: none;">
      <div class="card">
        <div class="card-header">
          <h3>批次选择</h3>
        </div>
        <div class="card-body">
          <div class="batch-tabs" id="ld-weakness-batch-tabs"></div>
        </div>
      </div>

      <div class="card weakness-core-card" id="ld-weakness-core-card" style="display: none;">
        <div class="card-header">
          <h3>🔴 核心短板识别</h3>
        </div>
        <div class="card-body">
          <div class="weakness-core-content">
            <div class="weakness-core-mode" id="ld-weakness-core-mode">—</div>
            <div class="weakness-core-metrics">
              <div class="metric-card weakness-highlight">
                <div class="metric-label">B10 寿命</div>
                <div class="metric-value" id="ld-weakness-core-b10">—</div>
                <div class="metric-unit">h</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">失效占比</div>
                <div class="metric-value" id="ld-weakness-core-pct">—</div>
                <div class="metric-unit">%</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">失效数</div>
                <div class="metric-value" id="ld-weakness-core-count">—</div>
              </div>
            </div>
            <div class="weakness-suggestion">
              <span class="suggestion-icon">💡</span>
              <span id="ld-weakness-suggestion">建议针对该失效模式优先优化，可显著提升整机寿命</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card" id="ld-weakness-table-card" style="display: none;">
        <div class="card-header">
          <h3>拟合参数对比</h3>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table class="data-table weakness-table">
              <thead>
                <tr>
                  <th style="min-width: 200px;">失效模式</th>
                  <th style="width: 90px;">样本数</th>
                  <th style="width: 90px;">失效数</th>
                  <th style="width: 90px;">β</th>
                  <th style="width: 110px;">η (h)</th>
                  <th style="width: 110px;">B10 (h)</th>
                  <th style="width: 110px;">MTBF (h)</th>
                </tr>
              </thead>
              <tbody id="ld-weakness-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card" id="ld-weakness-charts-card" style="display: none;">
        <div class="card-header">
          <h3>图表分析</h3>
        </div>
        <div class="card-body">
          <div class="weakness-charts-row">
            <div class="weakness-chart-col">
              <h4 class="chart-title">B10 寿命对比</h4>
              <div class="chart-container">
                <canvas id="ld-weakness-bar-canvas" width="500" height="350"></canvas>
              </div>
            </div>
            <div class="weakness-chart-col">
              <h4 class="chart-title">失效模式占比</h4>
              <div class="chart-container">
                <canvas id="ld-weakness-pie-canvas" width="500" height="350"></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" id="ld-weakness-empty-card">
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-icon">📊</div>
            <h3>数据不足，无法进行短板分析</h3>
            <p>请确保当前批次有至少2种失效模式，且每种失效模式至少有2个失效样本。</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function ensureLifeData() {
  if (!currentModel.modules) currentModel.modules = {};
  if (!currentModel.modules.lifeData) {
    currentModel.modules.lifeData = {
      batches: [],
      activeBatchId: null,
      analysisConfig: { distribution: "weibull", method: "rrx", analysisMode: "merged", selectedBatchId: null },
    };
  }
  const ld = currentModel.modules.lifeData;
  // 保留已有的 definition 数据（向后兼容），但不再主动初始化
  // 产品信息相关参数现在从 model.homeCalc 获取
  if (!ld.batches) ld.batches = [];
  if (!ld.analysisConfig) ld.analysisConfig = { distribution: "weibull", method: "rrx", analysisMode: "merged", selectedBatchId: null };
  activeBatchId = ld.activeBatchId || ld.batches[0]?.id || null;
  // 同步analysisMode状态
  analysisMode = ld.analysisConfig.analysisMode || "merged";
}

function save() {
  if (!onSaveCallback || !currentModel) return;
  onSaveCallback(currentModel);
}

function autoSave() {
  save();
}

function bindEvents() {
  const toolbar = document.querySelector(".life-data-toolbar");
  if (toolbar) {
    toolbar.addEventListener("click", (e) => {
      const tab = e.target.closest(".life-data-tab");
      if (!tab) return;
      switchTab(tab.dataset.tab);
    });
  }

  bindDataEntryEvents();
  bindAnalysisEvents();
  bindWeaknessEvents();
}

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll(".life-data-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
  document.querySelectorAll(".life-data-tab-content").forEach((c) => {
    c.style.display = "none";
  });
  const tabEl = document.getElementById(`life-tab-${tabName}`);
  if (tabEl) tabEl.style.display = "";

  if (tabName === "analysis") {
    updateAnalysisResults();
  } else if (tabName === "weakness") {
    updateWeaknessAnalysis();
  }
}

// Definition-related functions removed - product definition now handled elsewhere

function bindDataEntryEvents() {
  const newBatchBtn = document.getElementById("ld-new-batch");
  const importBtn = document.getElementById("ld-import");
  const importFile = document.getElementById("ld-import-file");
  const downloadTemplateBtn = document.getElementById("ld-download-template");
  const addItemBtn = document.getElementById("ld-add-item");
  const deleteBatchBtn = document.getElementById("ld-batch-delete");
  const batchTabs = document.getElementById("ld-batch-tabs");
  const itemsTbody = document.getElementById("ld-items-tbody");

  if (newBatchBtn) newBatchBtn.addEventListener("click", newBatch);
  if (importBtn) importBtn.addEventListener("click", () => importFile?.click());
  if (importFile) importFile.addEventListener("change", importCsv);
  if (downloadTemplateBtn) downloadTemplateBtn.addEventListener("click", downloadCsvTemplate);
  if (addItemBtn) addItemBtn.addEventListener("click", addItem);
  if (deleteBatchBtn) deleteBatchBtn.addEventListener("click", deleteBatch);

  ["ld-batch-name", "ld-batch-part", "ld-batch-date", "ld-batch-note"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", updateBatchFromForm);
  });

  if (batchTabs) {
    batchTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".batch-tab");
      if (!tab) return;
      activeBatchId = tab.dataset.id;
      currentModel.modules.lifeData.activeBatchId = activeBatchId;
      saveAndRefreshDataEntry();
    });
  }

  if (itemsTbody) {
    itemsTbody.addEventListener("change", (e) => {
      const el = e.target.closest("[data-field]");
      if (!el) return;
      const tr = el.closest("tr");
      const id = tr.dataset.id;
      const batch = getActiveBatch();
      if (!batch) return;
      const item = batch.items.find((i) => i.id === id);
      if (!item) return;
      let val = el.value;
      const field = el.dataset.field;
      if (field === "time") val = Number(val) || 0;
      if (field === "failed") val = val === "true";
      item[field] = val;
      autoSave();
    });

    itemsTbody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action='delete']");
      if (!btn) return;
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const batch = getActiveBatch();
      if (!batch) return;
      batch.items = batch.items.filter((i) => i.id !== id);
      saveAndRefreshDataEntry();
    });
  }
}

function getActiveBatch() {
  const batches = currentModel.modules.lifeData.batches;
  return batches.find((b) => b.id === activeBatchId) || null;
}

function newBatch() {
  const ld = currentModel.modules.lifeData;
  const num = ld.batches.length + 1;
  const batch = defaultAnalysisBatch(`试验批次 ${num}`);
  ld.batches.push(batch);
  activeBatchId = batch.id;
  ld.activeBatchId = batch.id;
  saveAndRefreshDataEntry();
}

function deleteBatch() {
  if (!activeBatchId) return;
  if (!confirm("确定删除该试验批次？此操作不可恢复。")) return;
  const ld = currentModel.modules.lifeData;
  ld.batches = ld.batches.filter((b) => b.id !== activeBatchId);
  activeBatchId = ld.batches[0]?.id ?? null;
  ld.activeBatchId = activeBatchId;
  saveAndRefreshDataEntry();
}

function addItem() {
  const batch = getActiveBatch();
  if (!batch) return;
  batch.items.push({
    id: genId(),
    time: 0,
    failed: false,
    part: "product",
    failureMode: "",
    note: "",
  });
  saveAndRefreshDataEntry();
}

function downloadCsvTemplate() {
  const csv = [
    "time,failed,part,failureMode,note",
    "120,true,blade,磨损,示例：刀片在120小时失效",
    "150,true,gearbox,齿轮断裂,",
    "200,false,product,,示例：200小时未失效（截尾）",
    "180,true,bearing,轴承抱死,",
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "试验数据模板.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importCsv(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const lines = reader.result.split(/\r?\n/).filter((l) => l.trim());
      const items = [];
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        const time = Number(cols[headers.indexOf("time")] ?? cols[0]);
        const failedStr = (cols[headers.indexOf("failed")] ?? cols[1] ?? "").toLowerCase();
        const failed = ["1", "true", "是", "失效", "fail", "failure"].includes(failedStr);
        const part = cols[headers.indexOf("part")] ?? cols[2] ?? "product";
        const failureMode = cols[headers.indexOf("failuremode")] ?? cols[3] ?? "";
        const note = cols[headers.indexOf("note")] ?? cols[4] ?? "";
        if (isFinite(time) && time > 0) {
          items.push({ id: genId(), time, failed, part, failureMode, note });
        }
      }
      if (items.length === 0) {
        alert("未解析到有效数据，请检查 CSV 格式");
        return;
      }
      const ld = currentModel.modules.lifeData;
      const num = ld.batches.length + 1;
      const batch = defaultAnalysisBatch(`导入批次 ${num}`);
      batch.items = items;
      ld.batches.push(batch);
      activeBatchId = batch.id;
      ld.activeBatchId = batch.id;
      saveAndRefreshDataEntry();
      toast(document.getElementById("ld-import"), `导入 ${items.length} 条`, 1500);
    } catch (err) {
      alert("导入失败：" + err.message);
    }
    e.target.value = "";
  };
  reader.readAsText(file);
}

function updateBatchFromForm() {
  const batch = getActiveBatch();
  if (!batch) return;
  batch.name = document.getElementById("ld-batch-name").value;
  batch.part = document.getElementById("ld-batch-part").value;
  batch.startDate = document.getElementById("ld-batch-date").value;
  batch.note = document.getElementById("ld-batch-note").value;
  renderBatchTabs();
  autoSave();
}

function saveAndRefreshDataEntry() {
  autoSave();
  renderDataEntryTab();
}

function renderDataEntryTab() {
  const ld = currentModel.modules.lifeData;
  if (!activeBatchId || !ld.batches.find((b) => b.id === activeBatchId)) {
    activeBatchId = ld.batches[0]?.id ?? null;
    ld.activeBatchId = activeBatchId;
  }

  renderBatchTabs();
  renderBatchDetail();
}

function renderBatchTabs() {
  const container = document.getElementById("ld-batch-tabs");
  const batches = currentModel.modules.lifeData.batches;
  if (!container) return;
  if (batches.length === 0) {
    container.innerHTML = '<p class="hint" style="margin-top: 0.75rem;">暂无批次，点击「新建批次」开始录入试验数据。</p>';
    return;
  }
  container.innerHTML = batches
    .map(
      (b) => `
      <button type="button" class="batch-tab ${b.id === activeBatchId ? "active" : ""}" data-id="${b.id}">
        ${escapeHtml(b.name)}
        <span class="batch-count">${b.items.length} 条</span>
      </button>`
    )
    .join("");
}

function renderBatchDetail() {
  const batch = getActiveBatch();
  const hasBatch = !!batch;
  const detailSection = document.getElementById("ld-batch-detail-section");
  const itemsSection = document.getElementById("ld-batch-items-section");
  if (detailSection) detailSection.style.display = hasBatch ? "" : "none";
  if (itemsSection) itemsSection.style.display = hasBatch ? "" : "none";
  if (!batch) return;

  document.getElementById("ld-batch-name").value = batch.name;
  document.getElementById("ld-batch-part").value = batch.part;
  document.getElementById("ld-batch-date").value = batch.startDate;
  document.getElementById("ld-batch-note").value = batch.note || "";

  renderItemsTable(batch);
}

function renderItemsTable(batch) {
  const tbody = document.getElementById("ld-items-tbody");
  const empty = document.getElementById("ld-items-empty");
  if (!tbody) return;

  if (!batch.items || batch.items.length === 0) {
    litRender(html``, tbody);
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = batch.items
    .map((item, idx) => {
      const escaped = {
        part: escapeHtml(item.part || ""),
        failureMode: escapeHtml(item.failureMode || ""),
        note: escapeHtml(item.note || ""),
      };
      return `
      <tr data-id="${item.id}">
        <td>${idx + 1}</td>
        <td><input type="number" data-field="time" value="${item.time}" min="0" step="0.1" class="item-input" /></td>
        <td>
          <select data-field="failed" class="item-input">
            <option value="false" ${!item.failed ? "selected" : ""}>截尾/未失效</option>
            <option value="true" ${item.failed ? "selected" : ""}>失效</option>
          </select>
        </td>
        <td>
          <select data-field="part" class="item-input">
            ${Object.entries(PART_LABELS)
              .map(([k, v]) => `<option value="${k}" ${item.part === k ? "selected" : ""}>${v}</option>`)
              .join("")}
          </select>
        </td>
        <td><input type="text" data-field="failureMode" value="${escaped.failureMode}" class="item-input" placeholder="如：磨损、断裂…" /></td>
        <td><input type="text" data-field="note" value="${escaped.note}" class="item-input" placeholder="可选" /></td>
        <td><button type="button" data-action="delete" class="btn-sm btn-ghost" style="color: var(--danger);">删除</button></td>
      </tr>`;
    })
    .join("");
}

function bindAnalysisEvents() {
  const distSelect = document.getElementById("ld-distribution");
  const methodSelect = document.getElementById("ld-method");
  const reliabilityTimeInput = document.getElementById("ld-reliability-time");
  const formulaToggle = document.getElementById("ld-formula-toggle");
  const formulaContent = document.getElementById("ld-formula-content");
  const modeSegmented = document.getElementById("ld-mode-segmented");

  // 模式切换事件（segmented control）
  if (modeSegmented) {
    modeSegmented.addEventListener("click", (e) => {
      const btn = e.target.closest(".segmented-btn");
      if (!btn) return;
      const mode = btn.dataset.mode;
      if (!mode || mode === analysisMode) return;
      analysisMode = mode;
      currentModel.modules.lifeData.analysisConfig.analysisMode = mode;
      // 更新激活状态
      modeSegmented.querySelectorAll(".segmented-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      autoSave();
      updateAnalysisResults();
    });
  }

  if (distSelect) {
    distSelect.addEventListener("change", () => {
      currentModel.modules.lifeData.analysisConfig.distribution = distSelect.value;
      autoSave();
      updateAnalysisResults();
    });
  }
  if (methodSelect) {
    methodSelect.addEventListener("change", () => {
      currentModel.modules.lifeData.analysisConfig.method = methodSelect.value;
      autoSave();
      updateAnalysisResults();
    });
  }
  if (reliabilityTimeInput) {
    reliabilityTimeInput.addEventListener("input", () => {
      updateReliabilityCalculator();
    });
    reliabilityTimeInput.addEventListener("change", () => {
      updateReliabilityCalculator();
    });
  }
  if (formulaToggle && formulaContent) {
    formulaToggle.addEventListener("click", () => {
      const isHidden = formulaContent.style.display === "none";
      formulaContent.style.display = isHidden ? "" : "none";
      formulaToggle.textContent = isHidden ? "📐 收起公式" : "📐 查看计算公式";
    });
  }
}

function renderAnalysisTab() {
  const config = currentModel.modules.lifeData.analysisConfig;
  const distSelect = document.getElementById("ld-distribution");
  const methodSelect = document.getElementById("ld-method");
  const reliabilityTimeInput = document.getElementById("ld-reliability-time");
  const warrantyLabel = document.getElementById("ld-reliability-warranty-label");
  const modeSegmented = document.getElementById("ld-mode-segmented");

  if (distSelect) distSelect.value = config.distribution || "weibull";
  if (methodSelect) methodSelect.value = config.method || "rrx";

  // 设置模式切换状态（segmented control）
  analysisMode = config.analysisMode || "merged";
  if (modeSegmented) {
    modeSegmented.querySelectorAll(".segmented-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === analysisMode);
    });
  }

  // 从 model.homeCalc 获取质保期参数（首页共享数据）
  const homeCalc = currentModel?.homeCalc || {};
  const warrantyYears = homeCalc.warrantyYears || 0;
  const hoursPerYear = homeCalc.hoursPerYear || 0;
  const warrantyHours = warrantyYears * hoursPerYear;

  if (reliabilityTimeInput && warrantyHours > 0) {
    reliabilityTimeInput.value = warrantyHours;
  }
  if (warrantyLabel) {
    warrantyLabel.textContent = `质保期 (${warrantyYears}年 × ${hoursPerYear}h/年)`;
  }
}

function getTargetB10() {
  const b10 = getHomeB10(currentModel);
  return b10 > 0 ? b10 : null;
}

function getFailureAndCensoredTimes() {
  // 合并模式：汇总全部批次数据
  const batches = currentModel.modules.lifeData.batches;
  const failures = [];
  const censored = [];

  for (const batch of batches) {
    for (const item of batch.items || []) {
      if (item.time <= 0) continue;
      const failed = isItemFailed(item);
      if (failed) {
        failures.push(item.time);
      } else {
        censored.push(item.time);
      }
    }
  }
  return { failures, censored };
}

function getBatchFailureAndCensoredTimes(batchId) {
  // 分轮模式：返回单个批次的失效和截尾数据
  const batches = currentModel.modules.lifeData.batches;
  const batch = batches.find((b) => b.id === batchId);
  const failures = [];
  const censored = [];

  if (!batch) return { failures, censored };

  for (const item of batch.items || []) {
    if (item.time <= 0) continue;
    const failed = isItemFailed(item);
    if (failed) {
      failures.push(item.time);
    } else {
      censored.push(item.time);
    }
  }
  return { failures, censored };
}

function updateAnalysisResults() {
  const config = currentModel.modules.lifeData.analysisConfig;
  const targetB10 = getTargetB10();
  const mergedContainer = document.getElementById("ld-merged-results");
  const batchContainer = document.getElementById("ld-batch-results");

  if (analysisMode === "batch") {
    if (mergedContainer) mergedContainer.style.display = "none";
    if (batchContainer) batchContainer.style.display = "";
    renderBatchResults(config, targetB10);
  } else {
    if (mergedContainer) mergedContainer.style.display = "";
    if (batchContainer) batchContainer.style.display = "none";
    const { failures, censored } = getFailureAndCensoredTimes();
    const fit = fitDistribution(config.distribution, config.method, failures, censored);
    updateFitMetrics(fit, config.distribution, targetB10);
    updateReliabilityCalculator(fit, config.distribution);
    drawPPPlot(fit, config.distribution, "ld-pp-canvas");
    drawCdfPlot(fit, config.distribution, targetB10, "ld-cdf-canvas");
  }
}

function renderBatchResults(config, targetB10) {
  const container = document.getElementById("ld-batch-results");
  if (!container) return;

  const batches = currentModel.modules.lifeData.batches;
  if (batches.length === 0) {
    container.innerHTML =
      '<div class="card"><div class="card-body"><p class="hint" style="margin: 0;">暂无批次数据，请先在「数据录入」中添加批次。</p></div></div>';
    return;
  }

  container.innerHTML = batches.map((batch) => buildBatchResultHtml(batch)).join("");

  for (const batch of batches) {
    const { failures, censored } = getBatchFailureAndCensoredTimes(batch.id);
    const fit = fitDistribution(config.distribution, config.method, failures, censored);
    updateBatchFitMetrics(batch.id, fit, config.distribution, targetB10);

    const hasData = fit && fit.b10 != null;
    const plotsEl = document.getElementById(`ld-batch-plots-${batch.id}`);
    const emptyEl = document.getElementById(`ld-batch-empty-${batch.id}`);
    if (hasData) {
      if (plotsEl) plotsEl.style.display = "";
      if (emptyEl) emptyEl.style.display = "none";
      drawPPPlot(fit, config.distribution, `ld-pp-canvas-${batch.id}`);
      drawCdfPlot(fit, config.distribution, targetB10, `ld-cdf-canvas-${batch.id}`);
    } else {
      if (plotsEl) plotsEl.style.display = "none";
      if (emptyEl) emptyEl.style.display = "";
    }
  }
}

function buildBatchResultHtml(batch) {
  const id = batch.id;
  const name = escapeHtml(batch.name);
  const itemCount = (batch.items || []).length;
  return `
    <div class="card ld-batch-result-card" data-batch-id="${id}">
      <div class="card-header">
        <h3>${name}</h3>
        <span class="hint">${itemCount} 条数据</span>
      </div>
      <div class="card-body">
        <div class="metrics-grid" id="ld-batch-metrics-${id}">
          <div class="metric-card">
            <div class="metric-label">样本总数</div>
            <div class="metric-value" id="ld-batch-total-${id}">—</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">失效数</div>
            <div class="metric-value" id="ld-batch-failures-${id}">—</div>
          </div>
          <div class="metric-card" id="ld-batch-metric-censored-${id}" style="display: none;">
            <div class="metric-label">右删失数<span class="help-icon" data-tooltip="试验结束时仍未失效的样品，只知道寿命大于某个值">?</span></div>
            <div class="metric-value" id="ld-batch-censored-${id}">—</div>
          </div>
          <div class="metric-card" id="ld-batch-metric-beta-${id}">
            <div class="metric-label">形状参数 β<span class="help-icon" data-tooltip="β<1早期失效，β≈1偶然失效，β>1磨损失效。电动工具典型值2.0~2.5">?</span></div>
            <div class="metric-value" id="ld-batch-beta-${id}">—</div>
          </div>
          <div class="metric-card" id="ld-batch-metric-eta-${id}">
            <div class="metric-label">特征寿命 η<span class="help-icon" data-tooltip="可靠度为36.8%时的寿命时间，代表整体寿命量级">?</span></div>
            <div class="metric-value" id="ld-batch-eta-${id}">—</div>
            <div class="metric-unit">h</div>
          </div>
          <div class="metric-card" id="ld-batch-metric-lambda-${id}" style="display: none;">
            <div class="metric-label">失效率 λ</div>
            <div class="metric-value" id="ld-batch-lambda-${id}">—</div>
            <div class="metric-unit">/h</div>
          </div>
          <div class="metric-card" id="ld-batch-metric-mu-${id}" style="display: none;">
            <div class="metric-label">对数均值 μ</div>
            <div class="metric-value" id="ld-batch-mu-${id}">—</div>
          </div>
          <div class="metric-card" id="ld-batch-metric-sigma-${id}" style="display: none;">
            <div class="metric-label">对数标准差 σ</div>
            <div class="metric-value" id="ld-batch-sigma-${id}">—</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">B10 寿命</div>
            <div class="metric-value" id="ld-batch-b10-${id}">—</div>
            <div class="metric-unit">h</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">B50 寿命</div>
            <div class="metric-value" id="ld-batch-b50-${id}">—</div>
            <div class="metric-unit">h</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">拟合优度 R²</div>
            <div class="metric-value" id="ld-batch-r2-${id}">—</div>
          </div>
        </div>
        <div class="metrics-grid" style="margin-top: 1rem;">
          <div class="metric-card">
            <div class="metric-label">目标 B10</div>
            <div class="metric-value" id="ld-batch-target-${id}">—</div>
            <div class="metric-unit">h</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">验证结果</div>
            <div class="metric-value" id="ld-batch-pass-${id}">—</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">差距</div>
            <div class="metric-value" id="ld-batch-gap-${id}">—</div>
            <div class="metric-unit">h</div>
          </div>
        </div>
        <div class="empty-state" id="ld-batch-empty-${id}" style="display: none;">
          <div class="empty-icon">⚠️</div>
          <h3>数据不足</h3>
          <p>该批次失效数据不足（至少需要 2 个失效数据和 3 个总样本），无法拟合分布。</p>
        </div>
        <div class="ld-batch-plots" id="ld-batch-plots-${id}">
          <div class="ld-plot-block">
            <h4>概率图 (P-P 图)</h4>
            <canvas id="ld-pp-canvas-${id}" width="700" height="400"></canvas>
          </div>
          <div class="ld-plot-block">
            <h4>累积分布函数 (CDF)</h4>
            <canvas id="ld-cdf-canvas-${id}" width="700" height="400"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
}

function updateBatchFitMetrics(batchId, fit, distribution, targetB10) {
  const hasData = fit && fit.b10 != null;
  const get = (id) => document.getElementById(id);

  const totalEl = get(`ld-batch-total-${batchId}`);
  if (!totalEl) return;

  totalEl.textContent = hasData ? fit.totalCount : "—";
  get(`ld-batch-failures-${batchId}`).textContent = hasData ? fit.failureCount : "—";

  const censoredMetric = get(`ld-batch-metric-censored-${batchId}`);
  const censoredCount = hasData ? fit.totalCount - fit.failureCount : 0;
  if (censoredCount > 0) {
    censoredMetric.style.display = "";
    get(`ld-batch-censored-${batchId}`).textContent = censoredCount;
  } else {
    censoredMetric.style.display = "none";
  }

  get(`ld-batch-b10-${batchId}`).textContent = hasData ? fmt(fit.b10, 1) + " h" : "—";
  get(`ld-batch-b50-${batchId}`).textContent = hasData && fit.b50 != null ? fmt(fit.b50, 1) + " h" : "—";
  get(`ld-batch-r2-${batchId}`).textContent = hasData && fit.rSquared != null ? fmt(fit.rSquared, 3) : "—";

  const betaMetric = get(`ld-batch-metric-beta-${batchId}`);
  const etaMetric = get(`ld-batch-metric-eta-${batchId}`);
  const lambdaMetric = get(`ld-batch-metric-lambda-${batchId}`);
  const muMetric = get(`ld-batch-metric-mu-${batchId}`);
  const sigmaMetric = get(`ld-batch-metric-sigma-${batchId}`);

  if (distribution === "weibull") {
    betaMetric.style.display = "";
    etaMetric.style.display = "";
    lambdaMetric.style.display = "none";
    muMetric.style.display = "none";
    sigmaMetric.style.display = "none";
    get(`ld-batch-beta-${batchId}`).textContent = hasData ? fmt(fit.beta, 2) : "—";
    get(`ld-batch-eta-${batchId}`).textContent = hasData ? fmt(fit.eta, 0) + " h" : "—";
  } else if (distribution === "exponential") {
    betaMetric.style.display = "none";
    etaMetric.style.display = "none";
    lambdaMetric.style.display = "";
    muMetric.style.display = "none";
    sigmaMetric.style.display = "none";
    get(`ld-batch-lambda-${batchId}`).textContent = hasData ? fmt(fit.lambda * 1000, 4) + " ×10⁻³/h" : "—";
  } else if (distribution === "lognormal") {
    betaMetric.style.display = "none";
    etaMetric.style.display = "none";
    lambdaMetric.style.display = "none";
    muMetric.style.display = "";
    sigmaMetric.style.display = "";
    get(`ld-batch-mu-${batchId}`).textContent = hasData ? fmt(fit.mu, 2) : "—";
    get(`ld-batch-sigma-${batchId}`).textContent = hasData ? fmt(fit.sigma, 2) : "—";
  }

  get(`ld-batch-target-${batchId}`).textContent = targetB10 ? fmt(targetB10, 0) + " h" : "—";

  const passEl = get(`ld-batch-pass-${batchId}`);
  const gapEl = get(`ld-batch-gap-${batchId}`);
  if (hasData && targetB10) {
    const pass = fit.b10 >= targetB10;
    const gap = fit.b10 - targetB10;
    passEl.textContent = pass ? "通过 ✓" : "未通过 ✗";
    passEl.style.color = pass ? "var(--success)" : "var(--danger)";
    gapEl.textContent = fmt(gap, 1) + " h";
    gapEl.className = "metric-value " + (gap >= 0 ? "pass" : "fail");
  } else {
    passEl.textContent = "—";
    passEl.style.color = "";
    gapEl.textContent = "—";
    gapEl.className = "metric-value";
  }
}

function updateFitMetrics(fit, distribution, targetB10) {
  const hasData = fit && fit.b10 != null;

  document.getElementById("ld-total-samples").textContent = hasData ? fit.totalCount : "—";
  document.getElementById("ld-failure-count").textContent = hasData ? fit.failureCount : "—";

  const censoredMetric = document.getElementById("ld-metric-censored");
  const censoredCount = hasData ? fit.totalCount - fit.failureCount : 0;
  if (censoredCount > 0) {
    censoredMetric.style.display = "";
    document.getElementById("ld-censored-count").textContent = censoredCount;
  } else {
    censoredMetric.style.display = "none";
  }

  document.getElementById("ld-b10").textContent = hasData ? fmt(fit.b10, 1) + " h" : "—";
  document.getElementById("ld-b50").textContent = hasData && fit.b50 != null ? fmt(fit.b50, 1) + " h" : "—";
  document.getElementById("ld-r2").textContent = hasData && fit.rSquared != null ? fmt(fit.rSquared, 3) : "—";

  const betaMetric = document.getElementById("ld-metric-beta");
  const etaMetric = document.getElementById("ld-metric-eta");
  const lambdaMetric = document.getElementById("ld-metric-lambda");
  const muMetric = document.getElementById("ld-metric-mu");
  const sigmaMetric = document.getElementById("ld-metric-sigma");

  if (distribution === "weibull") {
    betaMetric.style.display = "";
    etaMetric.style.display = "";
    lambdaMetric.style.display = "none";
    muMetric.style.display = "none";
    sigmaMetric.style.display = "none";
    document.getElementById("ld-beta").textContent = hasData ? fmt(fit.beta, 2) : "—";
    document.getElementById("ld-eta").textContent = hasData ? fmt(fit.eta, 0) + " h" : "—";
  } else if (distribution === "exponential") {
    betaMetric.style.display = "none";
    etaMetric.style.display = "none";
    lambdaMetric.style.display = "";
    muMetric.style.display = "none";
    sigmaMetric.style.display = "none";
    document.getElementById("ld-lambda").textContent = hasData ? fmt(fit.lambda * 1000, 4) + " ×10⁻³/h" : "—";
  } else if (distribution === "lognormal") {
    betaMetric.style.display = "none";
    etaMetric.style.display = "none";
    lambdaMetric.style.display = "none";
    muMetric.style.display = "";
    sigmaMetric.style.display = "";
    document.getElementById("ld-mu").textContent = hasData ? fmt(fit.mu, 2) : "—";
    document.getElementById("ld-sigma").textContent = hasData ? fmt(fit.sigma, 2) : "—";
  }

  document.getElementById("ld-target-b10").textContent = targetB10 ? fmt(targetB10, 0) + " h" : "—";

  const passEl = document.getElementById("ld-result-pass");
  const gapEl = document.getElementById("ld-result-gap-analysis");
  if (hasData && targetB10) {
    const pass = fit.b10 >= targetB10;
    const gap = fit.b10 - targetB10;
    passEl.textContent = pass ? "通过 ✓" : "未通过 ✗";
    passEl.style.color = pass ? "var(--success)" : "var(--danger)";
    gapEl.textContent = fmt(gap, 1) + " h";
    gapEl.className = "metric-value " + (gap >= 0 ? "pass" : "fail");
  } else {
    passEl.textContent = "—";
    passEl.style.color = "";
    gapEl.textContent = "—";
    gapEl.className = "metric-value";
  }
}

function calculateReliability(t, fit, distribution) {
  if (!fit || t <= 0) return null;
  if (distribution === "weibull") {
    if (fit.eta == null || fit.beta == null) return null;
    return 1 - weibullCdf(t, fit.eta, fit.beta);
  } else if (distribution === "exponential") {
    if (fit.lambda == null) return null;
    return 1 - exponentialCdf(t, fit.lambda);
  } else if (distribution === "lognormal") {
    if (fit.mu == null || fit.sigma == null) return null;
    return 1 - lognormalCdf(t, fit.mu, fit.sigma);
  }
  return null;
}

function updateReliabilityCalculator(fitParam, distributionParam) {
  const config = currentModel.modules.lifeData.analysisConfig;
  const distribution = distributionParam || config.distribution || "weibull";

  let fit;
  if (fitParam) {
    fit = fitParam;
  } else {
    const { failures, censored } = getFailureAndCensoredTimes();
    fit = fitDistribution(distribution, config.method || "rrx", failures, censored);
  }

  const timeInput = document.getElementById("ld-reliability-time");
  const reliabilityEl = document.getElementById("ld-reliability-value");
  const failureRateEl = document.getElementById("ld-failure-rate-value");
  const warrantyFailureRateEl = document.getElementById("ld-warranty-failure-rate");

  if (!timeInput || !reliabilityEl || !failureRateEl || !warrantyFailureRateEl) return;

  const t = Number(timeInput.value) || 0;
  const hasData = fit && fit.b10 != null;

  if (!hasData || t <= 0) {
    reliabilityEl.textContent = "—";
    failureRateEl.textContent = "—";
    warrantyFailureRateEl.textContent = "—";
    return;
  }

  const reliability = calculateReliability(t, fit, distribution);
  if (reliability == null) {
    reliabilityEl.textContent = "—";
    failureRateEl.textContent = "—";
  } else {
    reliabilityEl.textContent = pct(reliability);
    failureRateEl.textContent = pct(1 - reliability);
  }

  // 从 model.homeCalc 获取质保期参数（首页共享数据）
  const homeCalc = currentModel?.homeCalc || {};
  const warrantyYears = homeCalc.warrantyYears || 0;
  const hoursPerYear = homeCalc.hoursPerYear || 0;
  const warrantyHours = warrantyYears * hoursPerYear;

  if (warrantyHours > 0) {
    const warrantyReliability = calculateReliability(warrantyHours, fit, distribution);
    if (warrantyReliability != null) {
      warrantyFailureRateEl.textContent = pct(1 - warrantyReliability);
    } else {
      warrantyFailureRateEl.textContent = "—";
    }
  } else {
    warrantyFailureRateEl.textContent = "—";
  }
}

function drawPPPlot(fit, distribution, canvasOrId) {
  const canvas = typeof canvasOrId === "string" ? document.getElementById(canvasOrId) : canvasOrId;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const padL = 60,
    padR = 20,
    padT = 20,
    padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(padL, padT, plotW, plotH);

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, plotW, plotH);

  if (!fit || !fit.points || fit.points.length < 2) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("数据不足，无法拟合", w / 2, h / 2);
    return;
  }

  const points = fit.points;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs) - 0.5;
  const xMax = Math.max(...xs) + 0.5;
  const yMin = Math.min(...ys) - 0.5;
  const yMax = Math.max(...ys) + 0.5;

  const xScale = (x) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
  const yScale = (y) => padT + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 0.5;
  for (let i = 1; i <= 5; i++) {
    const x = padL + (plotW / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
  }
  for (let i = 1; i <= 4; i++) {
    const y = padT + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i <= 5; i++) {
    const xVal = xMin + ((xMax - xMin) / 5) * i;
    let label;
    if (distribution === "exponential") {
      label = fmt(xVal, 0);
    } else {
      label = fmt(Math.exp(xVal), 0);
    }
    ctx.fillText(label, padL + (plotW / 5) * i, padT + plotH + 15);
  }
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const yVal = yMin + ((yMax - yMin) / 4) * i;
    let pctVal;
    if (distribution === "weibull") {
      pctVal = (1 - Math.exp(-Math.exp(yVal))) * 100;
    } else if (distribution === "exponential") {
      pctVal = (1 - Math.exp(-yVal)) * 100;
    } else {
      pctVal = normCdfApprox(yVal) * 100;
    }
    ctx.fillText(fmt(pctVal, 1) + "%", padL - 5, padT + plotH - (plotH / 4) * i + 4);
  }

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (distribution === "weibull") {
    const xStart = xMin;
    const xEnd = xMax;
    const yStart = fit.beta * xStart - fit.beta * Math.log(fit.eta);
    const yEnd = fit.beta * xEnd - fit.beta * Math.log(fit.eta);
    ctx.moveTo(xScale(xStart), yScale(yStart));
    ctx.lineTo(xScale(xEnd), yScale(yEnd));
  } else if (distribution === "exponential") {
    const xStart = xMin;
    const xEnd = xMax;
    const yStart = fit.lambda * xStart;
    const yEnd = fit.lambda * xEnd;
    ctx.moveTo(xScale(xStart), yScale(yStart));
    ctx.lineTo(xScale(xEnd), yScale(yEnd));
  } else if (distribution === "lognormal") {
    const xStart = xMin;
    const xEnd = xMax;
    const yStart = (xStart - fit.mu) / fit.sigma;
    const yEnd = (xEnd - fit.mu) / fit.sigma;
    ctx.moveTo(xScale(xStart), yScale(yStart));
    ctx.lineTo(xScale(xEnd), yScale(yEnd));
  }
  ctx.stroke();

  ctx.fillStyle = "#4ade80";
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 1;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(xScale(p.x), yScale(p.y), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  const xLabel = distribution === "exponential" ? "失效时间 (h)" : "失效时间 (h)";
  ctx.fillText(xLabel, w / 2, h - 5);
  ctx.save();
  ctx.translate(15, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("累积失效概率", 0, 0);
  ctx.restore();
}

function drawCdfPlot(fit, distribution, targetB10, canvasOrId) {
  const canvas = typeof canvasOrId === "string" ? document.getElementById(canvasOrId) : canvasOrId;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const padL = 60,
    padR = 20,
    padT = 20,
    padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(padL, padT, plotW, plotH);

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, plotW, plotH);

  if (!fit || !fit.b10) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("数据不足，无法拟合", w / 2, h / 2);
    return;
  }

  let tMax;
  if (distribution === "weibull") {
    tMax = fit.eta * 2;
  } else if (distribution === "exponential") {
    tMax = fit.b10 * 5;
  } else {
    tMax = fit.b50 ? fit.b50 * 2 : fit.b10 * 5;
  }
  const tMin = 0;

  const xScale = (t) => padL + ((t - tMin) / (tMax - tMin)) * plotW;
  const yScale = (p) => padT + plotH - p * plotH;

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 0.5;
  for (let i = 1; i <= 5; i++) {
    const x = padL + (plotW / 5) * i;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    const y = padT + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i <= 5; i++) {
    const tVal = tMin + ((tMax - tMin) / 5) * i;
    ctx.fillText(fmt(tVal, 0), padL + (plotW / 5) * i, padT + plotH + 15);
  }
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const pVal = i / 4;
    ctx.fillText(fmt(pVal * 100, 0) + "%", padL - 5, padT + plotH - (plotH / 4) * i + 4);
  }

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let first = true;
  for (let i = 0; i <= 100; i++) {
    const t = tMin + ((tMax - tMin) / 100) * i;
    let p;
    if (distribution === "weibull") {
      p = weibullCdf(t, fit.eta, fit.beta);
    } else if (distribution === "exponential") {
      p = exponentialCdf(t, fit.lambda);
    } else {
      p = lognormalCdf(t, fit.mu, fit.sigma);
    }
    if (first) {
      ctx.moveTo(xScale(t), yScale(p));
      first = false;
    } else {
      ctx.lineTo(xScale(t), yScale(p));
    }
  }
  ctx.stroke();

  if (targetB10 && targetB10 > 0) {
    ctx.strokeStyle = "#f87171";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    if (targetB10 <= tMax) {
      ctx.beginPath();
      ctx.moveTo(xScale(targetB10), padT);
      ctx.lineTo(xScale(targetB10), yScale(0.1));
      ctx.lineTo(padL + plotW, yScale(0.1));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "#f87171";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    if (targetB10 <= tMax) {
      ctx.fillText(`目标 B10: ${fmt(targetB10, 0)}h`, xScale(targetB10) + 5, yScale(0.1) - 5);
    }
  }

  if (fit.points) {
    ctx.fillStyle = "#4ade80";
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1;
    for (const p of fit.points) {
      if (p.t <= tMax) {
        ctx.beginPath();
        ctx.arc(xScale(p.t), yScale(p.rank), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("时间 (h)", w / 2, h - 5);
  ctx.save();
  ctx.translate(15, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("累积失效概率 F(t)", 0, 0);
  ctx.restore();
}

function normCdfApprox(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isItemFailed(item) {
  if (item.failed != null) return item.failed === true;
  if (item.status != null) return item.status === "failed";
  return false;
}

// ===== 短板分析（竞争失效）=====

function bindWeaknessEvents() {
  const batchTabs = document.getElementById("ld-weakness-batch-tabs");
  if (batchTabs) {
    batchTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".batch-tab");
      if (!tab) return;
      activeBatchId = tab.dataset.id;
      currentModel.modules.lifeData.activeBatchId = activeBatchId;
      save();
      renderWeaknessBatchTabs();
      updateWeaknessAnalysis();
    });
  }
}

function renderWeaknessBatchTabs() {
  const container = document.getElementById("ld-weakness-batch-tabs");
  const batches = currentModel.modules.lifeData.batches;
  if (!container) return;
  if (batches.length === 0) {
    container.innerHTML = '<p class="hint" style="margin-top: 0.75rem;">暂无批次数据</p>';
    return;
  }
  container.innerHTML = batches
    .map(
      (b) => `
      <button type="button" class="batch-tab ${b.id === activeBatchId ? "active" : ""}" data-id="${b.id}">
        ${escapeHtml(b.name)}
        <span class="batch-count">${b.items?.length || 0} 条</span>
      </button>`
    )
    .join("");
}

function getWeaknessBatchData() {
  const batch = getActiveBatch();
  if (!batch || !batch.items || batch.items.length === 0) return null;

  const failureModeGroups = {};
  let totalFailures = 0;
  let totalSamples = 0;

  for (const item of batch.items) {
    if (item.time <= 0) continue;
    totalSamples++;
    const failed = isItemFailed(item);
    if (!failed) continue;

    // 优先使用失效模式；若未填写，按测试对象（part）兜底分组
    const mode = (item.failureMode && item.failureMode.trim())
      ? item.failureMode.trim()
      : (PART_LABELS[item.part] || item.part || "未分类");

    if (!failureModeGroups[mode]) {
      failureModeGroups[mode] = { failures: [], failureCount: 0 };
    }
    failureModeGroups[mode].failures.push(item.time);
    failureModeGroups[mode].failureCount++;
    totalFailures++;
  }

  const results = [];
  for (const [mode, group] of Object.entries(failureModeGroups)) {
    if (group.failures.length < 2) {
      results.push({
        mode,
        failureCount: group.failures.length,
        totalCount: group.failures.length,
        b10: null,
        beta: null,
        eta: null,
        mtbf: null,
        sufficient: false,
        note: "样本不足",
      });
      continue;
    }

    const estTotal = totalFailures > 0 ? Math.round((group.failures.length / totalFailures) * totalSamples) : group.failures.length;
    const censoredCount = Math.max(0, estTotal - group.failures.length);
    const maxTime = Math.max(...batch.items.filter((i) => i.time > 0).map((i) => i.time));
    const censoredTimes = [];
    for (let i = 0; i < censoredCount; i++) {
      censoredTimes.push(maxTime);
    }

    const fit = fitDistribution("weibull", "rrx", group.failures, censoredTimes);

    let mtbf = null;
    if (fit && fit.eta && fit.beta) {
      const gamma = 1 + 1 / fit.beta;
      mtbf = fit.eta * gammaApprox(gamma);
    }

    results.push({
      mode,
      failureCount: group.failures.length,
      totalCount: estTotal,
      b10: fit?.b10 ?? null,
      beta: fit?.beta ?? null,
      eta: fit?.eta ?? null,
      mtbf,
      rSquared: fit?.rSquared ?? null,
      sufficient: true,
      fit,
      note: "已拟合",
    });
  }

  results.sort((a, b) => {
    if (a.b10 == null && b.b10 == null) return 0;
    if (a.b10 == null) return 1;
    if (b.b10 == null) return -1;
    return a.b10 - b.b10;
  });

  return { results, totalFailures, totalSamples, batch };
}

function updateWeaknessAnalysis() {
  renderWeaknessBatchTabs();

  const data = getWeaknessBatchData();
  const coreCard = document.getElementById("ld-weakness-core-card");
  const tableCard = document.getElementById("ld-weakness-table-card");
  const chartsCard = document.getElementById("ld-weakness-charts-card");
  const emptyCard = document.getElementById("ld-weakness-empty-card");

  // 调试日志，方便排查数据问题
  console.log("[weakness] updateWeaknessAnalysis", {
    activeBatchId,
    batchName: data?.batch?.name,
    totalItems: data?.batch?.items?.length,
    resultsCount: data?.results?.length,
    sufficientCount: data?.results?.filter((r) => r.sufficient).length,
  });

  if (!data || data.results.length === 0) {
    if (coreCard) coreCard.style.display = "none";
    if (tableCard) tableCard.style.display = "none";
    if (chartsCard) chartsCard.style.display = "none";
    if (emptyCard) emptyCard.style.display = "";
    return;
  }

  const validResults = data.results.filter((r) => r.sufficient);

  // 有失效数据就显示表格，哪怕不足以做 Weibull 拟合
  if (emptyCard) emptyCard.style.display = "none";
  if (tableCard) tableCard.style.display = "";
  renderWeaknessTable(data.results);

  if (validResults.length === 0) {
    if (coreCard) coreCard.style.display = "none";
    if (chartsCard) chartsCard.style.display = "none";
    return;
  }

  if (coreCard) coreCard.style.display = "";
  if (chartsCard) chartsCard.style.display = "";

  const coreWeakness = validResults[0];
  const corePct = data.totalFailures > 0 ? (coreWeakness.failureCount / data.totalFailures) * 100 : 0;

  const coreModeEl = document.getElementById("ld-weakness-core-mode");
  if (coreModeEl) coreModeEl.textContent = coreWeakness.mode;
  const coreB10El = document.getElementById("ld-weakness-core-b10");
  if (coreB10El) coreB10El.textContent = fmt(coreWeakness.b10, 1);
  const corePctEl = document.getElementById("ld-weakness-core-pct");
  if (corePctEl) corePctEl.textContent = fmt(corePct, 1);
  const coreCountEl = document.getElementById("ld-weakness-core-count");
  if (coreCountEl) coreCountEl.textContent = coreWeakness.failureCount;

  drawWeaknessBarChart(validResults);
  drawWeaknessPieChart(data.results, data.totalFailures);
}

function renderWeaknessTable(results) {
  const tbody = document.getElementById("ld-weakness-tbody");
  if (!tbody) return;

  tbody.innerHTML = results
    .map((r) => {
      const isWeakest = r.sufficient && r.b10 != null && results[0]?.b10 === r.b10;
      return `
      <tr class="${isWeakest ? "weakness-row-highlight" : ""}">
        <td>${isWeakest ? "🔴 " : ""}${escapeHtml(r.mode)}</td>
        <td>${r.totalCount}</td>
        <td>${r.failureCount}</td>
        <td>${r.beta != null ? fmt(r.beta, 2) : "—"}</td>
        <td>${r.eta != null ? fmt(r.eta, 0) : "—"}</td>
        <td class="${r.sufficient ? "" : "text-muted"}">${r.b10 != null ? fmt(r.b10, 1) : "数据不足"}</td>
        <td>${r.mtbf != null ? fmt(r.mtbf, 0) : "—"}</td>
      </tr>`;
    })
    .join("");
}

const WEAKNESS_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

function drawWeaknessBarChart(data) {
  const canvas = document.getElementById("ld-weakness-bar-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const padL = 80,
    padR = 30,
    padT = 30,
    padB = 80;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(padL, padT, plotW, plotH);
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, plotW, plotH);

  if (!data || data.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("无有效数据", w / 2, h / 2);
    return;
  }

  const maxB10 = Math.max(...data.map((d) => d.b10 || 0)) * 1.2 || 100;
  const barCount = data.length;
  const barGap = 20;
  const barWidth = Math.min(80, (plotW - barGap * (barCount + 1)) / barCount);
  const xStart = padL + (plotW - (barWidth * barCount + barGap * (barCount - 1))) / 2;

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 0.5;
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = padT + (plotH / yTicks) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    const val = maxB10 - (maxB10 / yTicks) * i;
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(fmt(val, 0), padL - 8, y + 4);
  }

  for (let i = 0; i < barCount; i++) {
    const d = data[i];
    const x = xStart + i * (barWidth + barGap);
    const barH = (d.b10 / maxB10) * plotH;
    const y = padT + plotH - barH;
    const color = WEAKNESS_COLORS[i % WEAKNESS_COLORS.length];

    const gradient = ctx.createLinearGradient(0, y, 0, padT + plotH);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color + "66");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barH);

    ctx.fillStyle = "#f1f5f9";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(fmt(d.b10, 0) + "h", x + barWidth / 2, y - 6);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    const modeLabel = d.mode.length > 8 ? d.mode.slice(0, 8) + "..." : d.mode;
    ctx.save();
    ctx.translate(x + barWidth / 2, padT + plotH + 12);
    ctx.rotate(-Math.PI / 6);
    ctx.fillText(modeLabel, 0, 0);
    ctx.restore();
  }

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("B10 寿命 (小时)", w / 2, h - 8);
}

function drawWeaknessPieChart(data, totalFailures) {
  const canvas = document.getElementById("ld-weakness-pie-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const validData = data.filter((d) => d.failureCount > 0);
  const total = validData.reduce((sum, d) => sum + d.failureCount, 0);

  const cx = w * 0.4;
  const cy = h / 2;
  const radius = Math.min(w * 0.3, h * 0.35);

  if (validData.length === 0 || total === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("无失效数据", w / 2, h / 2);
    return;
  }

  let startAngle = -Math.PI / 2;

  for (let i = 0; i < validData.length; i++) {
    const d = validData[i];
    const sliceAngle = (d.failureCount / total) * Math.PI * 2;
    const color = WEAKNESS_COLORS[i % WEAKNESS_COLORS.length];

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.stroke();

    const midAngle = startAngle + sliceAngle / 2;
    const labelRadius = radius * 0.65;
    const lx = cx + Math.cos(midAngle) * labelRadius;
    const ly = cy + Math.sin(midAngle) * labelRadius;
    const pctVal = (d.failureCount / total) * 100;
    if (pctVal > 8) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(fmt(pctVal, 0) + "%", lx, ly + 4);
    }

    startAngle += sliceAngle;
  }

  const legendX = cx + radius + 40;
  let legendY = cy - radius + 10;
  const legendItemH = 26;

  for (let i = 0; i < validData.length; i++) {
    const d = validData[i];
    const color = WEAKNESS_COLORS[i % WEAKNESS_COLORS.length];

    ctx.fillStyle = color;
    ctx.fillRect(legendX, legendY, 14, 14);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    const modeLabel = d.mode.length > 12 ? d.mode.slice(0, 12) + "..." : d.mode;
    ctx.fillText(modeLabel, legendX + 22, legendY + 11);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.fillText(`${d.failureCount}个 (${fmt((d.failureCount / total) * 100, 1)}%)`, legendX + 22, legendY + 26);

    legendY += legendItemH + 8;
  }
}
