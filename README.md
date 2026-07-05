# 可靠性工具平台 (Reliability Tool Platform)

综合性可靠性工程分析工具平台，覆盖产品全生命周期的可靠性分析需求。

## 十大核心模块

| 模块 | 功能 |
|------|------|
| **FMEA** | DFMEA/PFMEA、S/O/D评分、RPN自动计算、Action Priority、措施跟踪 |
| **可靠性预测** | 10种元器件、MIL-HDBK-217失效率计算、串/并联系统、MTBF预测 |
| **寿命数据分析** | Weibull/指数/对数正态分布、RRX/RRY/MLE、B10/B50、概率图/CDF图 |
| **测试计划** | 样本量计算、ALT加速寿命(Arrhenius/Coffin-Manson)、HALT记录 |
| **故障树分析** | AND/OR/表决门、最小割集、顶事件概率、结构重要度、图形化 |
| **可靠性增长** | Duane模型、Crow-AMSAA模型、增长曲线、目标评估 |
| **维护可用性** | 可用度A/Av/Ao、备件预测、维护策略优化 |
| **降额裕度** | 4类应力降额、Ⅰ/Ⅱ/Ⅲ级标准、热/电气裕度分析 |
| **环境适应** | 温度循环、振动分析、环境应力映射、试验标准库 |
| **数据管理** | 项目/产品/型号管理、导入导出、报告生成、版本快照 |

## 数据架构

```
项目 (Project)
 └── 产品线 (Product)
      └── 型号 (Model)
           ├── FMEA 数据
           ├── 可靠性预测数据
           ├── 寿命分析数据
           ├── 测试计划数据
           ├── 故障树数据
           ├── 增长分析数据
           ├── 维护可用度数据
           ├── 降额分析数据
           ├── 环境分析数据
           └── 数据管理（版本快照）
```

- 三级数据组织：项目 → 产品线 → 型号
- **本地存储**：IndexedDB（主存储），localStorage 兼容备份
- **云端同步**：用户登录后自动同步，支持版本快照（最多保留 20 个版本）
- 支持 JSON 导出 / 导入（跨设备备份）
- 支持 CSV 导入导出（FMEA、寿命数据等）

## 技术栈

- **前端**：原生 HTML / CSS / JavaScript (ES Modules)，无构建步骤
- **路由**：Hash 路由 + 动态模块加载
- **本地存储**：IndexedDB（`js/db.js`），支持旧版 localStorage 数据迁移
- **后端 API**：腾讯云 CloudBase 云函数（`cloudbase/functions/api/`）
  - 用户认证：PBKDF2 密码哈希 + JWT 令牌
  - 数据同步：CloudBase 数据库
- **备用后端**：Cloudflare Worker（`worker/`），使用 Cloudflare KV 存储
  - 注意：当前前端默认连接 CloudBase，Worker 为备用方案
- **部署**：腾讯云 CloudBase 静态托管 + GitHub Actions CI

## 安全配置（重要）

部署前必须配置以下环境变量：

### CloudBase 云函数
在腾讯云 CloudBase 控制台为 `api` 函数设置环境变量：
```
JWT_SECRET=<至少32位的随机字符串>
```

### Cloudflare Worker（如启用）
```bash
wrangler secret put JWT_SECRET
```

> ⚠️ 未配置 `JWT_SECRET` 时，后端将拒绝启动并返回 503 错误。切勿使用代码中的默认值。

## 本地运行

```bash
npx serve .
# 访问 http://localhost:3000
```

> 需 HTTP 服务（ES Module），不能直接双击 `index.html`。

## 部署

### CloudBase 静态托管
```bash
tcb hosting deploy ./ --envId reliability-tool-d8erocv8e9979b2
```

### CloudBase 云函数
```bash
tcb fn deploy api --envId reliability-tool-d8erocv8e9979b2
```

### Cloudflare Worker（可选）
```bash
cd worker
wrangler deploy
```

## 项目结构

```
├── index.html              # 入口页面（内联模板）
├── css/styles.css          # 全局样式
├── js/
│   ├── app.js              # 应用初始化
│   ├── router.js           # Hash 路由
│   ├── db.js               # IndexedDB 封装
│   ├── store.js            # 状态管理
│   ├── api.js              # API 客户端
│   ├── auth.js             # 认证逻辑
│   ├── sync.js             # 云端同步
│   ├── utils.js            # 工具函数
│   └── pages/              # 页面模块（按需加载）
├── cloudbase/
│   └── functions/api/      # CloudBase 云函数
├── worker/                 # Cloudflare Worker（备用后端）
└── .github/workflows/      # CI/CD
```

## 版本历史

- **v3.0**：全面升级为可靠性工具平台，10 大模块，CloudBase 云端同步
- **v2.2**：B10 工具 Phase 3（结果分析 + Weibull 图表）
- **v2.1**：B10 工具 Phase 2（测试规划）
- **v2.0**：B10 工具 Phase 1（三页框架 + 项目/多型号）
- **v1.0**：单页 B10 计算器

## License

Internal use.
