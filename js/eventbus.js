/**
 * 轻量事件总线，用于模块间解耦通信
 */
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(fn);
      if (set.size === 0) this._listeners.delete(event);
    }
  }

  emit(event, data) {
    const set = this._listeners.get(event);
    if (set) {
      set.forEach(fn => {
        try { fn(data); } catch (e) { console.warn(`EventBus [${event}] 监听器错误:`, e); }
      });
    }
  }

  clear() {
    this._listeners.clear();
  }
}

export const eventBus = new EventBus();

export const Events = {
  // 首页
  HOME_B10_CHANGED: 'home:b10-changed',
  // 预测
  PREDICTION_TARGET_CHANGED: 'prediction:target-changed',
  PREDICTION_COMPONENT_UPDATED: 'prediction:component-updated',
  // FMEA
  FMEA_ITEM_UPDATED: 'fmea:item-updated',
  // 通用
  MODEL_SAVED: 'model:saved',
  MODULE_CHANGED: 'module:changed',
};
