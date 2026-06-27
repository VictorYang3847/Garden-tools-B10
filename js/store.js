/**
 * Data store: Project → Models → (definition, planning, analysis)
 */

import { defaultModelDefinition, defaultModelRecord } from "./calculator.js";

const STORAGE_KEY = "b10-tool-v2";
const LEGACY_KEY = "b10-hedge-trimmer-v1";

export function genId() {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultPlanning() {
  const targets = ["product", "motor", "battery", "gearbox", "blade", "bearing"];
  const labels = {
    product: "整机",
    motor: "电机",
    battery: "电池包",
    gearbox: "齿轮箱/传动",
    blade: "刀片组件",
    bearing: "轴承",
  };
  return {
    items: targets.map((id) => ({
      id,
      name: labels[id],
      censoringType: "time", // time | complete | failure_count
      allowedFailures: 1,
      sampleSize: null,
      testDuration: null,
      benchCondition: "",
      note: "",
    })),
  };
}

export function defaultAnalysis() {
  return { batches: [] };
}

export function createModel(name = "新型号") {
  return {
    id: genId(),
    name,
    record: defaultModelRecord(name),
    definition: defaultModelDefinition(),
    planning: defaultPlanning(),
    analysis: defaultAnalysis(),
    lastResult: null,
  };
}

export function createProject(name = "新项目") {
  const model = createModel("HT-550-Li");
  return {
    id: genId(),
    name,
    note: "",
    models: [model],
    createdAt: new Date().toISOString(),
  };
}

function migrateLegacyV1(raw) {
  const project = createProject("迁移项目");
  const model = project.models[0];
  model.name = raw.model || "HT-550-Li";
  model.record = {
    ...defaultModelRecord(model.name),
    projectCode: "",
    voltage: raw.voltage ?? 18,
    power: raw.power ?? 450,
    bladeType: raw.bladeType ?? "double",
    bladeLength: raw.bladeLength ?? 550,
    strokeRate: raw.strokeRate ?? 3000,
    analyst: raw.analyst ?? "",
    note: raw.note ?? "",
    updatedAt: new Date().toISOString(),
  };
  model.definition = {
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
  };
  return project;
}

export function defaultAppState() {
  const project = createProject("2026 绿篱机平台");
  return {
    version: 2,
    activeProjectId: project.id,
    activeModelId: project.models[0].id,
    activePage: "definition",
    projects: [project],
  };
}

export function loadAppState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if (state.version === 2 && state.projects?.length) {
        return normalizeState(state);
      }
    }
  } catch {
    /* ignore */
  }

  const legacyRaw = localStorage.getItem(LEGACY_KEY);
  if (legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw);
      const project = migrateLegacyV1(legacy);
      const state = defaultAppState();
      state.projects = [project];
      state.activeProjectId = project.id;
      state.activeModelId = project.models[0].id;
      localStorage.removeItem(LEGACY_KEY);
      return state;
    } catch {
      /* ignore */
    }
  }

  return defaultAppState();
}

function normalizeState(state) {
  for (const project of state.projects) {
    for (const model of project.models) {
      if (!model.planning) model.planning = defaultPlanning();
      if (!model.analysis) model.analysis = defaultAnalysis();
      if (!model.record) model.record = defaultModelRecord(model.name);
      if (!model.definition) model.definition = defaultModelDefinition();
    }
  }
  return state;
}

export function saveAppState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function getActiveProject(state) {
  return state.projects.find((p) => p.id === state.activeProjectId) ?? state.projects[0];
}

export function getActiveModel(state) {
  const project = getActiveProject(state);
  return project?.models.find((m) => m.id === state.activeModelId) ?? project?.models[0];
}

export function mergeInputs(record, definition) {
  return {
    model: record.modelName ?? record.name ?? "",
    ...record,
    ...definition,
    parts: definition.parts,
  };
}

export function exportStateJson(state) {
  return JSON.stringify(state, null, 2);
}

export function importStateJson(json) {
  const parsed = JSON.parse(json);
  if (!parsed.projects?.length) {
    throw new Error("无效的数据格式：缺少 projects");
  }
  parsed.version = 2;
  return normalizeState(parsed);
}

/** Sync planning item target labels from definition result (for display) */
export function getDefinitionTargets(model, calcResult) {
  if (!calcResult) return {};
  const map = { product: calcResult.b10Target };
  for (const p of calcResult.partEntries) {
    map[p.id] = p.equivHours;
  }
  return map;
}
