/**
 * 可靠性预测 Service - 处理元器件管理和可靠性分配
 */
import { BaseService } from './base-service.js';
import { Events } from '../eventbus.js';

export class PredictionService extends BaseService {
  /**
   * 更新分配目标 B10
   */
  async updateAllocationTarget(modelId, targetB10) {
    // 校验
    this.validatePositive(targetB10, '目标B10');
    if (targetB10 > 100000) {
      throw new Error('B10 值异常，不能超过 100000 小时');
    }

    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    // 不可变更新
    const prediction = model.modules?.prediction || {};
    const allocation = prediction.allocation || {};
    const newAllocation = { ...allocation, targetB10 };
    const newPrediction = { ...prediction, allocation: newAllocation };
    const newModules = { ...model.modules, prediction: newPrediction };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);

    this.emit(Events.PREDICTION_TARGET_CHANGED, {
      modelId,
      targetB10,
    });

    return newModel;
  }

  /**
   * 添加元器件
   */
  async addComponent(modelId, component) {
    // 校验
    if (!component.name) throw new Error('元器件名称不能为空');
    this.validatePositive(component.quantity || 1, '数量');
    if (component.lambda !== undefined && component.lambda < 0) {
      throw new Error('失效率不能为负数');
    }

    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    // 不可变更新
    const prediction = model.modules?.prediction || {};
    const components = prediction.components || [];
    const newComponent = {
      id: crypto.randomUUID?.() ?? `comp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ...component,
    };
    const newComponents = [...components, newComponent];
    const newPrediction = { ...prediction, components: newComponents };
    const newModules = { ...model.modules, prediction: newPrediction };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);

    this.emit(Events.PREDICTION_COMPONENT_UPDATED, {
      modelId,
      action: 'add',
      component: newComponent,
    });

    return { model: newModel, component: newComponent };
  }

  /**
   * 删除元器件
   */
  async removeComponent(modelId, componentId) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const prediction = model.modules?.prediction || {};
    const components = prediction.components || [];
    const newComponents = components.filter(c => c.id !== componentId);

    if (newComponents.length === components.length) {
      throw new Error(`未找到元器件 ${componentId}`);
    }

    // 不可变更新
    const newPrediction = { ...prediction, components: newComponents };
    const newModules = { ...model.modules, prediction: newPrediction };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);

    this.emit(Events.PREDICTION_COMPONENT_UPDATED, {
      modelId,
      action: 'remove',
      componentId,
    });

    return newModel;
  }

  /**
   * 更新元器件参数
   */
  async updateComponent(modelId, componentId, updates) {
    // 校验
    if (updates.lambda !== undefined && updates.lambda < 0) {
      throw new Error('失效率不能为负数');
    }
    if (updates.quantity !== undefined && updates.quantity <= 0) {
      throw new Error('数量必须是正数');
    }

    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const prediction = model.modules?.prediction || {};
    const components = prediction.components || [];
    const compIndex = components.findIndex(c => c.id === componentId);

    if (compIndex < 0) {
      throw new Error(`未找到元器件 ${componentId}`);
    }

    // 不可变更新
    const newComponents = [...components];
    newComponents[compIndex] = { ...components[compIndex], ...updates };
    const newPrediction = { ...prediction, components: newComponents };
    const newModules = { ...model.modules, prediction: newPrediction };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);

    this.emit(Events.PREDICTION_COMPONENT_UPDATED, {
      modelId,
      action: 'update',
      component: newComponents[compIndex],
    });

    return { model: newModel, component: newComponents[compIndex] };
  }

  /**
   * 计算系统级可靠性
   */
  calculateSystemReliability(components, systemStructure = 'series', parallelCount = 2) {
    if (!components || components.length === 0) {
      return { lambda: 0, mtbf: 0, b10: 0 };
    }

    // 计算系统失效率（串联系统）
    let systemLambda = 0;
    for (const comp of components) {
      const lambda = comp.lambda || 0;
      const qty = comp.quantity || 1;
      systemLambda += lambda * qty;
    }

    // 并联系统修正
    if (systemStructure === 'parallel' && parallelCount > 1) {
      // 简化计算：并联系统 MTBF ≈ 单个 MTBF × (1 + 1/2 + ... + 1/n)
      const harmonicSum = Array.from({ length: parallelCount }, (_, i) => 1 / (i + 1))
        .reduce((sum, v) => sum + v, 0);
      systemLambda = systemLambda / harmonicSum;
    }

    const mtbf = systemLambda > 0 ? 1 / systemLambda : 0;
    const b10 = mtbf * 0.1; // 简化：B10 ≈ MTBF × 0.1

    return {
      lambda: systemLambda,
      mtbf,
      b10,
    };
  }
}
