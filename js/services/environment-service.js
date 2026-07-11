/**
 * 环境应力 Service - 处理环境应力参数管理
 */
import { BaseService } from './base-service.js';
import { Events } from '../eventbus.js';

export class EnvironmentService extends BaseService {
  async updateThermalCycle(modelId, thermalCycle) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const env = model.modules?.environment || {};
    const newThermalCycle = { ...env.thermalCycle, ...thermalCycle };
    const newEnv = { ...env, thermalCycle: newThermalCycle };
    const newModules = { ...model.modules, environment: newEnv };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('environment:thermal-cycle-updated', { modelId, thermalCycle: newThermalCycle });
    return newModel;
  }

  async updateVibration(modelId, vibration) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const env = model.modules?.environment || {};
    const newVibration = { ...env.vibration, ...vibration };
    const newEnv = { ...env, vibration: newVibration };
    const newModules = { ...model.modules, environment: newEnv };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('environment:vibration-updated', { modelId, vibration: newVibration });
    return newModel;
  }

  async updateEnvStress(modelId, stressId, updates) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const env = model.modules?.environment || { envStresses: [] };
    const stresses = env.envStresses || [];
    const idx = stresses.findIndex(s => s.id === stressId);
    if (idx < 0) throw new Error(`未找到环境应力 ${stressId}`);

    const newStresses = [...stresses];
    newStresses[idx] = { ...stresses[idx], ...updates };
    const newEnv = { ...env, envStresses: newStresses };
    const newModules = { ...model.modules, environment: newEnv };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);
    this.emit('environment:stress-updated', { modelId, stress: newStresses[idx] });
    return { model: newModel, stress: newStresses[idx] };
  }
}
