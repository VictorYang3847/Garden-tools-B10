# GitHub Actions 自动部署方案

> push 代码到 GitHub 后，自动部署到 CloudBase 静态网站托管 + 云函数

---

## 一、原理说明

```
你 push 代码到 GitHub main 分支
    ↓
GitHub Actions 自动触发（.github/workflows/deploy.yml）
    ↓
1. 拉取最新代码
2. 安装 CloudBase CLI
3. 安装云函数依赖
4. 部署云函数（api）
5. 部署静态网站（index.html + css/ + js/）
    ↓
CloudBase 自动更新 ✅
```

**和手动部署的区别：**
- 手动：你在本地电脑敲命令
- 自动：GitHub 的服务器帮你敲命令，每次 push 自动执行

---

## 二、当前进展

### 已完成
- ✅ 云函数代码已写好：`cloudbase/functions/api/index.js`
- ✅ 前端 API 地址已配置：`index.html`
- ✅ GitHub Actions 配置文件已创建：`.github/workflows/deploy.yml`
- ✅ 云函数已手动部署成功（验证了代码没问题）
- ✅ HTTP 网关路由已配置

### 待完成
- ⬜ 优化 deploy.yml（解决 .git 目录权限问题）
- ⬜ 配置 GitHub Secrets（CloudBase 登录密钥）
- ⬜ push 代码测试自动部署

---

## 三、GitHub Actions 配置优化

### 为什么之前手动部署会失败？

因为 `.git` 目录里的文件权限特殊，CloudBase CLI 尝试读取时失败。

### GitHub Actions 里怎么解决？

在 Actions 的 Linux 环境里，没有 Windows 的权限问题，而且我们可以**只上传需要的文件**，不上传 `.git`、`worker`、`cloudbase` 等目录。

**优化后的部署策略：**
- 静态网站只上传：`index.html`、`css/`、`js/`
- 云函数单独部署：`cloudbase/functions/api/`

---

## 四、配置步骤

### 步骤 1：优化 deploy.yml（我来做）

更新 `.github/workflows/deploy.yml`，让它：
- 只部署必要的静态文件
- 单独部署云函数
- 更稳定、更快

### 步骤 2：生成 CloudBase API 密钥（你操作）

在本地 PowerShell 执行：
```powershell
tcb login --apiKeyId --apiKey
```

执行后会输出两个值：
- `TCB_API_KEY_ID`
- `TCB_API_KEY`

**把这两个值记下来，等会要填到 GitHub 里。**

### 步骤 3：配置 GitHub Secrets（你操作）

1. 打开你的 GitHub 仓库页面
2. 点击顶部的 **「Settings」**（设置）
3. 左侧菜单找到 **「Secrets and variables」** → 点击 **「Actions」**
4. 点击 **「New repository secret」** 按钮
5. 依次添加以下 3 个 Secrets：

| Secret 名称 | 值 |
|-------------|-----|
| `TCB_ENV_ID` | `reliability-tool-d8erocv8e9979b2` |
| `TCB_API_KEY_ID` | 步骤 2 生成的 API Key ID |
| `TCB_API_KEY` | 步骤 2 生成的 API Key |

### 步骤 4：push 代码触发自动部署（你操作）

把代码 push 到 GitHub 的 `main` 分支：
```powershell
git add .
git commit -m "feat: 添加 CloudBase 部署配置"
git push origin main
```

### 步骤 5：查看部署结果（你操作）

1. 打开 GitHub 仓库页面
2. 点击顶部的 **「Actions」** tab
3. 你会看到一个正在运行的工作流
4. 等它变成绿色 ✅，就说明部署成功了
5. 访问静态网站地址，确认更新了

---

## 五、验证自动部署

部署成功后，你可以做个小测试验证：

1. 随便改点东西（比如把 index.html 里的标题改一下）
2. commit 并 push 到 GitHub
3. 等 1-2 分钟
4. 刷新网站，看变化有没有生效

如果生效了，说明自动部署配置成功！

---

## 六、常见问题

### Q: 每次 push 都会部署吗？
是的，push 到 `main` 分支就会自动部署。如果是其他分支，不会触发。

### Q: 部署失败怎么办？
在 GitHub Actions 页面点击失败的工作流，看日志报错。常见原因：
- Secrets 配置错了
- 云函数代码有语法错误
- 网络问题（重试一下就好）

### Q: 部署需要多长时间？
一般 1-2 分钟，主要看云函数部署和文件上传速度。

### Q: 云函数也会自动更新吗？
是的，每次 push 都会同时部署：
- 静态网站（前端）
- 云函数（后端）

### Q: 能不能只在打 tag 的时候部署？
可以，但现在先简单点，每次 push 到 main 就部署，用熟了再调。

---

## 七、下一步

1. 我先优化 `deploy.yml` 配置
2. 你生成 API 密钥并配置到 GitHub Secrets
3. push 代码测试
4. 验证自动部署是否生效

有问题随时问我！
