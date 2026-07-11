/**
 * Service 基类 - 提供通用的数据操作方法
 */
import { eventBus, Events } from '../eventbus.js';

export class BaseService {
  constructor(repository) {
    this.repo = repository;
    this.eventBus = eventBus;
  }

  /**
   * 获取当前型号
   */
  getCurrentModel() {
    return this.repo.getCurrentModel();
  }

  /**
   * 获取指定型号
   */
  async getModel(modelId) {
    return this.repo.getModel(modelId);
  }

  /**
   * 保存型号（触发持久化和事件）
   */
  async saveModel(model) {
    const saved = await this.repo.saveModel(model);
    this.emit(Events.MODEL_SAVED, { modelId: model.id });
    return saved;
  }

  /**
   * 发送事件
   */
  emit(event, data) {
    this.eventBus.emit(event, data);
  }

  /**
   * 校验数值范围
   */
  validateRange(value, min, max, fieldName) {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`${fieldName} 必须是数字`);
    }
    if (value < min || value > max) {
      throw new Error(`${fieldName} 必须在 ${min} 到 ${max} 之间`);
    }
  }

  /**
   * 校验正数
   */
  validatePositive(value, fieldName) {
    if (typeof value !== 'number' || isNaN(value) || value <= 0) {
      throw new Error(`${fieldName} 必须是正数`);
    }
  }
}
