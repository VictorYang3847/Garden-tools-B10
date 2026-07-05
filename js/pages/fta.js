import { genId } from "../store.js?v=1.0.5";
import { fmt, pct, toast } from "../utils.js?v=1.0.5";

let currentModel = null;
let onSaveCallback = null;

const NODE_TYPES = {
  top: { label: "顶事件", color: "#f87171", shape: "rect" },
  intermediate: { label: "中间事件", color: "#fbbf24", shape: "rect" },
  basic: { label: "基本事件", color: "#34d399", shape: "circle" },
  and: { label: "AND 门", color: "#3b9eff", shape: "and" },
  or: { label: "OR 门", color: "#a78bfa", shape: "or" },
  vote23: { label: "2/3 表决门", color: "#f472b6", shape: "vote" },
};

function ensureFta() {
  if (!currentModel.modules) currentModel.modules = {};
  if (!currentModel.modules.fta) {
    currentModel.modules.fta = {
      trees: [],
      activeTreeId: null,
    };
  }
  const fta = currentModel.modules.fta;
  if (!fta.trees) fta.trees = [];
  if (!fta.activeTreeId) fta.activeTreeId = null;
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
  const template = document.getElementById("fta-template");
  const content = template.content.cloneNode(true);
  container.appendChild(content);

  ensureFta();
  bindEvents();
  renderTreeTabs();
  renderLibrary();
  renderTree();
  renderResults();
  updateEmptyState();
}

function bindEvents() {
  const newTreeBtn = document.getElementById("fta-new-tree");
  const emptyNewBtn = document.getElementById("fta-empty-new-btn");
  const addEventBtn = document.getElementById("fta-add-event-btn");
  const addEventMenu = document.getElementById("fta-add-event-menu");
  const calcMcsBtn = document.getElementById("fta-calc-mcs");
  const deleteTreeBtn = document.getElementById("fta-delete-tree");
  const treeTabs = document.getElementById("fta-tree-tabs");
  const treeContainer = document.getElementById("fta-tree-container");

  if (newTreeBtn) newTreeBtn.addEventListener("click", createNewTree);
  if (emptyNewBtn) emptyNewBtn.addEventListener("click", createNewTree);
  if (calcMcsBtn) calcMcsBtn.addEventListener("click", calculateAll);
  if (deleteTreeBtn) deleteTreeBtn.addEventListener("click", deleteActiveTree);

  if (addEventBtn && addEventMenu) {
    addEventBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      addEventMenu.classList.toggle("show");
    });
    document.addEventListener("click", () => {
      addEventMenu.classList.remove("show");
    });
    addEventMenu.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  if (addEventMenu) {
    addEventMenu.addEventListener("click", (e) => {
      const item = e.target.closest(".dropdown-item");
      if (!item) return;
      const type = item.dataset.addType;
      addNode(type);
      addEventMenu.classList.remove("show");
    });
  }

  if (treeTabs) {
    treeTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".fta-tree-tab");
      if (!tab) return;
      const treeId = tab.dataset.treeId;
      switchTree(treeId);
    });

    treeTabs.addEventListener("dblclick", (e) => {
      const tab = e.target.closest(".fta-tree-tab");
      if (!tab) return;
      const treeId = tab.dataset.treeId;
      const nameEl = tab.querySelector(".fta-tree-tab-name");
      if (!nameEl) return;
      const tree = getTree(treeId);
      if (!tree) return;
      const newName = prompt("输入故障树名称：", tree.name);
      if (newName && newName.trim()) {
        tree.name = newName.trim();
        autoSave();
        renderTreeTabs();
      }
    });
  }

  if (treeContainer) {
    treeContainer.addEventListener("click", (e) => {
      const nodeEl = e.target.closest(".fta-node");
      if (nodeEl && !e.target.closest(".fta-node-actions")) {
        const nodeId = nodeEl.dataset.nodeId;
        selectNode(nodeId);
      }
    });

    treeContainer.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest("[data-action='delete-node']");
      if (deleteBtn) {
        const nodeId = deleteBtn.dataset.nodeId;
        deleteNode(nodeId);
      }
    });

    treeContainer.addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-action='edit-node']");
      if (editBtn) {
        const nodeId = editBtn.dataset.nodeId;
        editNode(nodeId);
      }
    });

    treeContainer.addEventListener("click", (e) => {
      const addChildBtn = e.target.closest("[data-action='add-child']");
      if (addChildBtn) {
        const nodeId = addChildBtn.dataset.nodeId;
        showAddChildMenu(nodeId, addChildBtn);
      }
    });

    treeContainer.addEventListener("click", (e) => {
      const connectBtn = e.target.closest("[data-action='connect']");
      if (connectBtn) {
        const nodeId = connectBtn.dataset.nodeId;
        startConnect(nodeId);
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      if (selectedNodeId) {
        e.preventDefault();
        deleteNode(selectedNodeId);
      }
    }
    if (e.key === "Escape") {
      if (connectingFromId) {
        connectingFromId = null;
        renderTree();
      }
    }
  });
}

let selectedNodeId = null;
let connectingFromId = null;

function getActiveTree() {
  const fta = currentModel.modules.fta;
  if (!fta.activeTreeId) return null;
  return fta.trees.find((t) => t.id === fta.activeTreeId) || null;
}

function getTree(treeId) {
  return currentModel.modules.fta.trees.find((t) => t.id === treeId) || null;
}

function createNewTree() {
  const fta = currentModel.modules.fta;
  const tree = {
    id: genId(),
    name: `故障树 ${fta.trees.length + 1}`,
    description: "",
    topEventId: null,
    nodes: [],
  };
  fta.trees.push(tree);
  fta.activeTreeId = tree.id;
  autoSave();
  renderTreeTabs();
  renderLibrary();
  renderTree();
  renderResults();
  updateEmptyState();
}

function switchTree(treeId) {
  const fta = currentModel.modules.fta;
  fta.activeTreeId = treeId;
  selectedNodeId = null;
  connectingFromId = null;
  autoSave();
  renderTreeTabs();
  renderLibrary();
  renderTree();
  renderResults();
}

function deleteActiveTree() {
  const tree = getActiveTree();
  if (!tree) return;
  if (!confirm(`确定删除故障树「${tree.name}」？此操作不可恢复。`)) return;

  const fta = currentModel.modules.fta;
  fta.trees = fta.trees.filter((t) => t.id !== tree.id);
  if (fta.activeTreeId === tree.id) {
    fta.activeTreeId = fta.trees[0]?.id || null;
  }
  selectedNodeId = null;
  autoSave();
  renderTreeTabs();
  renderLibrary();
  renderTree();
  renderResults();
  updateEmptyState();
}

function renderTreeTabs() {
  const tabsContainer = document.getElementById("fta-tree-tabs");
  if (!tabsContainer) return;

  const fta = currentModel.modules.fta;
  const trees = fta.trees || [];

  if (trees.length === 0) {
    tabsContainer.innerHTML = "";
    return;
  }

  tabsContainer.innerHTML = trees
    .map((tree) => {
      const active = tree.id === fta.activeTreeId ? "active" : "";
      return `
        <div class="fta-tree-tab ${active}" data-tree-id="${tree.id}">
          <span class="fta-tree-tab-icon">🌳</span>
          <span class="fta-tree-tab-name">${escapeHtml(tree.name)}</span>
        </div>
      `;
    })
    .join("");
}

function renderLibrary() {
  const tree = getActiveTree();
  const basicList = document.getElementById("fta-basic-events-list");
  const intermediateList = document.getElementById("fta-intermediate-events-list");
  const gatesList = document.getElementById("fta-gates-list");

  if (!tree) {
    if (basicList) basicList.innerHTML = "";
    if (intermediateList) intermediateList.innerHTML = "";
    if (gatesList) gatesList.innerHTML = "";
    return;
  }

  const basicNodes = tree.nodes.filter((n) => n.type === "basic");
  const intermediateNodes = tree.nodes.filter((n) => n.type === "intermediate");
  const gateNodes = tree.nodes.filter((n) => n.type === "and" || n.type === "or" || n.type === "vote23");

  if (basicList) {
    basicList.innerHTML = basicNodes.length
      ? basicNodes
          .map(
            (n) => `
        <div class="library-item" draggable="true" data-node-id="${n.id}">
          <span class="library-item-dot" style="background: ${NODE_TYPES.basic.color};"></span>
          <span class="library-item-name">${escapeHtml(n.name || "基本事件")}</span>
        </div>
      `
          )
          .join("")
      : `<div class="library-empty">暂无基本事件</div>`;
  }

  if (intermediateList) {
    intermediateList.innerHTML = intermediateNodes.length
      ? intermediateNodes
          .map(
            (n) => `
        <div class="library-item" draggable="true" data-node-id="${n.id}">
          <span class="library-item-dot" style="background: ${NODE_TYPES.intermediate.color};"></span>
          <span class="library-item-name">${escapeHtml(n.name || "中间事件")}</span>
        </div>
      `
          )
          .join("")
      : `<div class="library-empty">暂无中间事件</div>`;
  }

  if (gatesList) {
    gatesList.innerHTML = gateNodes.length
      ? gateNodes
          .map(
            (n) => `
        <div class="library-item" draggable="true" data-node-id="${n.id}">
          <span class="library-item-dot" style="background: ${NODE_TYPES[n.type].color};"></span>
          <span class="library-item-name">${escapeHtml(n.name || NODE_TYPES[n.type].label)}</span>
        </div>
      `
          )
          .join("")
      : `<div class="library-empty">暂无逻辑门</div>`;
  }
}

function addNode(type) {
  const tree = getActiveTree();
  if (!tree) {
    alert("请先创建或选择一个故障树");
    return;
  }

  if (type === "top" && tree.topEventId) {
    alert("顶事件只能有一个");
    return;
  }

  const node = {
    id: genId(),
    type,
    name: NODE_TYPES[type].label,
    description: "",
    lambda: type === "basic" ? 0.001 : null,
    parentIds: [],
    childIds: [],
  };

  tree.nodes.push(node);

  if (type === "top") {
    tree.topEventId = node.id;
  }

  autoSave();
  renderLibrary();
  renderTree();
}

function deleteNode(nodeId) {
  const tree = getActiveTree();
  if (!tree) return;

  const node = tree.nodes.find((n) => n.id === nodeId);
  if (!node) return;

  if (!confirm(`确定删除「${node.name || NODE_TYPES[node.type].label}」？`)) return;

  for (const parentId of node.parentIds) {
    const parent = tree.nodes.find((n) => n.id === parentId);
    if (parent) {
      parent.childIds = parent.childIds.filter((id) => id !== nodeId);
    }
  }

  const deleteChildren = (id) => {
    const n = tree.nodes.find((x) => x.id === id);
    if (!n) return;
    for (const childId of n.childIds) {
      deleteChildren(childId);
    }
    tree.nodes = tree.nodes.filter((x) => x.id !== id);
  };
  for (const childId of node.childIds) {
    deleteChildren(childId);
  }

  tree.nodes = tree.nodes.filter((n) => n.id !== nodeId);

  if (node.type === "top") {
    tree.topEventId = null;
  }

  if (selectedNodeId === nodeId) selectedNodeId = null;
  if (connectingFromId === nodeId) connectingFromId = null;

  autoSave();
  renderLibrary();
  renderTree();
  renderResults();
}

function editNode(nodeId) {
  const tree = getActiveTree();
  if (!tree) return;

  const node = tree.nodes.find((n) => n.id === nodeId);
  if (!node) return;

  const name = prompt("节点名称：", node.name);
  if (name === null) return;
  node.name = name || NODE_TYPES[node.type].label;

  if (node.type === "basic") {
    const lambdaStr = prompt("失效率 λ (/h)：", String(node.lambda || 0));
    if (lambdaStr === null) return;
    const lambda = parseFloat(lambdaStr);
    if (!isNaN(lambda) && lambda >= 0) {
      node.lambda = lambda;
    }
  }

  const desc = prompt("描述：", node.description || "");
  if (desc !== null) {
    node.description = desc;
  }

  autoSave();
  renderLibrary();
  renderTree();
  renderResults();
}

function selectNode(nodeId) {
  selectedNodeId = nodeId;
  renderTree();
}

function startConnect(nodeId) {
  if (connectingFromId === nodeId) {
    connectingFromId = null;
  } else {
    connectingFromId = nodeId;
  }
  renderTree();
}

function showAddChildMenu(nodeId, button) {
  const types = ["basic", "intermediate", "and", "or", "vote23"];
  const typeLabels = {
    basic: "基本事件",
    intermediate: "中间事件",
    and: "AND 门",
    or: "OR 门",
    vote23: "2/3 表决门",
  };

  const menu = document.createElement("div");
  menu.className = "fta-context-menu";
  menu.style.position = "absolute";
  menu.style.zIndex = "1000";

  types.forEach((type) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "fta-context-item";
    item.textContent = `添加${typeLabels[type]}`;
    item.addEventListener("click", () => {
      addChildNode(nodeId, type);
      menu.remove();
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);

  const rect = button.getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;

  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => {
    document.addEventListener("click", closeHandler);
  }, 0);
}

function addChildNode(parentId, type) {
  const tree = getActiveTree();
  if (!tree) return;

  const parent = tree.nodes.find((n) => n.id === parentId);
  if (!parent) return;

  const node = {
    id: genId(),
    type,
    name: NODE_TYPES[type].label,
    description: "",
    lambda: type === "basic" ? 0.001 : null,
    parentIds: [parentId],
    childIds: [],
  };

  tree.nodes.push(node);
  parent.childIds.push(node.id);

  autoSave();
  renderLibrary();
  renderTree();
  renderResults();
}

function updateEmptyState() {
  const empty = document.getElementById("fta-empty-state");
  const treeContainer = document.getElementById("fta-tree-container");
  const fta = currentModel.modules.fta;

  if (!fta.trees || fta.trees.length === 0) {
    if (empty) empty.style.display = "";
    if (treeContainer) treeContainer.style.display = "none";
  } else {
    if (empty) empty.style.display = "none";
    if (treeContainer) treeContainer.style.display = "";
  }
}

function buildTreeLevels() {
  const tree = getActiveTree();
  if (!tree || !tree.topEventId) return [];

  const topEvent = tree.nodes.find((n) => n.id === tree.topEventId);
  if (!topEvent) return [];

  const levels = [];
  const visited = new Set();
  let currentLevel = [topEvent];
  visited.add(topEvent.id);

  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel = [];
    for (const node of currentLevel) {
      for (const childId of node.childIds) {
        if (!visited.has(childId)) {
          const child = tree.nodes.find((n) => n.id === childId);
          if (child) {
            nextLevel.push(child);
            visited.add(childId);
          }
        }
      }
    }
    currentLevel = nextLevel;
  }

  return levels;
}

function renderTree() {
  const container = document.getElementById("fta-tree-container");
  if (!container) return;

  const tree = getActiveTree();
  if (!tree) {
    container.innerHTML = "";
    return;
  }

  if (!tree.topEventId) {
    container.innerHTML = `
      <div class="fta-tree-empty">
        <p>请先添加顶事件</p>
        <button type="button" class="btn-primary" onclick="void(0)" data-action="add-top">添加顶事件</button>
      </div>
    `;
    container.querySelector("[data-action='add-top']")?.addEventListener("click", () => addNode("top"));
    return;
  }

  const levels = buildTreeLevels();
  if (levels.length === 0) {
    container.innerHTML = "";
    return;
  }

  let html = `<div class="fta-tree">`;

  for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
    const level = levels[levelIdx];
    html += `<div class="fta-tree-level" data-level="${levelIdx}">`;

    for (const node of level) {
      const isSelected = selectedNodeId === node.id;
      const isConnecting = connectingFromId === node.id;
      const typeInfo = NODE_TYPES[node.type];
      const selectedClass = isSelected ? "selected" : "";
      const connectingClass = isConnecting ? "connecting" : "";
      const nodeTypeClass = `fta-node-${node.type}`;

      html += `
        <div class="fta-node-wrapper" data-node-id="${node.id}">
          <div class="fta-node ${nodeTypeClass} ${selectedClass} ${connectingClass}" data-node-id="${node.id}" style="border-color: ${typeInfo.color};">
            <div class="fta-node-header">
              <span class="fta-node-type" style="background: ${typeInfo.color};">${typeInfo.label}</span>
              <div class="fta-node-actions">
                <button type="button" class="fta-node-action" data-action="add-child" data-node-id="${node.id}" title="添加子节点">+</button>
                <button type="button" class="fta-node-action" data-action="edit-node" data-node-id="${node.id}" title="编辑">✎</button>
                <button type="button" class="fta-node-action" data-action="delete-node" data-node-id="${node.id}" title="删除">✕</button>
              </div>
            </div>
            <div class="fta-node-body">
              <div class="fta-node-name">${escapeHtml(node.name)}</div>
              ${node.type === "basic" && node.lambda !== null ? `<div class="fta-node-lambda">λ: ${node.lambda.toExponential(2)}</div>` : ""}
            </div>
          </div>
      `;

      if (node.childIds.length > 0) {
        html += `<div class="fta-node-children-line"></div>`;
      }

      html += `</div>`;
    }

    html += `</div>`;
  }

  html += `</div>`;
  container.innerHTML = html;

  drawConnections(container, levels);
}

function drawConnections(container, levels) {
  const tree = getActiveTree();
  if (!tree) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "fta-connections-svg");
  svg.style.position = "absolute";
  svg.style.top = "0";
  svg.style.left = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.pointerEvents = "none";

  const nodeWrappers = container.querySelectorAll(".fta-node-wrapper");
  const nodePositions = new Map();

  const treeEl = container.querySelector(".fta-tree");
  const treeRect = treeEl?.getBoundingClientRect();
  if (!treeRect) {
    container.appendChild(svg);
    return;
  }

  nodeWrappers.forEach((wrapper) => {
    const nodeId = wrapper.dataset.nodeId;
    const nodeEl = wrapper.querySelector(".fta-node");
    const wrapperRect = wrapper.getBoundingClientRect();
    const nodeRect = nodeEl.getBoundingClientRect();
    nodePositions.set(nodeId, {
      top: nodeRect.top - treeRect.top + nodeRect.height / 2,
      bottom: nodeRect.bottom - treeRect.top - nodeRect.height / 2,
      left: nodeRect.left - treeRect.left + nodeRect.width / 2,
      right: nodeRect.right - treeRect.left - nodeRect.width / 2,
      centerX: nodeRect.left - treeRect.left + nodeRect.width / 2,
      centerY: nodeRect.top - treeRect.top + nodeRect.height / 2,
      wrapperTop: wrapperRect.top - treeRect.top,
      wrapperBottom: wrapperRect.bottom - treeRect.top,
    });
  });

  for (const node of tree.nodes) {
    if (node.childIds.length === 0) continue;
    const parentPos = nodePositions.get(node.id);
    if (!parentPos) continue;

    for (const childId of node.childIds) {
      const childPos = nodePositions.get(childId);
      if (!childPos) continue;

      const x1 = parentPos.centerX;
      const y1 = parentPos.centerY;
      const x2 = childPos.centerX;
      const y2 = childPos.centerY;

      const midY = (y1 + y2) / 2;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute(
        "d",
        `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`
      );
      path.setAttribute("stroke", "var(--border)");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("fill", "none");
      svg.appendChild(path);
    }
  }

  const treeContainer = container.querySelector(".fta-tree");
  if (treeContainer) {
    treeContainer.style.position = "relative";
    treeContainer.appendChild(svg);
  }
}

function calculateTopProbability() {
  const tree = getActiveTree();
  if (!tree || !tree.topEventId) return null;

  const nodeProbabilities = new Map();
  const visited = new Set();

  function calcProb(nodeId) {
    if (nodeProbabilities.has(nodeId)) {
      return nodeProbabilities.get(nodeId);
    }
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);

    const node = tree.nodes.find((n) => n.id === nodeId);
    if (!node) return 0;

    let prob = 0;

    switch (node.type) {
      case "basic":
        prob = node.lambda || 0;
        break;
      case "top":
      case "intermediate":
        if (node.childIds.length > 0) {
          const childProbs = node.childIds.map((cid) => calcProb(cid));
          prob = childProbs.reduce((a, b) => a + b - a * b, 0);
        }
        break;
      case "and":
        if (node.childIds.length > 0) {
          const childProbs = node.childIds.map((cid) => calcProb(cid));
          prob = childProbs.reduce((a, b) => a * b, 1);
        }
        break;
      case "or":
        if (node.childIds.length > 0) {
          const childProbs = node.childIds.map((cid) => calcProb(cid));
          prob = childProbs.reduce((a, b) => a + b - a * b, 0);
        }
        break;
      case "vote23":
        if (node.childIds.length >= 2) {
          const childProbs = node.childIds.map((cid) => calcProb(cid));
          const p = childProbs[0];
          const q = childProbs[1];
          const r = childProbs[2] || 0;
          prob = p * q + p * r + q * r - 2 * p * q * r;
        }
        break;
      default:
        prob = 0;
    }

    nodeProbabilities.set(nodeId, prob);
    return prob;
  }

  return {
    topProb: calcProb(tree.topEventId),
    nodeProbs: nodeProbabilities,
  };
}

function findMinimalCutSets() {
  const tree = getActiveTree();
  if (!tree || !tree.topEventId) return [];

  const cutSets = [];

  function expand(nodeId, path, depth) {
    if (depth > 10) return;

    const node = tree.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    if (node.type === "basic") {
      const cutSet = [...path].sort();
      const exists = cutSets.some(
        (cs) => cs.length === cutSet.length && cs.every((e, i) => e === cutSet[i])
      );
      if (!exists) {
        cutSets.push(cutSet);
      }
      return;
    }

    if (node.childIds.length === 0) return;

    if (node.type === "and" || node.type === "top" || node.type === "intermediate") {
      for (const childId of node.childIds) {
        expand(childId, [...path, childId], depth + 1);
      }
    } else if (node.type === "or") {
      if (node.childIds.length === 1) {
        expand(node.childIds[0], [...path], depth + 1);
      } else if (node.childIds.length === 2) {
        expand(node.childIds[0], [...path], depth + 1);
        expand(node.childIds[1], [...path], depth + 1);
      } else {
        for (const childId of node.childIds) {
          expand(childId, [...path], depth + 1);
        }
      }
    } else if (node.type === "vote23") {
      const c = node.childIds;
      if (c.length >= 2) {
        expand(c[0], [...path, c[1]], depth + 1);
        expand(c[0], [...path, c[2] || c[1]], depth + 1);
        expand(c[1], [...path, c[2] || c[0]], depth + 1);
      }
    }
  }

  const topEvent = tree.nodes.find((n) => n.id === tree.topEventId);
  if (!topEvent) return [];

  if (topEvent.childIds.length > 0) {
    for (const childId of topEvent.childIds) {
      expand(childId, [childId], 0);
    }
  } else {
    return [];
  }

  const simplified = [];
  const basicCutSets = cutSets.filter((cs) => {
    const node = tree.nodes.find((n) => n.id === cs[0]);
    return node?.type === "basic";
  });

  for (const cs of cutSets) {
    let isMinimal = true;
    for (const other of cutSets) {
      if (other === cs) continue;
      if (other.length < cs.length && other.every((e) => cs.includes(e))) {
        isMinimal = false;
        break;
      }
    }
    if (isMinimal) {
      simplified.push(cs);
    }
  }

  simplified.sort((a, b) => a.length - b.length);

  return simplified.slice(0, 50);
}

function calculateImportance(nodeProbs) {
  const tree = getActiveTree();
  if (!tree || !tree.topEventId) return [];

  const basicNodes = tree.nodes.filter((n) => n.type === "basic");
  const topProb = nodeProbs.get(tree.topEventId) || 0;

  const results = basicNodes.map((node) => {
    const nodeProb = node.lambda || 0;
    const structuralImportance = nodeProb > 0 ? (topProb > 0 ? nodeProb / topProb : 0) : 0;
    const probabilityImportance = nodeProb;

    return {
      id: node.id,
      name: node.name,
      structural: structuralImportance,
      probability: probabilityImportance,
    };
  });

  results.sort((a, b) => b.structural - a.structural);

  return results;
}

function calculateAll() {
  const tree = getActiveTree();
  if (!tree) {
    alert("请先创建故障树");
    return;
  }
  if (!tree.topEventId) {
    alert("请先添加顶事件");
    return;
  }

  renderResults();
  const btn = document.getElementById("fta-calc-mcs");
  if (btn) toast(btn, "计算完成", 1500);
}

function renderResults() {
  const tree = getActiveTree();
  const topProbEl = document.getElementById("fta-top-probability");
  const mcsCountEl = document.getElementById("fta-mcs-count");
  const basicCountEl = document.getElementById("fta-basic-count");
  const mcsOrderEl = document.getElementById("fta-mcs-order");
  const mcsTbody = document.getElementById("fta-mcs-tbody");
  const mcsEmpty = document.getElementById("fta-mcs-empty");
  const mcsTable = document.getElementById("fta-mcs-table");
  const importanceTbody = document.getElementById("fta-importance-tbody");
  const importanceEmpty = document.getElementById("fta-importance-empty");
  const importanceTable = document.getElementById("fta-importance-table");

  if (!tree) {
    if (topProbEl) topProbEl.textContent = "—";
    if (mcsCountEl) mcsCountEl.textContent = "—";
    if (basicCountEl) basicCountEl.textContent = "—";
    if (mcsOrderEl) mcsOrderEl.textContent = "—";
    if (mcsTbody) mcsTbody.innerHTML = "";
    if (mcsEmpty) mcsEmpty.style.display = "";
    if (mcsTable) mcsTable.style.display = "none";
    if (importanceTbody) importanceTbody.innerHTML = "";
    if (importanceEmpty) importanceEmpty.style.display = "";
    if (importanceTable) importanceTable.style.display = "none";
    return;
  }

  const basicCount = tree.nodes.filter((n) => n.type === "basic").length;

  const probResult = calculateTopProbability();
  const topProb = probResult?.topProb || 0;
  const nodeProbs = probResult?.nodeProbs || new Map();

  const cutSets = findMinimalCutSets();
  const importance = calculateImportance(nodeProbs);

  if (topProbEl) topProbEl.textContent = topProb.toExponential(4);
  if (mcsCountEl) mcsCountEl.textContent = String(cutSets.length);
  if (basicCountEl) basicCountEl.textContent = String(basicCount);
  if (mcsOrderEl) {
    const minOrder = cutSets.length > 0 ? cutSets[0].length : 0;
    mcsOrderEl.textContent = minOrder ? String(minOrder) + " 阶" : "—";
  }

  if (mcsTbody) {
    if (cutSets.length === 0) {
      mcsTbody.innerHTML = "";
      if (mcsEmpty) mcsEmpty.style.display = "";
      if (mcsTable) mcsTable.style.display = "none";
    } else {
      if (mcsEmpty) mcsEmpty.style.display = "none";
      if (mcsTable) mcsTable.style.display = "";

      mcsTbody.innerHTML = cutSets
        .map((cs, idx) => {
          const eventNames = cs
            .map((id) => {
              const node = tree.nodes.find((n) => n.id === id);
              return node ? node.name : id;
            })
            .join(", ");

          let csProb = 1;
          for (const id of cs) {
            const node = tree.nodes.find((n) => n.id === id);
            if (node) {
              csProb *= node.lambda || 0;
            }
          }

          return `
          <tr>
            <td>${idx + 1}</td>
            <td>${cs.length}</td>
            <td>${escapeHtml(eventNames)}</td>
            <td>${csProb.toExponential(4)}</td>
          </tr>
        `;
        })
        .join("");
    }
  }

  if (importanceTbody) {
    if (importance.length === 0) {
      importanceTbody.innerHTML = "";
      if (importanceEmpty) importanceEmpty.style.display = "";
      if (importanceTable) importanceTable.style.display = "none";
    } else {
      if (importanceEmpty) importanceEmpty.style.display = "none";
      if (importanceTable) importanceTable.style.display = "";

      importanceTbody.innerHTML = importance
        .map((item, idx) => {
          return `
          <tr>
            <td>${idx + 1}</td>
            <td>${escapeHtml(item.name)}</td>
            <td>${item.structural.toFixed(4)}</td>
            <td>${item.probability.toExponential(2)}</td>
          </tr>
        `;
        })
        .join("");
    }
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
