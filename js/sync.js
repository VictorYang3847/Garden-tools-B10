/**
 * 云同步管理器
 * 负责与 Cloudflare Worker 后端同步用户数据
 * - 防抖推送（2 秒）
 * - 拉取云端数据
 * - Last-Write-Wins 冲突处理
 * - 离线检测 + 自动重试
 */

import { getToken } from './auth.js?v=1.0.3';
import { apiUrl } from './api.js?v=1.0.3';

// 同步状态常量
export const SyncStatus = {
  IDLE: 'idle',       // 空闲（未登录或无变更）
  SYNCING: 'syncing', // 同步中
  SUCCESS: 'success', // 已同步
  ERROR: 'error',     // 同步失败
  OFFLINE: 'offline', // 离线
};

/**
 * 同步管理器类
 */
export class SyncManager {
  constructor() {
    this.status = SyncStatus.IDLE;
    this.statusCallbacks = [];
    this.pushTimer = null;
    this.pushDebounceMs = 2000;
    this.lastPushedState = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.pendingPush = null; // 离线时挂起的推送数据

    this._bindNetworkEvents();
  }

  /**
   * 绑定 online/offline 事件
   */
  _bindNetworkEvents() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => {
      this.isOnline = true;
      // 联网后，如果有挂起的推送，立即补推
      if (this.pendingPush) {
        const pending = this.pendingPush;
        this.pendingPush = null;
        this.pushData(pending, true);
      } else {
        this._setStatus(SyncStatus.IDLE);
      }
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this._setStatus(SyncStatus.OFFLINE);
    });
    // 初始化时根据当前状态设置
    if (!this.isOnline) {
      this._setStatus(SyncStatus.OFFLINE);
    }
  }

  /**
   * 注册状态变化回调
   * @param {(status: string) => void} cb
   */
  onStatusChange(cb) {
    if (typeof cb === 'function') this.statusCallbacks.push(cb);
  }

  _setStatus(newStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.statusCallbacks.forEach((cb) => {
      try {
        cb(newStatus);
      } catch (e) {
        console.error('同步状态回调异常:', e);
      }
    });
  }

  getStatus() {
    return this.status;
  }

  /**
   * 防抖推送数据到云端
   * @param {object} state 完整状态数据
   * @param {boolean} immediate 是否立即推送（跳过防抖）
   */
  pushData(state, immediate = false) {
    // 未登录则不推送
    // 注意：这里不 await getToken，避免防抖逻辑变复杂
    // 实际推送时再检查 token
    if (!this.isOnline) {
      this.pendingPush = state;
      this._setStatus(SyncStatus.OFFLINE);
      return;
    }

    // 清除已有定时器
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }

    const doPush = async () => {
      await this._doPushData(state);
    };

    if (immediate) {
      doPush();
    } else {
      this.pushTimer = setTimeout(doPush, this.pushDebounceMs);
    }
  }

  /**
   * 实际执行推送
   * @param {object} state
   */
  async _doPushData(state) {
    const token = await getToken();
    if (!token) {
      // 未登录，不推送
      this._setStatus(SyncStatus.IDLE);
      return;
    }
    if (!this.isOnline) {
      this.pendingPush = state;
      this._setStatus(SyncStatus.OFFLINE);
      return;
    }

    this._setStatus(SyncStatus.SYNCING);

    try {
      const res = await fetch(apiUrl('/api/data'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ data: state }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `推送失败 (${res.status})`);
      }

      this.lastPushedState = state;
      this.retryCount = 0;
      this._setStatus(SyncStatus.SUCCESS);
    } catch (err) {
      console.error('云同步推送失败:', err);
      // 指数退避重试
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = 1000 * Math.pow(2, this.retryCount - 1); // 1s, 2s, 4s
        setTimeout(() => this._doPushData(state), delay);
      } else {
        this.retryCount = 0;
        this._setStatus(SyncStatus.ERROR);
      }
    }
  }

  /**
   * 拉取云端数据
   * @returns {Promise<{data: object, updatedAt: number}|null>}
   */
  async pullData() {
    const token = await getToken();
    if (!token) return null;

    if (!this.isOnline) {
      this._setStatus(SyncStatus.OFFLINE);
      return null;
    }

    this._setStatus(SyncStatus.SYNCING);

    try {
      const res = await fetch(apiUrl('/api/data'), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `拉取失败 (${res.status})`);
      }

      const result = await res.json();
      this._setStatus(SyncStatus.SUCCESS);
      return result; // { data, updatedAt } 或 { data: null }
    } catch (err) {
      console.error('云同步拉取失败:', err);
      this._setStatus(SyncStatus.ERROR);
      return null;
    }
  }

  /**
   * 登录后同步：比较本地与云端，Last-Write-Wins
   * @param {object} localState 本地当前 state
   * @returns {Promise<{newState: object, merged: 'local'|'cloud'|'pushed'}>}
   *   - merged='local': 保留本地，无需变更
   *   - merged='cloud': 用云端覆盖本地，调用方需刷新 UI
   *   - merged='pushed': 本地推送到云端
   */
  async syncOnLogin(localState) {
    const cloud = await this.pullData();
    if (!cloud) {
      // 拉取失败（离线或未登录），保留本地
      return { newState: localState, merged: 'local' };
    }

    const localUpdatedAt = localState?.updatedAt || 0;
    const cloudUpdatedAt = cloud.updatedAt || 0;
    const cloudData = cloud.data;

    // 云端为空 → 推送本地
    if (!cloudData) {
      await this._doPushData(localState);
      return { newState: localState, merged: 'pushed' };
    }

    // 本地较新或相等 → 推送本地
    if (localUpdatedAt >= cloudUpdatedAt) {
      await this._doPushData(localState);
      return { newState: localState, merged: 'pushed' };
    }

    // 云端较新 → 用云端覆盖本地
    this.lastPushedState = cloudData;
    return { newState: cloudData, merged: 'cloud' };
  }

  /**
   * 获取版本历史列表
   * @returns {Promise<Array>}
   */
  async getVersions() {
    const token = await getToken();
    if (!token) return [];

    try {
      const res = await fetch(apiUrl('/api/versions'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const result = await res.json();
      return result.versions || [];
    } catch {
      return [];
    }
  }
}

// 单例
let syncManagerInstance = null;

/**
 * 获取 SyncManager 单例
 * @returns {SyncManager}
 */
export function getSyncManager() {
  if (!syncManagerInstance) {
    syncManagerInstance = new SyncManager();
  }
  return syncManagerInstance;
}
