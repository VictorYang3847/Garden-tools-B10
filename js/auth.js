/**
 * 用户认证模块
 * 提供注册/登录/登出/JWT 管理 + 登录注册 UI 弹窗
 */
import { getAuth, setAuth, clearAuth } from './db.js?v=1.0.2';
import { apiUrl } from './api.js?v=1.0.2';

// ====== 核心 API ======

/**
 * 注册新用户
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean}>}
 * @throws {Error} 含 message 字段
 */
export async function register(email, password) {
  const res = await fetch(apiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || '注册失败');
  }
  return { success: true };
}

/**
 * 用户登录
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{token, userId, email}>}
 * @throws {Error}
 */
export async function login(email, password) {
  const res = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || '登录失败');
  }
  // 持久化登录态到 IndexedDB
  await setAuth({
    token: data.token,
    userId: data.userId,
    email: data.email,
    loginAt: Date.now(),
  });
  return { token: data.token, userId: data.userId, email: data.email };
}

/**
 * 登出，清除登录态
 */
export async function logout() {
  await clearAuth();
}

/**
 * 获取 JWT，过期返回 null
 * @returns {Promise<string|null>}
 */
export async function getToken() {
  const auth = await getAuth();
  if (!auth || !auth.token) return null;
  // 检查过期：解析 JWT payload
  try {
    const parts = auth.token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      // 已过期，清除
      await clearAuth();
      return null;
    }
    return auth.token;
  } catch {
    return null;
  }
}

/**
 * 是否已登录
 * @returns {Promise<boolean>}
 */
export async function isLoggedIn() {
  const token = await getToken();
  return !!token;
}

/**
 * 获取当前登录用户信息
 * @returns {Promise<{userId, email}|null>}
 */
export async function getCurrentUser() {
  const auth = await getAuth();
  if (!auth || !auth.token) return null;
  // 复用 getToken 的过期检查
  const token = await getToken();
  if (!token) return null;
  return { userId: auth.userId, email: auth.email };
}

// ====== 登录/注册 UI 弹窗 ======

let authChangeCallbacks = [];

/**
 * 注册登录状态变化回调
 * @param {(loggedIn: boolean, user: {userId, email}|null) => void} cb
 */
export function onAuthChange(cb) {
  if (typeof cb === 'function') authChangeCallbacks.push(cb);
}

function notifyAuthChange(loggedIn, user) {
  authChangeCallbacks.forEach((cb) => {
    try {
      cb(loggedIn, user);
    } catch (e) {
      console.error('onAuthChange 回调异常:', e);
    }
  });
}

let currentMode = 'login'; // 'login' 或 'register'

/**
 * 初始化认证 UI：绑定顶栏按钮、弹窗事件
 */
export function initAuthUI() {
  const loginBtn = document.getElementById('login-btn');
  const modal = document.getElementById('auth-modal');
  const closeBtn = document.getElementById('auth-close');
  const form = document.getElementById('auth-form');
  const tabs = document.querySelectorAll('.auth-tab');
  const passwordConfirm = document.getElementById('auth-password-confirm');
  const submitBtn = document.getElementById('auth-submit');

  if (loginBtn) {
    loginBtn.addEventListener('click', () => openAuthModal('login'));
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAuthModal);
  }
  if (modal) {
    // 点击遮罩关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAuthModal();
    });
  }

  // Tab 切换
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.tab;
      switchMode(mode);
    });
  });

  // 表单提交
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSubmit();
    });
  }

  // 初始化时检查登录态，更新 UI
  checkInitialAuthState();
}

async function checkInitialAuthState() {
  const user = await getCurrentUser();
  notifyAuthChange(!!user, user);
}

function switchMode(mode) {
  currentMode = mode;
  const tabs = document.querySelectorAll('.auth-tab');
  const passwordConfirm = document.getElementById('auth-password-confirm');
  const submitBtn = document.getElementById('auth-submit');
  tabs.forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === mode);
  });
  if (mode === 'register') {
    if (passwordConfirm) passwordConfirm.hidden = false;
    if (submitBtn) submitBtn.textContent = '注册';
  } else {
    if (passwordConfirm) passwordConfirm.hidden = true;
    if (submitBtn) submitBtn.textContent = '登录';
  }
  hideError();
}

function openAuthModal(mode) {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.hidden = false;
  switchMode(mode || 'login');
  // 清空表单
  const form = document.getElementById('auth-form');
  if (form) form.reset();
  hideError();
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.hidden = true;
}

function showError(msg) {
  const errEl = document.getElementById('auth-error');
  if (errEl) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }
}

function hideError() {
  const errEl = document.getElementById('auth-error');
  if (errEl) {
    errEl.textContent = '';
    errEl.hidden = true;
  }
}

async function handleSubmit() {
  const email = document.getElementById('auth-email')?.value?.trim();
  const password = document.getElementById('auth-password')?.value;
  const passwordConfirm = document.getElementById('auth-password-confirm')?.value;
  const submitBtn = document.getElementById('auth-submit');

  if (!email || !password) {
    showError('请填写邮箱和密码');
    return;
  }
  if (password.length < 8) {
    showError('密码至少 8 位');
    return;
  }

  if (currentMode === 'register') {
    if (password !== passwordConfirm) {
      showError('两次密码不一致');
      return;
    }
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = currentMode === 'register' ? '注册中...' : '登录中...';
  }
  hideError();

  try {
    if (currentMode === 'register') {
      await register(email, password);
      // 注册成功后自动登录
      await login(email, password);
    } else {
      await login(email, password);
    }
    closeAuthModal();
    const user = await getCurrentUser();
    notifyAuthChange(true, user);
  } catch (err) {
    let msg = err.message || '操作失败';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      msg = '无法连接服务器，请检查网络';
    }
    showError(msg);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = currentMode === 'register' ? '注册' : '登录';
    }
  }
}

/**
 * 退出登录（供外部调用，含 UI 通知）
 */
export async function handleLogout() {
  await logout();
  notifyAuthChange(false, null);
}
