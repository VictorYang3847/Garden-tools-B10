# B10 Tool for Gardening Tools

园林电动工具 B10 可靠性分析工具（绿篱机 · 锂电）。

## 三阶段工作流

| 页面 | 状态 | 功能 |
|------|------|------|
| **产品定义** | ✅ Phase 1 | 计算区 / 记录区分离；定义测试标准与目标 B10 |
| **测试规划** | 🔜 Phase 2 | 样本量、截尾方式、试验时长（当前为预览骨架） |
| **结果分析** | 🔜 Phase 3 | Weibull 拟合、按零件/失效模式分析、图表 |

## 数据模型

```
项目 (Project)
 └── 型号 A (Model)
 │     ├── 产品记录（电压、刀片规格…）
 │     ├── 产品定义 / 测试标准（计算相关）
 │     ├── 测试规划
 │     └── 试验结果
 └── 型号 B …
```

- 一个项目可包含多个型号
- 数据保存在浏览器 `localStorage`
- 支持 JSON 导出 / 导入（跨设备备份）

## 本地运行

```bash
npx serve .
# 访问 http://localhost:3000
```

> 需 HTTP 服务（ES Module），不能直接双击 `index.html`。

## GitHub Pages

Settings → Pages → Branch: `main` → `/ (root)`

访问：https://VictorYang3847.github.io/B10_Tool_For_Gardening_Tools/

## 版本

- **v1**：单页 B10 计算器
- **v2.0 (Phase 1)**：三页框架 + 项目/多型号 + 产品定义双区布局
- **v2.1 (Phase 2)**：测试规划
- **v2.2 (Phase 3)**：结果分析 + Weibull 图表

## License

Internal use.
