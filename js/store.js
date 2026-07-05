import { defaultModelDefinition, defaultModelRecord, defaultPlanningItem, defaultAnalysisBatch } from "./calculator.js";
import {
  getState as dbGetState,
  setState as dbSetState,
  migrateFromLocalStorage,
} from "./db.js";

const STORAGE_KEY = "reliability-tool-data";
const LEGACY_V2_KEY = "b10-tool-v2";
const LEGACY_V1_KEY = "b10-hedge-trimmer-v1";

// 同步管理器单例（懒加载，避免循环依赖）
let syncManagerInstance = null;
async function getSyncManager() {
  if (!syncManagerInstance) {
    const { getSyncManager: getSM } = await import("./sync.js");
    syncManagerInstance = getSM();
  }
  return syncManagerInstance;
}

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
    allocation: {
      targetB10: 150,
      confidence: 0.9,
      systemStructure: "series",
      beta: 2.2,
      subsystems: [],
    },
  };
}

function defaultLifeData() {
  return {
    batches: [],
    activeBatchId: null,
    // definition 已移除，产品参数现在从 model.homeCalc 获取
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
    phases: [],
    activePhaseId: null,
    model: "duane",
    targetMtbf: null,
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

function defaultWeakness() {
  return {
    weights: { fmea: 0.4, prediction: 0.3, derating: 0.3 },
    items: [],
  };
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

function defaultHomeCalc() {
  return {
    warrantyYears: 2,
    hoursPerYear: 25,
    allowFailRate: 2,
    beta: 2.2,
    safetyMargin: 20,
    time: 100,
  };
}

export function createModuleData() {
  return {
    fmea: defaultFmea(),
    prediction: defaultPrediction(),
    lifeData: defaultLifeData(),
    testPlan: defaultTestPlan(),
    fta: defaultFta(),
    growth: defaultGrowth(),
    maintenance: defaultMaintenance(),
    derating: defaultDerating(),
    weakness: defaultWeakness(),
    environment: defaultEnvironment(),
    dataManagement: defaultDataManagement(),
  };
}

export function createModel(name = "新型号") {
  return {
    id: genId(),
    name,
    record: defaultModelRecord(name),
    productInfo: {},
    modules: createModuleData(),
    homeCalc: defaultHomeCalc(),
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
  const project = createDefaultProject();
  const product = project.products[0];
  const model = product.models[0];
  return {
    version: 3,
    currentProjectId: project.id,
    currentProductId: product.id,
    currentModelId: model.id,
    projects: [project],
    customComponentLibrary: [], // 预测模块自定义元器件库
    customImprovements: [], // 增长模块自定义改进措施库
    updatedAt: 0,
  };
}

let state = null;

function ensureState() {
  if (!state) {
    state = loadState();
  }
  return state;
}

/**
 * 异步加载 state（从 IndexedDB 主存储，降级到 localStorage）
 * 优先使用此方法，由 app.js 在初始化时 await 调用
 */
export async function loadStateAsync() {
  // 1. 迁移旧 localStorage 数据到 IndexedDB
  try {
    await migrateFromLocalStorage();
  } catch (e) {
    console.warn('localStorage 迁移失败:', e);
  }

  // 2. 从 IndexedDB 读取
  try {
    const data = await dbGetState();
    if (data && data.version === 3 && Array.isArray(data.projects)) {
      state = normalizeStateV3(data);
      return state;
    }
  } catch (e) {
    console.warn('IndexedDB 读取失败，降级到 localStorage:', e);
  }

  // 3. 降级到同步 loadState（含 v1/v2 迁移逻辑）
  state = loadState();

  // 4. 若是从 localStorage 加载或新建，写入 IndexedDB 持久化
  try {
    await dbSetState(state);
  } catch (e) {
    console.warn('IndexedDB 写入失败:', e);
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
  // 初始化顶层的自定义库字段
  if (!Array.isArray(s.customComponentLibrary)) s.customComponentLibrary = [];
  if (!Array.isArray(s.customImprovements)) s.customImprovements = [];
  if (typeof s.updatedAt !== 'number') s.updatedAt = 0;
  for (const project of s.projects) {
    if (!Array.isArray(project.products)) project.products = [];
    for (const product of project.products) {
      if (!Array.isArray(product.models)) product.models = [];
      for (const model of product.models) {
        if (!model.record) model.record = defaultModelRecord(model.name);
        if (!model.productInfo) model.productInfo = {};
        if (!model.homeCalc) model.homeCalc = defaultHomeCalc();

        // 数据迁移：如果 homeCalc 缺少质保期参数但 lifeData.definition 有数据，自动迁移
        if (model.modules.lifeData && model.modules.lifeData.definition) {
          const def = model.modules.lifeData.definition;
          if (def.warrantyYears && (!model.homeCalc.warrantyYears || model.homeCalc.warrantyYears === 0)) {
            model.homeCalc.warrantyYears = def.warrantyYears;
          }
          if (def.hoursPerYear && (!model.homeCalc.hoursPerYear || model.homeCalc.hoursPerYear === 0)) {
            model.homeCalc.hoursPerYear = def.hoursPerYear;
          }
          // beta 参数也迁移（首页计算器需要）
          if (def.beta && (!model.homeCalc.beta || model.homeCalc.beta === 0)) {
            model.homeCalc.beta = def.beta;
          }
          // safetyMargin 参数也迁移
          if (def.safetyMargin && (!model.homeCalc.safetyMargin || model.homeCalc.safetyMargin === 0)) {
            model.homeCalc.safetyMargin = def.safetyMargin;
          }
        }
        if (!model.modules) model.modules = createModuleData();
        if (!model.modules.fmea) model.modules.fmea = defaultFmea();
        if (!model.modules.prediction) model.modules.prediction = defaultPrediction();
        if (!model.modules.prediction.components) model.modules.prediction.components = [];
        if (!model.modules.prediction.systemStructure) model.modules.prediction.systemStructure = "series";
        if (!model.modules.prediction.parallelCount) model.modules.prediction.parallelCount = 2;
        if (!model.modules.prediction.missionTime) model.modules.prediction.missionTime = 10000;
        if (!model.modules.prediction.allocation) model.modules.prediction.allocation = defaultPrediction().allocation;
        if (!model.modules.prediction.allocation.targetB10) model.modules.prediction.allocation.targetB10 = 150;
        if (!model.modules.prediction.allocation.confidence) model.modules.prediction.allocation.confidence = 0.9;
        if (!model.modules.prediction.allocation.systemStructure) model.modules.prediction.allocation.systemStructure = "series";
        if (!model.modules.prediction.allocation.beta) model.modules.prediction.allocation.beta = 2.2;
        if (!Array.isArray(model.modules.prediction.allocation.subsystems)) model.modules.prediction.allocation.subsystems = [];
        if (!model.modules.lifeData) model.modules.lifeData = defaultLifeData();
        if (!model.modules.testPlan) model.modules.testPlan = defaultTestPlan();
        if (!model.modules.fta) model.modules.fta = defaultFta();
        if (!model.modules.growth) model.modules.growth = defaultGrowth();
        if (!Array.isArray(model.modules.growth.phases)) {
          const oldFailures = Array.isArray(model.modules.growth.failures) ? model.modules.growth.failures : [];
          const oldTotalTime = model.modules.growth.totalTime || null;
          const firstPhaseId = genId();
          model.modules.growth.phases = [
            {
              id: firstPhaseId,
              name: "首轮试验",
              phaseNumber: 1,
              description: "迁移自旧数据",
              failures: oldFailures,
              totalTime: oldTotalTime,
              startDate: null,
            },
          ];
          model.modules.growth.activePhaseId = firstPhaseId;
        }
        if (!model.modules.growth.activePhaseId && model.modules.growth.phases.length > 0) {
          model.modules.growth.activePhaseId = model.modules.growth.phases[0].id;
        }
        if (!model.modules.growth.model) model.modules.growth.model = "duane";
        if (model.modules.growth.targetMtbf === undefined) model.modules.growth.targetMtbf = null;
        if (!model.modules.maintenance) model.modules.maintenance = defaultMaintenance();
        if (!model.modules.maintenance.availability) model.modules.maintenance.availability = defaultMaintenance().availability;
        if (!Array.isArray(model.modules.maintenance.spares)) model.modules.maintenance.spares = [];
        if (!model.modules.maintenance.strategy) model.modules.maintenance.strategy = defaultMaintenance().strategy;
        if (!model.modules.derating) model.modules.derating = defaultDerating();
        if (!model.modules.weakness) model.modules.weakness = defaultWeakness();
        if (!model.modules.environment) model.modules.environment = defaultEnvironment();
        if (!model.modules.dataManagement) model.modules.dataManagement = defaultDataManagement();
        // 不再初始化 lifeData.definition，产品参数已迁移到 homeCalc
        // 保留已有 definition 数据供向后兼容（如果存在）
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
        // 从 definition 迁移数据到 homeCalc（V2→V3 迁移）
        homeCalc: (() => {
          const def = v2Model.definition || {};
          return {
            warrantyYears: def.warrantyYears || 2,
            hoursPerYear: def.hoursPerYear || 25,
            allowFailRate: def.acceptableFailureRate || 2,
            beta: def.beta || 2.2,
            safetyMargin: def.safetyMargin || 20,
            time: 100,
          };
        })(),
        modules: {
          fmea: defaultFmea(),
          prediction: defaultPrediction(),
          lifeData: {
            batches: v2Model.analysis?.batches || [],
            activeBatchId: null,
            // 保留原有 definition 数据供向后兼容
            definition: v2Model.definition,
          },
          testPlan: defaultTestPlan(),
          fta: defaultFta(),
          growth: defaultGrowth(),
          maintenance: defaultMaintenance(),
          derating: defaultDerating(),
          weakness: defaultWeakness(),
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

function saveStateSync(s) {
  // 兼容备份：同时写 localStorage（配额超限时静默失败）
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

/**
 * 异步保存 state：写 IndexedDB + 触发云同步
 */
async function saveState(s) {
  s.updatedAt = Date.now();
  // 1. 写 IndexedDB（主存储）
  try {
    await dbSetState(s);
  } catch (e) {
    console.warn('IndexedDB 写入失败，降级到 localStorage:', e);
    saveStateSync(s);
  }
  // 2. 触发云同步（防抖推送，不 await）
  try {
    const sm = await getSyncManager();
    if (sm) sm.pushData(s);
  } catch (e) {
    // 同步失败不影响本地保存
  }
}

function persist() {
  saveState(ensureState());
}

/**
 * 同步包装器：fire-and-forget 触发异步 persist
 * 保持与现有同步调用兼容（addProject/setModuleData 等）
 */
export function persistState() {
  persist();
}

/**
 * 初始化同步管理器（由 app.js 调用）
 * 登录后触发首次同步
 * @param {object} localState 当前本地 state
 * @returns {Promise<object>} 同步后的 state（可能是云端覆盖后的新 state）
 */
export async function initSync(localState) {
  const sm = await getSyncManager();
  // 触发登录后同步：比较本地与云端，Last-Write-Wins
  const result = await sm.syncOnLogin(localState);
  if (result.merged === 'cloud') {
    // 云端较新，用云端覆盖本地内存 state
    state = normalizeStateV3(result.newState);
    // 同步写入 IndexedDB
    try {
      await dbSetState(state);
    } catch (e) {
      console.warn('IndexedDB 写入失败:', e);
    }
    return { syncManager: sm, stateChanged: true, newState: state };
  }
  return { syncManager: sm, stateChanged: false, newState: localState };
}

/**
 * 获取同步管理器实例（供 sync-ui.js 注册状态回调）
 * @returns {Promise<object>}
 */
export async function getSyncManagerInstance() {
  return await getSyncManager();
}

/**
 * 获取当前内存 state（供同步使用）
 * @returns {object}
 */
export function getState() {
  return ensureState();
}

/**
 * 获取首页 B10 计算器得出的目标 B10 值
 * 如果首页未计算（参数不完整），返回默认值 150
 * @param {object} model 当前 model 对象（可选，不传则用当前选中型号）
 * @returns {number} 目标 B10 值（小时）
 */
export function getHomeB10(model) {
  const m = model || getCurrentModel();
  if (!m || !m.homeCalc) return 150;
  const hc = m.homeCalc;
  const warrantyYears = Number(hc.warrantyYears) || 0;
  const hoursPerYear = Number(hc.hoursPerYear) || 0;
  const allowFailRate = Number(hc.allowFailRate) || 0;
  const beta = Number(hc.beta) || 0;
  const safetyMargin = Number(hc.safetyMargin) || 0;
  if (warrantyYears <= 0 || hoursPerYear <= 0 || allowFailRate <= 0 || beta <= 0) {
    return 150;
  }
  const tw = warrantyYears * hoursPerYear;
  const fw = allowFailRate / 100;
  const margin = safetyMargin / 100;
  const K10 = Math.log(10 / 9);
  const b10Calc = tw * Math.pow(K10 / -Math.log(1 - fw), 1 / beta);
  const b10 = b10Calc * (1 + margin);
  return isFinite(b10) && b10 > 0 ? b10 : 150;
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

// ====== 自定义库（原独立 localStorage key）======

/**
 * 获取自定义元器件库（原 COMPONENT_LIBRARY_CUSTOM）
 * @returns {Array}
 */
export function getCustomComponentLibrary() {
  const s = ensureState();
  return s.customComponentLibrary || [];
}

/**
 * 保存自定义元器件库
 * @param {Array} list
 */
export function setCustomComponentLibrary(list) {
  const s = ensureState();
  s.customComponentLibrary = Array.isArray(list) ? list : [];
  persist();
}

/**
 * 获取自定义改进措施库（原 growth_custom_improvements）
 * @returns {Array}
 */
export function getCustomImprovements() {
  const s = ensureState();
  return s.customImprovements || [];
}

/**
 * 保存自定义改进措施库
 * @param {Array} list
 */
export function setCustomImprovements(list) {
  const s = ensureState();
  s.customImprovements = Array.isArray(list) ? list : [];
  persist();
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

export function createDefaultProject() {
  const project = {
    id: genId(),
    name: "家用锂电绿篱剪 - 示例项目",
    note: "",
    products: [],
    createdAt: new Date().toISOString(),
  };

  const product = {
    id: genId(),
    name: "园林电动工具",
    models: [],
    createdAt: new Date().toISOString(),
  };

  const model = {
    id: genId(),
    name: "HT-550-Li",
    record: defaultModelRecord("HT-550-Li"),
    modules: createModuleData(),
    lastResult: null,
    createdAt: new Date().toISOString(),
  };

  model.modules.fmea = {
    items: [
      {
        id: genId(),
        function: "行星齿轮箱",
        failureMode: "齿面点蚀磨损，传动异响/剪切无力",
        effect: "剪切效率下降、异响、最终无法传动",
        severity: 7,
        cause: "润滑不足、齿面硬度不够、载荷冲击",
        occurrence: 5,
        controlPrevention: "选用耐磨油脂、齿轮热处理强化、优化齿形设计",
        controlDetection: "台架耐久试验、噪声检测",
        detection: 3,
        rpn: 105,
        ap: "H",
        action: "RPN最高项，优先改进",
        responsible: "",
        targetDate: "",
        newSeverity: 0,
        newOccurrence: 0,
        newDetection: 0,
        newRpn: 0,
        newAp: "",
      },
      {
        id: genId(),
        function: "无刷电机",
        failureMode: "轴承磨损卡死，整机停转",
        effect: "整机突然停转，无法工作",
        severity: 8,
        cause: "轴承选型不当、润滑脂失效、轴向载荷过大",
        occurrence: 3,
        controlPrevention: "选用高质量轴承、优化润滑方案、轴承预压设计",
        controlDetection: "电机空载/带载寿命试验、温升检测",
        detection: 4,
        rpn: 96,
        ap: "H",
        action: "严重度高，需重点关注",
        responsible: "",
        targetDate: "",
        newSeverity: 0,
        newOccurrence: 0,
        newDetection: 0,
        newRpn: 0,
        newAp: "",
      },
      {
        id: genId(),
        function: "主控PCB",
        failureMode: "电子元器件失效，整机失控",
        effect: "整机失控、误动作、存在安全隐患",
        severity: 8,
        cause: "元器件质量问题、焊接缺陷、ESD损伤",
        occurrence: 2,
        controlPrevention: "元器件降额设计、SOP质量管控、ESD防护设计",
        controlDetection: "环境应力筛选、高低温循环试验",
        detection: 5,
        rpn: 80,
        ap: "M",
        action: "",
        responsible: "",
        targetDate: "",
        newSeverity: 0,
        newOccurrence: 0,
        newDetection: 0,
        newRpn: 0,
        newAp: "",
      },
      {
        id: genId(),
        function: "锂电池包",
        failureMode: "电芯容量衰减至70%以下，续航骤降",
        effect: "续航时间缩短，用户体验差",
        severity: 6,
        cause: "电芯老化、充放电倍率过高、温度环境恶劣",
        occurrence: 3,
        controlPrevention: "选用高品质电芯、BMS保护、充放电策略优化",
        controlDetection: "电芯循环寿命测试、容量检测",
        detection: 4,
        rpn: 72,
        ap: "M",
        action: "",
        responsible: "",
        targetDate: "",
        newSeverity: 0,
        newOccurrence: 0,
        newDetection: 0,
        newRpn: 0,
        newAp: "",
      },
      {
        id: genId(),
        function: "刀片总成",
        failureMode: "刃口崩口，无法剪切",
        effect: "剪切无力、无法剪切粗枝",
        severity: 7,
        cause: "刀片材料硬度不足、碰到硬物冲击、刃口磨钝",
        occurrence: 5,
        controlPrevention: "选用SK5高碳钢、热处理优化、刀片间隙调整",
        controlDetection: "刀片硬度检测、剪切寿命试验",
        detection: 2,
        rpn: 70,
        ap: "M",
        action: "易损件，用户可自行更换",
        responsible: "",
        targetDate: "",
        newSeverity: 0,
        newOccurrence: 0,
        newDetection: 0,
        newRpn: 0,
        newAp: "",
      },
      {
        id: genId(),
        function: "扳机开关",
        failureMode: "触点磨损接触不良，整机无法启动",
        effect: "整机无法启动或时断时续",
        severity: 7,
        cause: "触点氧化、机械磨损、电弧烧蚀",
        occurrence: 2,
        controlPrevention: "选用镀金触点开关、灭弧设计、开关防护结构",
        controlDetection: "开关机械寿命试验、通断检测",
        detection: 4,
        rpn: 56,
        ap: "L",
        action: "",
        responsible: "",
        targetDate: "",
        newSeverity: 0,
        newOccurrence: 0,
        newDetection: 0,
        newRpn: 0,
        newAp: "",
      },
    ],
    type: "DFMEA",
  };

  model.modules.prediction = {
    components: [
      {
        id: genId(),
        name: "行星齿轮箱",
        type: "mechanical",
        quantity: 1,
        lambda: 0.000556,
        mtbf: 1800,
        b10: 180,
        note: "齿轮磨损主导失效",
      },
      {
        id: genId(),
        name: "无刷电机",
        type: "electromechanical",
        quantity: 1,
        lambda: 0.000323,
        mtbf: 3100,
        b10: 310,
        note: "轴承失效为主",
      },
      {
        id: genId(),
        name: "锂电池包",
        type: "electrochemical",
        quantity: 1,
        lambda: 0.000303,
        mtbf: 3300,
        b10: 330,
        note: "容量衰减70%为判据",
      },
      {
        id: genId(),
        name: "电控系统",
        type: "electronic",
        quantity: 1,
        lambda: 0.000154,
        mtbf: 6500,
        b10: 650,
        note: "PCB及电子元器件",
      },
    ],
    systemStructure: "series",
    parallelCount: 2,
    missionTime: 10000,
  };

  model.modules.lifeData = {
    batches: [
      {
        id: genId(),
        name: "首轮摸底批次",
        note: "12样本，含3种主要失效模式",
        part: "product",
        startDate: "2024-01-15",
        items: [
          { id: genId(), time: 35, failed: true, part: "gearbox", failureMode: "齿轮箱齿面磨损", note: "传动异响增大" },
          { id: genId(), time: 48, failed: true, part: "gearbox", failureMode: "齿轮箱齿面磨损", note: "效率下降" },
          { id: genId(), time: 52, failed: true, part: "bearing", failureMode: "电机轴承磨损", note: "温升异常" },
          { id: genId(), time: 65, failed: true, part: "gearbox", failureMode: "齿轮箱齿面磨损", note: "" },
          { id: genId(), time: 72, failed: true, part: "bearing", failureMode: "电机轴承磨损", note: "出现异响" },
          { id: genId(), time: 78, failed: true, part: "blade", failureMode: "刀片刃口崩裂", note: "碰到硬物" },
          { id: genId(), time: 88, failed: true, part: "bearing", failureMode: "电机轴承磨损", note: "" },
          { id: genId(), time: 95, failed: true, part: "blade", failureMode: "刀片刃口崩裂", note: "" },
          { id: genId(), time: 102, failed: true, part: "blade", failureMode: "刀片刃口崩裂", note: "磨损过度" },
          { id: genId(), time: 110, failed: false, part: "product", failureMode: "", note: "定时截尾" },
          { id: genId(), time: 110, failed: false, part: "product", failureMode: "", note: "定时截尾" },
          { id: genId(), time: 110, failed: false, part: "product", failureMode: "", note: "定时截尾" },
        ],
      },
      {
        id: genId(),
        name: "第二轮复测批次",
        note: "8样本，改进后复测",
        part: "product",
        startDate: "2024-03-20",
        items: [
          { id: genId(), time: 85, failed: true, part: "gearbox", failureMode: "齿轮箱轻微磨损", note: "" },
          { id: genId(), time: 98, failed: true, part: "bearing", failureMode: "轴承轻微异响", note: "" },
          { id: genId(), time: 110, failed: true, part: "gearbox", failureMode: "齿轮箱轻微磨损", note: "" },
          { id: genId(), time: 125, failed: true, part: "bearing", failureMode: "轴承轻微异响", note: "" },
          { id: genId(), time: 140, failed: false, part: "product", failureMode: "", note: "定时截尾" },
          { id: genId(), time: 140, failed: false, part: "product", failureMode: "", note: "定时截尾" },
          { id: genId(), time: 140, failed: false, part: "product", failureMode: "", note: "定时截尾" },
          { id: genId(), time: 140, failed: false, part: "product", failureMode: "", note: "定时截尾" },
        ],
      },
    ],
    activeBatchId: null,
    // definition 已移除，产品参数现在从 model.homeCalc 获取
    analysisConfig: { distribution: "weibull", method: "rrx" },
  };

  model.modules.testPlan = {
    globalParams: {
      confidence: 0.9,
      allowedFailures: 0,
      defaultCensorType: "time",
    },
    testItems: [
      {
        id: genId(),
        name: "齿轮箱台架耐久",
        targetLife: 200,
        targetReliability: 0.9,
        sampleSize: 8,
        testDuration: 240,
        censorType: "time",
        benchCondition: "额定负载、连续运行、常温",
        testObject: "行星齿轮箱",
        testCondition: "额定负载、连续运行、常温",
        acceptanceCriteria: "1.无断齿卡滞；2.效率下降≤5%；3.0失效",
        resultStatus: "not_started",
        resultNote: "",
      },
      {
        id: genId(),
        name: "电机带载寿命",
        targetLife: 250,
        targetReliability: 0.9,
        sampleSize: 6,
        testDuration: 300,
        censorType: "time",
        benchCondition: "额定负载、连续运行、40℃",
        testObject: "无刷电机",
        testCondition: "额定负载、连续运行、40℃",
        acceptanceCriteria: "1.无烧毁卡死；2.转速下降≤10%；3.0失效",
        resultStatus: "not_started",
        resultNote: "",
      },
      {
        id: genId(),
        name: "电芯循环寿命",
        targetLife: 300,
        targetReliability: 0.9,
        sampleSize: 8,
        testDuration: 390,
        censorType: "failure",
        benchCondition: "1C充放电、25℃",
        testObject: "18650电芯",
        testCondition: "1C充放电、25℃",
        acceptanceCriteria: "1.循环≥300次；2.300次容量保持≥80%",
        resultStatus: "not_started",
        resultNote: "",
      },
      {
        id: genId(),
        name: "开关机械寿命",
        targetLife: 8000,
        targetReliability: 0.9,
        sampleSize: 5,
        testDuration: 10400,
        censorType: "failure",
        benchCondition: "额定电流、10次/分钟",
        testObject: "扳机开关",
        testCondition: "额定电流、10次/分钟",
        acceptanceCriteria: "1.机械寿命≥10000次；2.无接触不良",
        resultStatus: "not_started",
        resultNote: "",
      },
      {
        id: genId(),
        name: "整机加速耐久",
        targetLife: 150,
        targetReliability: 0.9,
        sampleSize: 16,
        testDuration: 180,
        censorType: "time",
        benchCondition: "间歇工作制、70%/100%两档负载",
        testObject: "整机组装",
        testCondition: "间歇工作制、70%/100%两档负载",
        acceptanceCriteria: "1.β≥2.0；2.90%置信B10下限≥150h；3.无致命失效",
        resultStatus: "not_started",
        resultNote: "",
      },
    ],
    altPlans: [],
    haltTests: [],
  };

  const phase1Id = genId();
  const phase2Id = genId();
  const phase3Id = genId();
  model.modules.growth = {
    phases: [
      {
        id: phase1Id,
        name: "首轮摸底",
        phaseNumber: 1,
        description: "基线摸底试验，识别主要失效模式",
        failures: [
          { id: genId(), time: 42, failureMode: "扳机开关接触不良" },
          { id: genId(), time: 63, failureMode: "行星齿轮箱齿面磨损" },
          { id: genId(), time: 68, failureMode: "行星齿轮箱齿面磨损" },
          { id: genId(), time: 85, failureMode: "电机轴承卡顿" },
        ],
        totalTime: 100,
        startDate: null,
      },
      {
        id: phase2Id,
        name: "第二轮复测",
        phaseNumber: 2,
        description: "改进后复测，验证增长效果",
        failures: [
          { id: genId(), time: 92, failureMode: "齿轮箱轻微磨损异响" },
          { id: genId(), time: 115, failureMode: "电机轴承轻微温升异响" },
        ],
        totalTime: 120,
        startDate: null,
      },
      {
        id: phase3Id,
        name: "终轮验证",
        phaseNumber: 3,
        description: "最终验证试验，确认达标",
        failures: [
          { id: genId(), time: 142, failureMode: "齿轮箱轻微磨损" },
        ],
        totalTime: 150,
        startDate: null,
      },
    ],
    activePhaseId: phase1Id,
    model: "duane",
    targetMtbf: 165,
  };

  model.modules.derating = {
    components: [
      {
        id: genId(),
        name: "功率MOS管",
        category: "semiconductor",
        stressType: "current",
        ratedValue: 10,
        appliedValue: 5,
        deratingRatio: 0.5,
        status: "pass",
        note: "额定10A，使用5A，降额50%",
      },
      {
        id: genId(),
        name: "电解电容",
        category: "capacitor",
        stressType: "voltage",
        ratedValue: 50,
        appliedValue: 30,
        deratingRatio: 0.6,
        status: "pass",
        note: "额定50V，使用30V，降额40%",
      },
      {
        id: genId(),
        name: "电机轴承",
        category: "mechanical",
        stressType: "temperature",
        ratedValue: 120,
        appliedValue: 80,
        deratingRatio: 0.67,
        status: "pass",
        note: "额定120℃，使用80℃，降额33%",
      },
      {
        id: genId(),
        name: "锂电池",
        category: "battery",
        stressType: "discharge_rate",
        ratedValue: 1,
        appliedValue: 0.8,
        deratingRatio: 0.8,
        status: "pass",
        note: "额定1C，使用0.8C，降额20%",
      },
      {
        id: genId(),
        name: "电阻",
        category: "resistor",
        stressType: "power",
        ratedValue: 1,
        appliedValue: 0.3,
        deratingRatio: 0.3,
        status: "pass",
        note: "额定1W，使用0.3W，降额70%",
      },
    ],
    standard: "mil-hdbk-217",
  };

  model.modules.weakness = {
    weights: { fmea: 0.4, prediction: 0.3, derating: 0.3 },
    items: [],
  };

  model.modules.environment = {
    thermalCycle: {
      tempHigh: 60,
      tempLow: -10,
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
      type: "random",
      freqStart: 10,
      freqEnd: 2000,
      amplitude: 5,
      psd: 0.1,
      grms: 0,
      direction: "x",
      duration: 60,
      stressLevel: "",
      fatigueDamage: 0,
      suggestedLevel: "",
    },
    envStresses: [
      { id: genId(), type: "temperature", name: "温度", level: "ground_fixed", piE: 1.5, standard: "IEC 60068-2-1/2", note: "" },
      { id: genId(), type: "humidity", name: "湿度", level: "moderate", piE: 1.2, standard: "IEC 60068-2-30", note: "" },
      { id: genId(), type: "salt_spray", name: "盐雾", level: "low", piE: 2.0, standard: "IEC 60068-2-11", note: "" },
      { id: genId(), type: "dust", name: "粉尘", level: "low", piE: 1.3, standard: "IEC 60068-2-68", note: "" },
      { id: genId(), type: "vibration", name: "振动", level: "low", piE: 2.0, standard: "IEC 60068-2-6", note: "" },
      { id: genId(), type: "shock", name: "冲击", level: "low", piE: 1.5, standard: "IEC 60068-2-27", note: "" },
    ],
    standards: [
      { id: genId(), code: "IEC 60068-2-1", name: "低温试验", category: "IEC 60068", scope: "非散热试件", items: "温度范围、持续时间" },
      { id: genId(), code: "IEC 60068-2-2", name: "高温试验", category: "IEC 60068", scope: "非散热试件", items: "温度范围、持续时间" },
      { id: genId(), code: "IEC 60068-2-14", name: "温度变化试验", category: "IEC 60068", scope: "温度循环", items: "温变率、循环次数" },
      { id: genId(), code: "IEC 60068-2-30", name: "湿热试验", category: "IEC 60068", scope: "恒定/交变湿热", items: "温度、湿度、持续时间" },
      { id: genId(), code: "IEC 60068-2-6", name: "正弦振动试验", category: "IEC 60068", scope: "振动耐久", items: "频率范围、加速度幅值" },
      { id: genId(), code: "IEC 60068-2-64", name: "随机振动试验", category: "IEC 60068", scope: "宽带随机振动", items: "PSD谱、Grms、持续时间" },
      { id: genId(), code: "IEC 60068-2-27", name: "冲击试验", category: "IEC 60068", scope: "半正弦冲击", items: "峰值加速度、持续时间" },
      { id: genId(), code: "IEC 60068-2-11", name: "盐雾试验", category: "IEC 60068", scope: "腐蚀防护", items: "盐雾浓度、试验时间" },
      { id: genId(), code: "GJB 150.3A", name: "高温试验", category: "GJB 150", scope: "军用装备", items: "高温贮存、高温工作" },
      { id: genId(), code: "GJB 150.4A", name: "低温试验", category: "GJB 150", scope: "军用装备", items: "低温贮存、低温工作" },
      { id: genId(), code: "GJB 150.16A", name: "振动试验", category: "GJB 150", scope: "军用装备", items: "正弦、随机振动" },
      { id: genId(), code: "MIL-STD-810H", name: "环境工程考虑和实验室试验", category: "MIL-STD-810", scope: "美军标环境试验", items: "温度、湿度、振动、冲击等" },
      { id: genId(), code: "GB/T 2423.1", name: "低温试验方法", category: "GB/T 2423", scope: "电工电子产品", items: "温度范围、持续时间" },
      { id: genId(), code: "GB/T 2423.2", name: "高温试验方法", category: "GB/T 2423", scope: "电工电子产品", items: "温度范围、持续时间" },
      { id: genId(), code: "GB/T 2423.10", name: "振动试验方法", category: "GB/T 2423", scope: "电工电子产品", items: "正弦振动" },
      { id: genId(), code: "GB/T 2423.22", name: "温度变化试验", category: "GB/T 2423", scope: "电工电子产品", items: "温度循环" },
    ],
  };

  const topEventId = genId();
  const motorFailureId = genId();
  const motorBurnoutId = genId();
  const motorBearingSeizeId = genId();
  const ctrlFailureId = genId();
  const powerFailureId = genId();
  const mcuFailureId = genId();
  const batteryFailureId = genId();
  const cellDamageId = genId();
  const bmsFailureId = genId();

  model.modules.fta = {
    trees: [
      {
        id: genId(),
        name: "整机不工作故障树",
        topEvent: "整机不工作",
        nodes: [
          { id: topEventId, type: "top", label: "整机不工作", parentId: null, probability: 0.05 },
          { id: motorFailureId, type: "and", label: "电机失效", parentId: topEventId, probability: 0.02 },
          { id: motorBurnoutId, type: "basic", label: "电机烧毁", parentId: motorFailureId, probability: 0.008 },
          { id: motorBearingSeizeId, type: "basic", label: "轴承卡死", parentId: motorFailureId, probability: 0.012 },
          { id: ctrlFailureId, type: "or", label: "电控失效", parentId: topEventId, probability: 0.015 },
          { id: powerFailureId, type: "basic", label: "电源故障", parentId: ctrlFailureId, probability: 0.008 },
          { id: mcuFailureId, type: "basic", label: "MCU故障", parentId: ctrlFailureId, probability: 0.007 },
          { id: batteryFailureId, type: "or", label: "电池失效", parentId: topEventId, probability: 0.018 },
          { id: cellDamageId, type: "basic", label: "电芯损坏", parentId: batteryFailureId, probability: 0.01 },
          { id: bmsFailureId, type: "basic", label: "BMS故障", parentId: batteryFailureId, probability: 0.008 },
        ],
      },
    ],
    activeTreeId: null,
  };

  model.modules.maintenance = {
    availability: {
      mtbf: 460,
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
        mtbf: 3100,
        annualHours: 25,
        unitCount: 10000,
        supportYears: 5,
        confidence: 0.9,
        demand: 0,
        spareCount: 0,
        shortageRate: 0,
      },
      {
        id: genId(),
        name: "齿轮箱",
        mtbf: 1800,
        annualHours: 25,
        unitCount: 10000,
        supportYears: 5,
        confidence: 0.9,
        demand: 0,
        spareCount: 0,
        shortageRate: 0,
      },
      {
        id: genId(),
        name: "锂电池",
        mtbf: 3300,
        annualHours: 25,
        unitCount: 10000,
        supportYears: 5,
        confidence: 0.9,
        demand: 0,
        spareCount: 0,
        shortageRate: 0,
      },
      {
        id: genId(),
        name: "主控板",
        mtbf: 6500,
        annualHours: 25,
        unitCount: 10000,
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

  model.modules.dataManagement = {
    versions: [
      {
        id: genId(),
        name: "V1.0 首轮设计基线",
        description: "首轮设计完成，DFMEA、寿命预测、测试计划已建立",
        createdAt: new Date().toISOString(),
        snapshot: null,
      },
    ],
    templates: [],
  };

  product.models.push(model);
  project.products.push(product);
  return project;
}
