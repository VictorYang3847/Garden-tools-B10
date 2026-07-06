import {
  getCurrentProduct,
  setCurrentProduct,
  getCurrentModel,
  setCurrentModel,
  getProducts,
  getModels,
  addProduct,
  addModel,
  deleteProduct,
  deleteModel,
  exportData,
  importData,
  createModuleData,
  persistState,
  loadStateAsync,
  initSync,
  getState,
} from "./store.js?v=1.0.5";
import { initRouter, navigateTo, routes, refreshCurrentRoute } from "./router.js?v=1.0.5";
import { initAuthUI, onAuthChange, handleLogout, getCurrentUser } from "./auth.js?v=1.0.5";
import { initSyncUI } from "./sync-ui.js?v=1.0.5";
import { hasCloudApi } from "./api.js?v=1.0.5";

const productSelect = document.getElementById("product-select");
const modelSelect = document.getElementById("model-select");
const productAddBtn = document.getElementById("product-add-btn");
const modelAddBtn = document.getElementById("model-add-btn");
const pageTitle = document.getElementById("page-title");
const mainContent = document.getElementById("main-content");
const sidebarToggle = document.getElementById("sidebar-toggle");
const importBtn = document.getElementById("import-btn");
const exportBtn = document.getElementById("export-btn");
const importFile = document.getElementById("import-file");
const clearDataBtn = document.getElementById("btn-clear-data");

const navItems = document.querySelectorAll(".nav-item");

// 异步启动：等待 IndexedDB 加载完成后再渲染页面
initApp();

async function initApp() {
  // 1. 等待 IndexedDB 数据加载完成（含 localStorage 迁移）
  await loadStateAsync();

  // 检测是否配置了云端 API（未配置则纯本地模式）
  const hasCloudApiEnabled = hasCloudApi();

  // 2. 初始化认证 UI（仅在配置了云端 API 时启用）
  if (hasCloudApiEnabled) {
    initAuthUI();
  }

  // 3. 初始化同步（如已登录，触发登录后同步）
  let syncManager = null;
  if (hasCloudApiEnabled) {
    try {
      const syncResult = await initSync(getState());
      syncManager = syncResult.syncManager;
      if (syncResult.stateChanged) {
        // 云端覆盖了本地，刷新选择器
        refreshAllSelectors();
        refreshCurrentRoute();
      }
    } catch (e) {
      console.warn('同步初始化失败:', e);
    }
  }

  // 4. 初始化同步状态 UI
  initSyncUI(syncManager);

  // 5. 注册登录状态变化回调（登录/登出后刷新 UI）
  if (hasCloudApiEnabled) {
    onAuthChange(async (loggedIn, user) => {
      updateAuthDisplay(loggedIn, user);
      if (loggedIn) {
        // 登录成功，触发同步
        try {
          const syncResult = await initSync(getState());
          if (syncResult.stateChanged) {
            refreshAllSelectors();
            refreshCurrentRoute();
          }
        } catch (e) {
          console.warn('登录后同步失败:', e);
        }
      }
    });
  }

  initSelectors();
  initSidebar();
  initImportExport();
  initClearData();

  initRouter({
    mainContent: mainContent,
    navItems: Array.from(navItems),
    onRouteChange: handleRouteChange,
    getModel: () => getCurrentModel(),
    saveModel: (modelData) => {
      const current = getCurrentModel();
      if (current && modelData) {
        Object.assign(current, modelData);
        persistState(); // 修复：保存后立即落盘
        refreshAllSelectors();
      }
    },
  });

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const route = item.dataset.route;
      navigateTo(route);
      closeSidebarMobile();
    });
  });

  initGlobalTooltip();
}

/**
 * 更新顶栏登录/用户显示
 */
async function updateAuthDisplay(loggedIn, user) {
  const authArea = document.getElementById("auth-area");
  if (!authArea) return;
  if (loggedIn && user) {
    authArea.innerHTML = `
      <div class="user-menu" id="user-menu">
        <button type="button" class="user-btn" id="user-btn">${escapeHtml(user.email)}</button>
        <div class="user-dropdown" id="user-dropdown" hidden>
          <button type="button" id="manual-sync-btn">手动同步</button>
          <button type="button" id="logout-btn">退出登录</button>
        </div>
      </div>
    `;
    const userBtn = document.getElementById("user-btn");
    const dropdown = document.getElementById("user-dropdown");
    userBtn?.addEventListener("click", () => {
      if (dropdown) dropdown.hidden = !dropdown.hidden;
    });
    document.getElementById("logout-btn")?.addEventListener("click", async () => {
      await handleLogout();
      if (dropdown) dropdown.hidden = true;
    });
    document.getElementById("manual-sync-btn")?.addEventListener("click", async () => {
      try {
        const syncResult = await initSync(getState());
        if (syncResult.stateChanged) {
          refreshAllSelectors();
          refreshCurrentRoute();
        }
      } catch (e) {
        console.warn('手动同步失败:', e);
      }
      if (dropdown) dropdown.hidden = true;
    });
    // 点击外部关闭下拉
    document.addEventListener("click", (e) => {
      if (!authArea.contains(e.target) && dropdown) {
        dropdown.hidden = true;
      }
    });
  } else {
    authArea.innerHTML = `<button type="button" id="login-btn" class="btn-secondary">登录同步</button>`;
    document.getElementById("login-btn")?.addEventListener("click", () => {
      const modal = document.getElementById("auth-modal");
      if (modal) modal.hidden = false;
    });
  }
}

let globalTooltipEl = null;

function initGlobalTooltip() {
  globalTooltipEl = document.createElement("div");
  globalTooltipEl.className = "global-help-tooltip";
  globalTooltipEl.style.cssText = [
    "position: fixed",
    "z-index: 100000",
    "background: #1a1a2e",
    "color: #fff",
    "padding: 8px 12px",
    "border-radius: 6px",
    "font-size: 12px",
    "line-height: 1.5",
    "max-width: 280px",
    "width: max-content",
    "box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5)",
    "border: 1px solid #2d2d44",
    "pointer-events: none",
    "display: none",
    "text-align: left",
    "word-wrap: break-word",
  ].join("; ") + ";";
  document.body.appendChild(globalTooltipEl);

  bindHelpIcons();

  const observer = new MutationObserver(() => {
    bindHelpIcons();
  });
  observer.observe(document.getElementById("main-content"), {
    childList: true,
    subtree: true,
  });
}

function bindHelpIcons() {
  const icons = document.querySelectorAll(".help-icon");
  icons.forEach((icon) => {
    if (icon.dataset.tooltipBound) return;
    icon.dataset.tooltipBound = "1";
    icon.addEventListener("mouseenter", () => {
      showGlobalTooltip(icon);
    });
    icon.addEventListener("mouseleave", () => {
      hideGlobalTooltip();
    });
  });
}

function showGlobalTooltip(icon) {
  if (!globalTooltipEl) return;

  globalTooltipEl.textContent = icon.dataset.tooltip;
  globalTooltipEl.style.display = "block";

  const iconRect = icon.getBoundingClientRect();
  const tooltipRect = globalTooltipEl.getBoundingClientRect();

  let top = iconRect.top - tooltipRect.height - 8;
  let left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);

  if (top < 8) {
    top = iconRect.bottom + 8;
  }

  if (left < 8) left = 8;
  if (left + tooltipRect.width > window.innerWidth - 8) {
    left = window.innerWidth - tooltipRect.width - 8;
  }

  globalTooltipEl.style.top = top + "px";
  globalTooltipEl.style.left = left + "px";
}

function hideGlobalTooltip() {
  if (!globalTooltipEl) return;
  globalTooltipEl.style.display = "none";
}

function handleRouteChange(routeKey, route) {
  pageTitle.textContent = route.title;
  document.title = `${route.title} - 可靠性工具平台`;
}

function initSelectors() {
  refreshAllSelectors();

  productSelect.addEventListener("change", () => {
    setCurrentProduct(productSelect.value);
    refreshAllSelectors();
    refreshCurrentRoute();
  });

  modelSelect.addEventListener("change", () => {
    setCurrentModel(modelSelect.value);
    refreshAllSelectors();
    refreshCurrentRoute();
  });

  productAddBtn.addEventListener("click", () => {
    const name = prompt("请输入产品名称：", "新产品");
    if (name && name.trim()) {
      const product = addProduct(name.trim());
      setCurrentProduct(product.id);
      refreshAllSelectors();
      refreshCurrentRoute();
    }
  });

  modelAddBtn.addEventListener("click", () => {
    const currentProduct = getCurrentProduct();
    if (!currentProduct) {
      alert("请先选择一个产品");
      return;
    }
    const name = prompt("请输入型号名称：", "新型号");
    if (name && name.trim()) {
      const model = addModel(currentProduct.id, name.trim());
      setCurrentModel(model.id);
      refreshAllSelectors();
      refreshCurrentRoute();
    }
  });
}

function refreshAllSelectors() {
  refreshProductSelect();
  refreshModelSelect();
}

function refreshProductSelect() {
  const products = getProducts();
  const current = getCurrentProduct();
  productSelect.innerHTML = products
    .map(
      (p) =>
        `<option value="${p.id}" ${current && p.id === current.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`
    )
    .join("");
}

function refreshModelSelect() {
  const product = getCurrentProduct();
  const models = product ? getModels(product.id) : [];
  const current = getCurrentModel();
  modelSelect.innerHTML = models
    .map(
      (m) =>
        `<option value="${m.id}" ${current && m.id === current.id ? "selected" : ""}>${escapeHtml(m.name)}</option>`
    )
    .join("");
}

function initSidebar() {
  sidebarToggle.addEventListener("click", toggleSidebar);

  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 768) {
      const sidebar = document.getElementById("sidebar");
      const toggleBtn = document.getElementById("sidebar-toggle");
      if (
        !sidebar.contains(e.target) &&
        !toggleBtn.contains(e.target) &&
        document.body.classList.contains("sidebar-open")
      ) {
        closeSidebarMobile();
      }
    }
  });
}

function toggleSidebar() {
  document.body.classList.toggle("sidebar-open");
}

function closeSidebarMobile() {
  if (window.innerWidth <= 768) {
    document.body.classList.remove("sidebar-open");
  }
}

function initImportExport() {
  exportBtn.addEventListener("click", onExport);
  importBtn.addEventListener("click", () => {
    importFile.click();
  });
  importFile.addEventListener("change", onImport);
}

function initClearData() {
  if (!clearDataBtn) return;
  clearDataBtn.addEventListener("click", onClearData);
}

function onClearData() {
  const current = getCurrentModel();
  if (!current) {
    alert("请先选择一个型号");
    return;
  }
  const confirmed = window.confirm(
    `确定要清空当前型号「${current.name}」的所有模块数据吗？此操作不可恢复。`
  );
  if (!confirmed) return;
  current.modules = createModuleData();
  current.lastResult = null;
  persistState();
  refreshAllSelectors();
  refreshCurrentRoute();
}

function onExport() {
  const blob = new Blob([exportData()], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `reliability-tool-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function onImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      importData(reader.result);
      refreshAllSelectors();
      refreshCurrentRoute();
      alert("导入成功");
    } catch (err) {
      alert("导入失败：" + err.message);
    }
    e.target.value = "";
  };
  reader.readAsText(file);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
