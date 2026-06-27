# B10 Tool for Gardening Tools

绿篱机（锂电）B10 寿命计算器 — 内部可靠性分析工具第一版。

## 功能

- **链 A**：根据保修年限、年均使用时间、可接受失效率，反推目标整机 B10（Weibull 模型）
- **链 B**：录入各零件 B10（电池支持循环→等效小时换算），串联合成整机 B10，识别瓶颈
- **链 C**：用合成 B10 反算保修末失效率，验证是否达标

## 本地运行

纯静态页面，无需构建：

```bash
# 方式 1：直接用浏览器打开 index.html

# 方式 2：本地 HTTP 服务（ES Module 需要）
npx serve .
# 或
python -m http.server 8080
```

然后访问 `http://localhost:8080`（或对应端口）。

## GitHub Pages 部署

1. 进入仓库 **Settings → Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `main`，文件夹选 `/ (root)`
4. 保存后等待几分钟，访问 `https://VictorYang3847.github.io/B10_Tool_For_Gardening_Tools/`

## 默认算例

| 参数 | 值 |
|------|-----|
| 保修 | 2 年 × 25 h/年 = 50 h |
| 可接受失效率 | 2% |
| β | 2.0 |
| 安全余量 | 20% |
| 目标 B10 | ≈ 137 h |
| 零件合成（默认零件值） | 80 h（瓶颈：刀片） |

## 技术栈

- HTML / CSS / JavaScript (ES Modules)
- 无第三方依赖

## 版本规划

- **v1**（当前）：绿篱机 · 锂电 · 目标设定 + 零件合成
- **v2**：Weibull 测试数据分析、CSV 导入、多产品支持

## License

Internal use.
