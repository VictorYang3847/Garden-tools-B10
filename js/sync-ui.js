/**
 * 同步状态 UI 模块
 * 在顶栏显示同步状态指示器（已同步/同步中/失败/离线）
 * 由 app.js 调用 initSyncUI(syncManager) 初始化
 */

import { SyncStatus } from './sync.js?v=1.4.1';
import { hasCloudApi } from './api.js?v=1.4.1';

const STATUS_CONFIG = {
  [SyncStatus.IDLE]: { icon: '○', text: '本地', color: '#94a3b8', title: '本地存储（未登录云端）' },
  [SyncStatus.SYNCING]: { icon: '⟳', text: '同步中', color: '#38bdf8', title: '正在同步到云端', spin: true },
  [SyncStatus.SUCCESS]: { icon: '✓', text: '已同步', color: '#4ade80', title: '云端已同步' },
  [SyncStatus.ERROR]: { icon: '⚠', text: '同步失败', color: '#f87171', title: '同步失败，点击重试' },
  [SyncStatus.OFFLINE]: { icon: '○', text: '离线', color: '#94a3b8', title: '网络离线，仅本地存储' },
};

/**
 * 初始化同步状态 UI
 * @param {object} syncManager SyncManager 实例（可能为 null，未登录时）
 */
export function initSyncUI(syncManager) {
  const indicator = document.getElementById('sync-indicator');
  const textEl = document.getElementById('sync-text');
  const statusEl = document.getElementById('sync-status');
  const authArea = document.getElementById('auth-area');

  // 未配置云端 API：隐藏同步状态和登录按钮，仅本地存储
  if (!hasCloudApi()) {
    if (statusEl) statusEl.hidden = true;
    if (authArea) authArea.hidden = true;
    return;
  }

  if (!indicator || !textEl) return;

  // 初始状态
  updateSyncIndicator(SyncStatus.IDLE);

  if (!syncManager) {
    // 未登录，仅本地存储
    updateSyncIndicator(SyncStatus.IDLE);
    return;
  }

  // 注册状态变化回调
  syncManager.onStatusChange((status) => {
    updateSyncIndicator(status);
  });

  // 点击错误状态可重试
  if (statusEl) {
    statusEl.style.cursor = 'pointer';
    statusEl.addEventListener('click', () => {
      if (syncManager.getStatus() === SyncStatus.ERROR) {
        // 触发重试：导入 store 的 getState 并推送
        import('./store.js?v=1.4.1').then(({ getState }) => {
          syncManager.pushData(getState(), true);
        });
      }
    });
  }
}

/**
 * 更新同步指示器显示
 * @param {string} status SyncStatus 常量
 */
export function updateSyncIndicator(status) {
  const indicator = document.getElementById('sync-indicator');
  const textEl = document.getElementById('sync-text');
  const statusEl = document.getElementById('sync-status');
  if (!indicator || !textEl) return;

  const config = STATUS_CONFIG[status] || STATUS_CONFIG[SyncStatus.IDLE];

  indicator.textContent = config.icon;
  indicator.style.color = config.color;
  indicator.title = config.title;
  textEl.textContent = config.text;
  textEl.style.color = config.color;
  textEl.title = config.title;

  // 旋转动画
  if (config.spin) {
    indicator.classList.add('sync-spinning');
  } else {
    indicator.classList.remove('sync-spinning');
  }
}
