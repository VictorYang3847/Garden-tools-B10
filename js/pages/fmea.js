import { html, render as litRender } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { getCurrentProduct, getProductShared } from "../store.js";

let onSaveCallback = null;
let currentModel = null;
let currentFilter = "all";
let fmeaData = null;
let currentRatingInput = null;
let currentRatingType = null;
const expandedRows = new Set();

const SEVERITY_RATINGS = [
  { score: 10, desc: "危及安全/违反法规，无预警" },
  { score: 9, desc: "危及安全/违反法规，有预警" },
  { score: 8, desc: "系统完全失效，无法使用" },
  { score: 7, desc: "性能严重下降，客户不满意" },
  { score: 6, desc: "性能中度下降，客户有抱怨" },
  { score: 5, desc: "性能轻微下降，客户可察觉" },
  { score: 4, desc: "外观/舒适性有缺陷，多数客户发现" },
  { score: 3, desc: "外观/舒适性有缺陷，部分客户发现" },
  { score: 2, desc: "外观有轻微缺陷，挑剔客户发现" },
  { score: 1, desc: "无影响，客户察觉不到" },
];

const OCCURRENCE_RATINGS = [
  { score: 10, desc: "几乎必然发生，失效率≥1/2" },
  { score: 9, desc: "很高，失效率≈1/3" },
  { score: 8, desc: "高，失效率≈1/8" },
  { score: 7, desc: "较高，失效率≈1/20" },
  { score: 6, desc: "中等，失效率≈1/50" },
  { score: 5, desc: "一般，失效率≈1/100" },
  { score: 4, desc: "较低，失效率≈1/500" },
  { score: 3, desc: "低，失效率≈1/2000" },
  { score: 2, desc: "极低，失效率≈1/10000" },
  { score: 1, desc: "几乎不可能，失效率≤1/100000" },
];

const DETECTION_RATINGS = [
  { score: 10, desc: "完全无法探测，无任何检测手段" },
  { score: 9, desc: "探测几率极低，几乎不可能发现" },
  { score: 8, desc: "探测几率很低，依靠人工抽检" },
  { score: 7, desc: "探测几率低，抽样检测" },
  { score: 6, desc: "中等探测几率，100%人工检验" },
  { score: 5, desc: "中等偏上，自动化检测覆盖率50%" },
  { score: 4, desc: "较高探测几率，自动化检测覆盖率100%" },
  { score: 3, desc: "高探测几率，多重检测" },
  { score: 2, desc: "很高探测几率，防错设计" },
  { score: 1, desc: "肯定能探测到，设计验证/防错" },
];

function genId() {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(val, min, max) {
  const n = Number(val);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function calculateRpn(s, o, d) {
  return clamp(s, 1, 10) * clamp(o, 1, 10) * clamp(d, 1, 10);
}

function calculateAp(s, o, d) {
  const sev = clamp(s, 1, 10);
  const occ = clamp(o, 1, 10);
  const det = clamp(d, 1, 10);
  const rpn = sev * occ * det;

  if (sev >= 9 && occ >= 7) return "H";
  if (sev >= 9 && occ >= 4 && det >= 5) return "H";
  if (sev >= 9 && occ <= 3 && det >= 8) return "H";
  if (sev >= 7 && sev <= 8 && occ >= 7 && det >= 4) return "H";
  if (sev >= 7 && sev <= 8 && occ >= 4 && occ <= 6 && det >= 7) return "H";
  if (sev >= 7 && sev <= 8 && occ <= 3 && det >= 9) return "H";
  if (sev <= 6 && occ >= 7 && det >= 7) return "H";
  if (sev <= 6 && occ >= 4 && occ <= 6 && det >= 9) return "H";

  return rpn >= 100 ? "M" : "L";
}

function createNewItem() {
  const s = 5;
  const o = 3;
  const d = 4;
  return {
    id: genId(),
    function: "",
    failureMode: "",
    effect: "",
    severity: s,
    cause: "",
    occurrence: o,
    controlPrevention: "",
    controlDetection: "",
    detection: d,
    rpn: calculateRpn(s, o, d),
    ap: calculateAp(s, o, d),
    action: "",
    responsible: "",
    targetDate: "",
    newSeverity: 0,
    newOccurrence: 0,
    newDetection: 0,
    newRpn: 0,
    newAp: "",
  };
}

function apBadge(ap) {
  if (!ap) return html`<span class="ap-badge ap-l">-</span>`;
  const label = { H: "H", M: "M", L: "L" }[ap] || ap;
  return html`<span class="ap-badge ap-${ap.toLowerCase()}">${label}</span>`;
}

function getFilteredItems() {
  if (!fmeaData || !fmeaData.items) return [];
  if (currentFilter === "all") return fmeaData.items;
  return fmeaData.items.filter((item) => item.ap === currentFilter);
}

function updateItemCalculations(item) {
  item.severity = clamp(item.severity, 1, 10);
  item.occurrence = clamp(item.occurrence, 1, 10);
  item.detection = clamp(item.detection, 1, 10);
  item.rpn = calculateRpn(item.severity, item.occurrence, item.detection);
  item.ap = calculateAp(item.severity, item.occurrence, item.detection);

  const ns = Number(item.newSeverity) || 0;
  const no = Number(item.newOccurrence) || 0;
  const nd = Number(item.newDetection) || 0;

  if (ns > 0 && no > 0 && nd > 0) {
    item.newSeverity = clamp(ns, 1, 10);
    item.newOccurrence = clamp(no, 1, 10);
    item.newDetection = clamp(nd, 1, 10);
    item.newRpn = calculateRpn(item.newSeverity, item.newOccurrence, item.newDetection);
    item.newAp = calculateAp(item.newSeverity, item.newOccurrence, item.newDetection);
  } else {
    item.newRpn = 0;
    item.newAp = "";
  }
}

function saveData() {
  if (onSaveCallback && currentModel) {
    const updated = {
      ...currentModel,
      modules: {
        ...currentModel.modules,
        fmea: fmeaData,
      },
    };
    onSaveCallback(updated);
  }
}

// --- Event handlers (receive container reference) ---

function handleFieldInput(container, e) {
  const input = e.target;
  if (!input.matches("[data-field]")) return;

  const tr = input.closest("tr");
  if (!tr) return;

  const id = tr.dataset.id;
  const field = input.dataset.field;
  const item = fmeaData.items.find((i) => i.id === id);
  if (!item) return;

  if (input.type === "number") {
    item[field] = Number(input.value) || 0;
  } else {
    item[field] = input.value;
  }

  updateItemCalculations(item);
  saveData();
  // Re-render to update RPN/AP cells
  renderPage(container);
}

function handleDeleteClick(container, e) {
  const btn = e.target.closest("[data-action='delete']");
  if (!btn) return;

  const tr = btn.closest("tr");
  if (!tr) return;

  const id = tr.dataset.id;
  if (!id) return;

  if (!confirm("确定要删除这一行吗？")) return;

  expandedRows.delete(id);
  fmeaData.items = fmeaData.items.filter((i) => i.id !== id);
  saveData();
  renderPage(container);
}

function handleToggleRow(container, e) {
  const btn = e.target.closest("[data-action='toggle']");
  if (!btn) return;

  const tr = btn.closest("tr");
  if (!tr) return;

  const id = tr.dataset.id;
  if (!id) return;

  if (expandedRows.has(id)) {
    expandedRows.delete(id);
  } else {
    expandedRows.add(id);
  }
  renderPage(container);
}

function handleTabClick(container, e) {
  const tab = e.target.closest(".fmea-tab");
  if (!tab) return;

  const type = tab.dataset.type;
  if (!type || type === fmeaData.type) return;

  fmeaData.type = type;
  saveData();
  renderPage(container);
}

function handleAddRow(container) {
  const newItem = createNewItem();
  fmeaData.items.push(newItem);
  saveData();
  renderPage(container);

  // Focus the first input of the new row
  const tbody = container.querySelector("#fmea-table-body");
  if (tbody) {
    const lastRow = tbody.querySelector(`tr.fmea-main-row[data-id="${newItem.id}"]`);
    if (lastRow) {
      const firstInput = lastRow.querySelector("input[data-field='function']");
      if (firstInput) firstInput.focus();
    }
  }
}

function handleFilterChange(container, e) {
  currentFilter = e.target.value;
  renderPage(container);
}

function getRatingData(type) {
  switch (type) {
    case "severity":
      return { ratings: SEVERITY_RATINGS, title: "严重度 (S) 评分标准" };
    case "occurrence":
      return { ratings: OCCURRENCE_RATINGS, title: "发生度 (O) 评分标准" };
    case "detection":
      return { ratings: DETECTION_RATINGS, title: "探测度 (D) 评分标准" };
    default:
      return { ratings: [], title: "评分标准" };
  }
}

function renderRatingContent(type) {
  const { ratings, title } = getRatingData(type);
  const panel = document.getElementById("fmea-rating-panel");
  if (!panel) return;

  const titleEl = panel.querySelector(".rating-panel-title");
  const contentEl = panel.querySelector(".rating-panel-content");

  if (titleEl) titleEl.textContent = title;

  if (contentEl) {
    contentEl.innerHTML = ratings
      .map(
        (item) => `
      <div class="rating-item" data-score="${item.score}">
        <span class="rating-score">${item.score}</span>
        <span class="rating-desc">${item.desc}</span>
      </div>
    `
      )
      .join("");
  }
}

function openRatingPanel(type, inputEl, container) {
  const panel = document.getElementById("fmea-rating-panel");
  if (!panel) return;

  currentRatingInput = inputEl;
  currentRatingType = type;

  renderRatingContent(type);

  panel.style.display = "block";

  const rect = inputEl.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();

  let top = rect.bottom + 4;
  let left = rect.left;

  if (top + panelRect.height > window.innerHeight) {
    top = rect.top - panelRect.height - 4;
  }

  if (top < 0) {
    top = Math.max(8, (window.innerHeight - panelRect.height) / 2);
  }

  if (left + panelRect.width > window.innerWidth) {
    left = window.innerWidth - panelRect.width - 8;
  }

  if (left < 8) left = 8;

  panel.style.top = `${top + window.scrollY}px`;
  panel.style.left = `${left + window.scrollX}px`;
}

function closeRatingPanel() {
  const panel = document.getElementById("fmea-rating-panel");
  if (!panel) return;

  panel.style.display = "none";
  currentRatingInput = null;
  currentRatingType = null;
}

function handleRatingClick(container, e) {
  const item = e.target.closest(".rating-item");
  if (!item) return;

  const score = Number(item.dataset.score);
  if (isNaN(score) || !currentRatingInput) {
    closeRatingPanel();
    return;
  }

  currentRatingInput.value = score;
  currentRatingInput.dispatchEvent(new Event("input", { bubbles: true }));

  closeRatingPanel();
}

function handleRatingInputClick(container, e) {
  const input = e.target.closest(".fmea-num-input");
  if (!input) return;

  const field = input.dataset.field;
  let type = field;
  if (field === "newSeverity") type = "severity";
  else if (field === "newOccurrence") type = "occurrence";
  else if (field === "newDetection") type = "detection";
  else if (field !== "severity" && field !== "occurrence" && field !== "detection") return;

  e.preventDefault();
  openRatingPanel(type, input, container);
}

function handleRatingPanelClose(container, e) {
  const closeBtn = e.target.closest(".rating-panel-close");
  if (!closeBtn) return;

  closeRatingPanel();
}

function handleDocumentClick(e) {
  const panel = document.getElementById("fmea-rating-panel");
  if (!panel || panel.style.display === "none") return;

  if (panel.contains(e.target)) return;

  if (e.target.closest(".fmea-num-input")) return;

  closeRatingPanel();
}

function exportCsv() {
  if (!fmeaData || !fmeaData.items || fmeaData.items.length === 0) {
    alert("暂无数据可导出");
    return;
  }

  const headers = [
    "序号",
    "功能/过程要求",
    "失效模式",
    "失效后果",
    "严重度(S)",
    "失效原因",
    "发生度(O)",
    "现行控制-预防",
    "现行控制-探测",
    "探测度(D)",
    "RPN",
    "AP",
    "建议措施",
    "责任部门/人",
    "目标完成日期",
    "措施结果-S(新)",
    "措施结果-O(新)",
    "措施结果-D(新)",
    "措施结果-RPN(新)",
    "措施结果-AP(新)",
  ];

  const rows = fmeaData.items.map((item, idx) => [
    idx + 1,
    item.function,
    item.failureMode,
    item.effect,
    item.severity,
    item.cause,
    item.occurrence,
    item.controlPrevention,
    item.controlDetection,
    item.detection,
    item.rpn,
    item.ap,
    item.action,
    item.responsible,
    item.targetDate,
    item.newSeverity,
    item.newOccurrence,
    item.newDetection,
    item.newRpn,
    item.newAp,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        })
        .join(",")
    ),
  ].join("\n");

  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FMEA_${fmeaData.type}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleInheritFromTemplate(container) {
  const currentProduct = getCurrentProduct();
  if (!currentProduct) {
    alert("请先选择一个产品");
    return;
  }

  const shared = getProductShared(currentProduct.id);
  const templateItems = shared.fmeaTemplate?.items || [];

  if (!templateItems || templateItems.length === 0) {
    alert("当前产品的 FMEA 模板为空，请先在产品级创建模板数据");
    return;
  }

  const existingIds = new Set(fmeaData.items.map((item) => item.id));
  let addedCount = 0;

  for (const templateItem of templateItems) {
    if (!existingIds.has(templateItem.id)) {
      const newItem = {
        ...templateItem,
        id: genId(),
        _inherited: true,
      };
      updateItemCalculations(newItem);
      fmeaData.items.push(newItem);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    saveData();
    renderPage(container);
    alert(`成功从模板继承 ${addedCount} 个失效模式`);
  } else {
    alert("模板中的失效模式已经全部存在");
  }
}

// --- lit-html rendering ---

function renderMainRow(item, index) {
  const expanded = expandedRows.has(item.id);
  return html`
    <tr data-id="${item.id}" class="fmea-main-row">
      <td class="fmea-toggle-cell">
        <button type="button" class="fmea-toggle-btn" data-action="toggle" title="${expanded ? "折叠" : "展开"}">${expanded ? "▼" : "▶"}</button>
      </td>
      <td class="fmea-index">${index + 1}</td>
      <td><input type="text" class="item-input" data-field="function" .value=${live(item.function ?? "")} placeholder="功能/过程要求" /></td>
      <td><input type="text" class="item-input" data-field="failureMode" .value=${live(item.failureMode ?? "")} placeholder="失效模式" /></td>
      <td><input type="number" class="item-input fmea-num-input" data-field="severity" .value=${live(String(item.severity))} min="1" max="10" /></td>
      <td><input type="number" class="item-input fmea-num-input" data-field="occurrence" .value=${live(String(item.occurrence))} min="1" max="10" /></td>
      <td><input type="number" class="item-input fmea-num-input" data-field="detection" .value=${live(String(item.detection))} min="1" max="10" /></td>
      <td class="fmea-rpn-cell" data-rpn>${item.rpn}</td>
      <td class="fmea-ap-cell" data-ap>${apBadge(item.ap)}</td>
      <td class="fmea-action-cell">
        <button type="button" class="fmea-delete-btn" data-action="delete" title="删除">🗑️</button>
      </td>
    </tr>
    ${renderDetailRow(item, expanded)}
  `;
}

function renderDetailRow(item, expanded) {
  const newApBadge = item.newAp
    ? apBadge(item.newAp)
    : html`<span class="ap-badge ap-l">-</span>`;
  return html`
    <tr data-id="${item.id}" class="fmea-detail-row" style="display: ${expanded ? "table-row" : "none"};">
      <td colspan="10">
        <div class="fmea-detail-grid">
          <div class="fmea-detail-item">
            <label>失效后果</label>
            <input type="text" class="item-input" data-field="effect" .value=${live(item.effect ?? "")} placeholder="失效后果" />
          </div>
          <div class="fmea-detail-item">
            <label>失效原因</label>
            <input type="text" class="item-input" data-field="cause" .value=${live(item.cause ?? "")} placeholder="失效原因" />
          </div>
          <div class="fmea-detail-item">
            <label>现行控制 - 预防</label>
            <input type="text" class="item-input" data-field="controlPrevention" .value=${live(item.controlPrevention ?? "")} placeholder="预防控制" />
          </div>
          <div class="fmea-detail-item">
            <label>现行控制 - 探测</label>
            <input type="text" class="item-input" data-field="controlDetection" .value=${live(item.controlDetection ?? "")} placeholder="探测控制" />
          </div>
          <div class="fmea-detail-item">
            <label>建议措施</label>
            <input type="text" class="item-input" data-field="action" .value=${live(item.action ?? "")} placeholder="建议措施" />
          </div>
          <div class="fmea-detail-item">
            <label>责任部门/人 · 目标完成日期</label>
            <div class="fmea-detail-pair">
              <input type="text" class="item-input" data-field="responsible" .value=${live(item.responsible ?? "")} placeholder="责任部门/人" />
              <input type="date" class="item-input" data-field="targetDate" .value=${live(item.targetDate ?? "")} />
            </div>
          </div>
          <div class="fmea-detail-item fmea-detail-result">
            <label>措施结果（S新 / O新 / D新 → RPN新 / AP新）</label>
            <div class="fmea-detail-result-row">
              <input type="number" class="item-input fmea-num-input" data-field="newSeverity" .value=${live(String(item.newSeverity))} min="0" max="10" placeholder="S新" />
              <input type="number" class="item-input fmea-num-input" data-field="newOccurrence" .value=${live(String(item.newOccurrence))} min="0" max="10" placeholder="O新" />
              <input type="number" class="item-input fmea-num-input" data-field="newDetection" .value=${live(String(item.newDetection))} min="0" max="10" placeholder="D新" />
              <span class="fmea-detail-arrow">→</span>
              <span class="fmea-detail-rpn" data-new-rpn>${item.newRpn || "-"}</span>
              <span class="fmea-detail-ap" data-new-ap>${newApBadge}</span>
            </div>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderPage(container) {
  const items = getFilteredItems();
  let displayIndex = 0;

  const template = html`
    <div class="module-page fmea-page">
      <div class="module-header">
        <h2>FMEA</h2>
        <p>失效模式与影响分析（Failure Mode and Effects Analysis）</p>
      </div>
      <div class="module-content">
        <div class="fmea-toolbar">
          <div class="fmea-tabs">
            <button type="button" class="fmea-tab ${fmeaData.type === 'DFMEA' ? 'active' : ''}" data-type="DFMEA" @click=${(e) => handleTabClick(container, e)}>DFMEA</button>
            <button type="button" class="fmea-tab ${fmeaData.type === 'PFMEA' ? 'active' : ''}" data-type="PFMEA" @click=${(e) => handleTabClick(container, e)}>PFMEA</button>
          </div>
          <div class="fmea-toolbar-right">
            <div class="fmea-filter">
              <label class="filter-label">AP 筛选</label>
              <select class="fmea-filter-select" id="fmea-ap-filter" @change=${(e) => handleFilterChange(container, e)}>
                <option value="all" ${currentFilter === 'all' ? 'selected' : ''}>全部</option>
                <option value="H" ${currentFilter === 'H' ? 'selected' : ''}>H - 高</option>
                <option value="M" ${currentFilter === 'M' ? 'selected' : ''}>M - 中</option>
                <option value="L" ${currentFilter === 'L' ? 'selected' : ''}>L - 低</option>
              </select>
            </div>
            <button type="button" class="btn-icon" id="fmea-inherit-template" @click=${() => handleInheritFromTemplate(container)}>
              <span>📋</span>
              <span class="btn-text">从模板继承</span>
            </button>
            <button type="button" class="btn-icon" id="fmea-add-row" @click=${() => handleAddRow(container)}>
              <span>➕</span>
              <span class="btn-text">添加行</span>
            </button>
            <button type="button" class="btn-icon" id="fmea-export-csv" @click=${exportCsv}>
              <span>📤</span>
              <span class="btn-text">导出 CSV</span>
            </button>
          </div>
        </div>
        <div class="fmea-table-container table-wrap">
          <table class="data-table fmea-table">
            <thead>
              <tr>
                <th style="width: 40px;"></th>
                <th style="width: 50px;">序号</th>
                <th style="min-width: 160px;">功能/要求</th>
                <th style="min-width: 160px;">失效模式</th>
                <th style="width: 70px;">S<span class="help-icon" data-tooltip="严重度(S): 失效后果严重程度，10=危及安全，1=轻微">?</span></th>
                <th style="width: 70px;">O<span class="help-icon" data-tooltip="发生度(O): 失效发生频率，10=几乎必然发生，1=极不可能">?</span></th>
                <th style="width: 70px;">D<span class="help-icon" data-tooltip="探测度(D): 现行控制探测失效的能力，10=无法探测，1=肯定能探测">?</span></th>
                <th style="width: 70px;">RPN</th>
                <th style="width: 70px;">AP</th>
                <th style="width: 70px;">操作</th>
              </tr>
            </thead>
            <tbody id="fmea-table-body">
              ${items.map((item) => {
                displayIndex++;
                return renderMainRow(item, displayIndex - 1);
              })}
            </tbody>
          </table>
          <div class="fmea-empty-state empty-state" id="fmea-empty-state" style="display: ${items.length === 0 ? 'block' : 'none'};">
            <div class="empty-icon">📋</div>
            <h3>暂无 FMEA 数据</h3>
            <p>点击「添加行」按钮开始创建您的第一个 FMEA 条目。</p>
            <button type="button" class="btn-primary" id="fmea-empty-add-btn" @click=${() => handleAddRow(container)}>添加第一行</button>
          </div>
        </div>
      </div>
      <div class="fmea-rating-panel" id="fmea-rating-panel" style="display: none;">
        <div class="rating-panel-header">
          <span class="rating-panel-title">评分标准</span>
          <button type="button" class="rating-panel-close">×</button>
        </div>
        <div class="rating-panel-content" id="rating-panel-content">
        </div>
      </div>
    </div>
  `;

  litRender(template, container);
}

function bindEvents(container) {
  const tbody = container.querySelector("#fmea-table-body");
  if (tbody) {
    tbody.addEventListener("input", (e) => handleFieldInput(container, e));
    tbody.addEventListener("click", (e) => {
      handleToggleRow(container, e);
      handleDeleteClick(container, e);
      handleRatingInputClick(container, e);
    });
  }

  const ratingPanel = container.querySelector("#fmea-rating-panel");
  if (ratingPanel) {
    ratingPanel.addEventListener("click", (e) => {
      handleRatingClick(container, e);
      handleRatingPanelClose(container, e);
    });
  }

  document.addEventListener("click", handleDocumentClick);
}

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;

  fmeaData = model?.modules?.fmea || { items: [], type: "DFMEA" };
  if (!fmeaData.items) fmeaData.items = [];
  if (!fmeaData.type) fmeaData.type = "DFMEA";

  currentFilter = "all";

  fmeaData.items.forEach((item) => updateItemCalculations(item));

  renderPage(container);
  bindEvents(container);
}
