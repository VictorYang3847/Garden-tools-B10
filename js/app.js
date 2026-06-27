import {
  loadAppState,
  saveAppState,
  getActiveProject,
  getActiveModel,
  createProject,
  createModel,
  genId,
  exportStateJson,
  importStateJson,
} from "./store.js";
import {
  initDefinitionPage,
  fillDefinitionForm,
} from "./pages/definition.js";
import { renderPlanningPage } from "./pages/planning.js";
import { renderAnalysisPage } from "./pages/analysis.js";

let state = loadAppState();

const projectSelect = document.getElementById("project-select");
const modelSelect = document.getElementById("model-select");
const pages = {
  definition: document.getElementById("page-definition"),
  planning: document.getElementById("page-planning"),
  analysis: document.getElementById("page-analysis"),
};

initDefinitionPage(handleModelSave);

document.getElementById("new-project").addEventListener("click", onNewProject);
document.getElementById("new-model").addEventListener("click", onNewModel);
document.getElementById("export-data").addEventListener("click", onExport);
document.getElementById("import-btn").addEventListener("click", () => {
  document.getElementById("import-file").click();
});
document.getElementById("import-file").addEventListener("change", onImport);

projectSelect.addEventListener("change", () => {
  state.activeProjectId = projectSelect.value;
  const project = getActiveProject(state);
  state.activeModelId = project.models[0]?.id;
  persistAndRefresh();
});

modelSelect.addEventListener("change", () => {
  state.activeModelId = modelSelect.value;
  persistAndRefresh();
});

document.querySelectorAll(".nav-tab").forEach((tab) => {
  tab.addEventListener("click", (e) => {
    e.preventDefault();
    navigateTo(tab.dataset.page);
  });
});

window.addEventListener("hashchange", syncPageFromHash);

function navigateTo(page) {
  state.activePage = page;
  location.hash = `#/${page}`;
  renderCurrentPage();
}

function syncPageFromHash() {
  const hash = location.hash.replace(/^#\/?/, "") || "definition";
  const page = ["definition", "planning", "analysis"].includes(hash)
    ? hash
    : "definition";
  state.activePage = page;
  renderCurrentPage();
}

function refreshSelectors() {
  projectSelect.innerHTML = state.projects
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === state.activeProjectId ? "selected" : ""}>${escapeHtml(p.name)}</option>`
    )
    .join("");

  const project = getActiveProject(state);
  modelSelect.innerHTML = project.models
    .map(
      (m) =>
        `<option value="${m.id}" ${m.id === state.activeModelId ? "selected" : ""}>${escapeHtml(m.name)}</option>`
    )
    .join("");
}

function renderCurrentPage() {
  refreshSelectors();

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.page === state.activePage);
  });

  for (const [key, el] of Object.entries(pages)) {
    el.hidden = key !== state.activePage;
  }

  const model = getActiveModel(state);
  if (!model) return;

  if (state.activePage === "definition") {
    fillDefinitionForm(model);
  } else if (state.activePage === "planning") {
    renderPlanningPage(model);
  } else if (state.activePage === "analysis") {
    renderAnalysisPage(model);
  }
}

function handleModelSave({ record, definition, lastResult }) {
  const project = getActiveProject(state);
  const model = project.models.find((m) => m.id === state.activeModelId);
  if (!model) return;

  model.record = record;
  model.definition = definition;
  if (lastResult) model.lastResult = lastResult;

  const newName = record.modelName?.trim() || model.name;
  if (newName !== model.name) {
    model.name = newName;
    refreshSelectors();
  }

  saveAppState(state);
}

function persistAndRefresh() {
  saveAppState(state);
  renderCurrentPage();
}

function onNewProject() {
  const name = prompt("新项目名称：", "新项目");
  if (!name?.trim()) return;
  const project = createProject(name.trim());
  state.projects.push(project);
  state.activeProjectId = project.id;
  state.activeModelId = project.models[0].id;
  persistAndRefresh();
}

function onNewModel() {
  const name = prompt("新型号名称：", "新型号");
  if (!name?.trim()) return;
  const project = getActiveProject(state);
  const model = createModel(name.trim());
  project.models.push(model);
  state.activeModelId = model.id;
  persistAndRefresh();
}

function onExport() {
  const blob = new Blob([exportStateJson(state)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `b10-tool-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function onImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = importStateJson(reader.result);
      saveAppState(state);
      persistAndRefresh();
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

if (!location.hash) {
  location.hash = "#/definition";
} else {
  syncPageFromHash();
}
