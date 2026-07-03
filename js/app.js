import {
  getProjects,
  getCurrentProject,
  setCurrentProject,
  getCurrentProduct,
  setCurrentProduct,
  getCurrentModel,
  setCurrentModel,
  getProducts,
  getModels,
  addProject,
  addProduct,
  addModel,
  deleteProject,
  deleteProduct,
  deleteModel,
  exportData,
  importData,
} from "./store.js";
import { initRouter, navigateTo, routes, refreshCurrentRoute } from "./router.js";

const projectSelect = document.getElementById("project-select");
const productSelect = document.getElementById("product-select");
const modelSelect = document.getElementById("model-select");
const pageTitle = document.getElementById("page-title");
const mainContent = document.getElementById("main-content");
const sidebarToggle = document.getElementById("sidebar-toggle");
const importBtn = document.getElementById("import-btn");
const exportBtn = document.getElementById("export-btn");
const importFile = document.getElementById("import-file");

const navItems = document.querySelectorAll(".nav-item");

initApp();

function initApp() {
  initSelectors();
  initSidebar();
  initImportExport();

  initRouter({
    mainContent: mainContent,
    navItems: Array.from(navItems),
    onRouteChange: handleRouteChange,
    getModel: () => getCurrentModel(),
    saveModel: (modelData) => {
      const current = getCurrentModel();
      if (current && modelData) {
        Object.assign(current, modelData);
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
}

function handleRouteChange(routeKey, route) {
  pageTitle.textContent = route.title;
  document.title = `${route.title} - 可靠性工具平台`;
}

function initSelectors() {
  refreshAllSelectors();

  projectSelect.addEventListener("change", () => {
    setCurrentProject(projectSelect.value);
    refreshAllSelectors();
    refreshCurrentRoute();
  });

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
}

function refreshAllSelectors() {
  refreshProjectSelect();
  refreshProductSelect();
  refreshModelSelect();
}

function refreshProjectSelect() {
  const projects = getProjects();
  const current = getCurrentProject();
  projectSelect.innerHTML = projects
    .map(
      (p) =>
        `<option value="${p.id}" ${current && p.id === current.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`
    )
    .join("");
}

function refreshProductSelect() {
  const project = getCurrentProject();
  const products = project ? getProducts(project.id) : [];
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
