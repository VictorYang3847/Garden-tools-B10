import { html, render as litRender } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { genId, getHomeB10, getCurrentProduct, getProductShared } from "../store.js";
import { fmt, toast } from "../utils.js";
import { gammaApprox, K10 } from "../calculator.js";

let currentModel = null;
let onSaveCallback = null;
let activeTab = "sample-analysis";

const STRESS_TYPES = {
  temperature: "温度",
  humidity: "湿度",
  vibration: "振动",
  voltage: "电压",
  power: "功率",
};

const ACCEL_MODELS = {
  arrhenius: "Arrhenius",
  coffinManson: "Coffin-Manson",
  inversePower: "逆幂律",
  combined: "综合",
};

const HALT_STRESS_TYPES = {
  lowTemp: "低温",
  highTemp: "高温",
  tempCycle: "温度循环",
  vibration: "振动",
  combined: "综合",
};

const CENSOR_TYPES = {
  time: "定时截尾",
  failure: "定数截尾",
  complete: "完全失效",
};

const RESULT_STATUS = {
  not_started: "未开始",
  in_progress: "进行中",
  passed: "通过",
  failed: "失败",
};

function ensureTestPlan() {
  if (!currentModel.modules) currentModel.modules = {};
  if (!currentModel.modules.testPlan) {
    currentModel.modules.testPlan = {
      globalParams: {
        confidence: 0.9,
        allowedFailures: 0,
        defaultCensorType: "time",
        defaultBeta: 2.2,
        strategy: "standard",
      },
      testItems: [],
      altPlans: [],
      haltTests: [],
    };
  }
  const tp = currentModel.modules.testPlan;
  if (!tp.globalParams) {
    tp.globalParams = { confidence: 0.9, allowedFailures: 0, defaultCensorType: "time", defaultBeta: 2.2, strategy: "standard" };
  }
  if (tp.globalParams.defaultBeta === undefined) tp.globalParams.defaultBeta = 2.2;
  if (tp.globalParams.strategy === undefined) tp.globalParams.strategy = "standard";
  if (!tp.testItems) tp.testItems = [];
  if (!tp.altPlans) tp.altPlans = [];
  if (!tp.haltTests) tp.haltTests = [];

  for (const item of tp.testItems) {
    if (item.testObject === undefined) item.testObject = "";
    if (item.testCondition === undefined) item.testCondition = "";
    if (item.acceptanceCriteria === undefined) item.acceptanceCriteria = "";
    if (item.resultStatus === undefined) item.resultStatus = "not_started";
    if (item.resultNote === undefined) item.resultNote = "";
    if (item.testLevel === undefined) item.testLevel = "system";
    if (item.beta === undefined) item.beta = tp.globalParams.defaultBeta || 2.2;
    if (item.durationMultiplier === undefined) item.durationMultiplier = 1.2;
  }
}

function save() {
  if (onSaveCallback && currentModel) {
    onSaveCallback(currentModel);
  }
}

function autoSave() {
  save();
}

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;
  ensureTestPlan();
  
  litRender(htmlTemplate(container), container);
  
  bindEvents(container);
  renderGlobalParams();
  renderTestItems();
  renderAltPlans();
  renderHaltTests();
  renderDvprTable();
  renderOptimizePanel();

  const b10Input = container.querySelector("#tp-sa-b10");
  if (b10Input) {
    b10Input.value = getHomeB10(currentModel);
  }

  switchTab(activeTab);
}

function htmlTemplate(container) {
  return html`
    <div class="module-page test-plan-page">
      <div class="module-header">
        <h2>测试计划与评估</h2>
        <p>可靠性试验方案设计、样本量计算、加速寿命试验与 HALT 试验管理</p>
      </div>
      <div class="module-content">
        <div class="test-plan-toolbar">
          <div class="test-plan-tabs">
            <button type="button" class="test-plan-tab active" data-tab="sample-analysis" @click=${(e) => handleTabClick(e, container)}>样本量分析</button>
            <button type="button" class="test-plan-tab" data-tab="test-items" @click=${(e) => handleTabClick(e, container)}>试验项目</button>
            <button type="button" class="test-plan-tab" data-tab="alt" @click=${(e) => handleTabClick(e, container)}>加速寿命</button>
            <button type="button" class="test-plan-tab" data-tab="halt" @click=${(e) => handleTabClick(e, container)}>HALT 试验</button>
            <button type="button" class="test-plan-tab" data-tab="dvpr" @click=${(e) => handleTabClick(e, container)}>DVP&R</button>
          </div>
        </div>

        <div class="test-plan-tab-content" id="tp-tab-sample-analysis">
          <div class="card">
            <div class="card-header">
              <h3>样本量分析</h3>
              <span class="tp-optimize-hint">制定测试计划前的前置分析工具</span>
            </div>
            <div class="card-body">
              <div class="sample-analysis-tabs">
                <button type="button" class="sample-analysis-tab active" data-tab="qualification" @click=${(e) => handleSampleAnalysisTabClick(e, container)}>合格性验证</button>
                <button type="button" class="sample-analysis-tab" data-tab="life-test" @click=${(e) => handleSampleAnalysisTabClick(e, container)}>寿命测定</button>
              </div>

              <div class="sample-analysis-tab-content" id="tp-sa-tab-qualification">
                <div class="form-row">
                  <div class="form-group">
                    <label>目标可靠度 R<span class="help-icon" data-tooltip="产品在目标寿命时刻的可靠度">?</span></label>
                    <input type="number" id="tp-sa-reliability" class="form-input" min="50" max="99.9" step="0.1" .value=${live("90")} @input=${calculateQualificationAnalysis} />
                  </div>
                  <div class="form-group">
                    <label>置信度 γ<span class="help-icon" data-tooltip="统计置信度，通常90%或95%">?</span></label>
                    <input type="number" id="tp-sa-confidence" class="form-input" min="50" max="99.9" step="0.1" .value=${live("90")} @input=${calculateQualificationAnalysis} />
                  </div>
                  <div class="form-group">
                    <label>允许失效数 r<span class="help-icon" data-tooltip="试验中允许的最大失效数">?</span></label>
                    <input type="number" id="tp-sa-allowed" class="form-input" min="0" max="20" step="1" .value=${live("0")} @input=${calculateQualificationAnalysis} />
                  </div>
                </div>
                <div class="result-card">
                  <div class="result-row">
                    <span class="result-label">所需样本量 n</span>
                    <span class="result-value" id="tp-sa-qual-n">-</span>
                  </div>
                  <div class="result-row">
                    <span class="result-label">通过概率（零失效）</span>
                    <span class="result-value" id="tp-sa-qual-pass">-</span>
                  </div>
                </div>
                <div class="formula-section">
                  <button type="button" id="tp-sa-qual-formula-toggle" class="btn-link" @click=${toggleQualFormula}>📐 查看计算公式</button>
                  <div id="tp-sa-qual-formula-content" style="display: none; margin-top: 8px; padding: 8px; background: var(--surface-2); border-radius: var(--radius); font-size: 0.85rem;">
                    <p><strong>二项分布样本量公式：</strong></p>
                    <p>P(≤r失效 | n,R) ≤ 1-γ</p>
                    <p>当 r=0 时：n = ceil(ln(1-γ) / ln(R))</p>
                    <p>当 r>0 时：搜索最小 n 满足 Σ(k=0 to r) C(n,k)p^k(1-p)^(n-k) ≤ 1-γ</p>
                  </div>
                </div>
              </div>

              <div class="sample-analysis-tab-content" id="tp-sa-tab-life-test" style="display: none;">
                <div class="form-row">
                  <div class="form-group">
                    <label>目标 B10 寿命 (h)<span class="help-icon" data-tooltip="10%失效概率对应的寿命">?</span></label>
                    <input type="number" id="tp-sa-b10" class="form-input" min="1" max="100000" step="1" .value=${live("150")} @input=${calculateLifeTestAnalysis} />
                  </div>
                  <div class="form-group">
                    <label>形状参数 β<span class="help-icon" data-tooltip="Weibull形状参数，β>1磨损失效">?</span></label>
                    <input type="number" id="tp-sa-beta" class="form-input" min="0.5" max="5" step="0.1" .value=${live("2.2")} @input=${calculateLifeTestAnalysis} />
                  </div>
                  <div class="form-group">
                    <label>置信度 γ</label>
                    <input type="number" id="tp-sa-life-confidence" class="form-input" min="50" max="99.9" step="0.1" .value=${live("90")} @input=${calculateLifeTestAnalysis} />
                  </div>
                  <div class="form-group">
                    <label>允许失效数 r</label>
                    <input type="number" id="tp-sa-life-allowed" class="form-input" min="0" max="20" step="1" .value=${live("0")} @input=${calculateLifeTestAnalysis} />
                  </div>
                  <div class="form-group">
                    <label>试验时间倍率<span class="help-icon" data-tooltip="试验时间 / B10，越大样本量越少">?</span></label>
                    <input type="number" id="tp-sa-multiplier" class="form-input" min="0.5" max="5" step="0.1" .value=${live("1.0")} @input=${calculateLifeTestAnalysis} />
                  </div>
                </div>
                <div class="result-card">
                  <div class="result-row">
                    <span class="result-label">试验时间</span>
                    <span class="result-value" id="tp-sa-life-duration">-</span>
                  </div>
                  <div class="result-row">
                    <span class="result-label">所需样本量 n</span>
                    <span class="result-value" id="tp-sa-life-n">-</span>
                  </div>
                  <div class="result-row">
                    <span class="result-label">等效可靠度 R_test</span>
                    <span class="result-value" id="tp-sa-life-rtest">-</span>
                  </div>
                  <div class="result-row">
                    <span class="result-label">总台时</span>
                    <span class="result-value" id="tp-sa-life-total">-</span>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group" style="flex: 1;">
                    <label>不同倍率优化对比</label>
                    <table class="data-table tp-compare-table" style="margin-top: 8px;">
                      <thead>
                        <tr>
                          <th>倍率</th>
                          <th>试验时间</th>
                          <th>样本量</th>
                          <th>总台时</th>
                          <th>节省</th>
                        </tr>
                      </thead>
                      <tbody id="tp-sa-life-comparison">
                      </tbody>
                    </table>
                  </div>
                </div>
                <div class="formula-section">
                  <button type="button" id="tp-sa-life-formula-toggle" class="btn-link" @click=${toggleLifeFormula}>📐 查看计算公式</button>
                  <div id="tp-sa-life-formula-content" style="display: none; margin-top: 8px; padding: 8px; background: var(--surface-2); border-radius: var(--radius); font-size: 0.85rem;">
                    <p><strong>Weibull 折算样本量公式：</strong></p>
                    <p>K10 = ln(10/9) ≈ 0.10536</p>
                    <p>R_test = exp(-K10 × (T/B10)^β)</p>
                    <p>n = binomialSampleSize(R_test, γ, r)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="test-plan-tab-content" id="tp-tab-test-items" style="display: none;">
          <div class="card">
            <div class="card-header">
              <h3>全局参数设置</h3>
            </div>
            <div class="card-body">
              <div class="form-row">
                <div class="form-group">
                  <label>置信度</label>
                  <select id="tp-confidence" class="form-input" .value=${live("0.9")} @change=${handleGlobalParamChange}>
                    <option value="0.9">90%</option>
                    <option value="0.95">95%</option>
                    <option value="0.99">99%</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>允许失效数</label>
                  <input type="number" id="tp-allowed-failures" class="form-input" min="0" step="1" .value=${live("0")} @change=${handleGlobalParamChange} />
                </div>
                <div class="form-group">
                  <label>默认截尾类型<span class="help-icon" data-tooltip="定时截尾(到时停) vs 定数截尾(失效数够了停)">?</span></label>
                  <select id="tp-default-censor" class="form-input" .value=${live("time")} @change=${handleGlobalParamChange}>
                    <option value="time">定时截尾</option>
                    <option value="failure">定数截尾</option>
                    <option value="complete">完全失效</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>形状参数 β<span class="help-icon" data-tooltip="Weibull 分布的形状参数，β>1 表示老化失效，β=1 为随机失效，β<1 为早期失效">?</span></label>
                  <input type="number" id="tp-default-beta" class="form-input" min="0.1" step="0.1" .value=${live("2.2")} @change=${handleGlobalParamChange} />
                </div>
                <div class="form-group">
                  <label>优化策略<span class="help-icon" data-tooltip="standard=传统截尾系数, optimized=Weibull延长试验(部件2.2×B10,整机1.3×B10), custom=自定义">?</span></label>
                  <select id="tp-strategy" class="form-input" .value=${live("standard")} @change=${handleStrategyChange}>
                    <option value="standard">标准</option>
                    <option value="optimized">Weibull 优化</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>试验项目明细</h3>
              <div class="card-actions">
                <button type="button" class="btn-icon" id="tp-apply-template" @click=${applyTestPlanTemplate}>
                  <span>📋</span>
                  <span class="btn-text">应用模板</span>
                </button>
                <button type="button" class="btn-icon" id="tp-import-fmea" @click=${importFromFmea}>
                  <span>📥</span>
                  <span class="btn-text">从 FMEA 导入</span>
                </button>
                <button type="button" class="btn-icon" id="tp-calc-all" @click=${calculateAllTestItems}>
                  <span>🔢</span>
                  <span class="btn-text">计算全部</span>
                </button>
                <button type="button" class="btn-icon btn-primary" id="tp-add-item" @click=${addTestItem}>
                  <span>➕</span>
                  <span class="btn-text">添加测试项</span>
                </button>
              </div>
            </div>
            <div class="card-body">
              <div class="table-wrap">
                <table class="data-table test-items-table">
                  <thead>
                    <tr>
                      <th style="width: 40px;">#</th>
                      <th style="width: 18%;">测试项目名称</th>
                      <th style="width: 80px;">目标寿命</th>
                      <th style="width: 75px;">可靠度</th>
                      <th style="width: 70px;">级别</th>
                      <th style="width: 55px;">β</th>
                      <th style="width: 70px;">倍率</th>
                      <th style="width: 65px;">样本量</th>
                      <th style="width: 80px;">试验时长</th>
                      <th style="width: 80px;">截尾类型</th>
                      <th style="width: 15%;">台架条件</th>
                      <th style="width: 50px;">操作</th>
                    </tr>
                  </thead>
                  <tbody id="tp-items-tbody"></tbody>
                </table>
              </div>
              <div class="empty-state" id="tp-items-empty" style="display: none;">
                <div class="empty-icon">📋</div>
                <h3>暂无试验项目</h3>
                <p>点击「添加测试项」或「从 FMEA 导入」开始创建试验项目。</p>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>智能优化方案对比</h3>
            </div>
            <div class="card-body">
              <div id="tp-optimize-panel"></div>
            </div>
          </div>
        </div>

        <div class="test-plan-tab-content" id="tp-tab-alt" style="display: none;">
          <div class="card">
            <div class="card-header">
              <h3>ALT 加速寿命试验计划</h3>
              <div class="card-actions">
                <button type="button" class="btn-icon btn-primary" id="tp-add-alt" @click=${addAltPlan}>
                  <span>➕</span>
                  <span class="btn-text">添加 ALT 计划</span>
                </button>
              </div>
            </div>
            <div class="card-body">
              <div class="table-wrap">
                <table class="data-table alt-table">
                  <thead>
                    <tr>
                      <th style="width: 50px;">序号</th>
                      <th style="min-width: 180px;">试验名称</th>
                      <th style="width: 100px;">应力类型</th>
                      <th style="width: 140px;">加速模型<span class="help-icon" data-tooltip="Arrhenius温度加速、逆幂律负载加速等，根据失效机理选择">?</span></th>
                      <th style="width: 120px;">正常使用应力</th>
                      <th style="width: 130px;">加速应力水平1<span class="help-icon" data-tooltip="加速试验施加的应力等级，至少需要2个水平才能计算加速因子">?</span></th>
                      <th style="width: 130px;">加速应力水平2</th>
                      <th style="width: 110px;">加速因子</th>
                      <th style="width: 110px;">目标B10 (h)<span class="help-icon" data-tooltip="使用工况下的目标B10寿命，用于自动计算加速后所需测试时间">?</span></th>
                      <th style="width: 110px;">试验时长 (h)<span class="help-icon" data-tooltip="自动计算 = 目标B10 / 加速因子，可手动覆盖">?</span></th>
                      <th style="width: 90px;">样本量</th>
                      <th style="width: 70px;">操作</th>
                    </tr>
                  </thead>
                  <tbody id="tp-alt-tbody"></tbody>
                </table>
              </div>
              <div class="empty-state" id="tp-alt-empty" style="display: none;">
                <div class="empty-icon">⚡</div>
                <h3>暂无 ALT 试验计划</h3>
                <p>点击「添加 ALT 计划」开始创建加速寿命试验。</p>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>加速因子说明</h3>
            </div>
            <div class="card-body">
              <div class="alt-info-grid">
                <div class="alt-info-item">
                  <h4>Arrhenius 模型</h4>
                  <p>适用于温度应力：AF = exp(Ea/k × (1/T_use - 1/T_accel))</p>
                  <p class="hint">Ea=0.7eV, k=8.617e-5 eV/K</p>
                </div>
                <div class="alt-info-item">
                  <h4>Coffin-Manson 模型</h4>
                  <p>适用于温度循环：AF = (ΔT_accel / ΔT_use)^n</p>
                  <p class="hint">n=2.5（默认，范围 2~4）</p>
                </div>
                <div class="alt-info-item">
                  <h4>逆幂律模型</h4>
                  <p>适用于电压、功率、振动等应力：AF = (S_accel / S_use)^n</p>
                  <p class="hint">n: 电压=5, 功率=4, 振动=3, 其他=4</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="test-plan-tab-content" id="tp-tab-halt" style="display: none;">
          <div class="card">
            <div class="card-header">
              <h3>HALT 试验记录</h3>
              <div class="card-actions">
                <button type="button" class="btn-icon btn-primary" id="tp-add-halt" @click=${addHaltTest}>
                  <span>➕</span>
                  <span class="btn-text">添加 HALT 试验</span>
                </button>
              </div>
            </div>
            <div class="card-body" id="tp-halt-container">
              <div class="empty-state" id="tp-halt-empty">
                <div class="empty-icon">🧪</div>
                <h3>暂无 HALT 试验记录</h3>
                <p>点击「添加 HALT 试验」开始记录高加速寿命试验。</p>
              </div>
            </div>
          </div>
        </div>

        <div class="test-plan-tab-content" id="tp-tab-dvpr" style="display: none;">
          <div class="card">
            <div class="card-header">
              <h3>DVP&R 设计验证计划与报告</h3>
              <div class="card-actions">
                <span class="selector-label" style="font-size: 0.8rem; color: var(--text-muted);">
                  共 <span id="dvpr-total">0</span> 项
                </span>
              </div>
            </div>
            <div class="card-body">
              <div class="table-wrap">
                <table class="data-table dvpr-table">
                  <thead>
                    <tr>
                      <th style="width: 50px;">序号</th>
                      <th style="min-width: 200px;">试验项目名称</th>
                      <th style="min-width: 150px;">试验对象</th>
                      <th style="min-width: 200px;">试验工况</th>
                      <th style="width: 80px;">样本量</th>
                      <th style="width: 120px;">截尾方式<span class="help-icon" data-tooltip="定时截尾(到时停) vs 定数截尾(失效数够了停)">?</span></th>
                      <th style="min-width: 220px;">验收标准</th>
                      <th style="width: 100px;">试验结果</th>
                      <th style="min-width: 150px;">备注</th>
                    </tr>
                  </thead>
                  <tbody id="dvpr-tbody"></tbody>
                </table>
              </div>
              <div class="empty-state" id="dvpr-empty" style="display: none;">
                <div class="empty-icon">📋</div>
                <h3>暂无 DVP&R 数据</h3>
                <p>请先在「试验项目」Tab 中添加试验项目。</p>
              </div>
              <div class="dvpr-stats" style="margin-top: 1rem; display: flex; gap: 1.5rem; flex-wrap: wrap;">
                <div class="dvpr-stat-item">
                  <span class="dvpr-stat-label">总试验项数：</span>
                  <span class="dvpr-stat-value" id="dvpr-stat-total">0</span>
                </div>
                <div class="dvpr-stat-item">
                  <span class="dvpr-stat-label">通过：</span>
                  <span class="dvpr-stat-value dvpr-pass" id="dvpr-stat-passed">0</span>
                </div>
                <div class="dvpr-stat-item">
                  <span class="dvpr-stat-label">失败：</span>
                  <span class="dvpr-stat-value dvpr-fail" id="dvpr-stat-failed">0</span>
                </div>
                <div class="dvpr-stat-item">
                  <span class="dvpr-stat-label">进行中：</span>
                  <span class="dvpr-stat-value dvpr-progress" id="dvpr-stat-progress">0</span>
                </div>
                <div class="dvpr-stat-item">
                  <span class="dvpr-stat-label">未开始：</span>
                  <span class="dvpr-stat-value dvpr-pending" id="dvpr-stat-pending">0</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function handleTabClick(e, container) {
  const tab = e.target.closest(".test-plan-tab");
  if (!tab) return;
  switchTab(tab.dataset.tab);
}

function handleSampleAnalysisTabClick(e, container) {
  const tab = e.target.closest(".sample-analysis-tab");
  if (!tab) return;
  switchSampleAnalysisTab(tab.dataset.tab);
}

function toggleQualFormula() {
  const qualToggle = document.getElementById("tp-sa-qual-formula-toggle");
  const qualContent = document.getElementById("tp-sa-qual-formula-content");
  if (qualToggle && qualContent) {
    const isHidden = qualContent.style.display === "none";
    qualContent.style.display = isHidden ? "" : "none";
    qualToggle.textContent = isHidden ? "📐 收起公式" : "📐 查看计算公式";
  }
}

function toggleLifeFormula() {
  const lifeToggle = document.getElementById("tp-sa-life-formula-toggle");
  const lifeContent = document.getElementById("tp-sa-life-formula-content");
  if (lifeToggle && lifeContent) {
    const isHidden = lifeContent.style.display === "none";
    lifeContent.style.display = isHidden ? "" : "none";
    lifeToggle.textContent = isHidden ? "📐 收起公式" : "📐 查看计算公式";
  }
}

function handleGlobalParamChange(e) {
  const el = e.target;
  const id = el.id;
  const params = currentModel.modules.testPlan.globalParams;
  
  if (id === "tp-confidence") {
    params.confidence = Number(el.value);
  } else if (id === "tp-allowed-failures") {
    params.allowedFailures = Number(el.value) || 0;
  } else if (id === "tp-default-censor") {
    params.defaultCensorType = el.value;
  } else if (id === "tp-default-beta") {
    params.defaultBeta = Number(el.value) || 2.2;
  }
  autoSave();
}

function handleStrategyChange(e) {
  const el = e.target;
  currentModel.modules.testPlan.globalParams.strategy = el.value;
  calculateAllTestItems();
}

function bindEvents(container) {
  bindTestItemsEvents(container);
  bindAltEvents(container);
  bindHaltEvents(container);
  bindDvprEvents(container);
}

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll(".test-plan-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
  document.querySelectorAll(".test-plan-tab-content").forEach((c) => {
    c.style.display = "none";
  });
  const tabEl = document.getElementById(`tp-tab-${tabName}`);
  if (tabEl) tabEl.style.display = "";
}

function renderGlobalParams() {
  const params = currentModel.modules.testPlan.globalParams;
  const confidence = document.getElementById("tp-confidence");
  const allowedFailures = document.getElementById("tp-allowed-failures");
  const defaultCensor = document.getElementById("tp-default-censor");
  const defaultBeta = document.getElementById("tp-default-beta");
  const strategy = document.getElementById("tp-strategy");

  if (confidence) confidence.value = String(params.confidence ?? 0.9);
  if (allowedFailures) allowedFailures.value = params.allowedFailures ?? 0;
  if (defaultCensor) defaultCensor.value = params.defaultCensorType ?? "time";
  if (defaultBeta) defaultBeta.value = params.defaultBeta ?? 2.2;
  if (strategy) strategy.value = params.strategy ?? "standard";
}

function binomialSampleSize(R, gamma, r) {
  const alpha = 1 - gamma;
  if (R <= 0 || R >= 1) return 0;
  if (r === 0) {
    return Math.ceil(Math.log(alpha) / Math.log(R));
  }
  let n = r;
  while (n < 10000) {
    if (binomialCdf(r, n, 1 - R) <= alpha) {
      return n;
    }
    n++;
  }
  return n;
}

function calculateSampleSize(reliability, confidence, allowedFailures, targetB10, beta, testDuration) {
  const R = Number(reliability) || 0.9;
  const gamma = Number(confidence) || 0.9;
  const r = Math.max(0, Math.floor(Number(allowedFailures) || 0));
  const b10 = Number(targetB10) || 0;
  const b = Number(beta) || 0;
  const T = Number(testDuration) || 0;

  // Weibull 优化：如果有 targetB10 + beta + testDuration 且 testDuration > targetB10
  if (b10 > 0 && b > 0 && T > b10) {
    const R_test = Math.exp(-K10 * Math.pow(T / b10, b));
    const n = binomialSampleSize(R_test, gamma, r);
    return -n; // 负数标记 Weibull 优化
  }

  // 标准二项分布
  return binomialSampleSize(R, gamma, r);
}

function binomialCdf(maxFailures, n, p) {
  let sum = 0;
  for (let k = 0; k <= maxFailures; k++) {
    sum += binomialCoeff(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
  }
  return sum;
}

function binomialCoeff(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

function chiSquareInv(p, df) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;

  let x = df * Math.pow(1 - 2 / (9 * df) + normInv(p) * Math.sqrt(2 / (9 * df)), 3);
  for (let i = 0; i < 10; i++) {
    const error = chiSquareCdf(x, df) - p;
    const pdf = chiSquarePdf(x, df);
    if (Math.abs(error) < 1e-10) break;
    x = x - error / pdf;
    if (x < 0) x = 0.001;
  }
  return x;
}

function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
  const c0 = 2.515517,
    c1 = 0.802853,
    c2 = 0.010328;
  const d1 = 1.432788,
    d2 = 0.189269,
    d3 = 0.001308;
  const x = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  return p < 0.5 ? -x : x;
}

function chiSquarePdf(x, df) {
  if (x <= 0) return 0;
  return (
    (Math.pow(x, df / 2 - 1) * Math.exp(-x / 2)) /
    (Math.pow(2, df / 2) * gammaApprox(df / 2))
  );
}

function chiSquareCdf(x, df) {
  if (x <= 0) return 0;
  return lowerRegularizedGamma(df / 2, x / 2);
}

function lowerRegularizedGamma(a, x) {
  if (x < 0) return 0;
  if (x === 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n <= 100; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-10) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  } else {
    let b = x + 1 - a;
    let c = Infinity;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= 100; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 1e-10) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  }
}

function lnGamma(z) {
  return Math.log(gammaApprox(z));
}

function calculateTestDuration(targetLife, censorType, beta, testLevel, strategy, multiplier) {
  const life = Number(targetLife) || 0;
  const strat = strategy || "standard";
  const mult = Number(multiplier) || 0;

  if (strat === "optimized") {
    const m = testLevel === "component" ? 2.2 : 1.3;
    return Math.ceil(life * m);
  }

  if (strat === "custom") {
    if (mult > 0) {
      return Math.ceil(life * mult);
    }
  }

  switch (censorType) {
    case "time":
      return Math.ceil(life * 1.2);
    case "failure":
      return Math.ceil(life * 1.3);
    case "complete":
      return Math.ceil(life * 1.5);
    default:
      return Math.ceil(life * 1.2);
  }
}

function createNewTestItem() {
  const params = currentModel.modules.testPlan.globalParams;
  return {
    id: genId(),
    name: "",
    targetLife: 1000,
    targetReliability: 0.9,
    sampleSize: 0,
    testDuration: 0,
    censorType: params.defaultCensorType || "time",
    testLevel: "system",
    beta: params.defaultBeta || 2.2,
    durationMultiplier: 1.2,
    benchCondition: "",
    testObject: "",
    testCondition: "",
    acceptanceCriteria: "",
    resultStatus: "not_started",
    resultNote: "",
  };
}

function bindTestItemsEvents(container) {
  const tbody = container.querySelector("#tp-items-tbody");
  if (tbody) {
    tbody.addEventListener("change", (e) => {
      const el = e.target.closest("[data-field]");
      if (!el) return;
      const tr = el.closest("tr");
      const id = tr.dataset.id;
      const field = el.dataset.field;
      const item = currentModel.modules.testPlan.testItems.find((i) => i.id === id);
      if (!item) return;

      let val = el.value;
      if (el.type === "number") val = Number(val) || 0;
      item[field] = val;

      if (
        field === "targetLife" ||
        field === "targetReliability" ||
        field === "censorType" ||
        field === "testLevel" ||
        field === "beta" ||
        field === "durationMultiplier"
      ) {
        const params = currentModel.modules.testPlan.globalParams;
        item.sampleSize = calculateSampleSize(
          item.targetReliability,
          params.confidence,
          params.allowedFailures,
          item.targetLife,
          item.beta,
          item.testDuration
        );
        item.testDuration = calculateTestDuration(
          item.targetLife, item.censorType, item.beta, item.testLevel, params.strategy, item.durationMultiplier
        );
        // 重新计算 sampleSize（testDuration 可能已变）
        item.sampleSize = calculateSampleSize(
          item.targetReliability,
          params.confidence,
          params.allowedFailures,
          item.targetLife,
          item.beta,
          item.testDuration
        );
      }

      autoSave();
      renderTestItems();
      renderDvprTable();
      renderOptimizePanel();
    });

    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action='delete']");
      if (!btn) return;
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      if (!confirm("确定删除该测试项？")) return;
      currentModel.modules.testPlan.testItems =
        currentModel.modules.testPlan.testItems.filter((i) => i.id !== id);
      autoSave();
      renderTestItems();
      renderDvprTable();
    });
  }
}

function renderTestItems() {
  const tbody = document.getElementById("tp-items-tbody");
  const empty = document.getElementById("tp-items-empty");
  const items = currentModel.modules.testPlan.testItems;

  if (!tbody) return;

  if (!items || items.length === 0) {
    litRender(html``, tbody);
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = items
    .map((item, idx) => {
      const sampleDisplay = item.sampleSize < 0
        ? `\uD83D\uDCCD ${Math.abs(item.sampleSize)}`
        : (item.sampleSize || "-");

      // 根据策略计算倍率显示值和是否可编辑
      const strategy = currentModel.modules.testPlan.globalParams.strategy || "standard";
      let multiplierDisplay;
      let multiplierDisabled = false;
      if (strategy === "optimized") {
        multiplierDisplay = item.testLevel === "component" ? "2.2" : "1.3";
        multiplierDisabled = true;
      } else if (strategy === "standard") {
        const stdMap = { time: "1.2", failure: "1.3", complete: "1.5" };
        multiplierDisplay = stdMap[item.censorType] || "1.2";
        multiplierDisabled = true;
      } else {
        // custom
        multiplierDisplay = item.durationMultiplier ?? 1.2;
        multiplierDisabled = false;
      }
      return `
      <tr data-id="${item.id}">
        <td>${idx + 1}</td>
        <td><input type="text" data-field="name" value="${escapeHtml(item.name)}" class="item-input" placeholder="测试项目名称" /></td>
        <td><input type="number" data-field="targetLife" value="${item.targetLife}" min="0" step="1" class="item-input" /></td>
        <td>
          <select data-field="targetReliability" class="item-input">
            <option value="0.9" ${item.targetReliability === 0.9 ? "selected" : ""}>90%</option>
            <option value="0.95" ${item.targetReliability === 0.95 ? "selected" : ""}>95%</option>
            <option value="0.99" ${item.targetReliability === 0.99 ? "selected" : ""}>99%</option>
            <option value="0.999" ${item.targetReliability === 0.999 ? "selected" : ""}>99.9%</option>
          </select>
        </td>
        <td>
          <select data-field="testLevel" class="item-input">
            <option value="system" ${item.testLevel === "system" ? "selected" : ""}>整机</option>
            <option value="component" ${item.testLevel === "component" ? "selected" : ""}>部件</option>
          </select>
        </td>
        <td><input type="number" data-field="beta" value="${item.beta}" min="0.1" step="0.1" class="item-input" /></td>
        <td><input type="number" data-field="durationMultiplier" value="${multiplierDisplay}" min="0.5" max="5" step="0.1" class="item-input" ${multiplierDisabled ? "disabled" : ""} /></td>
        <td class="tp-sample-size">${sampleDisplay}</td>
        <td class="tp-test-duration">${item.testDuration || "-"}</td>
        <td>
          <select data-field="censorType" class="item-input">
            <option value="time" ${item.censorType === "time" ? "selected" : ""}>定时截尾</option>
            <option value="failure" ${item.censorType === "failure" ? "selected" : ""}>定数截尾</option>
            <option value="complete" ${item.censorType === "complete" ? "selected" : ""}>完全失效</option>
          </select>
        </td>
        <td><input type="text" data-field="benchCondition" value="${escapeHtml(item.benchCondition)}" class="item-input" placeholder="台架条件" /></td>
        <td><button type="button" data-action="delete" class="btn-sm btn-ghost" style="color: var(--danger);">删除</button></td>
      </tr>`;
    })
    .join("");
}

function addTestItem() {
  const item = createNewTestItem();
  const params = currentModel.modules.testPlan.globalParams;
  item.testDuration = calculateTestDuration(
    item.targetLife, item.censorType, item.beta, item.testLevel, params.strategy, item.durationMultiplier
  );
  item.sampleSize = calculateSampleSize(
    item.targetReliability,
    params.confidence,
    params.allowedFailures,
    item.targetLife,
    item.beta,
    item.testDuration
  );
  currentModel.modules.testPlan.testItems.push(item);
  autoSave();
  renderTestItems();
  renderDvprTable();
  renderOptimizePanel();

  const tbody = document.getElementById("tp-items-tbody");
  const lastRow = tbody?.lastElementChild;
  if (lastRow) {
    const firstInput = lastRow.querySelector("input[data-field='name']");
    if (firstInput) firstInput.focus();
  }
}

function calculateAllTestItems() {
  const params = currentModel.modules.testPlan.globalParams;
  const items = currentModel.modules.testPlan.testItems;
  for (const item of items) {
    item.testDuration = calculateTestDuration(
      item.targetLife, item.censorType, item.beta, item.testLevel, params.strategy, item.durationMultiplier
    );
    item.sampleSize = calculateSampleSize(
      item.targetReliability,
      params.confidence,
      params.allowedFailures,
      item.targetLife,
      item.beta,
      item.testDuration
    );
  }
  autoSave();
  renderTestItems();
  renderDvprTable();
  renderOptimizePanel();
  const btn = document.getElementById("tp-calc-all");
  if (btn) toast(btn, "计算完成", 1500);
}

function importFromFmea() {
  const fmea = currentModel.modules?.fmea;
  if (!fmea || !fmea.items || fmea.items.length === 0) {
    alert("FMEA 模块暂无数据，请先在 FMEA 模块中添加失效模式。");
    return;
  }

  const existingNames = new Set(
    currentModel.modules.testPlan.testItems.map((i) => i.name)
  );
  const params = currentModel.modules.testPlan.globalParams;
  let imported = 0;

  for (const fmeaItem of fmea.items) {
    const name = fmeaItem.failureMode || fmeaItem.function;
    if (!name || existingNames.has(name)) continue;

    const item = createNewTestItem();
    item.name = name;
    item.benchCondition = fmeaItem.function || "";
    item.testDuration = calculateTestDuration(
      item.targetLife, item.censorType, item.beta, item.testLevel, params.strategy, item.durationMultiplier
    );
    item.sampleSize = calculateSampleSize(
      item.targetReliability,
      params.confidence,
      params.allowedFailures,
      item.targetLife,
      item.beta,
      item.testDuration
    );
    currentModel.modules.testPlan.testItems.push(item);
    existingNames.add(name);
    imported++;
  }

  if (imported === 0) {
    alert("未导入新项目（可能全部已存在）。");
    return;
  }

  autoSave();
  renderTestItems();
  renderDvprTable();
  const btn = document.getElementById("tp-import-fmea");
  if (btn) toast(btn, `已导入 ${imported} 项`, 1500);
}

function applyTestPlanTemplate() {
  const currentProduct = getCurrentProduct();
  if (!currentProduct) {
    alert("请先选择一个产品");
    return;
  }

  const shared = getProductShared(currentProduct.id);
  const templateItems = shared.testPlanTemplate?.testItems || [];

  if (!templateItems || templateItems.length === 0) {
    alert("当前产品的测试计划模板为空，请先在产品级创建模板数据");
    return;
  }

  const existingNames = new Set(currentModel.modules.testPlan.testItems.map((i) => i.name));
  let addedCount = 0;

  for (const templateItem of templateItems) {
    const name = templateItem.name || "";
    if (!existingNames.has(name)) {
      const newItem = {
        ...templateItem,
        id: genId(),
        _inherited: true,
      };
      const params = currentModel.modules.testPlan.globalParams;
      newItem.testDuration = calculateTestDuration(
        newItem.targetLife, newItem.censorType, newItem.beta, newItem.testLevel, params.strategy, newItem.durationMultiplier
      );
      newItem.sampleSize = calculateSampleSize(
        newItem.targetReliability,
        params.confidence,
        params.allowedFailures,
        newItem.targetLife,
        newItem.beta,
        newItem.testDuration
      );
      currentModel.modules.testPlan.testItems.push(newItem);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    autoSave();
    renderTestItems();
    renderDvprTable();
    const btn = document.getElementById("tp-apply-template");
    if (btn) toast(btn, `已应用 ${addedCount} 项模板`, 1500);
  } else {
    alert("模板中的测试项已经全部存在");
  }
}

function calculateAccelFactor(plan) {
  const stressType = plan.stressType;
  const model = plan.accelModel;
  const useStress = Number(plan.useStress) || 0;
  const accel1 = Number(plan.accelStress1) || 0;

  if (!useStress || !accel1) return null;

  switch (model) {
    case "arrhenius": {
      const Ea = 0.7;
      const k = 8.617e-5;
      const T_use = useStress + 273.15;
      const T_accel = accel1 + 273.15;
      return Math.exp((Ea / k) * (1 / T_use - 1 / T_accel));
    }
    case "coffinManson": {
      const n = 2.5;
      if (useStress <= 0) return null;
      return Math.pow(accel1 / useStress, n);
    }
    case "inversePower": {
      const n = stressType === "voltage" ? 5 : stressType === "vibration" ? 3 : stressType === "power" ? 4 : 4;
      if (useStress <= 0) return null;
      return Math.pow(accel1 / useStress, n);
    }
    default:
      return null;
  }
}

function createNewAltPlan() {
  return {
    id: genId(),
    name: "",
    stressType: "temperature",
    accelModel: "arrhenius",
    useStress: 25,
    accelStress1: 60,
    accelStress2: 85,
    accelFactor: 0,
    targetB10: 0,
    testDuration: 1000,
    sampleSize: 10,
  };
}

function bindAltEvents(container) {
  const tbody = container.querySelector("#tp-alt-tbody");
  if (tbody) {
    tbody.addEventListener("change", (e) => {
      const el = e.target.closest("[data-field]");
      if (!el) return;
      const tr = el.closest("tr");
      const id = tr.dataset.id;
      const field = el.dataset.field;
      const plan = currentModel.modules.testPlan.altPlans.find((p) => p.id === id);
      if (!plan) return;

      let val = el.value;
      if (el.type === "number") val = Number(val) || 0;
      plan[field] = val;

      if (
        field === "stressType" ||
        field === "accelModel" ||
        field === "useStress" ||
        field === "accelStress1"
      ) {
        const af = calculateAccelFactor(plan);
        plan.accelFactor = af ? parseFloat(af.toFixed(2)) : 0;
        if (plan.accelFactor > 0 && plan.targetB10 > 0) {
          plan.testDuration = Math.ceil(plan.targetB10 / plan.accelFactor);
        }
      }

      if (field === "targetB10" && plan.accelFactor > 0 && plan.targetB10 > 0) {
        plan.testDuration = Math.ceil(plan.targetB10 / plan.accelFactor);
      }

      autoSave();
      renderAltPlans();
    });

    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action='delete']");
      if (!btn) return;
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      if (!confirm("确定删除该 ALT 计划？")) return;
      currentModel.modules.testPlan.altPlans =
        currentModel.modules.testPlan.altPlans.filter((p) => p.id !== id);
      autoSave();
      renderAltPlans();
    });
  }
}

function renderAltPlans() {
  const tbody = document.getElementById("tp-alt-tbody");
  const empty = document.getElementById("tp-alt-empty");
  const plans = currentModel.modules.testPlan.altPlans;

  if (!tbody) return;

  if (!plans || plans.length === 0) {
    litRender(html``, tbody);
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = plans
    .map((plan, idx) => {
      const stressOptions = Object.entries(STRESS_TYPES)
        .map(
          ([k, v]) =>
            `<option value="${k}" ${plan.stressType === k ? "selected" : ""}>${v}</option>`
        )
        .join("");
      const modelOptions = Object.entries(ACCEL_MODELS)
        .map(
          ([k, v]) =>
            `<option value="${k}" ${plan.accelModel === k ? "selected" : ""}>${v}</option>`
        )
        .join("");

      return `
      <tr data-id="${plan.id}">
        <td>${idx + 1}</td>
        <td><input type="text" data-field="name" value="${escapeHtml(plan.name)}" class="item-input" placeholder="试验名称" /></td>
        <td>
          <select data-field="stressType" class="item-input">
            ${stressOptions}
          </select>
        </td>
        <td>
          <select data-field="accelModel" class="item-input">
            ${modelOptions}
          </select>
        </td>
        <td><input type="number" data-field="useStress" value="${plan.useStress}" class="item-input" step="0.1" /></td>
        <td><input type="number" data-field="accelStress1" value="${plan.accelStress1}" class="item-input" step="0.1" /></td>
        <td><input type="number" data-field="accelStress2" value="${plan.accelStress2}" class="item-input" step="0.1" /></td>
        <td class="tp-af-cell">${plan.accelFactor ? plan.accelFactor.toFixed(2) + "×" : "-"}</td>
        <td><input type="number" data-field="targetB10" value="${plan.targetB10 || 0}" min="0" class="item-input" step="1" /></td>
        <td><input type="number" data-field="testDuration" value="${plan.testDuration}" min="0" class="item-input" step="1" /></td>
        <td><input type="number" data-field="sampleSize" value="${plan.sampleSize}" min="1" class="item-input" step="1" /></td>
        <td><button type="button" data-action="delete" class="btn-sm btn-ghost" style="color: var(--danger);">删除</button></td>
      </tr>`;
    })
    .join("");
}

function addAltPlan() {
  const plan = createNewAltPlan();
  plan.targetB10 = getHomeB10(currentModel) || 1500;
  const af = calculateAccelFactor(plan);
  plan.accelFactor = af ? parseFloat(af.toFixed(2)) : 0;
  if (plan.accelFactor > 0 && plan.targetB10 > 0) {
    plan.testDuration = Math.ceil(plan.targetB10 / plan.accelFactor);
  }
  currentModel.modules.testPlan.altPlans.push(plan);
  autoSave();
  renderAltPlans();

  const tbody = document.getElementById("tp-alt-tbody");
  const lastRow = tbody?.lastElementChild;
  if (lastRow) {
    const firstInput = lastRow.querySelector("input[data-field='name']");
    if (firstInput) firstInput.focus();
  }
}

function createNewHaltTest() {
  return {
    id: genId(),
    name: "",
    startDate: "",
    endDate: "",
    purpose: "",
    steps: [],
  };
}

function createNewHaltStep() {
  return {
    id: genId(),
    stressType: "highTemp",
    stressLevel: "",
    durationMin: 30,
    failures: 0,
    description: "",
  };
}

function getHaltTotalFailures(test) {
  if (!test.steps || test.steps.length === 0) return 0;
  return test.steps.reduce((sum, s) => sum + (Number(s.failures) || 0), 0);
}

function bindHaltEvents(container) {
  const haltContainer = container.querySelector("#tp-halt-container");

  if (haltContainer) {
    haltContainer.addEventListener("click", (e) => {
      const addStepBtn = e.target.closest("button[data-action='add-step']");
      if (addStepBtn) {
        const testId = addStepBtn.dataset.testId;
        addHaltStep(testId);
        return;
      }

      const deleteTestBtn = e.target.closest("button[data-action='delete-test']");
      if (deleteTestBtn) {
        const testId = deleteTestBtn.dataset.testId;
        deleteHaltTest(testId);
        return;
      }

      const deleteStepBtn = e.target.closest("button[data-action='delete-step']");
      if (deleteStepBtn) {
        const testId = deleteStepBtn.dataset.testId;
        const stepId = deleteStepBtn.dataset.stepId;
        deleteHaltStep(testId, stepId);
        return;
      }
    });

    haltContainer.addEventListener("change", (e) => {
      const el = e.target.closest("[data-field]");
      if (!el) return;

      const testEl = el.closest("[data-test-id]");
      if (!testEl) return;
      const testId = testEl.dataset.testId;
      const test = currentModel.modules.testPlan.haltTests.find((t) => t.id === testId);
      if (!test) return;

      const stepEl = el.closest("[data-step-id]");
      if (stepEl) {
        const stepId = stepEl.dataset.stepId;
        const step = test.steps.find((s) => s.id === stepId);
        if (!step) return;
        const field = el.dataset.field;
        let val = el.value;
        if (el.type === "number") val = Number(val) || 0;
        step[field] = val;
      } else {
        const field = el.dataset.field;
        test[field] = el.value;
      }

      autoSave();
      renderHaltTests();
    });
  }
}

function renderHaltTests() {
  const container = document.getElementById("tp-halt-container");
  const empty = document.getElementById("tp-halt-empty");
  const tests = currentModel.modules.testPlan.haltTests;

  if (!container) return;

  if (!tests || tests.length === 0) {
    if (empty) empty.style.display = "";
    const existing = container.querySelectorAll(".halt-test-card");
    existing.forEach((el) => el.remove());
    return;
  }
  if (empty) empty.style.display = "none";

  container.innerHTML =
    (empty ? empty.outerHTML : "") +
    tests
      .map((test, idx) => {
        const totalFailures = getHaltTotalFailures(test);
        const stepsHtml = renderHaltSteps(test);
        return `
        <div class="halt-test-card" data-test-id="${test.id}">
          <div class="halt-test-header">
            <div class="halt-test-title">
              <span class="halt-test-index">试验 ${idx + 1}</span>
              <input type="text" data-field="name" value="${escapeHtml(test.name)}" class="item-input halt-test-name" placeholder="HALT 试验名称" />
            </div>
            <div class="halt-test-stats">
              <span class="halt-stat">总失效数: <strong>${totalFailures}</strong></span>
              <span class="halt-stat">步数: <strong>${test.steps?.length || 0}</strong></span>
            </div>
            <div class="halt-test-actions">
              <button type="button" data-action="delete-test" data-test-id="${test.id}" class="btn-sm btn-ghost" style="color: var(--danger);">删除试验</button>
            </div>
          </div>
          <div class="halt-test-body">
            <div class="form-row">
              <div class="form-group">
                <label>开始日期</label>
                <input type="date" data-field="startDate" value="${escapeHtml(test.startDate)}" class="form-input" />
              </div>
              <div class="form-group">
                <label>结束日期</label>
                <input type="date" data-field="endDate" value="${escapeHtml(test.endDate)}" class="form-input" />
              </div>
              <div class="form-group full-width">
                <label>试验目的</label>
                <input type="text" data-field="purpose" value="${escapeHtml(test.purpose)}" class="form-input" placeholder="试验目的说明" />
              </div>
            </div>
            <div class="halt-steps-section">
              <div class="halt-steps-header">
                <h4>应力步记录</h4>
                <button type="button" data-action="add-step" data-test-id="${test.id}" class="btn-sm btn-secondary">
                  <span>➕</span> 添加应力步
                </button>
              </div>
              ${stepsHtml}
            </div>
          </div>
        </div>`;
      })
      .join("");

  const emptyEl = container.querySelector("#tp-halt-empty");
  if (emptyEl) emptyEl.style.display = "none";
}

function renderHaltSteps(test) {
  if (!test.steps || test.steps.length === 0) {
    return `<div class="halt-steps-empty">暂无应力步记录，点击「添加应力步」开始记录。</div>`;
  }

  const rows = test.steps
    .map((step, idx) => {
      const stressOptions = Object.entries(HALT_STRESS_TYPES)
        .map(
          ([k, v]) =>
            `<option value="${k}" ${step.stressType === k ? "selected" : ""}>${v}</option>`
        )
        .join("");

      return `
      <tr data-step-id="${step.id}">
        <td>${idx + 1}</td>
        <td>
          <select data-field="stressType" class="item-input">
            ${stressOptions}
          </select>
        </td>
        <td><input type="text" data-field="stressLevel" value="${escapeHtml(step.stressLevel)}" class="item-input" placeholder="如: 85°C / 10Grms" /></td>
        <td><input type="number" data-field="durationMin" value="${step.durationMin}" min="0" class="item-input" step="1" /></td>
        <td><input type="number" data-field="failures" value="${step.failures}" min="0" class="item-input" step="1" /></td>
        <td><input type="text" data-field="description" value="${escapeHtml(step.description)}" class="item-input" placeholder="失效描述" /></td>
        <td><button type="button" data-action="delete-step" data-test-id="${test.id}" data-step-id="${step.id}" class="btn-sm btn-ghost" style="color: var(--danger);">删除</button></td>
      </tr>`;
    })
    .join("");

  return `
  <div class="table-wrap">
    <table class="data-table halt-steps-table">
      <thead>
        <tr>
          <th style="width: 50px;">序号</th>
          <th style="width: 120px;">应力类型</th>
          <th style="width: 150px;">应力水平</th>
          <th style="width: 130px;">持续时间 (min)</th>
          <th style="width: 100px;">失效数</th>
          <th style="min-width: 180px;">失效描述</th>
          <th style="width: 70px;">操作</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function addHaltTest() {
  const test = createNewHaltTest();
  currentModel.modules.testPlan.haltTests.push(test);
  autoSave();
  renderHaltTests();

  const container = document.getElementById("tp-halt-container");
  const lastCard = container?.querySelector(".halt-test-card:last-child");
  if (lastCard) {
    const nameInput = lastCard.querySelector("input[data-field='name']");
    if (nameInput) nameInput.focus();
  }
}

function deleteHaltTest(testId) {
  if (!confirm("确定删除该 HALT 试验？此操作不可恢复。")) return;
  currentModel.modules.testPlan.haltTests =
    currentModel.modules.testPlan.haltTests.filter((t) => t.id !== testId);
  autoSave();
  renderHaltTests();
}

function addHaltStep(testId) {
  const test = currentModel.modules.testPlan.haltTests.find((t) => t.id === testId);
  if (!test) return;
  if (!test.steps) test.steps = [];
  test.steps.push(createNewHaltStep());
  autoSave();
  renderHaltTests();
}

function deleteHaltStep(testId, stepId) {
  const test = currentModel.modules.testPlan.haltTests.find((t) => t.id === testId);
  if (!test) return;
  test.steps = test.steps.filter((s) => s.id !== stepId);
  autoSave();
  renderHaltTests();
}

function getResultStatusClass(status) {
  switch (status) {
    case "passed":
      return "dvpr-status-passed";
    case "failed":
      return "dvpr-status-failed";
    case "in_progress":
      return "dvpr-status-progress";
    case "not_started":
    default:
      return "dvpr-status-pending";
  }
}

function renderDvprTable() {
  const tbody = document.getElementById("dvpr-tbody");
  const empty = document.getElementById("dvpr-empty");
  const items = currentModel.modules.testPlan.testItems;

  if (!tbody) return;

  const totalEl = document.getElementById("dvpr-total");
  const statTotal = document.getElementById("dvpr-stat-total");
  const statPassed = document.getElementById("dvpr-stat-passed");
  const statFailed = document.getElementById("dvpr-stat-failed");
  const statProgress = document.getElementById("dvpr-stat-progress");
  const statPending = document.getElementById("dvpr-stat-pending");

  if (!items || items.length === 0) {
    litRender(html``, tbody);
    if (empty) empty.style.display = "";
    if (totalEl) totalEl.textContent = "0";
    if (statTotal) statTotal.textContent = "0";
    if (statPassed) statPassed.textContent = "0";
    if (statFailed) statFailed.textContent = "0";
    if (statProgress) statProgress.textContent = "0";
    if (statPending) statPending.textContent = "0";
    return;
  }
  if (empty) empty.style.display = "none";

  let passed = 0, failed = 0, progress = 0, pending = 0;
  for (const item of items) {
    switch (item.resultStatus) {
      case "passed": passed++; break;
      case "failed": failed++; break;
      case "in_progress": progress++; break;
      default: pending++; break;
    }
  }

  if (totalEl) totalEl.textContent = String(items.length);
  if (statTotal) statTotal.textContent = String(items.length);
  if (statPassed) statPassed.textContent = String(passed);
  if (statFailed) statFailed.textContent = String(failed);
  if (statProgress) statProgress.textContent = String(progress);
  if (statPending) statPending.textContent = String(pending);

  tbody.innerHTML = items
    .map((item, idx) => {
      const statusOptions = Object.entries(RESULT_STATUS)
        .map(([k, v]) => `<option value="${k}" ${k === item.resultStatus ? "selected" : ""}>${v}</option>`)
        .join("");

      const censorOptions = Object.entries(CENSOR_TYPES)
        .map(([k, v]) => `<option value="${k}" ${k === item.censorType ? "selected" : ""}>${v}</option>`)
        .join("");

      return `
      <tr data-id="${item.id}">
        <td>${idx + 1}</td>
        <td><input type="text" data-field="name" value="${escapeHtml(item.name)}" class="item-input" placeholder="试验项目名称" /></td>
        <td><input type="text" data-field="testObject" value="${escapeHtml(item.testObject)}" class="item-input" placeholder="试验对象" /></td>
        <td><input type="text" data-field="testCondition" value="${escapeHtml(item.testCondition)}" class="item-input" placeholder="试验工况" /></td>
        <td class="tp-sample-size">${item.sampleSize ? Math.abs(item.sampleSize) : "-"}</td>
        <td>
          <select data-field="censorType" class="item-input">
            ${censorOptions}
          </select>
        </td>
        <td><input type="text" data-field="acceptanceCriteria" value="${escapeHtml(item.acceptanceCriteria)}" class="item-input" placeholder="验收标准" /></td>
        <td>
          <select data-field="resultStatus" class="item-input ${getResultStatusClass(item.resultStatus)}">
            ${statusOptions}
          </select>
        </td>
        <td><input type="text" data-field="resultNote" value="${escapeHtml(item.resultNote)}" class="item-input" placeholder="备注" /></td>
      </tr>`;
    })
    .join("");
}

function bindDvprEvents(container) {
  const tbody = container.querySelector("#dvpr-tbody");
  if (!tbody) return;

  tbody.addEventListener("change", (e) => {
    const el = e.target.closest("[data-field]");
    if (!el) return;
    const tr = el.closest("tr");
    const id = tr.dataset.id;
    const field = el.dataset.field;
    const item = currentModel.modules.testPlan.testItems.find((i) => i.id === id);
    if (!item) return;

    let val = el.value;
    if (el.type === "number") val = Number(val) || 0;
    item[field] = val;

    if (
      field === "targetLife" ||
      field === "targetReliability" ||
      field === "censorType" ||
      field === "testLevel" ||
      field === "beta"
    ) {
      const params = currentModel.modules.testPlan.globalParams;
      item.testDuration = calculateTestDuration(
        item.targetLife, item.censorType, item.beta, item.testLevel, params.strategy, item.durationMultiplier
      );
      item.sampleSize = calculateSampleSize(
        item.targetReliability,
        params.confidence,
        params.allowedFailures,
        item.targetLife,
        item.beta,
        item.testDuration
      );
    }

    autoSave();
    renderDvprTable();
    renderTestItems();
  });
}

function renderOptimizePanel() {
  const panel = document.getElementById("tp-optimize-panel");
  if (!panel) return;

  const items = currentModel.modules.testPlan.testItems;
  const params = currentModel.modules.testPlan.globalParams;

  if (!items || items.length === 0) {
    panel.innerHTML = `<div class="tp-optimize-empty">暂无试验项目，请先添加试验项目。</div>`;
    return;
  }

  let totalStandardN = 0;
  let totalOptimizedN = 0;
  let hasOptimization = false;

  const rows = items.map((item, idx) => {
    const R = Number(item.targetReliability) || 0.9;
    const gamma = params.confidence;
    const r = Math.max(0, Math.floor(Number(params.allowedFailures) || 0));
    const b10 = Number(item.targetLife) || 0;
    const b = Number(item.beta) || 2.2;

    // 标准方案
    const stdDuration = calculateTestDuration(b10, item.censorType, b, item.testLevel, "standard");
    const stdN = binomialSampleSize(R, gamma, r);

    // 优化方案
    const optDuration = calculateTestDuration(b10, item.censorType, b, item.testLevel, "optimized");
    let optN;
    if (b10 > 0 && b > 0 && optDuration > b10) {
      const R_test = Math.exp(-K10 * Math.pow(optDuration / b10, b));
      optN = binomialSampleSize(R_test, gamma, r);
      hasOptimization = true;
    } else {
      optN = stdN;
    }

    totalStandardN += stdN;
    totalOptimizedN += optN;

    const saved = stdN - optN;
    const pct = stdN > 0 ? ((saved / stdN) * 100).toFixed(1) : "0.0";
    const isOptimized = saved > 0;

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(item.name || "(未命名)")}</td>
        <td class="tp-opt-value">${stdN}</td>
        <td class="tp-opt-value">${stdDuration}h</td>
        <td class="tp-opt-value ${isOptimized ? "tp-save-highlight" : ""}">${optN}</td>
        <td class="tp-opt-value ${isOptimized ? "tp-save-highlight" : ""}">${optDuration}h</td>
        <td class="tp-opt-value ${isOptimized ? "tp-save-highlight" : ""}">${isOptimized ? `-${saved} (${pct}%)` : "-"}</td>
      </tr>`;
  }).join("");

  const totalSaved = totalStandardN - totalOptimizedN;
  const totalPct = totalStandardN > 0 ? ((totalSaved / totalStandardN) * 100).toFixed(1) : "0.0";

  panel.innerHTML = `
    <div class="tp-optimize-hint">
      Weibull 延长试验可降低等效可靠度要求，从而减少样本量。部件级默认 2.2×B10，整机级默认 1.3×B10。
    </div>
    <div class="table-wrap">
      <table class="data-table tp-compare-table">
        <thead>
          <tr>
            <th style="width: 50px;">序号</th>
            <th style="min-width: 150px;">测试项目</th>
            <th style="width: 90px;">标准样本量</th>
            <th style="width: 110px;">标准试验时长</th>
            <th style="width: 90px;">优化样本量</th>
            <th style="width: 110px;">优化试验时长</th>
            <th style="width: 120px;">节省</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="tp-optimize-summary">
      <span>合计：标准 <strong>${totalStandardN}</strong> 件 → 优化 <strong>${totalOptimizedN}</strong> 件</span>
      ${totalSaved > 0 ? `<span>节省 <strong class="tp-save-highlight">${totalSaved}</strong> 件 (${totalPct}%)</span>` : ""}
    </div>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let saActiveTab = "qualification";

function switchSampleAnalysisTab(tabName) {
  saActiveTab = tabName;
  document.querySelectorAll(".sample-analysis-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
  document.querySelectorAll(".sample-analysis-tab-content").forEach((c) => {
    c.style.display = "none";
  });
  const tabEl = document.getElementById(`tp-sa-tab-${tabName}`);
  if (tabEl) tabEl.style.display = "";
}

function calculateQualificationAnalysis() {
  const R = (Number(document.getElementById("tp-sa-reliability")?.value) || 90) / 100;
  const CL = (Number(document.getElementById("tp-sa-confidence")?.value) || 90) / 100;
  const r = Math.max(0, Math.floor(Number(document.getElementById("tp-sa-allowed")?.value) || 0));

  if (R <= 0 || R >= 1) {
    document.getElementById("tp-sa-qual-n").textContent = "-";
    document.getElementById("tp-sa-qual-pass").textContent = "-";
    return;
  }

  const n = binomialSampleSize(R, CL, r);
  const zeroFailProb = Math.pow(R, n);

  document.getElementById("tp-sa-qual-n").textContent = n;
  document.getElementById("tp-sa-qual-pass").textContent = (zeroFailProb * 100).toFixed(2) + "%";
}

function calculateLifeTestAnalysis() {
  const B10 = Number(document.getElementById("tp-sa-b10")?.value) || 150;
  const beta = Number(document.getElementById("tp-sa-beta")?.value) || 2.2;
  const CL = (Number(document.getElementById("tp-sa-life-confidence")?.value) || 90) / 100;
  const r = Math.max(0, Math.floor(Number(document.getElementById("tp-sa-life-allowed")?.value) || 0));
  const multiplier = Number(document.getElementById("tp-sa-multiplier")?.value) || 1.0;

  if (B10 <= 0 || beta <= 0) {
    document.getElementById("tp-sa-life-duration").textContent = "-";
    document.getElementById("tp-sa-life-n").textContent = "-";
    document.getElementById("tp-sa-life-rtest").textContent = "-";
    document.getElementById("tp-sa-life-total").textContent = "-";
    document.getElementById("tp-sa-life-comparison").innerHTML = "";
    return;
  }

  const duration = Math.ceil(B10 * multiplier);
  const R_test = Math.exp(-K10 * Math.pow(duration / B10, beta));
  const n = binomialSampleSize(R_test, CL, r);
  const totalHours = n * duration;

  document.getElementById("tp-sa-life-duration").textContent = duration + "h";
  document.getElementById("tp-sa-life-n").textContent = n;
  document.getElementById("tp-sa-life-rtest").textContent = (R_test * 100).toFixed(1) + "%";
  document.getElementById("tp-sa-life-total").textContent = totalHours + " 台时";

  const multipliers = [1.0, 1.2, 1.5, 1.7, 2.0, 2.5];
  const baseN = binomialSampleSize(0.9, CL, r);
  const baseHours = baseN * B10;

  let rows = "";
  multipliers.forEach(m => {
    const dur = Math.ceil(B10 * m);
    const rTest = Math.exp(-K10 * Math.pow(dur / B10, beta));
    const num = binomialSampleSize(rTest, CL, r);
    const hours = num * dur;
    const save = baseHours > 0 ? ((1 - hours / baseHours) * 100).toFixed(0) : 0;
    const isCurrent = Math.abs(m - multiplier) < 0.01;
    rows += `<tr ${isCurrent ? 'style="background: var(--surface-2);"' : ""}>
      <td>${m}×</td>
      <td>${dur}h</td>
      <td>${num}</td>
      <td>${hours}</td>
      <td>${save > 0 ? '<span class="tp-save-highlight">-' + save + '%</span>' : "-"}</td>
    </tr>`;
  });

  document.getElementById("tp-sa-life-comparison").innerHTML = rows;
}
