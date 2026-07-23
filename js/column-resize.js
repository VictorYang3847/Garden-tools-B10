/**
 * column-resize.js — 可复用的表格列拖拽调整宽度工具
 *
 * 用法:
 *   import { initResizeForContainer, initGlobalDragHandler, destroyResize } from './column-resize.js';
 *   initGlobalDragHandler(mainContent);  // 在路由初始化时调用一次
 *   initResizeForContainer(mainContent, routeKey);  // 每次渲染模块后调用
 *   destroyResize();  // 路由切换前调用
 *
 * 表格只需在模板中:
 *   1. <table> 添加 class="resizable"
 *   2. <thead> 前添加 <colgroup><col>...</col></colgroup> (列数匹配)
 *   3. 不需要拖拽的 <th> 添加 data-no-resize 属性
 */

const STORAGE_PREFIX = 'colResize_';
const MIN_COL_WIDTH = 30;
const RESIZE_HIT_ZONE = 6; // px — th 右边缘检测区域
const MUTATION_DEBOUNCE = 150; // ms

let _observer = null;
let _observerTimer = null;
let _mainContent = null;
let _currentRouteKey = null;
let _activeDrag = null; // { table, col, th, startX, startWidth, colIndex }

// ============================================================
// 公开 API
// ============================================================

/**
 * 初始化容器内所有 table.resizable 表格的列宽调整
 */
export function initResizeForContainer(container, routeKey) {
  if (!container) return;
  _currentRouteKey = routeKey;
  _mainContent = container;

  const tables = container.querySelectorAll('table.resizable');
  tables.forEach((table) => setupTable(table, routeKey));

  // 设置 MutationObserver 防止 lit-html 重渲染后宽度丢失
  setupMutationObserver(container, routeKey);
}

/**
 * 在 mainContent 上委托 mousedown 事件，检测列拖拽
 */
export function initGlobalDragHandler(mainContent) {
  if (!mainContent) return;
  _mainContent = mainContent;

  mainContent.addEventListener('mousedown', onMouseDown);
  mainContent.addEventListener('dblclick', onDoubleClick);
}

/**
 * 清理 resize 状态（路由切换时调用）
 */
export function destroyResize() {
  if (_observer) {
    _observer.disconnect();
    _observer = null;
  }
  if (_observerTimer) {
    clearTimeout(_observerTimer);
    _observerTimer = null;
  }
  _activeDrag = null;
  document.body.classList.remove('resizing-active');
}

// ============================================================
// 表格初始化
// ============================================================

function setupTable(table, routeKey) {
  // 确保有 colgroup
  let colgroup = table.querySelector('colgroup');
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    table.insertBefore(colgroup, table.firstChild);
  }

  const ths = table.querySelectorAll('thead th');
  if (!ths.length) return;

  const colCount = ths.length;

  // 同步 col 数量
  while (colgroup.children.length < colCount) {
    colgroup.appendChild(document.createElement('col'));
  }
  while (colgroup.children.length > colCount) {
    colgroup.removeChild(colgroup.lastChild);
  }

  // 尝试加载保存的宽度
  const tableKey = getTableKey(table, routeKey);
  const savedWidths = loadWidths(tableKey);

  if (savedWidths && savedWidths.length === colCount) {
    // 应用保存的宽度
    Array.from(colgroup.children).forEach((col, i) => {
      col.style.width = savedWidths[i] + 'px';
    });
  } else {
    // 首次初始化：从 <th> inline style 读取宽度
    const ths2 = table.querySelectorAll('thead th');
    Array.from(colgroup.children).forEach((col, i) => {
      const th = ths2[i];
      if (!th) return;
      // 解析 style="width: 50px" 或 style="min-width: 160px"
      const inlineW = th.style.width;
      const inlineMinW = th.style.minWidth;
      const w = inlineW || inlineMinW;
      if (w) {
        col.style.width = w;
      }
      // 无 width 的列（弹性列）不设置，自动填充
    });
  }

  // 激活 CSS
  table.classList.add('resize-active');
}

// ============================================================
// 拖拽事件处理
// ============================================================

function onMouseDown(e) {
  if (e.button !== 0) return; // 只响应左键

  const th = e.target.closest('th');
  if (!th) return;

  const table = th.closest('table.resizable');
  if (!table || !table.classList.contains('resize-active')) return;

  // 跳过不可调整的列
  if (th.hasAttribute('data-no-resize')) return;

  // 检测是否在右边缘 hit zone 内
  const rect = th.getBoundingClientRect();
  const offsetX = e.clientX - rect.right;
  if (Math.abs(offsetX) > RESIZE_HIT_ZONE) return;

  // 找到对应的 col
  const colgroup = table.querySelector('colgroup');
  if (!colgroup) return;

  const ths = table.querySelectorAll('thead th');
  const colIndex = Array.from(ths).indexOf(th);
  if (colIndex < 0 || colIndex >= colgroup.children.length) return;

  const col = colgroup.children[colIndex];
  const startWidth = col.offsetWidth || rect.width;

  _activeDrag = {
    table,
    col,
    th,
    startX: e.clientX,
    startWidth,
    colIndex,
    tableKey: getTableKey(table, _currentRouteKey),
  };

  th.classList.add('resizing');
  document.body.classList.add('resizing-active');

  e.preventDefault();
  e.stopPropagation();

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e) {
  if (!_activeDrag) return;

  const delta = e.clientX - _activeDrag.startX;
  const newWidth = Math.max(MIN_COL_WIDTH, _activeDrag.startWidth + delta);
  _activeDrag.col.style.width = newWidth + 'px';
}

function onMouseUp() {
  if (!_activeDrag) return;

  _activeDrag.th.classList.remove('resizing');
  document.body.classList.remove('resizing-active');

  // 保存所有列的宽度
  const colgroup = _activeDrag.table.querySelector('colgroup');
  if (colgroup) {
    const widths = Array.from(colgroup.children).map((col) => {
      const w = col.style.width;
      // 提取数值
      const num = parseInt(w, 10);
      return isNaN(num) ? 0 : num;
    });
    saveWidths(_activeDrag.tableKey, widths);
  }

  _activeDrag = null;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
}

/**
 * 双击 th 右边缘 → 自适应宽度
 */
function onDoubleClick(e) {
  const th = e.target.closest('th');
  if (!th) return;

  const table = th.closest('table.resizable');
  if (!table || !table.classList.contains('resize-active')) return;
  if (th.hasAttribute('data-no-resize')) return;

  // 检测是否在右边缘区域
  const rect = th.getBoundingClientRect();
  const offsetX = e.clientX - rect.right;
  if (Math.abs(offsetX) > RESIZE_HIT_ZONE * 2) return;

  const colgroup = table.querySelector('colgroup');
  if (!colgroup) return;

  const ths = table.querySelectorAll('thead th');
  const colIndex = Array.from(ths).indexOf(th);
  const col = colgroup.children[colIndex];
  if (!col) return;

  // 临时切换为 auto 布局测量自然宽度
  const originalLayout = table.style.tableLayout;
  const originalColWidth = col.style.width;
  table.style.tableLayout = 'auto';
  col.style.width = 'auto';

  // 测量该列所有单元格的最大宽度
  const rows = table.querySelectorAll('tbody tr');
  let maxW = th.offsetWidth;
  rows.forEach((row) => {
    const cell = row.children[colIndex];
    if (cell) {
      const w = cell.offsetWidth;
      if (w > maxW) maxW = w;
    }
  });

  // 加一点 padding 余量
  const naturalWidth = Math.max(maxW + 8, MIN_COL_WIDTH);

  // 切回 fixed 并应用
  table.style.tableLayout = originalLayout || '';
  col.style.width = originalColWidth;
  // force reflow
  void table.offsetWidth;
  col.style.width = naturalWidth + 'px';

  // 保存
  const tableKey = getTableKey(table, _currentRouteKey);
  const widths = Array.from(colgroup.children).map((c) => {
    const w = c.style.width;
    const num = parseInt(w, 10);
    return isNaN(num) ? 0 : num;
  });
  saveWidths(tableKey, widths);
}

// ============================================================
// MutationObserver — lit-html 重渲染后恢复宽度
// ============================================================

function setupMutationObserver(container, routeKey) {
  if (_observer) {
    _observer.disconnect();
  }

  _observer = new MutationObserver((mutations) => {
    // 检查是否有 table 被添加或修改
    let hasTableChange = false;
    for (const mutation of mutations) {
      // 检查新增节点
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'TABLE' && node.classList.contains('resizable')) {
          hasTableChange = true;
          break;
        }
        if (node.querySelectorAll && node.querySelectorAll('table.resizable').length) {
          hasTableChange = true;
          break;
        }
      }
      if (hasTableChange) break;
    }

    if (!hasTableChange) return;

    // 防抖处理
    if (_observerTimer) clearTimeout(_observerTimer);
    _observerTimer = setTimeout(() => {
      const tables = container.querySelectorAll('table.resizable');
      tables.forEach((table) => {
        // 检查是否需要重新初始化（resize-active 可能被 lit-html 移除）
        if (!table.classList.contains('resize-active') || !table.querySelector('colgroup')) {
          setupTable(table, routeKey);
        } else {
          // colgroup 存在，重新应用保存的宽度
          const tableKey = getTableKey(table, routeKey);
          const savedWidths = loadWidths(tableKey);
          if (savedWidths) {
            const colgroup = table.querySelector('colgroup');
            const cols = colgroup.children;
            if (savedWidths.length === cols.length) {
              savedWidths.forEach((w, i) => {
                if (w > 0) cols[i].style.width = w + 'px';
              });
            }
          }
          table.classList.add('resize-active');
        }
      });
    }, MUTATION_DEBOUNCE);
  });

  _observer.observe(container, { childList: true, subtree: true });
}

// ============================================================
// localStorage 持久化
// ============================================================

function getTableKey(table, routeKey) {
  // 使用 routeKey + 表格的 class 列表作为唯一标识
  const classes = Array.from(table.classList)
    .filter((c) => c !== 'resizable' && c !== 'resize-active' && c !== 'data-table')
    .join('-');
  return (routeKey || 'page') + '_' + (classes || 'table');
}

function loadWidths(tableKey) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tableKey);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr;
  } catch {
    return null;
  }
}

function saveWidths(tableKey, widths) {
  try {
    localStorage.setItem(STORAGE_PREFIX + tableKey, JSON.stringify(widths));
  } catch {
    // localStorage 满或不可用，静默失败
  }
}
