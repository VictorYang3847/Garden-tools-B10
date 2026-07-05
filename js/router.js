const routes = {
  home: {
    path: "home",
    title: "首页",
    module: () => import("./pages/home.js?v=1.0.4"),
  },
  fmea: {
    path: "fmea",
    title: "FMEA",
    module: () => import("./pages/fmea.js?v=1.0.4"),
  },
  prediction: {
    path: "prediction",
    title: "可靠性预测",
    module: () => import("./pages/prediction.js?v=1.0.4"),
  },
  "life-data": {
    path: "life-data",
    title: "寿命数据分析",
    module: () => import("./pages/life-data.js?v=1.0.4"),
  },
  "test-plan": {
    path: "test-plan",
    title: "测试计划",
    module: () => import("./pages/test-plan.js?v=1.0.4"),
  },
  fta: {
    path: "fta",
    title: "故障树分析",
    module: () => import("./pages/fta.js?v=1.0.4"),
  },
  growth: {
    path: "growth",
    title: "可靠性增长",
    module: () => import("./pages/growth.js?v=1.0.4"),
  },
  maintenance: {
    path: "maintenance",
    title: "维护可用性",
    module: () => import("./pages/maintenance.js?v=1.0.4"),
  },
  derating: {
    path: "derating",
    title: "降额裕度",
    module: () => import("./pages/derating.js?v=1.0.4"),
  },
  environment: {
    path: "environment",
    title: "环境适应",
    module: () => import("./pages/environment.js?v=1.0.4"),
  },
  data: {
    path: "data",
    title: "数据管理",
    module: () => import("./pages/data-management.js?v=1.0.4"),
  },
};

const defaultRoute = "home";

let currentRoute = null;
let currentModule = null;
let mainContent = null;
let navItems = [];
let onRouteChangeCallback = null;
let getModelCallback = null;
let saveModelCallback = null;

export function initRouter(options = {}) {
  mainContent = options.mainContent || document.getElementById("main-content");
  navItems = options.navItems || [];
  onRouteChangeCallback = options.onRouteChange || null;
  getModelCallback = options.getModel || null;
  saveModelCallback = options.saveModel || null;

  window.addEventListener("hashchange", handleHashChange);

  if (!location.hash) {
    location.hash = `#/${defaultRoute}`;
  } else {
    handleHashChange();
  }
}

export function navigateTo(routeKey) {
  if (!routes[routeKey]) {
    routeKey = defaultRoute;
  }
  location.hash = `#/${routes[routeKey].path}`;
}

export function getCurrentRoute() {
  return currentRoute;
}

export function refreshCurrentRoute() {
  if (currentRoute) {
    renderRoute(currentRoute);
  }
}

function handleHashChange() {
  const hash = location.hash.replace(/^#\/?/, "") || defaultRoute;
  const routeKey = findRouteKey(hash);

  if (!routeKey) {
    navigateTo(defaultRoute);
    return;
  }

  if (routeKey === currentRoute) {
    refreshCurrentRoute();
    return;
  }

  currentRoute = routeKey;
  updateNavHighlight();
  renderRoute(routeKey);

  if (onRouteChangeCallback) {
    onRouteChangeCallback(routeKey, routes[routeKey]);
  }
}

function findRouteKey(path) {
  for (const [key, route] of Object.entries(routes)) {
    if (route.path === path) return key;
  }
  return null;
}

function updateNavHighlight() {
  navItems.forEach((item) => {
    const route = item.dataset.route;
    item.classList.toggle("active", route === currentRoute);
  });
}

async function renderRoute(routeKey) {
  if (!mainContent) return;

  mainContent.innerHTML = '<div class="page-loading">加载中...</div>';

  try {
    const module = await routes[routeKey].module();
    currentModule = module;

    const model = getModelCallback ? getModelCallback() : null;

    const onSave = (updatedModel) => {
      if (saveModelCallback) {
        saveModelCallback(updatedModel);
      }
    };

    if (typeof module.init === "function") {
      module.init(model, onSave);
    }
    if (typeof module.render === "function") {
      mainContent.innerHTML = "";
      module.render(mainContent, model);
    }
  } catch (err) {
    console.error('Failed to load module:', err);
    const safeMsg = (err?.message || '未知错误')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    mainContent.innerHTML = `
      <div class="error-state">
        <h3>加载失败</h3>
        <p>${safeMsg}</p>
      </div>
    `;
  }
}

export { routes, defaultRoute };
