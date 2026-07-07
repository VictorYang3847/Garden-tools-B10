import {
  getCurrentProject,
  setCurrentProject,
  getCurrentProduct,
  setCurrentProduct,
  getCurrentModel,
  setCurrentModel,
  getProjects,
  getProducts,
  getModels,
  getProduct,
  getModel,
  addProject,
  addProduct,
  addModel,
  deleteProject,
  deleteProduct,
  deleteModel,
  exportData,
  importData,
  getModuleData,
  setModuleData,
  genId,
  persistState,
} from "../store.js?v=1.3.0";

let model = null;
let onSave = null;
let importDataCache = null;
let reportWindow = null;

export function init(m, save) {
  model = m;
  onSave = save;
}

export function render(container, m) {
  model = m;
  const template = document.getElementById("data-management-template");
  const content = template.content.cloneNode(true);
  container.appendChild(content);

  bindTabs();
  renderProjects();
  renderProjectTree();
  renderVersions();
  bindImportExport();
  bindReportGeneration();
  bindVersionManagement();
}

function bindTabs() {
  const tabs = document.querySelectorAll(".dm-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  document.querySelectorAll(".dm-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
  document.querySelectorAll(".dm-tab-content").forEach((c) => {
    c.style.display = c.id === `dm-tab-${tabName}` ? "" : "none";
  });
}

function renderProjects() {
  const grid = document.getElementById("dm-projects-grid");
  const projects = getProjects();
  const currentProject = getCurrentProject();
  const currentProduct = getCurrentProduct();
  const currentModel = getCurrentModel();

  if (!projects.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📁</div>
        <h3>暂无项目</h3>
        <p>点击「新建项目」按钮开始创建第一个项目。</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = projects
    .map((proj) => {
      const productCount = proj.products?.length || 0;
      const modelCount = proj.products?.reduce((sum, p) => sum + (p.models?.length || 0), 0) || 0;
      const isActive = currentProject && proj.id === currentProject.id;

      let productsHtml = "";
      for (const product of proj.products || []) {
        const isProductActive = currentProduct && product.id === currentProduct.id;
        let modelsHtml = "";
        for (const mdl of product.models || []) {
          const isModelActive = currentModel && mdl.id === currentModel.id;
          modelsHtml += `
            <div class="dm-model-row ${isModelActive ? "active" : ""}" data-model-id="${mdl.id}" data-product-id="${product.id}">
              <span class="dm-model-name">🔧 ${escapeHtml(mdl.name)}</span>
              <div class="dm-model-actions">
                <button type="button" class="dm-action-btn-sm" data-action="rename-model" title="重命名型号">✏️</button>
                <button type="button" class="dm-action-btn-sm" data-action="delete-model" title="删除型号">🗑️</button>
              </div>
            </div>
          `;
        }
        productsHtml += `
          <div class="dm-product-section ${isProductActive ? "active" : ""}" data-product-id="${product.id}">
            <div class="dm-product-header">
              <span class="dm-product-name">📦 ${escapeHtml(product.name)}</span>
              <div class="dm-product-actions">
                <button type="button" class="dm-action-btn-sm" data-action="rename-product" title="重命名产品">✏️</button>
                <button type="button" class="dm-action-btn-sm" data-action="copy-product" title="复制产品">📋</button>
                <button type="button" class="dm-action-btn-sm dm-action-danger" data-action="delete-product" title="删除产品">🗑️</button>
                <button type="button" class="dm-action-btn-sm" data-action="add-model" title="新建型号">➕</button>
              </div>
            </div>
            <div class="dm-models-list">
              ${modelsHtml || '<div class="dm-empty-models">暂无型号，点击 ➕ 添加</div>'}
            </div>
          </div>
        `;
      }

      return `
        <div class="dm-project-card ${isActive ? "active" : ""}" data-project-id="${proj.id}">
          <div class="dm-project-card-header">
            <div class="dm-project-icon">📁</div>
            <div class="dm-project-info">
              <h3 class="dm-project-name">${escapeHtml(proj.name)}</h3>
              <div class="dm-project-meta">
                <span>${productCount} 个产品 · ${modelCount} 个型号</span>
              </div>
            </div>
          </div>
          <div class="dm-project-products">
            ${productsHtml || '<div class="dm-empty-products">暂无产品</div>'}
          </div>
          <div class="dm-project-card-footer">
            <span class="dm-project-date">创建于 ${formatDate(proj.createdAt)}</span>
            <div class="dm-project-actions">
              <button type="button" class="dm-action-btn" data-action="open" title="打开">📂</button>
              <button type="button" class="dm-action-btn" data-action="rename" title="重命名">✏️</button>
              <button type="button" class="dm-action-btn" data-action="copy" title="复制">📋</button>
              <button type="button" class="dm-action-btn dm-action-danger" data-action="delete" title="删除">🗑️</button>
              <button type="button" class="dm-action-btn" data-action="add-product" title="新建产品">➕</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  grid.querySelectorAll(".dm-project-card").forEach((card) => {
    const projectId = card.dataset.projectId;

    card.querySelector('[data-action="open"]').addEventListener("click", () => openProject(projectId));
    card.querySelector('[data-action="rename"]').addEventListener("click", () => renameProject(projectId));
    card.querySelector('[data-action="copy"]').addEventListener("click", () => copyProject(projectId));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteProjectConfirm(projectId));
    card.querySelector('[data-action="add-product"]').addEventListener("click", () => addProductToProject(projectId));

    card.querySelectorAll('[data-action="rename-product"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const productId = btn.closest(".dm-product-section").dataset.productId;
        renameProduct(productId);
      });
    });

    card.querySelectorAll('[data-action="copy-product"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const productId = btn.closest(".dm-product-section").dataset.productId;
        copyProduct(productId);
      });
    });

    card.querySelectorAll('[data-action="delete-product"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const productId = btn.closest(".dm-product-section").dataset.productId;
        deleteProductConfirm(productId);
      });
    });

    card.querySelectorAll('[data-action="add-model"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const productId = btn.closest(".dm-product-section").dataset.productId;
        addModelToProduct(productId);
      });
    });

    card.querySelectorAll('[data-action="rename-model"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const modelRow = btn.closest(".dm-model-row");
        const modelId = modelRow.dataset.modelId;
        renameModel(modelId);
      });
    });

    card.querySelectorAll('[data-action="delete-model"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const modelRow = btn.closest(".dm-model-row");
        const modelId = modelRow.dataset.modelId;
        const productId = modelRow.dataset.productId;
        deleteModelConfirm(modelId, productId);
      });
    });
  });

  document.getElementById("dm-new-project").addEventListener("click", createNewProject);
}

function renderProjectTree() {
  const tree = document.getElementById("dm-project-tree");
  const projects = getProjects();
  const currentProject = getCurrentProject();
  const currentProduct = getCurrentProduct();
  const currentModel = getCurrentModel();

  let html = "";
  for (const proj of projects) {
    const isProjectActive = currentProject?.id === proj.id;
    html += `
      <div class="dm-tree-item dm-tree-project ${isProjectActive ? "active" : ""}" data-type="project" data-id="${proj.id}" style="padding-left: 0;">
        <span class="dm-tree-toggle">▾</span>
        <span class="dm-tree-icon">📁</span>
        <span class="dm-tree-label">${escapeHtml(proj.name)}</span>
      </div>
      <div class="dm-tree-children">
    `;
    for (const product of proj.products || []) {
      const isProductActive = currentProduct?.id === product.id;
      html += `
        <div class="dm-tree-item dm-tree-product ${isProductActive ? "active" : ""}" data-type="product" data-id="${product.id}" style="padding-left: 1rem;">
          <span class="dm-tree-toggle">▾</span>
          <span class="dm-tree-icon">📦</span>
          <span class="dm-tree-label">${escapeHtml(product.name)}</span>
        </div>
        <div class="dm-tree-children">
      `;
      for (const mdl of product.models || []) {
        const isModelActive = currentModel?.id === mdl.id;
        html += `
          <div class="dm-tree-item dm-tree-model ${isModelActive ? "active" : ""}" data-type="model" data-id="${mdl.id}" style="padding-left: 2rem;">
            <span class="dm-tree-toggle" style="visibility: hidden;">▸</span>
            <span class="dm-tree-icon">🔧</span>
            <span class="dm-tree-label">${escapeHtml(mdl.name)}</span>
          </div>
        `;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  tree.innerHTML = html;

  tree.querySelectorAll(".dm-tree-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const type = item.dataset.type;
      const id = item.dataset.id;

      if (type === "project") {
        setCurrentProject(id);
      } else if (type === "product") {
        setCurrentProduct(id);
      } else if (type === "model") {
        setCurrentModel(id);
        window.location.hash = "#/fmea";
      }

      refreshUI();
    });

    const toggle = item.querySelector(".dm-tree-toggle");
    if (toggle) {
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const children = item.nextElementSibling;
        if (children && children.classList.contains("dm-tree-children")) {
          const isCollapsed = children.style.display === "none";
          children.style.display = isCollapsed ? "" : "none";
          toggle.textContent = isCollapsed ? "▾" : "▸";
        }
      });
    }
  });
}

function refreshUI() {
  renderProjects();
  renderProjectTree();
  renderVersions();
}

function createNewProject() {
  const name = prompt("请输入项目名称：", "新项目");
  if (!name) return;
  addProject(name);
  refreshUI();
}

function openProject(projectId) {
  setCurrentProject(projectId);
  refreshUI();
}

function renameProject(projectId) {
  const projects = getProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return;

  const name = prompt("请输入新的项目名称：", project.name);
  if (!name || name === project.name) return;

  project.name = name;
  persistState();
  refreshUI();
}

function copyProject(projectId) {
  const projects = getProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return;

  const newProject = JSON.parse(JSON.stringify(project));
  newProject.id = genId();
  newProject.name = project.name + " - 副本";
  newProject.createdAt = new Date().toISOString();

  function regenerateIds(obj) {
    if (obj && typeof obj === "object") {
      if (obj.id) obj.id = genId();
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key])) {
          obj[key].forEach(regenerateIds);
        } else if (typeof obj[key] === "object") {
          regenerateIds(obj[key]);
        }
      }
    }
  }
  regenerateIds(newProject);

  projects.push(newProject);
  persistState();
  refreshUI();
}

function deleteProjectConfirm(projectId) {
  const projects = getProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return;

  if (!confirm(`确定要删除项目「${project.name}」吗？此操作将删除该项目下的所有产品和型号数据，不可恢复。`)) return;

  deleteProject(projectId);
  refreshUI();
}

// ========== 产品操作函数 ==========

function addProductToProject(projectId) {
  const projects = getProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return;

  const name = prompt("请输入产品名称：", "新产品");
  if (!name) return;

  const product = createProduct(name);
  project.products.push(product);
  persistState();
  refreshUI();
}

function renameProduct(productId) {
  const product = getProduct(productId);
  if (!product) return;

  const name = prompt("请输入新的产品名称：", product.name);
  if (!name || name === product.name) return;

  product.name = name;
  persistState();
  refreshUI();
}

function copyProduct(productId) {
  const product = getProduct(productId);
  if (!product) return;

  const newProduct = JSON.parse(JSON.stringify(product));
  newProduct.id = genId();
  newProduct.name = product.name + " - 副本";
  newProduct.createdAt = new Date().toISOString();

  function regenerateIds(obj) {
    if (obj && typeof obj === "object") {
      if (obj.id) obj.id = genId();
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key])) {
          obj[key].forEach(regenerateIds);
        } else if (typeof obj[key] === "object") {
          regenerateIds(obj[key]);
        }
      }
    }
  }
  regenerateIds(newProduct);

  const currentProject = getCurrentProject();
  if (currentProject) {
    currentProject.products.push(newProduct);
    persistState();
    refreshUI();
  }
}

function deleteProductConfirm(productId) {
  const product = getProduct(productId);
  if (!product) return;

  if (!confirm(`确定要删除产品「${product.name}」吗？此操作将删除该产品下的所有型号数据，不可恢复。`)) return;

  deleteProduct(productId);
  refreshUI();
}

// ========== 型号操作函数 ==========

function addModelToProduct(productId) {
  const name = prompt("请输入型号名称：", "新型号");
  if (!name) return;

  addModel(productId, name);
  refreshUI();
}

function renameModel(modelId) {
  const model = getModel(modelId);
  if (!model) return;

  const name = prompt("请输入新的型号名称：", model.name);
  if (!name || name === model.name) return;

  model.name = name;
  persistState();
  refreshUI();
}

function deleteModelConfirm(modelId, productId) {
  const model = getModel(modelId);
  if (!model) return;

  if (!confirm(`确定要删除型号「${model.name}」吗？此操作不可恢复。`)) return;

  deleteModel(modelId);
  refreshUI();
}

function bindImportExport() {
  const dropZone = document.getElementById("dm-drop-zone");
  const fileInput = document.getElementById("dm-import-file");
  const exportBtn = document.getElementById("dm-export-btn");
  const importBtn = document.getElementById("dm-import-btn");

  dropZone.addEventListener("click", () => fileInput.click());

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files?.[0];
    if (file) handleImportFile(file);
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleImportFile(file);
  });

  exportBtn.addEventListener("click", handleExport);
  importBtn.addEventListener("click", handleImport);
}

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.projects) && !Array.isArray(data.products)) {
        throw new Error("无效的数据格式");
      }
      importDataCache = data;
      showImportPreview(data);
    } catch (err) {
      alert("文件解析失败：" + err.message);
    }
  };
  reader.readAsText(file);
}

function showImportPreview(data) {
  const preview = document.getElementById("dm-import-preview");
  let projectCount = 0;
  let productCount = 0;
  let modelCount = 0;

  if (data.version === 5 && Array.isArray(data.projects)) {
    projectCount = data.projects.length;
    for (const proj of data.projects) {
      productCount += proj.products?.length || 0;
      for (const prod of proj.products || []) {
        modelCount += prod.models?.length || 0;
      }
    }
  } else if (Array.isArray(data.products)) {
    productCount = data.products.length;
    for (const prod of data.products) {
      modelCount += prod.models?.length || 0;
    }
  } else if (Array.isArray(data.projects)) {
    // V3 格式
    projectCount = data.projects.length;
    for (const p of data.projects) {
      productCount += p.products?.length || 0;
      for (const prod of p.products || []) {
        modelCount += prod.models?.length || 0;
      }
    }
  }

  // 更新预览显示（使用现有的元素，如果只有产品数和型号数）
  document.getElementById("dm-preview-products").textContent = productCount;
  document.getElementById("dm-preview-models").textContent = modelCount;
  preview.style.display = "";
}

function handleExport() {
  const format = document.getElementById("dm-export-format").value;
  const scope = document.getElementById("dm-export-scope").value;

  if (format === "json") {
    exportJSON(scope);
  } else if (format === "csv-fmea") {
    exportFmeaCSV(scope);
  } else if (format === "csv-life") {
    exportLifeCSV(scope);
  }
}

function exportJSON(scope) {
  let data;
  const currentProject = getCurrentProject();
  const currentProduct = getCurrentProduct();
  const currentModel = getCurrentModel();

  if (scope === "project") {
    // 导出整个项目（包含所有产品和型号）
    data = {
      version: 5,
      projects: [currentProject],
      customComponentLibrary: [],
      customImprovements: [],
      updatedAt: Date.now(),
    };
  } else if (scope === "product") {
    // 导出当前产品（包含所有型号）
    data = {
      version: 5,
      projects: [{
        id: genId(),
        name: "导出产品",
        note: "",
        createdAt: new Date().toISOString(),
        products: [currentProduct],
      }],
      customComponentLibrary: [],
      customImprovements: [],
      updatedAt: Date.now(),
    };
  } else if (scope === "model") {
    // 导出当前型号
    const productCopy = {
      id: currentProduct?.id || genId(),
      name: currentProduct?.name || "导出产品",
      createdAt: currentProduct?.createdAt || new Date().toISOString(),
      productShared: currentProduct?.productShared || {},
      models: [currentModel],
    };
    data = {
      version: 5,
      projects: [{
        id: genId(),
        name: "导出型号",
        note: "",
        createdAt: new Date().toISOString(),
        products: [productCopy],
      }],
      customComponentLibrary: [],
      customImprovements: [],
      updatedAt: Date.now(),
    };
  }

  downloadFile(JSON.stringify(data, null, 2), `reliability-data-${Date.now()}.json`, "application/json");
}

function exportFmeaCSV(scope) {
  const currentModel = getCurrentModel();
  const fmea = currentModel?.modules?.fmea;
  if (!fmea || !fmea.items?.length) {
    alert("暂无 FMEA 数据可导出");
    return;
  }

  const headers = [
    "序号", "功能/过程要求", "失效模式", "失效后果", "严重度(S)",
    "失效原因", "发生度(O)", "现行控制-预防", "现行控制-探测", "探测度(D)",
    "RPN", "AP", "建议措施", "责任部门/人", "目标完成日期",
    "措施结果-S(新)", "措施结果-O(新)", "措施结果-D(新)", "RPN(新)", "AP(新)"
  ];

  const rows = fmea.items.map((item, idx) => [
    idx + 1,
    item.function || "",
    item.failureMode || "",
    item.failureEffect || "",
    item.severity || "",
    item.failureCause || "",
    item.occurrence || "",
    item.preventionControl || "",
    item.detectionControl || "",
    item.detection || "",
    item.rpn || "",
    item.ap || "",
    item.recommendedAction || "",
    item.responsible || "",
    item.targetDate || "",
    item.newSeverity || "",
    item.newOccurrence || "",
    item.newDetection || "",
    item.newRPN || "",
    item.newAp || "",
  ]);

  const csv = [headers, ...rows].map((row) => row.map(escapeCSV).join(",")).join("\n");
  downloadFile(csv, `fmea-${currentModel.name}-${Date.now()}.csv`, "text/csv;charset=utf-8");
}

function exportLifeCSV(scope) {
  const currentModel = getCurrentModel();
  const lifeData = currentModel?.modules?.lifeData;
  if (!lifeData || !lifeData.batches?.length) {
    alert("暂无寿命数据可导出");
    return;
  }

  const headers = ["批次", "序号", "时间(h)", "状态", "零件", "失效模式", "备注"];
  const rows = [];

  for (const batch of lifeData.batches) {
    const batchName = batch.name || "未命名批次";
    (batch.items || []).forEach((item, idx) => {
      rows.push([
        batchName,
        idx + 1,
        item.time || "",
        item.status === "failure" ? "失效" : item.status === "suspended" ? "截尾" : "",
        item.part || "",
        item.failureMode || "",
        item.note || "",
      ]);
    });
  }

  const csv = [headers, ...rows].map((row) => row.map(escapeCSV).join(",")).join("\n");
  downloadFile(csv, `life-data-${currentModel.name}-${Date.now()}.csv`, "text/csv;charset=utf-8");
}

function escapeCSV(value) {
  const str = String(value || "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function handleImport() {
  if (!importDataCache) return;

  const mode = document.getElementById("dm-import-mode").value;

  try {
    if (mode === "overwrite") {
      importData(JSON.stringify(importDataCache));
    } else {
      mergeImportData(importDataCache);
    }
    alert("导入成功！");
    importDataCache = null;
    document.getElementById("dm-import-preview").style.display = "none";
    refreshUI();
    window.dispatchEvent(new Event("data-imported"));
  } catch (err) {
    alert("导入失败：" + err.message);
  }
}

function mergeImportData(data) {
  const existingProducts = getProducts();
  
  let productsToImport = [];
  if (Array.isArray(data.products)) {
    productsToImport = data.products;
  } else if (Array.isArray(data.projects)) {
    for (const project of data.projects) {
      if (Array.isArray(project.products)) {
        productsToImport.push(...project.products);
      }
    }
  }

  function regenerateIds(obj) {
    if (obj && typeof obj === "object") {
      if (obj.id) obj.id = genId();
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key])) {
          obj[key].forEach(regenerateIds);
        } else if (typeof obj[key] === "object") {
          regenerateIds(obj[key]);
        }
      }
    }
  }

  for (const product of productsToImport) {
    const newProduct = JSON.parse(JSON.stringify(product));
    regenerateIds(newProduct);
    newProduct.name = newProduct.name + " (导入)";
    existingProducts.push(newProduct);
  }
  saveToStorage();
}

function bindReportGeneration() {
  document.getElementById("dm-generate-report").addEventListener("click", generateReport);
  document.getElementById("dm-print-report").addEventListener("click", printReport);
  document.getElementById("dm-open-report").addEventListener("click", openReportInNewWindow);
}

function generateReport() {
  const template = document.getElementById("dm-report-template").value;
  const modules = Array.from(
    document.querySelectorAll('input[name="report-modules"]:checked')
  ).map((c) => c.value);

  const reportHtml = buildReportHtml(template, modules);
  const preview = document.getElementById("dm-report-preview");
  preview.innerHTML = `<div class="dm-report-content">${reportHtml}</div>`;

  document.getElementById("dm-print-report").style.display = "";
  document.getElementById("dm-open-report").style.display = "";
}

function buildReportHtml(template, modules) {
  const currentModel = getCurrentModel();
  const currentProduct = getCurrentProduct();

  let html = `
    <div class="report-page">
      <div class="report-header">
        <h1>${getReportTitle(template)}</h1>
        <div class="report-meta">
          <p><strong>产品：</strong>${escapeHtml(currentProduct?.name || "-")}</p>
          <p><strong>型号：</strong>${escapeHtml(currentModel?.name || "-")}</p>
          <p><strong>生成时间：</strong>${new Date().toLocaleString()}</p>
        </div>
      </div>
  `;

  if (modules.includes("basic")) {
    html += buildBasicInfoSection(currentModel);
  }
  if (modules.includes("fmea") && (template === "fmea" || template === "comprehensive")) {
    html += buildFmeaSection(currentModel);
  }
  if (modules.includes("life") && (template === "life" || template === "comprehensive")) {
    html += buildLifeSection(currentModel);
  }
  if (modules.includes("prediction") && template === "comprehensive") {
    html += buildPredictionSection(currentModel);
  }
  if (modules.includes("test-plan") && (template === "test-plan" || template === "comprehensive")) {
    html += buildTestPlanSection(currentModel);
  }
  if (modules.includes("derating") && template === "comprehensive") {
    html += buildDeratingSection(currentModel);
  }

  html += `
      <div class="report-footer">
        <p>本报告由可靠性工具平台自动生成</p>
      </div>
    </div>
  `;

  return html;
}

function getReportTitle(template) {
  const titles = {
    fmea: "FMEA 分析报告",
    life: "寿命分析报告",
    "test-plan": "测试计划报告",
    comprehensive: "综合可靠性报告",
  };
  return titles[template] || "可靠性分析报告";
}

function buildBasicInfoSection(model) {
  const record = model?.record || {};
  return `
    <div class="report-section">
      <h2>1. 基本信息</h2>
      <table class="report-table">
        <tr><th style="width: 30%;">型号名称</th><td>${escapeHtml(record.modelName || model?.name || "-")}</td></tr>
        <tr><th>项目编号</th><td>${escapeHtml(record.projectCode || "-")}</td></tr>
        <tr><th>电压</th><td>${record.voltage || "-"} V</td></tr>
        <tr><th>功率</th><td>${record.power || "-"} W</td></tr>
        <tr><th>刀片类型</th><td>${escapeHtml(record.bladeType || "-")}</td></tr>
        <tr><th>刀片长度</th><td>${record.bladeLength || "-"} mm</td></tr>
        <tr><th>分析人员</th><td>${escapeHtml(record.analyst || "-")}</td></tr>
        <tr><th>创建时间</th><td>${model?.createdAt ? new Date(model.createdAt).toLocaleString() : "-"}</td></tr>
      </table>
    </div>
  `;
}

function buildFmeaSection(model) {
  const fmea = model?.modules?.fmea;
  const items = fmea?.items || [];
  const highRisk = items.filter((i) => i.ap === "H").length;
  const mediumRisk = items.filter((i) => i.ap === "M").length;
  const lowRisk = items.filter((i) => i.ap === "L").length;

  return `
    <div class="report-section">
      <h2>2. FMEA 分析</h2>
      <div class="report-summary-cards">
        <div class="report-summary-card">
          <div class="report-summary-value">${items.length}</div>
          <div class="report-summary-label">总项数</div>
        </div>
        <div class="report-summary-card danger">
          <div class="report-summary-value">${highRisk}</div>
          <div class="report-summary-label">高风险 (H)</div>
        </div>
        <div class="report-summary-card warning">
          <div class="report-summary-value">${mediumRisk}</div>
          <div class="report-summary-label">中风险 (M)</div>
        </div>
        <div class="report-summary-card success">
          <div class="report-summary-value">${lowRisk}</div>
          <div class="report-summary-label">低风险 (L)</div>
        </div>
      </div>
      ${
        highRisk > 0
          ? `
      <h3>高风险项列表</h3>
      <table class="report-table">
        <thead>
          <tr>
            <th>序号</th><th>失效模式</th><th>失效后果</th><th>S</th><th>O</th><th>D</th><th>RPN</th><th>AP</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .filter((i) => i.ap === "H")
            .map(
              (item, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHtml(item.failureMode || "-")}</td>
              <td>${escapeHtml(item.failureEffect || "-")}</td>
              <td>${item.severity || "-"}</td>
              <td>${item.occurrence || "-"}</td>
              <td>${item.detection || "-"}</td>
              <td>${item.rpn || "-"}</td>
              <td><span class="risk-badge high">H</span></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      `
          : ""
      }
    </div>
  `;
}

function buildLifeSection(model) {
  const lifeData = model?.modules?.lifeData;
  const batches = lifeData?.batches || [];
  const totalSamples = batches.reduce((sum, b) => sum + (b.items?.length || 0), 0);
  const failureCount = batches.reduce(
    (sum, b) => sum + (b.items?.filter((i) => i.status === "failure")?.length || 0),
    0
  );

  return `
    <div class="report-section">
      <h2>3. 寿命分析</h2>
      <div class="report-summary-cards">
        <div class="report-summary-card">
          <div class="report-summary-value">${batches.length}</div>
          <div class="report-summary-label">试验批次</div>
        </div>
        <div class="report-summary-card">
          <div class="report-summary-value">${totalSamples}</div>
          <div class="report-summary-label">样本总数</div>
        </div>
        <div class="report-summary-card">
          <div class="report-summary-value">${failureCount}</div>
          <div class="report-summary-label">失效数</div>
        </div>
        <div class="report-summary-card">
          <div class="report-summary-value">${
            totalSamples > 0 ? ((failureCount / totalSamples) * 100).toFixed(1) : 0
          }%</div>
          <div class="report-summary-label">失效率</div>
        </div>
      </div>
      <h3>试验批次列表</h3>
      <table class="report-table">
        <thead>
          <tr>
            <th>序号</th><th>批次名称</th><th>测试对象</th><th>样本数</th><th>失效数</th><th>开始日期</th>
          </tr>
        </thead>
        <tbody>
          ${batches
            .map(
              (batch, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHtml(batch.name || "-")}</td>
              <td>${escapeHtml(batch.part || "-")}</td>
              <td>${batch.items?.length || 0}</td>
              <td>${batch.items?.filter((i) => i.status === "failure")?.length || 0}</td>
              <td>${escapeHtml(batch.date || "-")}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildPredictionSection(model) {
  const prediction = model?.modules?.prediction;
  const components = prediction?.components || [];
  const totalLambda = components.reduce(
    (sum, c) => sum + (c.quantity || 0) * (c.workingLambda || c.baseLambda || 0),
    0
  );
  const mtbf = totalLambda > 0 ? 1e9 / totalLambda : 0;

  return `
    <div class="report-section">
      <h2>4. 可靠性预测</h2>
      <div class="report-summary-cards">
        <div class="report-summary-card">
          <div class="report-summary-value">${components.length}</div>
          <div class="report-summary-label">元器件种类</div>
        </div>
        <div class="report-summary-card">
          <div class="report-summary-value">${components.reduce((sum, c) => sum + (c.quantity || 0), 0)}</div>
          <div class="report-summary-label">元器件总数</div>
        </div>
        <div class="report-summary-card accent">
          <div class="report-summary-value">${totalLambda.toFixed(2)}</div>
          <div class="report-summary-label">总失效率 (FIT)</div>
        </div>
        <div class="report-summary-card success">
          <div class="report-summary-value">${mtbf > 10000 ? (mtbf / 10000).toFixed(2) + "万" : mtbf.toFixed(0)}</div>
          <div class="report-summary-label">MTBF (小时)</div>
        </div>
      </div>
    </div>
  `;
}

function buildTestPlanSection(model) {
  const testPlan = model?.modules?.testPlan;
  const testItems = testPlan?.testItems || [];
  const altPlans = testPlan?.altPlans || [];
  const haltTests = testPlan?.haltTests || [];

  return `
    <div class="report-section">
      <h2>5. 测试计划</h2>
      <div class="report-summary-cards">
        <div class="report-summary-card">
          <div class="report-summary-value">${testItems.length}</div>
          <div class="report-summary-label">试验项目</div>
        </div>
        <div class="report-summary-card">
          <div class="report-summary-value">${altPlans.length}</div>
          <div class="report-summary-label">ALT 计划</div>
        </div>
        <div class="report-summary-card">
          <div class="report-summary-value">${haltTests.length}</div>
          <div class="report-summary-label">HALT 试验</div>
        </div>
      </div>
    </div>
  `;
}

function buildDeratingSection(model) {
  const derating = model?.modules?.derating;
  const components = derating?.components || [];

  return `
    <div class="report-section">
      <h2>6. 降额分析</h2>
      <div class="report-summary-cards">
        <div class="report-summary-card">
          <div class="report-summary-value">${components.length}</div>
          <div class="report-summary-label">元器件数</div>
        </div>
      </div>
    </div>
  `;
}

function printReport() {
  const reportContent = document.querySelector(".dm-report-content");
  if (!reportContent) return;

  if (reportWindow && !reportWindow.closed) {
    reportWindow.close();
  }

  reportWindow = window.open("", "_blank");
  reportWindow.document.write(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <title>可靠性报告</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; }
        .report-page { max-width: 900px; margin: 0 auto; background: white; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .report-header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #3b9eff; }
        .report-header h1 { font-size: 28px; color: #1a2332; margin-bottom: 15px; }
        .report-meta { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; font-size: 14px; color: #666; }
        .report-meta p { margin: 0; }
        .report-section { margin-bottom: 30px; }
        .report-section h2 { font-size: 20px; color: #1a2332; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0; }
        .report-section h3 { font-size: 16px; color: #333; margin: 20px 0 10px; }
        .report-table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px; }
        .report-table th, .report-table td { border: 1px solid #ddd; padding: 10px 12px; text-align: left; }
        .report-table th { background: #f8f9fa; font-weight: 600; color: #1a2332; }
        .report-table tbody tr:nth-child(even) { background: #fafafa; }
        .report-summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 15px 0; }
        .report-summary-card { background: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; border: 1px solid #e0e0e0; }
        .report-summary-card.accent { background: #eff6ff; border-color: #bfdbfe; }
        .report-summary-card.success { background: #f0fdf4; border-color: #bbf7d0; }
        .report-summary-card.warning { background: #fffbeb; border-color: #fde68a; }
        .report-summary-card.danger { background: #fef2f2; border-color: #fecaca; }
        .report-summary-value { font-size: 28px; font-weight: 700; color: #1a2332; margin-bottom: 5px; }
        .report-summary-label { font-size: 13px; color: #666; }
        .risk-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
        .risk-badge.high { background: #fee2e2; color: #dc2626; }
        .risk-badge.medium { background: #fef3c7; color: #d97706; }
        .risk-badge.low { background: #dcfce7; color: #16a34a; }
        .report-footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999; }
        @media print {
          body { background: white; }
          .report-page { box-shadow: none; padding: 20px; }
        }
      </style>
    </head>
    <body>
      ${reportContent.innerHTML}
    </body>
    </html>
  `);
  reportWindow.document.close();
  reportWindow.focus();
  setTimeout(() => reportWindow.print(), 500);
}

function openReportInNewWindow() {
  const reportContent = document.querySelector(".dm-report-content");
  if (!reportContent) return;

  const win = window.open("", "_blank");
  win.document.write(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <title>可靠性报告</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; padding: 20px; }
        .report-page { max-width: 900px; margin: 0 auto; background: white; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-radius: 8px; }
        .report-header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #3b9eff; }
        .report-header h1 { font-size: 28px; color: #1a2332; margin-bottom: 15px; }
        .report-meta { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; font-size: 14px; color: #666; }
        .report-meta p { margin: 0; }
        .report-section { margin-bottom: 30px; }
        .report-section h2 { font-size: 20px; color: #1a2332; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0; }
        .report-section h3 { font-size: 16px; color: #333; margin: 20px 0 10px; }
        .report-table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px; }
        .report-table th, .report-table td { border: 1px solid #ddd; padding: 10px 12px; text-align: left; }
        .report-table th { background: #f8f9fa; font-weight: 600; color: #1a2332; }
        .report-table tbody tr:nth-child(even) { background: #fafafa; }
        .report-summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 15px 0; }
        .report-summary-card { background: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; border: 1px solid #e0e0e0; }
        .report-summary-card.accent { background: #eff6ff; border-color: #bfdbfe; }
        .report-summary-card.success { background: #f0fdf4; border-color: #bbf7d0; }
        .report-summary-card.warning { background: #fffbeb; border-color: #fde68a; }
        .report-summary-card.danger { background: #fef2f2; border-color: #fecaca; }
        .report-summary-value { font-size: 28px; font-weight: 700; color: #1a2332; margin-bottom: 5px; }
        .report-summary-label { font-size: 13px; color: #666; }
        .risk-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
        .risk-badge.high { background: #fee2e2; color: #dc2626; }
        .risk-badge.medium { background: #fef3c7; color: #d97706; }
        .risk-badge.low { background: #dcfce7; color: #16a34a; }
        .report-footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999; }
        .toolbar { position: fixed; top: 20px; right: 20px; }
        .toolbar button { padding: 10px 20px; background: #3b9eff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
        .toolbar button:hover { background: #2563a8; }
        @media print {
          body { background: white; padding: 0; }
          .toolbar { display: none; }
          .report-page { box-shadow: none; border-radius: 0; padding: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <button onclick="window.print()">🖨️ 打印 / 导出PDF</button>
      </div>
      ${reportContent.innerHTML}
    </body>
    </html>
  `);
  win.document.close();
}

function bindVersionManagement() {
  document.getElementById("dm-new-snapshot").addEventListener("click", createSnapshot);
  document.getElementById("dm-close-compare").addEventListener("click", () => {
    document.getElementById("dm-version-compare").style.display = "none";
  });
}

function renderVersions() {
  const list = document.getElementById("dm-versions-list");
  const dataMgmt = model?.modules?.dataManagement;
  const versions = dataMgmt?.versions || [];

  if (!versions.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📸</div>
        <h3>暂无版本快照</h3>
        <p>点击「创建快照」按钮保存当前版本。</p>
      </div>
    `;
    return;
  }

  list.innerHTML = `
    <div class="dm-version-items">
      ${versions
        .slice()
        .reverse()
        .map(
          (v, idx) => `
        <div class="dm-version-item" data-version-id="${v.id}">
          <div class="dm-version-info">
            <div class="dm-version-name">${escapeHtml(v.name)}</div>
            <div class="dm-version-note">${escapeHtml(v.note || "")}</div>
            <div class="dm-version-date">${new Date(v.createdAt).toLocaleString()}</div>
          </div>
          <div class="dm-version-actions">
            <button type="button" class="btn-ghost" data-action="restore">恢复</button>
            <button type="button" class="btn-ghost" data-action="compare">对比</button>
            <button type="button" class="btn-ghost btn-danger" data-action="delete">删除</button>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  list.querySelectorAll(".dm-version-item").forEach((item) => {
    const versionId = item.dataset.versionId;
    item.querySelector('[data-action="restore"]').addEventListener("click", () => restoreSnapshot(versionId));
    item.querySelector('[data-action="compare"]').addEventListener("click", () => startCompare(versionId));
    item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteSnapshot(versionId));
  });
}

function createSnapshot() {
  const name = prompt("请输入版本名称：", `v${(model?.modules?.dataManagement?.versions?.length || 0) + 1}.0`);
  if (!name) return;

  const note = prompt("请输入版本备注（可选）：", "") || "";

  const snapshot = {
    id: genId(),
    name,
    note,
    createdAt: new Date().toISOString(),
    snapshot: JSON.parse(JSON.stringify(model.modules)),
  };

  if (!model.modules.dataManagement) {
    model.modules.dataManagement = { versions: [], templates: [] };
  }
  if (!model.modules.dataManagement.versions) {
    model.modules.dataManagement.versions = [];
  }

  model.modules.dataManagement.versions.push(snapshot);

  if (onSave) {
    onSave({ modules: model.modules });
  }

  renderVersions();
  alert("版本快照创建成功！");
}

function restoreSnapshot(versionId) {
  const versions = model?.modules?.dataManagement?.versions || [];
  const version = versions.find((v) => v.id === versionId);
  if (!version) return;

  if (!confirm(`确定要恢复到版本「${version.name}」吗？当前未保存的修改将会丢失。`)) return;

  model.modules = JSON.parse(JSON.stringify(version.snapshot));

  if (!model.modules.dataManagement) {
    model.modules.dataManagement = { versions: [], templates: [] };
  }
  if (!model.modules.dataManagement.versions) {
    model.modules.dataManagement.versions = versions;
  }

  if (onSave) {
    onSave({ modules: model.modules });
  }

  renderVersions();
  alert("版本恢复成功！");
}

function deleteSnapshot(versionId) {
  const versions = model?.modules?.dataManagement?.versions || [];
  const version = versions.find((v) => v.id === versionId);
  if (!version) return;

  if (!confirm(`确定要删除版本「${version.name}」吗？此操作不可恢复。`)) return;

  model.modules.dataManagement.versions = versions.filter((v) => v.id !== versionId);

  if (onSave) {
    onSave({ modules: model.modules });
  }

  renderVersions();
}

function startCompare(versionId) {
  const versions = model?.modules?.dataManagement?.versions || [];
  if (versions.length < 2) {
    alert("至少需要两个版本才能对比");
    return;
  }

  const compareSection = document.getElementById("dm-version-compare");
  const selectA = document.getElementById("dm-compare-a");
  const selectB = document.getElementById("dm-compare-b");

  const options = versions
    .map((v) => `<option value="${v.id}">${escapeHtml(v.name)}</option>`)
    .join("");

  selectA.innerHTML = options;
  selectB.innerHTML = options;

  selectB.value = versionId;
  if (selectA.value === versionId) {
    const otherVersion = versions.find((v) => v.id !== versionId);
    if (otherVersion) selectA.value = otherVersion.id;
  }

  compareSection.style.display = "";

  const doCompare = () => {
    const aId = selectA.value;
    const bId = selectB.value;
    if (aId && bId) {
      showCompareResults(aId, bId);
    }
  };

  selectA.onchange = doCompare;
  selectB.onchange = doCompare;
  doCompare();
}

function showCompareResults(aId, bId) {
  const versions = model?.modules?.dataManagement?.versions || [];
  const versionA = versions.find((v) => v.id === aId);
  const versionB = versions.find((v) => v.id === bId);

  if (!versionA || !versionB) return;

  const results = compareObjects(versionA.snapshot, versionB.snapshot);
  const container = document.getElementById("dm-compare-results");

  if (!results.length) {
    container.innerHTML = `
      <div class="dm-compare-empty">
        <p>两个版本完全相同，没有差异。</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="dm-compare-list">
      <div class="dm-compare-summary">共发现 ${results.length} 处差异</div>
      ${results
        .map(
          (r) => `
        <div class="dm-compare-item">
          <div class="dm-compare-path">${escapeHtml(r.path)}</div>
          <div class="dm-compare-values">
            <div class="dm-compare-value dm-compare-old">
              <span class="dm-compare-label">${escapeHtml(versionA.name)}</span>
              <span class="dm-compare-content">${escapeHtml(formatValue(r.a))}</span>
            </div>
            <div class="dm-compare-value dm-compare-new">
              <span class="dm-compare-label">${escapeHtml(versionB.name)}</span>
              <span class="dm-compare-content">${escapeHtml(formatValue(r.b))}</span>
            </div>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function compareObjects(a, b, path = "") {
  const differences = [];

  if (a === b) return differences;

  if (a === null || b === null || typeof a !== typeof b) {
    differences.push({ path: path || "root", a, b });
    return differences;
  }

  if (typeof a !== "object") {
    differences.push({ path: path || "root", a, b });
    return differences;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      differences.push({ path: path || "root", a: `数组(${a.length}项)`, b: `数组(${b.length}项)` });
    }
    return differences;
  }

  const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

  for (const key of allKeys) {
    const currentPath = path ? `${path}.${key}` : key;
    const valA = a?.[key];
    const valB = b?.[key];

    if (valA === undefined && valB !== undefined) {
      differences.push({ path: currentPath, a: "(不存在)", b: valB });
    } else if (valA !== undefined && valB === undefined) {
      differences.push({ path: currentPath, a: valA, b: "(不存在)" });
    } else if (typeof valA === "object" && typeof valB === "object" && valA !== null && valB !== null) {
      if (Array.isArray(valA) && Array.isArray(valB)) {
        if (valA.length !== valB.length) {
          differences.push({ path: currentPath, a: `数组(${valA.length}项)`, b: `数组(${valB.length}项)` });
        }
      } else if (!Array.isArray(valA) && !Array.isArray(valB)) {
        differences.push(...compareObjects(valA, valB, currentPath));
      }
    } else if (valA !== valB) {
      differences.push({ path: currentPath, a: valA, b: valB });
    }
  }

  return differences.slice(0, 50);
}

function formatValue(val) {
  if (val === null || val === undefined) return String(val);
  if (typeof val === "object") {
    if (Array.isArray(val)) return `数组(${val.length}项)`;
    return `对象(${Object.keys(val).length}个字段)`;
  }
  return String(val).slice(0, 100);
}

function saveToStorage() {
  const event = new Event("data-changed");
  window.dispatchEvent(event);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleDateString();
}
