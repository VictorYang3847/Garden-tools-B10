/**
 * 可靠性增长 Service - 处理增长阶段、失效数据、改进措施管理
 */
import { BaseService } from './base-service.js';
import { Events } from '../eventbus.js';
import { genId } from '../store.js';

export class GrowthService extends BaseService {
  /**
   * 确保增长模块数据已初始化（含至少一个阶段）
   */
  ensureGrowthData(model) {
    if (!model.modules) model.modules = {};
    if (!model.modules.growth) {
      model.modules.growth = {
        phases: [],
        activePhaseId: null,
        model: 'duane',
        targetMtbf: null,
      };
    }
    const g = model.modules.growth;
    if (!Array.isArray(g.phases)) {
      const oldFailures = Array.isArray(g.failures) ? g.failures : [];
      const oldTotalTime = g.totalTime || null;
      const firstPhaseId = genId();
      g.phases = [
        {
          id: firstPhaseId,
          name: '首轮试验',
          phaseNumber: 1,
          description: '迁移自旧数据',
          failures: oldFailures,
          improvements: [],
          totalTime: oldTotalTime,
          startDate: null,
        },
      ];
      g.activePhaseId = firstPhaseId;
    }
    if (!g.activePhaseId && g.phases.length > 0) {
      g.activePhaseId = g.phases[0].id;
    }
    if (!g.model) g.model = 'duane';
    if (g.targetMtbf === undefined) g.targetMtbf = null;
    for (const phase of g.phases) {
      if (!Array.isArray(phase.failures)) phase.failures = [];
      if (!Array.isArray(phase.improvements)) phase.improvements = [];
      if (phase.totalTime === undefined) phase.totalTime = null;
      if (!phase.phaseNumber) phase.phaseNumber = 1;
      if (!phase.name) phase.name = `第${phase.phaseNumber}轮`;
    }
    return model;
  }

  /**
   * 添加增长阶段
   */
  async addPhase(modelId, phaseData) {
    if (!phaseData || !phaseData.name) throw new Error('阶段名称不能为空');

    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const growth = model.modules?.growth || { phases: [], activePhaseId: null, model: 'duane', targetMtbf: null };
    const phases = growth.phases || [];
    const lastPhase = phases[phases.length - 1];
    const newNumber = lastPhase ? (lastPhase.phaseNumber || 0) + 1 : 1;

    const newPhase = {
      id: genId(),
      name: phaseData.name || `第${newNumber}轮试验`,
      phaseNumber: newNumber,
      description: phaseData.description || '',
      failures: [],
      improvements: [],
      totalTime: null,
      startDate: null,
      ...phaseData,
    };

    const newPhases = [...phases, newPhase];
    const newGrowth = { ...growth, phases: newPhases, activePhaseId: newPhase.id };
    const newModules = { ...model.modules, growth: newGrowth };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('growth:phase-added', { modelId, phase: newPhase });
    return { model: newModel, phase: newPhase };
  }

  /**
   * 删除增长阶段
   */
  async removePhase(modelId, phaseId) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const growth = model.modules?.growth || { phases: [] };
    const phases = growth.phases || [];
    if (phases.length <= 1) throw new Error('至少保留一个阶段');

    const idx = phases.findIndex(p => p.id === phaseId);
    if (idx < 0) throw new Error(`未找到阶段 ${phaseId}`);

    const newPhases = phases.filter(p => p.id !== phaseId);
    // 重新编号
    for (let i = idx; i < newPhases.length; i++) {
      newPhases[i] = { ...newPhases[i], phaseNumber: i + 1 };
    }

    const newGrowth = { ...growth, phases: newPhases };
    if (growth.activePhaseId === phaseId) {
      newGrowth.activePhaseId = newPhases[Math.max(0, idx - 1)]?.id || null;
    }
    const newModules = { ...model.modules, growth: newGrowth };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('growth:phase-removed', { modelId, phaseId });
    return newModel;
  }

  /**
   * 更新阶段信息（名称、描述、总时间等）
   */
  async updatePhase(modelId, phaseId, updates) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const growth = model.modules?.growth || { phases: [] };
    const phases = growth.phases || [];
    const idx = phases.findIndex(p => p.id === phaseId);
    if (idx < 0) throw new Error(`未找到阶段 ${phaseId}`);

    const newPhases = [...phases];
    newPhases[idx] = { ...phases[idx], ...updates };
    const newGrowth = { ...growth, phases: newPhases };
    const newModules = { ...model.modules, growth: newGrowth };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('growth:phase-updated', { modelId, phase: newPhases[idx] });
    return { model: newModel, phase: newPhases[idx] };
  }

  /**
   * 设置当前活跃阶段
   */
  async setActivePhase(modelId, phaseId) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const growth = model.modules?.growth || { phases: [] };
    const newGrowth = { ...growth, activePhaseId: phaseId };
    const newModules = { ...model.modules, growth: newGrowth };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('growth:active-phase-changed', { modelId, phaseId });
    return newModel;
  }

  /**
   * 更新增长配置（模型类型、目标 MTBF）
   */
  async updateGrowthConfig(modelId, config) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const growth = model.modules?.growth || {};
    const newGrowth = { ...growth, ...config };
    const newModules = { ...model.modules, growth: newGrowth };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('growth:config-updated', { modelId, config: newGrowth });
    return newModel;
  }

  /**
   * 添加失效记录
   */
  async addFailure(modelId, phaseId, failureData) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const growth = model.modules?.growth || { phases: [] };
    const phases = growth.phases || [];
    const idx = phases.findIndex(p => p.id === phaseId);
    if (idx < 0) throw new Error(`未找到阶段 ${phaseId}`);

    const newFailure = {
      id: genId(),
      time: failureData?.time ?? 0,
      failureMode: failureData?.failureMode || '',
      ...failureData,
    };

    const newFailures = [...phases[idx].failures, newFailure];
    const newPhases = [...phases];
    newPhases[idx] = { ...phases[idx], failures: newFailures };
    const newGrowth = { ...growth, phases: newPhases };
    const newModules = { ...model.modules, growth: newGrowth };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('growth:failure-added', { modelId, phaseId, failure: newFailure });
    return { model: newModel, failure: newFailure };
  }

  /**
   * 删除失效记录
   */
  async removeFailure(modelId, phaseId, failureId) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const growth = model.modules?.growth || { phases: [] };
    const phases = growth.phases || [];
    const idx = phases.findIndex(p => p.id === phaseId);
    if (idx < 0) throw new Error(`未找到阶段 ${phaseId}`);

    const newFailures = phases[idx].failures.filter(f => f.id !== failureId);
    const newPhases = [...phases];
    newPhases[idx] = { ...phases[idx], failures: newFailures };
    const newGrowth = { ...growth, phases: newPhases };
    const newModules = { ...model.modules, growth: newGrowth };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('growth:failure-removed', { modelId, phaseId, failureId });
    return newModel;
  }

  /**
   * 更新失效记录
   */
  async updateFailure(modelId, phaseId, failureId, updates) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const growth = model.modules?.growth || { phases: [] };
    const phases = growth.phases || [];
    const phaseIdx = phases.findIndex(p => p.id === phaseId);
    if (phaseIdx < 0) throw new Error(`未找到阶段 ${phaseId}`);

    const failures = phases[phaseIdx].failures;
    const failIdx = failures.findIndex(f => f.id === failureId);
    if (failIdx < 0) throw new Error(`未找到失效记录 ${failureId}`);

    const newFailures = [...failures];
    newFailures[failIdx] = { ...failures[failIdx], ...updates };
    const newPhases = [...phases];
    newPhases[phaseIdx] = { ...phases[phaseIdx], failures: newFailures };
    const newGrowth = { ...growth, phases: newPhases };
    const newModules = { ...model.modules, growth: newGrowth };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('growth:failure-updated', { modelId, phaseId, failureId, updates });
    return newModel;
  }

  /**
   * 添加改进措施
   */
  async addImprovement(modelId, phaseId, improvementData) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const growth = model.modules?.growth || { phases: [] };
    const phases = growth.phases || [];
    const idx = phases.findIndex(p => p.id === phaseId);
    if (idx < 0) throw new Error(`未找到阶段 ${phaseId}`);

    // 检查是否已存在
    const improvements = phases[idx].improvements || [];
    if (improvementData.id && improvements.some(imp => imp.id === improvementData.id)) {
      throw new Error('该措施已在当前轮次中');
    }

    const newImprovement = {
      id: improvementData.id || genId(),
      name: improvementData.name || '',
      category: improvementData.category || '',
      improvement: improvementData.improvement || '',
      desc: improvementData.desc || '',
      status: 'pending',
      responsible: '',
      targetDate: '',
      ...improvementData,
    };

    const newImprovements = [...improvements, newImprovement];
    const newPhases = [...phases];
    newPhases[idx] = { ...phases[idx], improvements: newImprovements };
    const newGrowth = { ...growth, phases: newPhases };
    const newModules = { ...model.modules, growth: newGrowth };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('growth:improvement-added', { modelId, phaseId, improvement: newImprovement });
    return { model: newModel, improvement: newImprovement };
  }

  /**
   * 删除改进措施
   */
  async removeImprovement(modelId, phaseId, improvementId) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const growth = model.modules?.growth || { phases: [] };
    const phases = growth.phases || [];
    const idx = phases.findIndex(p => p.id === phaseId);
    if (idx < 0) throw new Error(`未找到阶段 ${phaseId}`);

    const newImprovements = (phases[idx].improvements || []).filter(imp => imp.id !== improvementId);
    const newPhases = [...phases];
    newPhases[idx] = { ...phases[idx], improvements: newImprovements };
    const newGrowth = { ...growth, phases: newPhases };
    const newModules = { ...model.modules, growth: newGrowth };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('growth:improvement-removed', { modelId, phaseId, improvementId });
    return newModel;
  }
}
