/**
 * 维护可用性 Service - 处理维护性参数管理
 */
import { BaseService } from './base-service.js';
import { Events } from '../eventbus.js';

export class MaintenanceService extends BaseService {
  async updateAvailability(modelId, availability) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const maintenance = model.modules?.maintenance || {};
    const newAvailability = { ...maintenance.availability, ...availability };
    const newMaintenance = { ...maintenance, availability: newAvailability };
    const newModules = { ...model.modules, maintenance: newMaintenance };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('maintenance:availability-updated', { modelId, availability: newAvailability });
    return newModel;
  }

  async addSpare(modelId, spare) {
    if (!spare.name) throw new Error('备件名称不能为空');

    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const maintenance = model.modules?.maintenance || { spares: [] };
    const spares = maintenance.spares || [];
    const newSpare = {
      id: crypto.randomUUID?.() ?? `spare-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ...spare,
    };
    const newSpares = [...spares, newSpare];
    const newMaintenance = { ...maintenance, spares: newSpares };
    const newModules = { ...model.modules, maintenance: newMaintenance };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('maintenance:spare-added', { modelId, spare: newSpare });
    return { model: newModel, spare: newSpare };
  }

  async removeSpare(modelId, spareId) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const maintenance = model.modules?.maintenance || { spares: [] };
    const spares = maintenance.spares || [];
    const newSpares = spares.filter(s => s.id !== spareId);
    if (newSpares.length === spares.length) throw new Error(`未找到备件 ${spareId}`);

    const newMaintenance = { ...maintenance, spares: newSpares };
    const newModules = { ...model.modules, maintenance: newMaintenance };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('maintenance:spare-removed', { modelId, spareId });
    return newModel;
  }

  async updateSpare(modelId, spareId, updates) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const maintenance = model.modules?.maintenance || { spares: [] };
    const spares = maintenance.spares || [];
    const idx = spares.findIndex(s => s.id === spareId);
    if (idx < 0) throw new Error(`未找到备件 ${spareId}`);

    const newSpares = [...spares];
    newSpares[idx] = { ...spares[idx], ...updates };
    const newMaintenance = { ...maintenance, spares: newSpares };
    const newModules = { ...model.modules, maintenance: newMaintenance };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('maintenance:spare-updated', { modelId, spare: newSpares[idx] });
    return { model: newModel, spare: newSpares[idx] };
  }

  async updateStrategy(modelId, strategy) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const maintenance = model.modules?.maintenance || {};
    const newMaintenance = { ...maintenance, strategy: { ...maintenance.strategy, ...strategy } };
    const newModules = { ...model.modules, maintenance: newMaintenance };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('maintenance:strategy-updated', { modelId, strategy: newMaintenance.strategy });
    return newModel;
  }
}
