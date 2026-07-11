/**
 * 寿命数据 Service - 处理寿命数据批次管理
 */
import { BaseService } from './base-service.js';
import { Events } from '../eventbus.js';

export class LifeDataService extends BaseService {
  async addBatch(modelId, batch) {
    if (!batch.name) throw new Error('批次名称不能为空');

    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const lifeData = model.modules?.lifeData || { batches: [], activeBatchId: null, analysisConfig: { distribution: 'weibull', method: 'rrx' } };
    const batches = lifeData.batches || [];
    const newBatch = {
      id: crypto.randomUUID?.() ?? `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ...batch,
      createdAt: new Date().toISOString(),
    };
    const newBatches = [...batches, newBatch];
    const newLifeData = { ...lifeData, batches: newBatches };
    const newModules = { ...model.modules, lifeData: newLifeData };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('life-data:batch-added', { modelId, batch: newBatch });
    return { model: newModel, batch: newBatch };
  }

  async removeBatch(modelId, batchId) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const lifeData = model.modules?.lifeData || { batches: [] };
    const batches = lifeData.batches || [];
    const newBatches = batches.filter(b => b.id !== batchId);
    if (newBatches.length === batches.length) throw new Error(`未找到批次 ${batchId}`);

    const newLifeData = { ...lifeData, batches: newBatches };
    if (lifeData.activeBatchId === batchId) {
      newLifeData.activeBatchId = newBatches.length > 0 ? newBatches[0].id : null;
    }
    const newModules = { ...model.modules, lifeData: newLifeData };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('life-data:batch-removed', { modelId, batchId });
    return newModel;
  }

  async updateBatch(modelId, batchId, updates) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const lifeData = model.modules?.lifeData || { batches: [] };
    const batches = lifeData.batches || [];
    const idx = batches.findIndex(b => b.id === batchId);
    if (idx < 0) throw new Error(`未找到批次 ${batchId}`);

    const newBatches = [...batches];
    newBatches[idx] = { ...batches[idx], ...updates };
    const newLifeData = { ...lifeData, batches: newBatches };
    const newModules = { ...model.modules, lifeData: newLifeData };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('life-data:batch-updated', { modelId, batch: newBatches[idx] });
    return { model: newModel, batch: newBatches[idx] };
  }

  async setActiveBatch(modelId, batchId) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const lifeData = model.modules?.lifeData || { batches: [] };
    const newLifeData = { ...lifeData, activeBatchId: batchId };
    const newModules = { ...model.modules, lifeData: newLifeData };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('life-data:active-batch-changed', { modelId, batchId });
    return newModel;
  }

  async updateAnalysisConfig(modelId, config) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const lifeData = model.modules?.lifeData || {};
    const newLifeData = { ...lifeData, analysisConfig: { ...lifeData.analysisConfig, ...config } };
    const newModules = { ...model.modules, lifeData: newLifeData };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('life-data:config-updated', { modelId, config: newLifeData.analysisConfig });
    return newModel;
  }
}
