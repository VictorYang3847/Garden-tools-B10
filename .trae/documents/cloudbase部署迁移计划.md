# CloudBase 部署迁移计划

> 从 Cloudflare 迁移到腾讯云 CloudBase（含自动部署）

---

## 零、常见问题解答

### Q1: Cloudflare 之前没部署成功，有影响吗？

**完全没有影响。**

CloudBase 是腾讯云的独立平台，和 Cloudflare 没有任何依赖关系。你的项目本质上就是：
- **前端**：一堆静态文件（HTML/CSS/JS）
- **后端**：一段 Node.js 代码（原来的 Worker）

我们只是把这两部分从「Cloudflare 平台」搬到「CloudBase 平台」，代码逻辑基本不变。Cloudflare 那边不管成功失败，都不影响这次迁移。

---

### Q2: 能像 GitHub + Cloudflare 那样自动更新吗？

**可以！** 我推荐用 **GitHub Actions** 实现自动部署，体验和你之前的 Cloudflare 自动部署几乎一样：

```
你 push 代码到 GitHub
    ↓
GitHub Actions 自动触发
    ↓
自动部署前端到 CloudBase 静态托管
自动部署云函数到 CloudBase
    ↓
网站自动更新 ✅
```

**为什么选 GitHub Actions 而不是 CloudBase 自带的 Git 部署？**
- 更灵活，可以自定义部署流程
- 和你现有的 GitHub 工作流完全契合
- 可以加 lint、测试等步骤
- 配置一次，永久生效

---

### Q3: 哪些需要我手动操作？哪些你能帮我做？

| 分类 | 操作内容 | 谁来做 | 原因 |
|------|---------|--------|------|
| 🔴 **必须你操作** | 安装 CloudBase CLI | **你** | 需要本地 npm 环境 |
| 🔴 **必须你操作** | 登录 CloudBase 授权 | **你** | 需要扫码/微信授权，我没法替你登录 |
| 🔴 **必须你操作** | 控制台开通服务 | **你** | 静态托管、云函数、数据库需要手动点开通 |
| 🔴 **必须你操作** | 配置环境变量密钥 | **你** | JWT_SECRET 等敏感信息，我不能碰 |
| 🔴 **必须你操作** | 功能测试验证 | **你** | 注册账号、体验功能、确认没问题 |
| 🟢 **我来做** | 改写云函数代码 | **我** | 从 Worker 改写为云函数格式 |
| 🟢 **我来做** | 前端 API 地址适配 | **我** | 修改 index.html 配置 |
| 🟢 **我来做** | 创建 cloudbase 目录结构 | **我** | 项目配置文件、目录组织 |
| 🟢 **我来做** | 编写 GitHub Actions 脚本 | **我** | 自动部署配置文件 |
| 🟢 **我来做** | 提供详细操作步骤 | **我** | 每一步都给你写清楚 |

---

## 一、现状分析

### 1.1 技术栈对比

| 组件 | Cloudflare 方案 | CloudBase 替代方案 |
|------|----------------|-------------------|
| 前端托管 | Cloudflare Pages | CloudBase 静态网站托管 |
| 后端 API | Cloudflare Worker | CloudBase 云函数 |
| 数据存储 | Cloudflare KV | CloudBase 云数据库（MongoDB 兼容） |
| 自动部署 | Cloudflare + GitHub | GitHub Actions + CloudBase CLI |
| 环境 ID | - | `reliability-tool-d8erocv8e9979b2` |

### 1.2 项目结构

```
B10_Tool_For_Gardening_Tools/
├── index.html          # 前端入口
├── css/                # 样式文件
├── js/                 # 前端 JS 模块
│   ├── auth.js         # 用户认证（调用后端 API）
│   ├── sync.js         # 数据同步（调用后端 API）
│   ├── db.js           # 本地 IndexedDB
│   └── pages/          # 各功能模块
├── worker/             # Cloudflare Worker 后端（原）
│   ├── index.js
│   └── wrangler.toml
├── cloudbase/          # CloudBase 后端（新增）
│   └── functions/
│       └── api/
│           ├── index.js    # 云函数入口
│           └── package.json
├── .github/
│   └── workflows/
│       └── deploy.yml  # GitHub Actions 自动部署（新增）
└── cloudbaserc.json    # CloudBase 项目配置（新增）
```

### 1.3 后端 API 接口（保持不变）

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/auth/register` | POST | 用户注册 |
| `/api/auth/login` | POST | 用户登录，返回 JWT |
| `/api/data` | GET | 获取用户数据 |
| `/api/data` | PUT | 保存用户数据 |
| `/api/versions` | GET | 获取版本历史列表 |

---

## 二、迁移步骤总览

```
第一阶段：准备工作（你操作）
  步骤 1：安装 CloudBase CLI 并登录
  步骤 2：控制台开通服务（静态托管/云函数/数据库）
  步骤 3：创建数据库集合

第二阶段：代码改造（我操作）
  步骤 4：创建云函数（后端 API）
  步骤 5：前端 API 地址适配
  步骤 6：编写 GitHub Actions 自动部署脚本

第三阶段：首次部署（配合操作）
  步骤 7：部署静态网站
  步骤 8：部署云函数
  步骤 9：配置 HTTP 访问路径
  步骤 10：配置环境变量（JWT_SECRET）

第四阶段：自动部署配置（你操作）
  步骤 11：配置 GitHub Secrets
  步骤 12：测试自动部署

第五阶段：验证
  步骤 13：功能验证
```

---

## 三、详细步骤

### 第一阶段：准备工作（你操作）

---

#### 步骤 1：安装 CloudBase CLI 并登录

**你需要做的：**

1. 打开 PowerShell，执行：
```powershell
# 安装 CloudBase CLI
npm install -g @cloudbase/cli

# 验证安装
tcb --version
```

2. 登录（会打开浏览器，用微信或腾讯云账号扫码）：
```powershell
tcb login
```

3. 验证登录成功，能看到你的环境：
```powershell
tcb env list
```

**预期结果：**
- 列表中出现 `reliability-tool-d8erocv8e9979b2`

---

#### 步骤 2：控制台开通服务

**你需要做的：**

1. 打开 [腾讯云 CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 选择环境 `reliability-tool`
3. 分别开通以下服务（点几下鼠标的事）：

| 服务 | 位置 | 操作 |
|------|------|------|
| 静态网站托管 | 左侧菜单「静态网站托管」 | 点击「开通」，按默认配置即可 |
| 云函数 | 左侧菜单「云函数」 | 点击「新建/开通」，按默认配置即可 |
| 云数据库 | 左侧菜单「数据库」 | 点击「开通」，按默认配置即可 |

> 💡 体验版这些服务都是免费开通的，放心点。

---

#### 步骤 3：创建数据库集合

**方法一：控制台创建（推荐，简单直观）**

1. 进入 CloudBase 控制台 → 「数据库」
2. 点击「新建集合」
3. 依次创建以下 3 个集合：
   - `users`（用户表）
   - `user_data`（用户数据）
   - `versions`（版本历史）

**方法二：CLI 创建**

```powershell
tcb db collection create users -e reliability-tool-d8erocv8e997777
tcb db collection create user_data -e reliability-tool-d8erocv8e997777
tcb db collection create versions -e reliability-tool-d8erocv8e997777
```

---

### 第二阶段：代码改造（我操作）

---

#### 步骤 4：创建云函数（后端 API）

**我来做：**

1. 新建目录结构：
```
cloudbase/
└── functions/
    └── api/
        ├── index.js       # 云函数入口
        └── package.json   # 云函数依赖
```

2. 把原来的 Cloudflare Worker 代码改写为 CloudBase 云函数格式：

| Cloudflare Worker | CloudBase 云函数 |
|------------------|-----------------|
| `export default { async fetch(request, env, ctx) }` | `exports.main = async (event, context) => { }` |
| 从 `request` 取数据 | 从 `event` 取数据（`event.httpMethod`, `event.path`, `event.body`） |
| KV 存储操作 | 云数据库集合操作（MongoDB 风格） |
| `env.JWT_SECRET` | `process.env.JWT_SECRET` |

3. 数据库操作改造：
   - `RELIABILITY_KV.get(key)` → `db.collection('xxx').where(...).get()`
   - `RELIABILITY_KV.put(key, value)` → `db.collection('xxx').add(...)` 或 `.update()`

4. 创建项目配置文件 `cloudbaserc.json`

---

#### 步骤 5：前端 API 地址适配

**我来做：**

修改 `index.html`，在 `<head>` 中添加：
```html
<script>
  // CloudBase 云函数 HTTP 访问地址
  window.__API_BASE_URL__ = 'https://reliability-tool-d8erocv8e9979b2.service.tcloudbase.com/api';
</script>
```

> 说明：`js/auth.js` 和 `js/sync.js` 已经支持 `window.__API_BASE_URL__` 注入，**无需修改**。

---

#### 步骤 6：编写 GitHub Actions 自动部署脚本

**我来做：**

创建 `.github/workflows/deploy.yml`，实现：
- push 到 `main` 分支时自动触发
- 自动部署前端静态文件
- 自动部署云函数
- 使用 GitHub Secrets 存储 CloudBase 密钥（安全）

---

### 第三阶段：首次部署（配合操作）

---

#### 步骤 7：部署静态网站

**我给你命令，你执行：**

```powershell
# 进入项目目录
cd B10_Tool_For_Gardening_Tools

# 部署静态网站（上传当前目录所有文件）
tcb hosting deploy . -e reliability-tool-d8erocv8e997777

# 查看访问地址
tcb hosting detail -e reliability-tool-d8erocv8e997777
```

**预期结果：**
- 获得一个静态网站访问地址，类似 `https://reliability-tool-xxx.tcloudbaseapp.com`
- 浏览器打开可以看到网站首页

---

#### 步骤 8：部署云函数

**我给你命令，你执行：**

```powershell
# 部署 api 云函数
tcb fn deploy api -e reliability-tool-d8erocv8e997777

# 查看函数列表
tcb fn list -e reliability-tool-d8erocv8e997777
```

---

#### 步骤 9：配置 HTTP 访问路径

**你需要在控制台操作：**

1. 进入 CloudBase 控制台 → 「云函数」
2. 找到 `api` 函数，点击进入
3. 找到「函数配置」或「触发方式」
4. 开启「HTTP 访问服务」
5. 设置触发路径为 `/api`
6. 保存后，你会得到一个 HTTP 访问地址，格式类似：
   ```
   https://reliability-tool-d8erocv8e9979b2.service.tcloudbase.com/api
   ```

7. **把这个地址告诉我**，我来更新 `index.html` 里的 `window.__API_BASE_URL__`

> 💡 这一步很重要，前端就是通过这个地址调用后端 API 的。

---

#### 步骤 10：配置环境变量（JWT_SECRET）

**你需要在控制台操作（敏感信息，我不能碰）：**

1. 进入 CloudBase 控制台 → 「云函数」→ 「api」函数
2. 找到「函数配置」→ 「环境变量」
3. 添加环境变量：
   - 变量名：`JWT_SECRET`
   - 变量值：**你自己设一个随机字符串**（越复杂越好，比如 `myReliabilityTool2024!SecretKey`）
4. 保存

> ⚠️ 这个密钥用于签名 JWT，很重要，不要泄露，不要用默认值。

---

### 第四阶段：自动部署配置（你操作）

---

#### 步骤 11：配置 GitHub Secrets

**你需要做的：**

1. 生成 CloudBase 登录密钥（用于 CI/CD 自动登录）：
```powershell
tcb login --apiKeyId --apiKey
```
执行后会生成 `TCB_API_KEY_ID` 和 `TCB_API_KEY`，保存好。

2. 打开你的 GitHub 仓库页面：
   - 进入「Settings」→ 「Secrets and variables」→ 「Actions」
   - 点击「New repository secret」
   - 添加以下 3 个 Secrets：

| Secret 名称 | 值 |
|-------------|-----|
| `TCB_ENV_ID` | `reliability-tool-d8erocv8e9979b2` |
| `TCB_API_KEY_ID` | 上一步生成的 API Key ID |
| `TCB_API_KEY` | 上一步生成的 API Key |

---

#### 步骤 12：测试自动部署

**你需要做的：**

1. 把我改好的代码 push 到 GitHub 的 `main` 分支
2. 打开 GitHub 仓库的「Actions」页面
3. 观察工作流是否自动启动并成功完成
4. 如果成功，访问网站确认已更新

---

### 第五阶段：验证

---

#### 步骤 13：功能验证

**验证清单（你一步步测）：**

- [ ] 静态网站可以正常访问
- [ ] 首页和各模块页面可以正常加载（点侧边栏每个菜单都看看）
- [ ] 点击「登录同步」按钮，弹窗正常显示
- [ ] 注册一个新账号，提示注册成功
- [ ] 登录成功，右上角状态变为已登录
- [ ] 随便修改一些数据（比如在 FMEA 里加几行）
- [ ] 刷新页面，数据还在（说明本地存储正常）
- [ ] 换个浏览器登录同一个账号，数据能同步过来（说明云同步正常）
- [ ] 版本历史可以正常查看

---

## 四、代码改造清单

### 4.1 新增文件

| 文件路径 | 说明 | 谁来做 |
|----------|------|--------|
| `cloudbase/functions/api/index.js` | 云函数入口（改写自 worker/index.js） | 我 |
| `cloudbase/functions/api/package.json` | 云函数依赖声明 | 我 |
| `cloudbaserc.json` | CloudBase 项目配置 | 我 |
| `.github/workflows/deploy.yml` | GitHub Actions 自动部署脚本 | 我 |

### 4.2 修改文件

| 文件路径 | 修改内容 | 谁来做 |
|----------|----------|--------|
| `index.html` | 添加 `window.__API_BASE_URL__` 配置 | 我 |

### 4.3 无需修改的文件

以下文件已支持 `window.__API_BASE_URL__` 注入，无需改动：
- `js/auth.js`
- `js/sync.js`

---

## 五、注意事项

### 5.1 体验版限制

CloudBase 体验版有以下限制（了解即可，前期够用）：
- 云函数每月有免费调用额度
- 数据库容量有限制（2GB）
- 静态托管流量有限制（5GB/月）
- 云函数长时间不访问会冷启动（第一次打开可能慢几秒）

**建议：** 先在体验版上跑通，确认没问题，后续根据使用量再考虑升级。

### 5.2 跨域问题

云函数代码中已设置 `Access-Control-Allow-Origin: *`，理论上不会有跨域问题。如果遇到，我们再调。

### 5.3 数据迁移

**目前 Cloudflare KV 里有数据吗？**
- 如果没有 → 直接跳过，不用管
- 如果有 → 告诉我，我再加一个数据迁移步骤

### 5.4 自定义域名（可选）

如果想绑自己的域名（比如 `reliability.example.com`），可以在 CloudBase 控制台的「静态网站托管」→「自定义域名」里配置。这是可选项，先用默认域名也行。

---

## 六、回滚方案

如果迁移后出现问题，随时可以回滚：
1. 前端还是可以部署回 Cloudflare Pages（原来的代码都在）
2. 数据存在本地 IndexedDB，不会丢
3. 大不了改回 `window.__API_BASE_URL__` 就行

风险很低，放心搞。

---

## 七、下一步

1. **你先做第一阶段**：安装 CLI、登录、控制台开通服务、创建集合
2. **做完告诉我**，我开始第二阶段的代码改造
3. 然后一步步配合部署

你觉得这个方案可以吗？如果没问题，你就从步骤 1 开始做，有任何问题随时问我。
