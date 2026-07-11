/**
 * FMEA Service - 处理 FMEA 条目的增删改和评分计算
 */
import { BaseService } from './base-service.js';
import { Events } from '../eventbus.js';

export class FmeaService extends BaseService {
  /**
   * 添加 FMEA 条目
   */
  async addItem(modelId, item) {
    // 校验
    if (!item.function) throw new Error('功能不能为空');
    if (!item.failureMode) throw new Error('失效模式不能为空');
    this.validateRange(item.severity || 1, 1, 10, '严重度S');
    this.validateRange(item.occurrence || 1, 1, 10, '频度O');
    this.validateRange(item.detection || 1, 1, 10, '探测度D');

    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    // 计算 RPN 和 AP
    const rpn = this.calculateRpn(item);
    const ap = this.determineAp(item.severity, item.occurrence, item.detection);

    // 不可变更新
    const fmea = model.modules?.fmea || { items: [], type: 'DFMEA' };
    const items = fmea.items || [];
    const newItem = {
      id: crypto.randomUUID?.() ?? `fmea-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ...item,
      rpn,
      ap,
    };
    const newItems = [...items, newItem];
    const newFmea = { ...fmea, items: newItems };
    const newModules = { ...model.modules, fmea: newFmea };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);

    this.emit(Events.FMEA_ITEM_UPDATED, {
      modelId,
      action: 'add',
      item: newItem,
    });

    return { model: newModel, item: newItem };
  }

  /**
   * 删除 FMEA 条目
   */
  async removeItem(modelId, itemId) {
    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const fmea = model.modules?.fmea || { items: [] };
    const items = fmea.items || [];
    const newItems = items.filter(i => i.id !== itemId);

    if (newItems.length === items.length) {
      throw new Error(`未找到 FMEA 条目 ${itemId}`);
    }

    // 不可变更新
    const newFmea = { ...fmea, items: newItems };
    const newModules = { ...model.modules, fmea: newFmea };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);

    this.emit(Events.FMEA_ITEM_UPDATED, {
      modelId,
      action: 'remove',
      itemId,
    });

    return newModel;
  }

  /**
   * 更新 FMEA 条目
   */
  async updateItem(modelId, itemId, updates) {
    // 校验 S/O/D
    if (updates.severity !== undefined) {
      this.validateRange(updates.severity, 1, 10, '严重度S');
    }
    if (updates.occurrence !== undefined) {
      this.validateRange(updates.occurrence, 1, 10, '频度O');
    }
    if (updates.detection !== undefined) {
      this.validateRange(updates.detection, 1, 10, '探测度D');
    }

    const model = await this.getModel(modelId);
    if (!model) throw new Error(`未找到型号 ${modelId}`);

    const fmea = model.modules?.fmea || { items: [] };
    const items = fmea.items || [];
    const itemIndex = items.findIndex(i => i.id === itemId);

    if (itemIndex < 0) {
      throw new Error(`未找到 FMEA 条目 ${itemId}`);
    }

    // 合并更新并重新计算 RPN 和 AP
    const updatedItem = { ...items[itemIndex], ...updates };
    updatedItem.rpn = this.calculateRpn(updatedItem);
    updatedItem.ap = this.determineAp(updatedItem.severity, updatedItem.occurrence, updatedItem.detection);

    // 不可变更新
    const newItems = [...items];
    newItems[itemIndex] = updatedItem;
    const newFmea = { ...fmea, items: newItems };
    const newModules = { ...model.modules, fmea: newFmea };
    const newModel = { ...model, modules: newModules };

    await this.saveModel(newModel);

    this.emit(Events.FMEA_ITEM_UPDATED, {
      modelId,
      action: 'update',
      item: updatedItem,
    });

    return { model: newModel, item: updatedItem };
  }

  /**
   * 计算 RPN = S × O × D
   */
  calculateRpn(item) {
    const s = item.severity || 1;
    const o = item.occurrence || 1;
    const d = item.detection || 1;
    return s * o * d;
  }

  /**
   * 确定 AP 等级（严重度、频度、探测度组合）
   */
  determineAp(severity, occurrence, detection) {
    const s = severity || 1;
    const o = occurrence || 1;
    const d = detection || 1;

    // 高优先级：S≥7 且 (O≥4 或 D≥7)
    if (s >= 7 && (o >= 4 || d >= 7)) {
      return 'H';
    }
    // 中优先级：S≥4 且 (O≥4 或 D≥4)
    if (s >= 4 && (o >= 4 || d >= 4)) {
      return 'M';
    }
    // 低优先级
    return 'L';
  }
}
