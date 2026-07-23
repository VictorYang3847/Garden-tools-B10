import { html, render as litRender } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import {
  targetB10,
  targetB10WithoutMargin,
  weibullEta,
  failureRate,
  gammaApprox,
  calcMtbf,
} from "../calculator.js";
import {
  getCurrentProduct,
  addComponent,
  updateComponent,
  removeComponent,
  getComponents,
} from "../store.js";

let currentModel = null;
let onSaveCallback = null;
let lastSyncedB10 = null;
let lastSyncedModelId = null;
let syncBannerTimer = null;
let _container = null; // 渲染容器引用，由 render() 存入

// 产品信息字段定义
const PRODUCT_INFO_FIELDS = [
  { id: "product-model-name", key: "modelName", label: "型号名称", type: "text" },
  { id: "product-project-code", key: "projectCode", label: "项目编号", type: "text" },
  { id: "product-voltage", key: "voltage", label: "电压(V)", type: "number", unit: "V" },
  { id: "product-power", key: "power", label: "功率(W)", type: "number", unit: "W" },
  { id: "product-blade-type", key: "bladeType", label: "刀片类型", type: "text" },
  { id: "product-blade-length", key: "bladeLength", label: "刀片长度(mm)", type: "number", unit: "mm" },
  { id: "product-stroke-rate", key: "strokeRate", label: "往复次数", type: "number" },
  { id: "product-analyst", key: "analyst", label: "分析师", type: "text" },
  { id: "product-note", key: "note", label: "备注", type: "textarea" },
];

// 本地状态（用于 lit-html 渲染）
let state = {
  warrantyYears: 2,
  hoursPerYear: 25,
  allowFailRate: 2,
  beta: 2.2,
  safetyMargin: 20,
  time: 50,
  // 计算结果
  tw: 0,
  b10WithMargin: 0,
  b10NoMargin: 0,
  eta: 0,
  mtbf: 0,
  reliabilityT: 0,
  failureT: 0,
  // 同步横幅
  showSyncBanner: false,
  pendingB10: 0,
  // 公式折叠
  formulaExpanded: false,
  // 产品卡片折叠
  productInfoCollapsed: true,
  // 零部件管理折叠
  componentMgrCollapsed: false,
  // 零部件编辑弹窗
  componentEditing: null, // null=关闭, {mode:'add'|'edit', data:{...}}
};

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;
  _container = container;
  if (lastSyncedModelId !== model?.id) {
    lastSyncedModelId = model?.id;
    lastSyncedB10 = null;
  }
  loadStateFromModel();
  doRender(container);
}

function loadStateFromModel() {
  const hc = currentModel?.homeCalc;
  if (!hc) return;
  state.warrantyYears = hc.warrantyYears ?? 2;
  state.hoursPerYear = hc.hoursPerYear ?? 25;
  state.allowFailRate = hc.allowFailRate ?? 2;
  state.beta = hc.beta ?? 2.2;
  state.safetyMargin = hc.safetyMargin ?? 20;
  state.time = hc.time ?? 50;
}

function saveStateToModel() {
  if (!currentModel) return;
  const hc = currentModel.homeCalc || {};
  hc.warrantyYears = state.warrantyYears;
  hc.hoursPerYear = state.hoursPerYear;
  hc.allowFailRate = state.allowFailRate;
  hc.beta = state.beta;
  hc.safetyMargin = state.safetyMargin;
  hc.time = state.time;
  currentModel.homeCalc = hc;
  if (typeof onSaveCallback === "function") {
    onSaveCallback({ homeCalc: hc });
  }
}

function doRender(container) {
  calculate();
  litRender(html`
    <div class="module-page home-page">
      ${renderWelcome()}
      ${renderToolCards()}
      ${renderProductInfoCard()}
      ${renderComponentManager()}
      ${renderB10Calculator()}
      ${renderQuickStart()}
      ${state.componentEditing ? renderComponentModal() : ''}
    </div>
  `, container);
}

function renderWelcome() {
  return html`
    <div class="home-welcome">
      <h1 class="home-title">可靠性工具平台</h1>
      <p class="home-subtitle">专业的锂电产品可靠性分析与计算工具</p>
    </div>
  `;
}

function renderToolCards() {
  const cards = [
    { href: "#/fmea", icon: "🔍", name: "FMEA分析", desc: "失效模式与影响分析" },
    { href: "#/prediction", icon: "📊", name: "可靠性预测", desc: "系统可靠性预计与分配" },
    { href: "#/life-data", icon: "📈", name: "寿命数据分析", desc: "Weibull分布与B10计算" },
    { href: "#/test-plan", icon: "📋", name: "测试计划", desc: "试验方案设计与评估" },
    { href: "#/fta", icon: "🌳", name: "故障树分析", desc: "FTA故障树分析" },
    { href: "#/growth", icon: "📈", name: "可靠性增长", desc: "可靠性增长模型" },
    { href: "#/data", icon: "💾", name: "数据管理", desc: "项目数据导入导出" },
  ];
  return html`
    <div class="home-section">
      <h2 class="home-section-title">工具快捷入口</h2>
      <div class="tool-cards-grid">
        ${cards.map(c => html`
          <a href="${c.href}" class="tool-card">
            <div class="tool-card-icon">${c.icon}</div>
            <div class="tool-card-name">${c.name}</div>
            <div class="tool-card-desc">${c.desc}</div>
          </a>
        `)}
      </div>
    </div>
  `;
}

function renderProductInfoCard() {
  const summary = getProductInfoSummary();
  return html`
    <div class="home-section">
      <div class="card product-info-card collapsible" data-collapsed="${state.productInfoCollapsed ? 'true' : 'false'}">
        <div class="card-header collapsible-header" id="product-info-header" @click=${toggleProductInfoCollapse}>
          <div class="collapsible-title">
            <span class="collapse-indicator" aria-hidden="true">${state.productInfoCollapsed ? '▶' : '▼'}</span>
            <h3>产品信息</h3>
          </div>
          <div class="product-info-summary" id="product-info-summary">${summary}</div>
        </div>
        <div class="card-body collapsible-body">
          <div class="product-info-grid">
            ${PRODUCT_INFO_FIELDS.map(f => html`
              <div class="form-group${f.type === 'textarea' ? ' full-width' : ''}">
                <label>${f.label}</label>
                ${f.type === 'textarea'
                  ? html`<textarea id="${f.id}" class="form-input" rows="2" placeholder="请输入${f.label}" .value=${live(getProductInfoValue(f.key))} @input=${(e) => onProductInfoChange(f.key, e.target.value)}></textarea>`
                  : html`<input type="${f.type}" id="${f.id}" class="form-input" min="${f.type === 'number' ? '0' : undefined}" step="${f.type === 'number' ? (f.unit ? '0.1' : '1') : undefined}" placeholder="请输入${f.label}" .value=${live(getProductInfoValue(f.key))} @input=${(e) => onProductInfoChange(f.key, f.type === 'number' ? Number(e.target.value) || 0 : e.target.value)} />`
                }
              </div>
            `)}
          </div>
        </div>
      </div>
    </div>
  `;
}

function getProductInfoValue(key) {
  const pi = currentModel?.productInfo || {};
  let val = pi[key];
  if (key === "modelName" && (val === undefined || val === null || val === "")) {
    val = currentModel?.name ?? "";
  }
  return val ?? "";
}

function onProductInfoChange(key, value) {
  if (!currentModel) return;
  const pi = currentModel.productInfo || {};
  pi[key] = value;
  pi.updatedAt = new Date().toISOString();
  currentModel.productInfo = pi;

  // 同步型号名称到 model.name
  if (key === "modelName") {
    const newName = value || "";
    if (newName && newName !== currentModel.name) {
      currentModel.name = newName;
    }
  }

  if (typeof onSaveCallback === "function") {
    const payload = { productInfo: pi };
    if (key === "modelName" && value !== currentModel.name) {
      payload.name = value;
    }
    onSaveCallback(payload);
  }
}

function getProductInfoSummary() {
  const modelName = getProductInfoValue("modelName") || currentModel?.name || "未命名型号";
  const projectCode = getProductInfoValue("projectCode");
  return projectCode ? `${modelName} | ${projectCode}` : modelName;
}

function toggleProductInfoCollapse() {
  state.productInfoCollapsed = !state.productInfoCollapsed;
  doRender(_container);
}

// ========== 零部件管理板块 ==========

const COMPONENT_CATEGORIES = {
  electronic: "电子类",
  mechanical: "机械类",
  electromechanical: "机电类",
  electrochemical: "电化学类",
  other: "其他",
};

const COMPONENT_TYPES = {
  resistor: "电阻", capacitor: "电容", inductor: "电感",
  diode: "二极管", transistor: "晶体管", ic_digital: "IC(数字)",
  ic_analog: "IC(模拟)", sensor: "传感器", connector: "连接器",
  relay: "继电器", switch: "开关", motor: "电机",
  gear: "齿轮/齿轮箱", bearing: "轴承", blade: "刀片",
  spring: "弹簧", seal: "密封件",
  battery: "电池/电池包",
  pcb: "PCB电路板", cable: "线缆", other: "其他",
};

function renderComponentManager() {
  const product = getCurrentProduct();
  if (!product) return html``;
  const components = product.productShared?.components || [];

  return html`
    <div class="home-section">
      <div class="card component-manager-card collapsible" data-collapsed="${state.componentMgrCollapsed ? 'true' : 'false'}">
        <div class="card-header collapsible-header" @click=${toggleComponentMgrCollapse}>
          <div class="collapsible-title">
            <span class="collapse-indicator" aria-hidden="true">${state.componentMgrCollapsed ? '▶' : '▼'}</span>
            <h3>零部件管理</h3>
          </div>
          <div class="component-summary">共 ${components.length} 个零部件</div>
        </div>
        <div class="card-body collapsible-body">
          <div class="component-toolbar">
            <button type="button" class="btn btn-primary btn-sm" @click=${(e) => { e.stopPropagation(); openComponentModal(); }}>
              + 添加零部件
            </button>
          </div>
          <div class="table-wrap">
            ${components.length === 0 ? html`
              <div class="empty-state">
                <p>暂无零部件数据，点击「添加零部件」开始创建</p>
                <p class="empty-hint">各分析模块中输入的零部件也会自动注册到这里</p>
              </div>
            ` : html`
              <table class="data-table component-table resizable">
                <colgroup>
                  <col><col><col><col><col><col><col>
                </colgroup>
                <thead>
                  <tr>
                    <th style="width:36px;">#</th>
                    <th style="width:120px;">名称</th>
                    <th style="width:60px;">类别</th>
                    <th style="width:70px;">类型</th>
                    <th>描述</th>
                    <th style="width:40px;">引用</th>
                    <th style="width:100px;" class="col-actions" data-no-resize>操作</th>
                  </tr>
                </thead>
                <tbody>
                  ${components.map((comp, idx) => html`
                    <tr data-comp-id="${comp.id}">
                      <td class="col-nowrap">${idx + 1}</td>
                      <td class="col-nowrap">${comp.name}</td>
                      <td class="col-nowrap">${COMPONENT_CATEGORIES[comp.category] || comp.category}</td>
                      <td class="col-nowrap">${COMPONENT_TYPES[comp.type] || comp.type}</td>
                      <td class="col-desc">${comp.description || '-'}</td>
                      <td class="col-nowrap">${countComponentReferences(product, comp.id)}</td>
                      <td class="col-actions">
                        <button type="button" class="btn-link" @click=${(e) => { e.stopPropagation(); editComponent(comp); }}>编辑</button>
                        <button type="button" class="btn-link btn-danger-link" @click=${(e) => { e.stopPropagation(); deleteComponent(comp.id, comp.name); }}>删除</button>
                      </td>
                    </tr>
                  `)}
                </tbody>
              </table>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
}

function toggleComponentMgrCollapse() {
  state.componentMgrCollapsed = !state.componentMgrCollapsed;
  doRender(_container);
}

/** 统计某零部件在各模块中被引用的次数 */
function countComponentReferences(product, componentId) {
  let count = 0;
  for (const model of product.models || []) {
    const m = model.modules;
    if (!m) continue;
    // FMEA
    if (m.fmea?.items) {
      count += m.fmea.items.filter(i => i.componentId === componentId).length;
    }
    // Prediction
    if (m.prediction?.components) {
      count += m.prediction.components.filter(c => c.componentId === componentId).length;
    }
    // Allocation
    if (m.prediction?.allocation?.subsystems) {
      count += m.prediction.allocation.subsystems.filter(s => s.componentId === componentId).length;
    }
    // LifeData
    if (m.lifeData?.batches) {
      for (const batch of m.lifeData.batches) {
        count += (batch.items || []).filter(i => i.componentId === componentId).length;
      }
    }
    // Growth
    if (m.growth?.phases) {
      for (const phase of m.growth.phases) {
        count += (phase.failures || []).filter(f => f.componentId === componentId).length;
      }
    }
    // Maintenance
    if (m.maintenance?.spares) {
      count += m.maintenance.spares.filter(s => s.componentId === componentId).length;
    }
    // Derating
    if (m.derating?.components) {
      count += m.derating.components.filter(c => c.componentId === componentId).length;
    }
  }
  return count;
}

function openComponentModal() {
  state.componentEditing = {
    mode: 'add',
    data: { name: '', category: 'mechanical', type: 'other', description: '', aliases: '' },
  };
  doRender(_container);
}

function editComponent(comp) {
  state.componentEditing = {
    mode: 'edit',
    id: comp.id,
    data: {
      name: comp.name || '',
      category: comp.category || 'other',
      type: comp.type || 'other',
      description: comp.description || '',
      aliases: (comp.aliases || []).join(', '),
    },
  };
  doRender(_container);
}

function deleteComponent(componentId, name) {
  const product = getCurrentProduct();
  if (!product) return;
  const refCount = countComponentReferences(product, componentId);
  const msg = refCount > 0
    ? `零部件「${name}」被 ${refCount} 处引用，删除后这些引用将变为悬空（各模块中仍保留原名称显示）。确认删除？`
    : `确认删除零部件「${name}」？`;
  if (!confirm(msg)) return;
  removeComponent(product.id, componentId);
  doRender(_container);
}

function renderComponentModal() {
  const editing = state.componentEditing;
  const d = editing.data;
  const isEdit = editing.mode === 'edit';

  return html`
    <div class="modal-overlay" @click=${onComponentModalCancel}>
      <div class="modal-dialog component-modal" @click=${(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>${isEdit ? '编辑零部件' : '添加零部件'}</h3>
          <button type="button" class="modal-close" @click=${onComponentModalCancel}>x</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>名称 <span class="required">*</span></label>
            <input type="text" class="form-input" id="comp-name" .value=${d.name}
                   placeholder="如：行星齿轮箱" @input=${(e) => { d.name = e.target.value; }} />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>类别</label>
              <select class="form-input" id="comp-category" .value=${d.category}
                      @change=${(e) => { d.category = e.target.value; }}>
                ${Object.entries(COMPONENT_CATEGORIES).map(([k, v]) => html`<option value="${k}" ?selected=${d.category === k}>${v}</option>`)}
              </select>
            </div>
            <div class="form-group">
              <label>类型</label>
              <select class="form-input" id="comp-type" .value=${d.type}
                      @change=${(e) => { d.type = e.target.value; }}>
                ${Object.entries(COMPONENT_TYPES).map(([k, v]) => html`<option value="${k}" ?selected=${d.type === k}>${v}</option>`)}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>描述</label>
            <input type="text" class="form-input" id="comp-desc" .value=${d.description}
                   placeholder="零部件描述（可选）" @input=${(e) => { d.description = e.target.value; }} />
          </div>
          <div class="form-group">
            <label>别名</label>
            <input type="text" class="form-input" id="comp-aliases" .value=${d.aliases}
                   placeholder="多个别名用逗号分隔，如：齿轮箱, gearbox" @input=${(e) => { d.aliases = e.target.value; }} />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click=${onComponentModalCancel}>取消</button>
          <button type="button" class="btn btn-primary" @click=${onComponentModalSave}>${isEdit ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  `;
}

function onComponentModalSave() {
  const product = getCurrentProduct();
  if (!product) return;
  const editing = state.componentEditing;
  const d = editing.data;
  const name = (d.name || '').trim();
  if (!name) {
    alert('请输入零部件名称');
    return;
  }
  const aliases = (d.aliases || '').split(',').map(a => a.trim()).filter(Boolean);
  const payload = {
    name,
    category: d.category,
    type: d.type,
    description: d.description || '',
    aliases,
  };
  if (editing.mode === 'edit') {
    updateComponent(product.id, editing.id, payload);
  } else {
    addComponent(product.id, payload);
  }
  state.componentEditing = null;
  doRender(_container);
}

function onComponentModalCancel() {
  state.componentEditing = null;
  doRender(_container);
}

function renderB10Calculator() {
  return html`
    <div class="home-section">
      <div class="card b10-quick-card">
        <div class="card-header">
          <h3>B10 目标定义计算器</h3>
        </div>
        <div class="card-body">
          <div class="b10-calc-layout">
            <div class="b10-calc-inputs">
              <div class="form-group">
                <label>质保期 (年)</label>
                <input type="number" class="form-input" min="0.5" max="10" step="0.5" .value=${live(state.warrantyYears)} @input=${(e) => onB10Input('warrantyYears', Number(e.target.value))} />
              </div>
              <div class="form-group">
                <label>年使用时长 (小时/年)</label>
                <input type="number" class="form-input" min="1" max="1000" step="1" .value=${live(state.hoursPerYear)} @input=${(e) => onB10Input('hoursPerYear', Number(e.target.value))} />
              </div>
              <div class="form-group">
                <label>允许失效率 (%)</label>
                <input type="number" class="form-input" min="0.1" max="10" step="0.1" .value=${live(state.allowFailRate)} @input=${(e) => onB10Input('allowFailRate', Number(e.target.value))} />
              </div>
              <div class="form-group">
                <label>形状参数 β<span class="help-icon" data-tooltip="Weibull形状参数：β>1磨损失效(典型2.0~2.5)，β=1随机失效，β<1早期失效">?</span></label>
                <input type="number" class="form-input" min="0.1" step="0.1" .value=${live(state.beta)} @input=${(e) => onB10Input('beta', Number(e.target.value))} />
              </div>
              <div class="form-group">
                <label>安全余量 (%)<span class="help-icon" data-tooltip="设计余量，行业常用20%~30%，考虑制造波动和使用条件变化">?</span></label>
                <input type="number" class="form-input" min="0" max="50" step="5" .value=${live(state.safetyMargin)} @input=${(e) => onB10Input('safetyMargin', Number(e.target.value))} />
              </div>
              <div class="form-group">
                <label>指定时间 t (小时)<span class="help-icon" data-tooltip="查询该时刻的可靠度，例如质保总时长或设计寿命">?</span></label>
                <input type="number" class="form-input" min="0" step="1" .value=${live(state.time)} @input=${(e) => onB10Input('time', Number(e.target.value))} />
              </div>
            </div>
            <div class="b10-calc-results">
              ${renderMetricCard('质保总时长 Tw', state.tw.toFixed(0), '小时')}
              ${renderMetricCard('目标 B10 (含余量)', state.b10WithMargin.toFixed(1), '小时', true)}
              ${state.showSyncBanner ? html`
                <div class="b10-sync-banner" id="b10-sync-banner">
                  <span class="sync-banner-text">目标B10已更新为 ${state.pendingB10.toFixed(1)} 小时，是否同步到其他模块？</span>
                  <div class="sync-banner-actions">
                    <button type="button" class="btn-sync-confirm" id="b10-sync-btn" @click=${onSyncConfirm}>同步</button>
                    <button type="button" class="btn-sync-dismiss" id="b10-sync-dismiss" @click=${onSyncDismiss}>忽略</button>
                  </div>
                </div>
              ` : ''}
              ${renderMetricCard('目标 B10 (不含余量)', state.b10NoMargin.toFixed(1), '小时')}
              ${renderMetricCard('所需特征寿命 η', state.eta.toFixed(1), '小时')}
              ${renderMetricCard('所需 MTBF', state.mtbf.toFixed(1), '小时')}
              ${renderMetricCard('t 时刻可靠度', (state.reliabilityT * 100).toFixed(2), '%')}
              ${renderMetricCard('t 时刻失效概率', (state.failureT * 100).toFixed(2), '%')}
            </div>
          </div>
          <div class="b10-formula-section">
            <button type="button" class="formula-toggle" id="home-formula-toggle" @click=${toggleFormula}>${state.formulaExpanded ? ' 收起公式' : '📐 查看计算公式'}</button>
            ${state.formulaExpanded ? html`
              <div class="formula-content formula-grid" id="home-formula-content">
                <div class="formula-item">
                  <h4>质保总时长</h4>
                  <div class="formula-equation">Tw = 质保年数 × 年使用时长</div>
                </div>
                <div class="formula-item">
                  <h4>特征寿命 η</h4>
                  <div class="formula-equation">η = B10 / [ln(10/9)]<sup>1/β</sup></div>
                </div>
                <div class="formula-item">
                  <h4>MTBF</h4>
                  <div class="formula-equation">MTBF = η × Γ(1 + 1/β)</div>
                </div>
                <div class="formula-item">
                  <h4>t 时刻可靠度</h4>
                  <div class="formula-equation">R(t) = exp(-(t/η)<sup>β</sup>)</div>
                </div>
                <div class="formula-item formula-item-wide">
                  <h4>目标 B10 寿命（含安全余量）</h4>
                  <div class="formula-equation">B10 = Tw × [ln(10/9) / -ln(1-Fw)]<sup>1/β</sup> × (1 + margin)</div>
                  <div class="formula-vars-inline">
                    <span class="var-chip"><b>Tw</b>质保总时长</span>
                    <span class="var-chip"><b>Fw</b>允许失效率</span>
                    <span class="var-chip"><b>β</b>形状参数</span>
                    <span class="var-chip"><b>margin</b>安全余量</span>
                  </div>
                  <div class="formula-note">ln(10/9)≈0.10536，B10点对应的标准常数</div>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderMetricCard(label, value, unit, highlight) {
  return html`
    <div class="metric-card${highlight ? ' b10-highlight' : ''}">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-unit">${unit}</div>
    </div>
  `;
}

function onB10Input(field, value) {
  state[field] = value;
  saveStateToModel();
  checkB10Sync();
  doRender(_container);
}

function calculate() {
  const { warrantyYears, hoursPerYear, allowFailRate, beta, safetyMargin, time } = state;

  if (warrantyYears <= 0 || hoursPerYear <= 0 || allowFailRate <= 0 || beta <= 0) {
    state.tw = 0;
    state.b10WithMargin = 0;
    state.b10NoMargin = 0;
    state.eta = 0;
    state.mtbf = 0;
    state.reliabilityT = 0;
    state.failureT = 0;
    return;
  }

  const tw = warrantyYears * hoursPerYear;
  const fw = allowFailRate / 100;
  const margin = safetyMargin / 100;

  state.tw = tw;
  state.b10WithMargin = targetB10(tw, fw, beta, margin);
  state.b10NoMargin = targetB10WithoutMargin(tw, fw, beta);
  state.eta = weibullEta(state.b10WithMargin, beta);
  state.mtbf = calcMtbf(state.eta, beta);
  state.failureT = failureRate(time, state.b10WithMargin, beta);
  state.reliabilityT = 1 - state.failureT;
}

function checkB10Sync() {
  if (!currentModel) return;
  if (lastSyncedB10 === null) {
    lastSyncedB10 = state.b10WithMargin;
    return;
  }
  const diff = Math.abs(state.b10WithMargin - lastSyncedB10);
  if (diff < 0.1) return;
  state.showSyncBanner = true;
  state.pendingB10 = state.b10WithMargin;
}

function onSyncConfirm() {
  if (!currentModel) return;
  syncB10ToModules(state.pendingB10);
  lastSyncedB10 = state.pendingB10;
  state.showSyncBanner = false;
  doRender(_container);
}

function onSyncDismiss() {
  lastSyncedB10 = state.pendingB10;
  state.showSyncBanner = false;
  doRender(_container);
}

function syncB10ToModules(b10Value) {
  if (!currentModel) return;
  const prediction = currentModel.modules?.prediction;
  if (prediction?.allocation) {
    prediction.allocation.targetB10 = b10Value;
  }
  if (typeof onSaveCallback === "function") {
    onSaveCallback({});
  }
}

function toggleFormula() {
  state.formulaExpanded = !state.formulaExpanded;
  doRender(_container);
}

function renderQuickStart() {
  const steps = [
    { num: 1, title: "创建/选择产品型号", desc: "在顶部选择器中创建或选择您的产品和型号" },
    { num: 2, title: "使用工具进行分析", desc: "从左侧导航或上方快捷入口进入所需的可靠性分析工具" },
    { num: 3, title: "导出结果或保存数据", desc: "完成分析后，可导出结果或通过数据管理保存项目数据" },
  ];
  return html`
    <div class="home-section">
      <h2 class="home-section-title">快速开始</h2>
      <div class="quick-start-steps">
        ${steps.map(s => html`
          <div class="step-card">
            <div class="step-number">${s.num}</div>
            <div class="step-content">
              <h3>${s.title}</h3>
              <p>${s.desc}</p>
            </div>
          </div>
        `)}
      </div>
    </div>
  `;
}
