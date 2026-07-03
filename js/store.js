import { defaultModelDefinition, defaultModelRecord, defaultPlanningItem, defaultAnalysisBatch } from "./calculator.js";

const STORAGE_KEY = "reliability-tool-data";
const LEGACY_V2_KEY = "b10-tool-v2";
const LEGACY_V1_KEY = "b10-hedge-trimmer-v1";

export function genId() {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultFmea() {
  return { items: [], type: "DFMEA" };
}

function defaultPrediction() {
  return {
    components: [],
    systemStructure: "series",
    parallelCount: 2,
    missionTime: 10000,
  };
}

function defaultLifeData() {
  return {
    batches: [],
    activeBatchId: null,
    definition: defaultModelDefinition(),
    analysisConfig: { distribution: "weibull", method: "rrx" },
  };
}

function defaultTestPlan() {
  return {
    globalParams: {
      confidence: 0.9,
      allowedFailures: 0,
      defaultCensorType: 'time',
    },
    testItems: [],
    altPlans: [],
    haltTests: [],
  };
}

function defaultFta() {
  return {
    trees: [],
    activeTreeId: null,
  };
}

function defaultGrowth() {
  return {
    failures: [],
    model: "duane",
    targetMtbf: null,
    totalTime: null,
  };
}

function defaultMaintenance() {
  return {
    availability: {
      mtbf: 1000,
      mttr: 2,
      detectionTime: 0.5,
      pmInterval: 500,
      pmTime: 1,
      logisticsDelay: 24,
    },
    spares: [
      {
        id: genId(),
        name: "电机组件",
        mtbf: 10000,
        annualHours: 2000,
        unitCount: 10,
        supportYears: 5,
        confidence: 0.9,
        demand: 0,
        spareCount: 0,
        shortageRate: 0,
      },
    ],
    strategy: {
      targetReliability: 0.9,
      beta: 2,
      eta: 1000,
      pmCost: 1000,
      failureCost: 5000,
    },
  };
}

function defaultDerating() {
  return { components: [], standard: "mil-hdbk-217" };
}

function defaultEnvironment() {
  return {
    thermalCycle: {
      tempHigh: 85,
      tempLow: -40,
      rampRate: 5,
      cycles: 100,
      holdTime: 30,
      coffinMansonN: 2.5,
      deltaT: 0,
      cycleDamage: 0,
      totalDamage: 0,
      equivalentLife: 0,
      predictedLife: 0,
    },
    vibration: {
      type: 'sine',
      freqStart: 10,
      freqEnd: 2000,
      amplitude: 5,
      psd: 0.1,
      grms: 0,
      direction: 'x',
      duration: 60,
      stressLevel: '',
      fatigueDamage: 0,
      suggestedLevel: '',
    },
    envStresses: [
      { id: genId(), type: 'temperature', name: '温度', level: 'ground_fixed', piE: 1.5, standard: 'IEC 60068-2-1/2', note: '' },
      { id: genId(), type: 'humidity', name: '湿度', level: 'moderate', piE: 1.2, standard: 'IEC 60068-2-30', note: '' },
      { id: genId(), type: 'salt_spray', name: '盐雾', level: 'low', piE: 2.0, standard: 'IEC 60068-2-11', note: '' },
      { id: genId(), type: 'dust', name: '粉尘', level: 'low', piE: 1.3, standard: 'IEC 60068-2-68', note: '' },
      { id: genId(), type: 'vibration', name: '振动', level: 'low', piE: 2.0, standard: 'IEC 60068-2-6', note: '' },
      { id: genId(), type: 'shock', name: '冲击', level: 'low', piE: 1.5, standard: 'IEC 60068-2-27', note: '' },
    ],
    standards: [
      { id: genId(), code: 'IEC 60068-2-1', name: '低温试验', category: 'IEC 60068', scope: '非散热试件', items: '温度范围、持续时间' },
      { id: genId(), code: 'IEC 60068-2-2', name: '高温试验', category: 'IEC 60068', scope: '非散热试件', items: '温度范围、持续时间' },
      { id: genId(), code: 'IEC 60068-2-14', name: '温度变化试验', category: 'IEC 60068', scope: '温度循环', items: '温变率、循环次数' },
      { id: genId(), code: 'IEC 60068-2-30', name: '湿热试验', category: 'IEC 60068', scope: '恒定/交变湿热', items: '温度、湿度、持续时间' },
      { id: genId(), code: 'IEC 60068-2-6', name: '正弦振动试验', category: 'IEC 60068', scope: '振动耐久', items: '频率范围、加速度幅值' },
      { id: genId(), code: 'IEC 60068-2-64', name: '随机振动试验', category: 'IEC 60068', scope: '宽带随机振动', items: 'PSD谱、Grms、持续时间' },
      { id: genId(), code: 'IEC 60068-2-27', name: '冲击试验', category: 'IEC 60068', scope: '半正弦冲击', items: '峰值加速度、持续时间' },
      { id: genId(), code: 'IEC 60068-2-11', name: '盐雾试验', category: 'IEC 60068', scope: '腐蚀防护', items: '盐雾浓度、试验时间' },
      { id: genId(), code: 'GJB 150.3A', name: '高温试验', category: 'GJB 150', scope: '军用装备', items: '高温贮存、高温工作' },
      { id: genId(), code: 'GJB 150.4A', name: '低温试验', category: 'GJB 150', scope: '军用装备', items: '低温贮存、低温工作' },
      { id: genId(), code: 'GJB 150.16A', name: '振动试验', category: 'GJB 150', scope: '军用装备', items: '正弦、随机振动' },
      { id: genId(), code: 'MIL-STD-810H', name: '环境工程考虑和实验室试验', category: 'MIL-STD-810', scope: '美军标环境试验', items: '温度、湿度、振动、冲击等' },
      { id: genId(), code: 'GB/T 2423.1', name: '低温试验方法', category: 'GB/T 2423', scope: '电工电子产品', items: '温度范围、持续时间' },
      { id: genId(), code: 'GB/T 2423.2', name: '高温试验方法', category: 'GB/T 2423', scope: '电工电子产品', items: '温度范围、持续时间' },
      { id: genId(), code: 'GB/T 2423.10', name: '振动试验方法', category: 'GB/T 2423', scope: '电工电子产品', items: '正弦振动' },
      { id: genId(), code: 'GB/T 2423.22', name: '温度变化试验', category: 'GB/T 2423', scope: '电工电子产品', items: '温度循环' },
    ],
  };
}

function defaultDataManagement() {
  return { versions: [], templates: [] };
}

function createModuleData() {
  return {
    fmea: defaultFmea(),
    prediction: defaultPrediction(),
    lifeData: defaultLifeData(),
    testPlan: defaultTestPlan(),
    fta: defaultFta(),
    growth: defaultGrowth(),
    maintenance: defaultMaintenance(),
    derating: defaultDerating(),
    environment: defaultEnvironment(),
    dataManagement: defaultDataManagement(),
  };
}

export function createModel(name = "新型号") {
  return {
    id: genId(),
    name,
    record: defaultModelRecord(name),
    modules: createModuleData(),
    lastResult: null,
    createdAt: new Date().toISOString(),
  };
}

export function createProduct(name = "新产品") {
  const model = createModel("默认型号");
  return {
    id: genId(),
    name,
    models: [model],
    createdAt: new Date().toISOString(),
  };
}

export function createProject(name = "新项目") {
  const product = createProduct("绿篱机");
  return {
    id: genId(),
    name,
    note: "",
    products: [product],
    createdAt: new Date().toISOString(),
  };
}

function defaultAppState() {
  const project = createProject("2026 园林工具平台");
  const product = project.products[0];
  const model = product.models[0];
  model.name = "HT-550-Li";
  model.record = defaultModelRecord("HT-550-Li");
  return {
    version: 3,
    currentProjectId: project.id,
    currentProductId: product.id,
    currentModelId: model.id,
    projects: [project],
  };
}

let state = null;

function ensureState() {
  if (!state) {
    state = loadState();
  }
  return state;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version === 3 && Array.isArray(parsed.projects)) {
        return normalizeStateV3(parsed);
      }
    }
  } catch {
    /* ignore */
  }

  const legacyV2Raw = localStorage.getItem(LEGACY_V2_KEY);
  if (legacyV2Raw) {
    try {
      const legacy = JSON.parse(legacyV2Raw);
      if (legacy.version === 2 && Array.isArray(legacy.projects)) {
        const migrated = migrateV2ToV3(legacy);
        saveState(migrated);
        localStorage.removeItem(LEGACY_V2_KEY);
        return migrated;
      }
    } catch {
      /* ignore */
    }
  }

  const legacyV1Raw = localStorage.getItem(LEGACY_V1_KEY);
  if (legacyV1Raw) {
    try {
      const legacy = JSON.parse(legacyV1Raw);
      const v2 = migrateV1ToV2(legacy);
      const migrated = migrateV2ToV3(v2);
      saveState(migrated);
      localStorage.removeItem(LEGACY_V1_KEY);
      return migrated;
    } catch {
      /* ignore */
    }
  }

  return defaultAppState();
}

function normalizeStateV3(s) {
  for (const project of s.projects) {
    if (!Array.isArray(project.products)) project.products = [];
    for (const product of project.products) {
      if (!Array.isArray(product.models)) product.models = [];
      for (const model of product.models) {
        if (!model.record) model.record = defaultModelRecord(model.name);
        if (!model.modules) model.modules = createModuleData();
        if (!model.modules.fmea) model.modules.fmea = defaultFmea();
        if (!model.modules.prediction) model.modules.prediction = defaultPrediction();
        if (!model.modules.prediction.components) model.modules.prediction.components = [];
        if (!model.modules.prediction.systemStructure) model.modules.prediction.systemStructure = "series";
        if (!model.modules.prediction.parallelCount) model.modules.prediction.parallelCount = 2;
        if (!model.modules.prediction.missionTime) model.modules.prediction.missionTime = 10000;
        if (!model.modules.lifeData) model.modules.lifeData = defaultLifeData();
        if (!model.modules.testPlan) model.modules.testPlan = defaultTestPlan();
        if (!model.modules.fta) model.modules.fta = defaultFta();
        if (!model.modules.growth) model.modules.growth = defaultGrowth();
        if (!model.modules.maintenance) model.modules.maintenance = defaultMaintenance();
        if (!model.modules.maintenance.availability) model.modules.maintenance.availability = defaultMaintenance().availability;
        if (!Array.isArray(model.modules.maintenance.spares)) model.modules.maintenance.spares = [];
        if (!model.modules.maintenance.strategy) model.modules.maintenance.strategy = defaultMaintenance().strategy;
        if (!model.modules.derating) model.modules.derating = defaultDerating();
        if (!model.modules.environment) model.modules.environment = defaultEnvironment();
        if (!model.modules.dataManagement) model.modules.dataManagement = defaultDataManagement();
        if (!model.modules.lifeData.definition) model.modules.lifeData.definition = defaultModelDefinition();
        if (!model.modules.lifeData.batches) model.modules.lifeData.batches = [];
        if (!model.modules.lifeData.analysisConfig) model.modules.lifeData.analysisConfig = { distribution: "weibull", method: "rrx" };
      }
    }
  }
  return s;
}

function migrateV1ToV2(raw) {
  const project = {
    id: genId(),
    name: "迁移项目",
    note: "",
    models: [],
    createdAt: new Date().toISOString(),
  };
  const model = {
    id: genId(),
    name: raw.model || "HT-550-Li",
    record: {
      ...defaultModelRecord(raw.model || "HT-550-Li"),
      projectCode: "",
      voltage: raw.voltage ?? 18,
      power: raw.power ?? 450,
      bladeType: raw.bladeType ?? "double",
      bladeLength: raw.bladeLength ?? 550,
      strokeRate: raw.strokeRate ?? 3000,
      analyst: raw.analyst ?? "",
      note: raw.note ?? "",
      updatedAt: new Date().toISOString(),
    },
    definition: {
      scenarioName: raw.scenarioName ?? "默认场景",
      scenarioNote: raw.scenarioNote ?? "",
      hoursPerYear: raw.hoursPerYear ?? 25,
      dutyCycle: raw.dutyCycle ?? 60,
      continuousRunMin: raw.continuousRunMin ?? 15,
      warrantyYears: raw.warrantyYears ?? 2,
      acceptableFailureRate: raw.acceptableFailureRate ?? 2,
      confidence: raw.confidence ?? 90,
      safetyMargin: raw.safetyMargin ?? 20,
      failureDefinition: raw.failureDefinition ?? "performance",
      performanceThreshold: raw.performanceThreshold ?? 70,
      beta: raw.beta ?? 2.0,
      parts: raw.parts ?? defaultModelDefinition().parts,
    },
    planning: defaultPlanning(),
    analysis: defaultAnalysis(),
    lastResult: null,
  };
  project.models.push(model);
  return {
    version: 2,
    activeProjectId: project.id,
    activeModelId: model.id,
    activePage: "definition",
    projects: [project],
  };
}

function migrateV2ToV3(v2) {
  const projects = [];
  let firstProjectId = null;
  let firstProductId = null;
  let firstModelId = null;

  for (const v2Project of v2.projects) {
    const product = {
      id: genId(),
      name: "默认产品线",
      models: [],
      createdAt: v2Project.createdAt || new Date().toISOString(),
    };

    for (const v2Model of v2Project.models || []) {
      const model = {
        id: v2Model.id || genId(),
        name: v2Model.name || "新型号",
        record: v2Model.record || defaultModelRecord(v2Model.name),
        modules: {
          fmea: defaultFmea(),
          prediction: defaultPrediction(),
          lifeData: {
            batches: v2Model.analysis?.batches || [],
            activeBatchId: null,
            definition: v2Model.definition || defaultModelDefinition(),
          },
          testPlan: defaultTestPlan(),
          fta: defaultFta(),
          growth: defaultGrowth(),
          maintenance: defaultMaintenance(),
          derating: defaultDerating(),
          environment: defaultEnvironment(),
          dataManagement: defaultDataManagement(),
        },
        lastResult: v2Model.lastResult || null,
        createdAt: new Date().toISOString(),
      };
      product.models.push(model);
      if (!firstModelId) firstModelId = model.id;
    }

    const project = {
      id: v2Project.id || genId(),
      name: v2Project.name || "新项目",
      note: v2Project.note || "",
      products: [product],
      createdAt: v2Project.createdAt || new Date().toISOString(),
    };
    projects.push(project);
    if (!firstProjectId) firstProjectId = project.id;
    if (!firstProductId) firstProductId = product.id;
  }

  return {
    version: 3,
    currentProjectId: firstProjectId,
    currentProductId: firstProductId,
    currentModelId: firstModelId,
    projects,
  };
}

function saveState(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

function persist() {
  saveState(ensureState());
}

export function getProjects() {
  return ensureState().projects;
}

export function getProject(id) {
  return ensureState().projects.find((p) => p.id === id) || null;
}

export function addProject(name) {
  const s = ensureState();
  const project = createProject(name);
  s.projects.push(project);
  persist();
  return project;
}

export function deleteProject(id) {
  const s = ensureState();
  s.projects = s.projects.filter((p) => p.id !== id);
  if (s.currentProjectId === id) {
    const first = s.projects[0];
    if (first) {
      s.currentProjectId = first.id;
      s.currentProductId = first.products[0]?.id || null;
      s.currentModelId = first.products[0]?.models[0]?.id || null;
    } else {
      s.currentProjectId = null;
      s.currentProductId = null;
      s.currentModelId = null;
    }
  }
  persist();
}

export function getProducts(projectId) {
  const project = getProject(projectId);
  return project?.products || [];
}

export function getProduct(id) {
  const s = ensureState();
  for (const project of s.projects) {
    const product = project.products?.find((p) => p.id === id);
    if (product) return product;
  }
  return null;
}

export function addProduct(projectId, name) {
  const project = getProject(projectId);
  if (!project) return null;
  const product = createProduct(name);
  project.products.push(product);
  persist();
  return product;
}

export function deleteProduct(id) {
  const s = ensureState();
  for (const project of s.projects) {
    const idx = project.products?.findIndex((p) => p.id === id) ?? -1;
    if (idx >= 0) {
      project.products.splice(idx, 1);
      if (s.currentProductId === id) {
        const first = project.products[0];
        if (first) {
          s.currentProductId = first.id;
          s.currentModelId = first.models[0]?.id || null;
        } else {
          s.currentProductId = null;
          s.currentModelId = null;
        }
      }
      persist();
      return;
    }
  }
}

export function getModels(productId) {
  const product = getProduct(productId);
  return product?.models || [];
}

export function getModel(id) {
  const s = ensureState();
  for (const project of s.projects) {
    for (const product of project.products || []) {
      const model = product.models?.find((m) => m.id === id);
      if (model) return model;
    }
  }
  return null;
}

export function addModel(productId, name) {
  const product = getProduct(productId);
  if (!product) return null;
  const model = createModel(name);
  product.models.push(model);
  persist();
  return model;
}

export function deleteModel(id) {
  const s = ensureState();
  for (const project of s.projects) {
    for (const product of project.products || []) {
      const idx = product.models?.findIndex((m) => m.id === id) ?? -1;
      if (idx >= 0) {
        product.models.splice(idx, 1);
        if (s.currentModelId === id) {
          s.currentModelId = product.models[0]?.id || null;
        }
        persist();
        return;
      }
    }
  }
}

export function getModuleData(modelId, moduleName) {
  const model = getModel(modelId);
  if (!model || !model.modules) return null;
  return model.modules[moduleName] || null;
}

export function setModuleData(modelId, moduleName, data) {
  const model = getModel(modelId);
  if (!model) return;
  if (!model.modules) model.modules = createModuleData();
  model.modules[moduleName] = data;
  persist();
}

export function getCurrentProject() {
  const s = ensureState();
  return getProject(s.currentProjectId) || s.projects[0] || null;
}

export function setCurrentProject(id) {
  const s = ensureState();
  const project = getProject(id);
  if (!project) return;
  s.currentProjectId = id;
  s.currentProductId = project.products[0]?.id || null;
  s.currentModelId = project.products[0]?.models[0]?.id || null;
  persist();
}

export function getCurrentProduct() {
  const s = ensureState();
  return getProduct(s.currentProductId) || getCurrentProject()?.products?.[0] || null;
}

export function setCurrentProduct(id) {
  const s = ensureState();
  const product = getProduct(id);
  if (!product) return;
  s.currentProductId = id;
  s.currentModelId = product.models[0]?.id || null;
  persist();
}

export function getCurrentModel() {
  const s = ensureState();
  return getModel(s.currentModelId) || getCurrentProduct()?.models?.[0] || null;
}

export function setCurrentModel(id) {
  const s = ensureState();
  const model = getModel(id);
  if (!model) return;
  s.currentModelId = id;
  persist();
}

export function exportData() {
  return JSON.stringify(ensureState(), null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed.projects)) {
    throw new Error("无效的数据格式：缺少 projects");
  }
  parsed.version = 3;
  state = normalizeStateV3(parsed);
  persist();
  return state;
}

export function mergeInputs(record, definition) {
  return {
    model: record.modelName ?? record.name ?? "",
    ...record,
    ...definition,
    parts: definition.parts,
  };
}

export function getDefinitionTargets(model, calcResult) {
  if (!calcResult) return {};
  const map = { product: calcResult.b10Target };
  for (const p of calcResult.partEntries) {
    map[p.id] = p.equivHours;
  }
  return map;
}

function defaultPlanning() {
  return defaultTestPlan();
}

function defaultAnalysis() {
  return { batches: [] };
}
