/**
 * 测试计划 Service - 处理测试计划管理
 */
import { BaseService } from './base-service.js';
import { Events } from '../eventbus.js';

export class TestPlanService extends BaseService {
  async addTestItem(modelId, item) {
    if (!item.name) throw new Error('测试项名称不能为空');

    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const testPlan = model.modules?.testPlan || { globalParams: { confidence: 0.9, allowedFailures: 0, defaultCensorType: 'time' }, testItems: [], altPlans: [], haltTests: [] };
    const items = testPlan.testItems || [];
    const newItem = {
      id: crypto.randomUUID?.() ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ...item,
    };
    const newItems = [...items, newItem];
    const newTestPlan = { ...testPlan, testItems: newItems };
    const newModules = { ...model.modules, testPlan: newTestPlan };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('test-plan:item-added', { modelId, item: newItem });
    return { model: newModel, item: newItem };
  }

  async removeTestItem(modelId, itemId) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const testPlan = model.modules?.testPlan || { testItems: [] };
    const items = testPlan.testItems || [];
    const newItems = items.filter(i => i.id !== itemId);
    if (newItems.length === items.length) throw new Error(`未找到测试项 ${itemId}`);

    const newTestPlan = { ...testPlan, testItems: newItems };
    const newModules = { ...model.modules, testPlan: newTestPlan };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('test-plan:item-removed', { modelId, itemId });
    return newModel;
  }

  async updateTestItem(modelId, itemId, updates) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const testPlan = model.modules?.testPlan || { testItems: [] };
    const items = testPlan.testItems || [];
    const idx = items.findIndex(i => i.id === itemId);
    if (idx < 0) throw new Error(`未找到测试项 ${itemId}`);

    const newItems = [...items];
    newItems[idx] = { ...items[idx], ...updates };
    const newTestPlan = { ...testPlan, testItems: newItems };
    const newModules = { ...model.modules, testPlan: newTestPlan };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('test-plan:item-updated', { modelId, item: newItems[idx] });
    return { model: newModel, item: newItems[idx] };
  }

  async updateGlobalParams(modelId, params) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const testPlan = model.modules?.testPlan || {};
    const newTestPlan = { ...testPlan, globalParams: { ...testPlan.globalParams, ...params } };
    const newModules = { ...model.modules, testPlan: newTestPlan };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('test-plan:params-updated', { modelId, params: newTestPlan.globalParams });
    return newModel;
  }
}
