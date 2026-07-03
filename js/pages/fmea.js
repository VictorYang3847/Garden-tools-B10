let onSaveCallback = null;
let currentModel = null;
let currentFilter = "all";
let fmeaData = null;

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

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function apBadge(ap) {
  if (!ap) return '<span class="ap-badge ap-l">-</span>';
  const label = { H: "H", M: "M", L: "L" }[ap] || ap;
  return `<span class="ap-badge ap-${ap.toLowerCase()}">${label}</span>`;
}

function renderRow(item, index) {
  return `
    <tr data-id="${item.id}">
      <td class="fmea-index">${index + 1}</td>
      <td><input type="text" class="item-input" data-field="function" value="${escapeHtml(item.function)}" placeholder="功能/过程要求" /></td>
      <td><input type="text" class="item-input" data-field="failureMode" value="${escapeHtml(item.failureMode)}" placeholder="失效模式" /></td>
      <td><input type="text" class="item-input" data-field="effect" value="${escapeHtml(item.effect)}" placeholder="失效后果" /></td>
      <td><input type="number" class="item-input fmea-num-input" data-field="severity" value="${item.severity}" min="1" max="10" /></td>
      <td><input type="text" class="item-input" data-field="cause" value="${escapeHtml(item.cause)}" placeholder="失效原因" /></td>
      <td><input type="number" class="item-input fmea-num-input" data-field="occurrence" value="${item.occurrence}" min="1" max="10" /></td>
      <td><input type="text" class="item-input" data-field="controlPrevention" value="${escapeHtml(item.controlPrevention)}" placeholder="预防控制" /></td>
      <td><input type="text" class="item-input" data-field="controlDetection" value="${escapeHtml(item.controlDetection)}" placeholder="探测控制" /></td>
      <td><input type="number" class="item-input fmea-num-input" data-field="detection" value="${item.detection}" min="1" max="10" /></td>
      <td class="fmea-rpn-cell">${item.rpn}</td>
      <td class="fmea-ap-cell">${apBadge(item.ap)}</td>
      <td><input type="text" class="item-input" data-field="action" value="${escapeHtml(item.action)}" placeholder="建议措施" /></td>
      <td><input type="text" class="item-input" data-field="responsible" value="${escapeHtml(item.responsible)}" placeholder="责任部门/人" /></td>
      <td><input type="date" class="item-input" data-field="targetDate" value="${escapeHtml(item.targetDate)}" /></td>
      <td><input type="number" class="item-input fmea-num-input" data-field="newSeverity" value="${item.newSeverity}" min="0" max="10" /></td>
      <td><input type="number" class="item-input fmea-num-input" data-field="newOccurrence" value="${item.newOccurrence}" min="0" max="10" /></td>
      <td><input type="number" class="item-input fmea-num-input" data-field="newDetection" value="${item.newDetection}" min="0" max="10" /></td>
      <td class="fmea-rpn-cell">${item.newRpn || "-"}</td>
      <td class="fmea-ap-cell">${item.newAp ? apBadge(item.newAp) : '<span class="ap-badge ap-l">-</span>'}</td>
      <td class="fmea-action-cell">
        <button type="button" class="fmea-delete-btn" data-action="delete" title="删除">🗑️</button>
      </td>
    </tr>
  `;
}

function getFilteredItems() {
  if (!fmeaData || !fmeaData.items) return [];
  if (currentFilter === "all") return fmeaData.items;
  return fmeaData.items.filter((item) => item.ap === currentFilter);
}

function renderTable(container) {
  const tbody = container.querySelector("#fmea-table-body");
  const emptyState = container.querySelector("#fmea-empty-state");
  const items = getFilteredItems();

  if (!items || items.length === 0) {
    tbody.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";
  let displayIndex = 0;
  tbody.innerHTML = fmeaData.items
    .map((item, realIndex) => {
      if (currentFilter !== "all" && item.ap !== currentFilter) return "";
      displayIndex++;
      return renderRow(item, displayIndex - 1);
    })
    .join("");
}

function updateTabState(container) {
  const tabs = container.querySelectorAll(".fmea-tab");
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.type === fmeaData.type);
  });
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

function handleInputChange(container, e) {
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
  renderTable(container);
}

function handleDeleteClick(container, e) {
  const btn = e.target.closest("[data-action='delete']");
  if (!btn) return;

  const tr = btn.closest("tr");
  if (!tr) return;

  const id = tr.dataset.id;
  if (!id) return;

  if (!confirm("确定要删除这一行吗？")) return;

  fmeaData.items = fmeaData.items.filter((i) => i.id !== id);
  saveData();
  renderTable(container);
}

function handleTabClick(container, e) {
  const tab = e.target.closest(".fmea-tab");
  if (!tab) return;

  const type = tab.dataset.type;
  if (!type || type === fmeaData.type) return;

  fmeaData.type = type;
  saveData();
  updateTabState(container);
}

function handleAddRow(container) {
  const newItem = createNewItem();
  fmeaData.items.push(newItem);
  saveData();
  renderTable(container);

  const tbody = container.querySelector("#fmea-table-body");
  const lastRow = tbody.lastElementChild;
  if (lastRow) {
    const firstInput = lastRow.querySelector("input[data-field='function']");
    if (firstInput) firstInput.focus();
  }
}

function handleFilterChange(container, e) {
  currentFilter = e.target.value;
  renderTable(container);
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

function bindEvents(container) {
  const tbody = container.querySelector("#fmea-table-body");
  tbody.addEventListener("input", (e) => handleInputChange(container, e));
  tbody.addEventListener("click", (e) => handleDeleteClick(container, e));

  const tabs = container.querySelector(".fmea-tabs");
  tabs.addEventListener("click", (e) => handleTabClick(container, e));

  const addBtn = container.querySelector("#fmea-add-row");
  addBtn.addEventListener("click", () => handleAddRow(container));

  const emptyAddBtn = container.querySelector("#fmea-empty-add-btn");
  emptyAddBtn.addEventListener("click", () => handleAddRow(container));

  const filterSelect = container.querySelector("#fmea-ap-filter");
  filterSelect.addEventListener("change", (e) => handleFilterChange(container, e));

  const exportBtn = container.querySelector("#fmea-export-csv");
  exportBtn.addEventListener("click", exportCsv);
}

export function init(model, onSave) {
  currentModel = model;
  onSaveCallback = onSave;
}

export function render(container, model) {
  currentModel = model;

  const template = document.getElementById("fmea-template");
  if (!template) {
    container.innerHTML = '<div class="error-state"><h3>加载失败</h3><p>FMEA 模板未找到</p></div>';
    return;
  }

  const clone = template.content.cloneNode(true);
  container.innerHTML = "";
  container.appendChild(clone);

  fmeaData = model?.modules?.fmea || { items: [], type: "DFMEA" };
  if (!fmeaData.items) fmeaData.items = [];
  if (!fmeaData.type) fmeaData.type = "DFMEA";

  currentFilter = "all";

  fmeaData.items.forEach((item) => updateItemCalculations(item));

  updateTabState(container);
  renderTable(container);
  bindEvents(container);
}
