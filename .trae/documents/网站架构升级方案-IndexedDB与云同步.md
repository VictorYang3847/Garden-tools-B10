# 网站架构升级方案：本地 IndexedDB + Cloudflare 云同步

## 摘要

当前网站使用 localStorage 存储数据，存在三大问题：1）刷新后部分数据丢失（onSave 回调未触发 persist）；2）localStorage 5-10MB 容量限制；3）数据无法跨设备同步。本方案将存储架构升级为"IndexedDB 本地主存储 + Cloudflare Workers + KV 云同步"，实现跨设备数据同步和可靠的长期保存。

## 进度状态

### 已完成（3/10）
- ✅ `js/db.js` — IndexedDB 封装（getState/setState/getAuth/setAuth/getSyncMeta/setSyncMeta/migrateFromLocalStorage）
- ✅ `worker/index.js` — Cloudflare Worker 后端（5 个路由：register/login/GET data/PUT data/versions）
- ✅ `worker/wrangler.toml` — Worker 部署配置

### 待实施（7/10）
- ⬜ `js/auth.js` — 用户认证模块
- ⬜ `js/sync.js` — 云同步管理器
- ⬜ `js/store.js` — 核心改造（IndexedDB + 同步触发 + persist bug 修复）
- ⬜ `js/app.js` — 入口改造（异步加载 + 同步初始化 + 修复 saveModel bug）
- ⬜ `js/sync-ui.js` — 同步状态 UI
- ⬜ `index.html` — 顶栏同步状态 + 登录弹窗
- ⬜ `css/styles.css` — 同步状态和登录样式

## 现状分析

### 当前存储架构
- **存储方式**：100% localStorage，key 为 `reliability-tool-data`
- **数据结构**：v3 格式，Project → Product → Model 三级层次，10 个模块数据
- **持久化机制**：store.js 的 `persist()` → `saveState()` → `localStorage.setItem()`
- **已知问题**：
  1. **app.js 第 50-56 行**：`saveModel` 回调只做 `Object.assign(current, modelData)` + `refreshAllSelectors()`，**未调用 persistState()**，导致页面通过 onSave 保存的数据未落盘（这是刷新后数据丢失的直接原因）
  2. `saveState` 的 catch 静默吞掉错误，配额超限时用户无感知
  3. `prediction.js` 第 833/846 行有独立的 localStorage key `COMPONENT_LIBRARY_CUSTOM`；`growth.js` 第 1437/1448 行有 `growth_custom_improvements`，均不参与主 state 导入导出
  4. 无防抖，每次写操作都同步 JSON.stringify 整个 state

### 技术栈
- 前端：原生 HTML/CSS/JS + ES Modules，无框架
- 部署：Cloudflare Pages（静态托管）
- 无 package.json，无构建工具，无后端

### 关键文件结构（已核实）
- `index.html` 第 79-106 行：`<div class="header-right">` 内含 `header-selectors` 和 `header-actions`，同步状态 UI 应插入到 `header-actions` 之前
- `js/store.js` 第 459-473 行：`saveState`/`persist`/`persistState` 三个函数
- `js/app.js` 第 50-56 行：`saveModel` 回调（需修复）
- `js/app.js` 第 39 行：`initApp()` 同步调用，需改为异步

## 架构方案

### 整体架构
```
┌─────────────────────────────────────────────────┐
│                   前端（不变）                     │
│  原生 HTML/CSS/JS + ES Modules                   │
├─────────────────────────────────────────────────┤
│  store.js（改造）                                 │
│  ├── db.js（已完成）IndexedDB 封装 ← 本地主存储   │
│  ├── sync.js（新增）云同步管理器                   │
│  └── auth.js（新增）用户认证                      │
├─────────────────────────────────────────────────┤
│  Cloudflare Workers（已完成）                     │
│  ├── /api/auth/register  用户注册                │
│  ├── /api/auth/login     用户登录（JWT）          │
│  ├── /api/data           GET/PUT 用户数据        │
│  └── /api/versions       版本历史                │
├─────────────────────────────────────────────────┤
│  Cloudflare KV（新增云存储）                      │
│  ├── user:{email}        用户信息+密码哈希        │
│  ├── data:{userId}       用户完整数据 JSON        │
│  └── versions:{userId}   版本快照列表             │
└─────────────────────────────────────────────────┘
```

### 数据流
```
用户输入 → store.js 修改内存 state
         → db.js 写入 IndexedDB（本地立即可靠保存）
         → sync.js 防抖 2 秒后推送到 Cloudflare Workers
         → Workers 写入 KV
         → 返回同步状态（成功/失败指示器）

页面加载 → db.js 从 IndexedDB 读取
         → 如果已登录，sync.js 从云端拉取最新
         → 冲突处理：Last-Write-Wins（比较 updatedAt 时间戳）
         → 更新内存 state，刷新页面
```

### 同步策略
- **本地优先**：所有读写先走 IndexedDB，确保离线可用
- **自动同步**：本地修改后防抖 2 秒自动推送云端
- **登录同步**：登录时拉取云端最新，与本地合并
- **冲突处理**：Last-Write-Wins（最后修改者胜），保留云端版本历史可回滚
- **离线模式**：未登录或网络断开时，仅用 IndexedDB，登录后自动同步

## 详细实施步骤（剩余 7 项）

### Task 4：创建 `js/auth.js` — 用户认证模块

**职责**：封装注册/登录/登出/JWT 管理，提供登录注册 UI 弹窗

**导出 API**：
- `register(email, password)` → `POST /api/auth/register`，返回 `{success}` 或抛错
- `login(email, password)` → `POST /api/auth/login`，返回 `{token, userId, email}`，并调用 `db.setAuth()` 持久化
- `logout()` → 调用 `db.clearAuth()` 清除登录态
- `getToken()` → 从 `db.getAuth()` 读取 JWT，检查 exp 过期则返回 null
- `isLoggedIn()` → `!!getToken()`
- `getCurrentUser()` → 返回 `{userId, email}` 或 null
- `initAuthUI()` → 绑定顶栏登录按钮事件，渲染登录/注册弹窗

**API 基址**：从 `window.location` 推断，或读 `window.__API_BASE_URL__`（部署时注入）；默认 dev 用 `http://localhost:8787`（Worker 本地）

**登录/注册弹窗**：复用现有 modal 样式，含 Tab 切换"登录/注册"，邮箱+密码+确认密码（注册时），提交后调用相应 API，成功后关闭弹窗并触发 `onAuthChange` 回调

**错误处理**：网络错误显示"无法连接服务器"，401 显示"邮箱或密码错误"，409 显示"邮箱已注册"

### Task 5：创建 `js/sync.js` — 云同步管理器

**职责**：管理云端数据推送/拉取，防抖，冲突处理

**`SyncManager` 类**：
- `constructor(apiBase, auth)` — 保存 API 基址和 auth 模块引用
- `pushData(state)` — 防抖 2 秒（用 `setTimeout` + `clearTimeout`），调用 `PUT /api/data`，请求体 `{data: state}`，需带 `Authorization: Bearer <token>`；返回 `{success, updatedAt}` 或 `{error}`
- `pullData()` — 调用 `GET /api/data`，返回 `{data, updatedAt}` 或 null
- `syncOnLogin(localState)` — 拉取云端数据，比较 `updatedAt`：
  - 云端为空 → 推送本地
  - 本地较新（本地 updatedAt ≥ 云端 updatedAt）→ 推送本地
  - 云端较新 → 用云端覆盖本地，返回新 state 供 store.js 更新内存
- `getStatus()` — 返回当前状态：`idle`/`syncing`/`success`/`error`/`offline`
- `onStatusChange(callback)` — 注册状态回调，sync-ui.js 用于更新指示器

**网络检测**：用 `navigator.onLine` + `online`/`offline` 事件，离线时暂停推送，联网后自动补推

**错误重试**：推送失败时指数退避重试 3 次（1s/2s/4s），仍失败则标记为 error 状态

### Task 6：修改 `js/store.js` — 核心改造

**改动点 1：导入 db.js 和 sync.js**
- 顶部新增 `import { getState, setState, migrateFromLocalStorage, getAuth } from './db.js'`
- 顶部新增 `import { SyncManager } from './sync.js'`（动态导入避免循环依赖）
- 创建单例 `let syncManager = null;` 和 `export async function getSyncManager()`

**改动点 2：`loadState()` 改为异步（第 237-280 行）**
- 新增 `export async function loadStateAsync()`：
  1. 调用 `await migrateFromLocalStorage()` 迁移旧 localStorage 数据
  2. `const data = await getState()` 从 IndexedDB 读取
  3. 若 data 存在且 `data.version === 3` → `state = normalizeStateV3(data)`，返回
  4. 若不存在 → 检查 localStorage v1/v2 旧 key，按原迁移逻辑处理，写入 IndexedDB
  5. 都没有 → `state = defaultAppState()`，调用 `await setState(state)` 初始化
- 保留原同步 `loadState()` 作为降级 fallback（IndexedDB 不可用时用 localStorage）

**改动点 3：`saveState()` 改为异步（第 459-465 行）**
- 改为 `async function saveState(s)`：
  1. `s.updatedAt = Date.now()` 添加时间戳
  2. `await setState(s)` 写入 IndexedDB
  3. 触发 `syncManager?.pushData(s)`（防抖推送，不 await）
- 保留同步版本 `saveStateSync()` 用于兼容（直接写 localStorage 作为额外备份）

**改动点 4：`persist()` 改为异步（第 467-469 行）**
- 改为 `async function persist()`：`await saveState(ensureState())`
- 同步包装器 `export function persistState()`：`persist()` 不 await（fire-and-forget），保证现有同步调用兼容

**改动点 5：纳入独立 localStorage key**
- `prediction.js` 的 `COMPONENT_LIBRARY_CUSTOM`：迁到 `state.customComponentLibrary`（数组）
- `growth.js` 的 `growth_custom_improvements`：迁到 `state.customImprovements`（数组）
- 在 `normalizeStateV3` 中初始化这两个字段为 `[]`
- 修改 `prediction.js` 第 833/846 行和 `growth.js` 第 1437/1448 行，改用 store.js 的 getter/setter
- 在 `exportData()`/`importData()` 中包含这两个字段

**改动点 6：新增 `initSync(auth)` 函数**
- 创建 `syncManager = new SyncManager(API_BASE, auth)`
- 返回 syncManager 实例，供 app.js 调用

### Task 7：修改 `js/app.js` — 入口改造

**改动点 1：`initApp()` 改为异步（第 39 行）**
```js
async function initApp() {
  await loadStateAsync(); // 等待 IndexedDB 加载完成
  const auth = await initAuth();
  const sync = await initSync(auth);
  initSelectors();
  initSidebar();
  initImportExport();
  initClearData();
  initRouter({...});
  initGlobalTooltip();
  initSyncUI(sync, auth); // 新增
}
```
- 顶部导入 `loadStateAsync`, `initSync` from store.js，`initAuth`, `initAuthUI` from auth.js，`initSyncUI` from sync-ui.js

**改动点 2：修复 `saveModel` 回调（第 50-56 行）**
```js
saveModel: (modelData) => {
  const current = getCurrentModel();
  if (current && modelData) {
    Object.assign(current, modelData);
    persistState(); // 新增：修复数据不落盘 bug
    refreshAllSelectors();
  }
},
```

**改动点 3：在 `initApp` 末尾添加 `initAuthUI(auth)` 调用**

### Task 8：创建 `js/sync-ui.js` — 同步状态 UI

**职责**：在顶栏显示同步状态，提供登录/用户菜单入口

**导出 API**：
- `initSyncUI(syncManager, auth)` — 初始化同步状态指示器，注册 `syncManager.onStatusChange` 回调
- `updateSyncIndicator(status)` — 根据状态更新图标和文字：
  - `idle`/`offline` → ○ 离线（灰色）
  - `syncing` → ⟳ 同步中（蓝色，旋转动画）
  - `success` → ✓ 已同步（绿色）
  - `error` → ⚠ 同步失败（红色）
- `updateAuthUI(auth)` — 根据登录状态切换：
  - 未登录 → 显示"登录"按钮
  - 已登录 → 显示邮箱 + 下拉菜单（手动同步/退出登录）

**手动同步**：用户点击"手动同步"时调用 `syncManager.syncOnLogin(state)` 并刷新页面

### Task 9：修改 `index.html` — UI 调整

**改动点 1：顶栏添加同步状态区域（第 95 行之前，`header-actions` 之前）**
```html
<div class="sync-status" id="sync-status">
  <span class="sync-indicator" id="sync-indicator" title="本地存储">○</span>
  <span class="sync-text" id="sync-text">本地</span>
</div>
<div class="auth-area" id="auth-area">
  <button type="button" id="login-btn" class="btn-secondary">登录同步</button>
</div>
```

**改动点 2：登录/注册弹窗 HTML（`</body>` 之前）**
```html
<div class="modal-overlay" id="auth-modal" hidden>
  <div class="modal auth-modal">
    <div class="modal-header">
      <div class="auth-tabs">
        <button type="button" class="auth-tab active" data-tab="login">登录</button>
        <button type="button" class="auth-tab" data-tab="register">注册</button>
      </div>
      <button type="button" class="modal-close" id="auth-close">×</button>
    </div>
    <form id="auth-form" class="auth-form">
      <input type="email" id="auth-email" placeholder="邮箱" required />
      <input type="password" id="auth-password" placeholder="密码" required minlength="6" />
      <input type="password" id="auth-password-confirm" placeholder="确认密码" hidden />
      <button type="submit" id="auth-submit" class="btn-primary">登录</button>
      <div class="auth-error" id="auth-error" hidden></div>
    </form>
  </div>
</div>
```

### Task 10：修改 `css/styles.css` — 样式

**新增样式**：
- `.sync-status` — 顶栏同步状态容器，flex 布局，与 `header-actions` 对齐
- `.sync-indicator` — 12px 圆形图标，`syncing` 时 `animation: spin 1s linear infinite`
- `.sync-text` — 12px 文字，颜色随状态变化
- `.auth-area` — 登录按钮容器
- `.auth-modal` — 登录弹窗，宽度 360px，居中
- `.auth-tabs` — Tab 切换栏，flex
- `.auth-tab.active` — 激活 Tab 下划线
- `.auth-form` — 表单垂直布局，input 全宽
- `.auth-error` — 红色错误提示
- `@keyframes spin { to { transform: rotate(360deg); } }` — 同步中旋转动画

## 不修改的部分
- 10 个功能模块页面（fmea、prediction、life-data 等）的业务逻辑不变
- 路由机制不变
- JSON 导入导出功能保留
- 版本快照功能保留
- 默认案例数据不变

## 部署步骤

1. **创建 Cloudflare KV namespace**
   ```bash
   wrangler kv:namespace create RELIABILITY_KV
   ```
   将返回的 `id` 填入 `worker/wrangler.toml`

2. **设置 JWT 密钥（Worker 环境变量）**
   ```bash
   wrangler secret put JWT_SECRET
   ```
   输入一个随机长字符串

3. **部署 Worker**
   ```bash
   cd worker && wrangler deploy
   ```
   记下 Worker URL（如 `https://reliability-tool-api.<account>.workers.dev`）

4. **配置前端 API 基址**
   - 在 `index.html` 的 `<head>` 中添加 `<script>window.__API_BASE_URL__ = 'https://reliability-tool-api.xxx.workers.dev';</script>`
   - 或在 Cloudflare Pages 环境变量中配置

5. **前端部署**：照常推送到 GitHub，Cloudflare Pages 自动构建

## 验证步骤

1. **本地存储验证**：刷新页面后所有数据保留（重点验证 prediction 和 growth 模块）
2. **persist bug 验证**：在任意模块修改数据，刷新后数据仍在（验证 saveModel 修复）
3. **云同步验证**：在设备 A 修改数据，设备 B 登录后能看到最新数据
4. **离线验证**：断网状态下仍可正常使用，联网后自动同步
5. **冲突验证**：两设备同时修改，Last-Write-Wins 生效
6. **容量验证**：大数据量（>5MB）不再丢失
7. **兼容验证**：旧 localStorage 数据自动迁移到 IndexedDB（首次加载时）
8. **导入导出验证**：导出 JSON 包含 customComponentLibrary 和 customImprovements，导入后正常恢复

## 假设与决策

- **后端选型**：Cloudflare Workers + KV（用户已在用 Cloudflare Pages，免费额度足够：KV 每天 10万次读 + 1000次写）
- **认证方式**：JWT + PBKDF2 密码哈希（Web Crypto API），无需第三方 OAuth
- **本地存储选型**：IndexedDB（容量几百 MB，远超 localStorage 的 5-10MB）
- **同步策略**：本地优先 + Last-Write-Wins（简单可靠，适合单人跨设备场景）
- **不引入构建工具**：保持零依赖纯静态项目，Worker 用原生 JS
- **数据合并策略**：整体替换（不做字段级合并），靠版本快照回滚
- **免费额度**：Cloudflare Workers 免费版每天 10万次请求，KV 免费 1GB 存储，对个人使用足够
- **API 基址注入**：通过 `window.__API_BASE_URL__` 全局变量，部署时在 index.html 注入，避免构建工具
- **兼容性**：保留 `loadState()` 同步版本作为 fallback，IndexedDB 不可用时降级到 localStorage
- **循环依赖规避**：sync.js 通过动态导入或参数注入方式引用 auth.js，避免 ES Module 循环依赖

## 风险与缓解

1. **风险**：IndexedDB 在某些隐私模式下被禁用
   - **缓解**：`db.openDB()` 失败时降级到 localStorage，`store.js` 的 `loadState()` 保留同步版本

2. **风险**：Cloudflare Worker 部署失败或配额超限
   - **缓解**：本地 IndexedDB 仍可作为单机版使用，仅失去跨设备同步

3. **风险**：JWT_SECRET 泄露
   - **缓解**：用 `wrangler secret put` 设置，不写入 wrangler.toml，不提交到 Git

4. **风险**：用户忘记密码无法找回
   - **缓解**：本地 IndexedDB 数据始终可用，可导出 JSON 备份；后续可加密码重置功能
