# 测试计划模块优化：Weibull样本量计算 + 智能优化

## 摘要

优化测试计划模块的样本量计算逻辑，从纯二项分布改为支持 Weibull 分布，利用"延长试验时间减少样本量"的工程方法降低测试成本，同时增加部件/整机分级考量。

## 现状分析

### 当前样本量计算逻辑（test-plan.js）
- `calculateSampleSize()`：统一用二项分布公式 `P(≤r失效|n,R) ≤ 1-γ`
- R=90%, γ=90%, r=0 → n=22；r=1 → n=38；r=2 → n=52
- 二项分布只看"失效/不失效"，忽略了**时间信息**
- `calculateTestDuration()`：简单乘系数（定时1.2x，定数1.3x，完全1.5x），与样本量无关联

### 现有的 Weibull 工具
- `calculator.js`：已有 `weibullEta()`, `weibullCdf()`, `weibullBn()` 等函数
- `calculator-distributions.js`：已有完整的 Weibull 拟合（RRX/MLE）
- `sample-size.js`：样本量计算器，有"合格性验证"和"寿命测定"两个 Tab

### 核心问题
1. **样本量过大**：二项分布不考虑时间维度，22台×200h=4400台时，成本高
2. **未利用 Weibull 特性**：β>1 时失效集中在后期，延长试验时间可显著减少样本量
3. **部件/整机不分**：部件级可小样本长时间，整机级可大样本短时间，应分类

## 关键数学原理

### Weibull 分布下的样本量-时间折算

二项分布的问题：只看"在目标寿命时刻是否失效"，忽略了 Weibull 分布的时间特征。

**核心公式**：Weibull 可靠度 `R(t) = exp(-(t/η)^β)`

在试验时间 T_test 运行到 T_test 时刻不失效的概率为 `R(T_test) = exp(-(T_test/η)^β)`。

如果真实 B10 寿命 = B10_target，则 η = B10_target / (-ln(0.9))^(1/β)，代入得：

`R(T_test) = exp(-(-ln(0.9)) × (T_test / B10_target)^β)`

当 T_test > B10_target 时，R(T_test) < 0.9，等价于在更低的可靠度水平上做二项检验，需要的样本量更少。

**样本量公式（Weibull + 延长试验时间）**：

```
R_test = exp(-(-ln(0.9)) × (T_test / B10_target)^β)   // 试验时间对应的等效可靠度
n = f(R_test, γ, r)   // 基于等效可靠度 R_test 的二项样本量
```

### 示例：R=90%, γ=90%, r=0, β=2.2, B10_target=150h

| 试验时间 | T_test/B10 | 等效可靠度 R_test | 样本量 n | 总台时 |
|---------|-----------|-----------------|---------|-------|
| 150h (1.0×B10) | 1.0 | 90.0% | 22 | 3,300 |
| 180h (1.2×B10) | 1.2 | 85.6% | 15 | 2,700 |
| 210h (1.4×B10) | 1.4 | 80.4% | 11 | 2,310 |
| 255h (1.7×B10) | 1.7 | 72.5% | 8 | 2,040 |
| 300h (2.0×B10) | 2.0 | 64.2% | 6 | 1,800 |

**结论**：延长试验时间到 1.7×B10（255h），样本量从 22 降到 8，总台时从 3300 降到 2040，节省 38%。

### 部件 vs 整机考量

| 维度 | 部件级 | 整机级 |
|------|--------|--------|
| 样本量 | 少（3~8台） | 多（5~15台） |
| 试验时间 | 长（2~3×B10） | 短（1.0~1.5×B10） |
| 原因 | 单台便宜，台架多 | 整机昂贵，台架有限 |
| β参考 | 按部件特性（轴承1.5~2, 齿轮2~3） | 按整机综合（1.5~2.5） |

## 修改计划

### 1. 重构 `calculateSampleSize()` 函数（test-plan.js）

**新增参数**：`targetB10`, `beta`, `testDuration`
**新增逻辑**：
```
function calculateSampleSize(reliability, confidence, allowedFailures, targetB10, beta, testDuration) {
  // 如果有 targetB10 + beta + testDuration，用 Weibull 折算
  if (targetB10 > 0 && beta > 0 && testDuration > 0) {
    // 计算试验时间对应的等效可靠度
    const K10 = Math.log(10/9);
    const R_test = Math.exp(-K10 * Math.pow(testDuration / targetB10, beta));
    // 用等效可靠度代入二项分布
    return binomialSampleSize(R_test, confidence, allowedFailures);
  }
  // 否则用原始二项分布（兼容旧逻辑）
  return binomialSampleSize(reliability, confidence, allowedFailures);
}
```

### 2. 测试项数据结构扩展

当前 `createNewTestItem()` 的字段：
- name, targetLife, targetReliability, sampleSize, testDuration, censorType, benchCondition

**新增字段**：
- `testLevel`: "component" | "system"（部件级/整机级，默认 "system"）
- `beta`: Weibull 形状参数（默认 2.2，部件级可选预设值）
- `targetB10`: 目标B10寿命（= targetLife，用于 Weibull 折算）

**新增全局参数**：
- `defaultBeta`: 默认 Weibull β 值（默认 2.2）
- `testDurationStrategy`: "standard" | "optimized" | "custom"（标准/优化/自定义）

### 3. 新增"智能优化"面板（HTML + JS）

在试验项目明细卡片中添加「智能优化」区域：

**优化策略选择**：
- 标准方案：试验时间 = 1.0~1.2×B10，样本量大
- 优化方案（推荐）：根据 β 和测试级别自动选择最佳时间/样本量配比
- 自定义：用户手动调整试验时间，自动计算对应样本量

**优化结果展示**：
- 对比表格：标准方案 vs 优化方案（样本量、试验时间、总台时）
- 节省比例显示
- 推荐参数说明

**部件/整机预设**：
- 部件级：β 可选常见值（轴承1.8、齿轮2.5、开关2.0、电池1.5），试验时间建议 2.0~3.0×B10
- 整机级：β 综合取 1.8~2.5，试验时间建议 1.0~1.5×B10

### 4. 修改 test-plan.js 的渲染和事件逻辑

**renderTestItems()**：
- 表格增加"测试级别"列（部件/整机）和"β"列
- 样本量列显示优化标记（如果用了 Weibull 折算，显示 📐 图标）

**全局参数区**：
- 增加"默认形状参数 β"输入
- 增加"优化策略"选择

**计算逻辑**：
- 修改 change 事件中 targetLife/targetReliability/censorType 变化时的重算逻辑
- 添加 beta/testDuration/testLevel 变化时的重算逻辑
- `calculateAllTestItems()` 自动应用优化策略

**calculateTestDuration() 重构**：
```javascript
function calculateTestDuration(targetB10, censorType, beta, testLevel, strategy) {
  if (strategy === "optimized") {
    // 部件级：2.0~2.5×B10
    // 整机级：1.2~1.5×B10
    const multiplier = testLevel === "component" ? 2.2 : 1.3;
    return Math.ceil(targetB10 * multiplier);
  }
  // 标准方案：保持原有逻辑
  const multipliers = { time: 1.2, failure: 1.3, complete: 1.5 };
  return Math.ceil(targetB10 * (multipliers[censorType] || 1.2));
}
```

### 5. 修改 index.html 的 test-plan-template

**全局参数区新增**：
- "默认形状参数 β" 输入框（number, 默认2.2）
- "优化策略" 下拉框（标准方案/优化方案/自定义）

**试验项目表新增列**：
- "测试级别" 下拉（部件/整机）
- "β" 数字输入

**智能优化面板**（新卡片，在试验项目明细卡片下方）：
- 标题："智能优化方案对比"
- 内容：当前方案的优化对比（标准 vs 优化）
- 每行显示：测试项名称 | 标准样本量 | 优化样本量 | 节省比例 | 优化试验时间

### 6. 添加 CSS 样式

- `.tp-optimize-badge`：优化标记样式
- `.tp-compare-table`：对比表格样式
- `.tp-save-highlight`：节省比例高亮样式

### 7. 数据向后兼容

- `testLevel` 默认 "system"（旧数据无此字段）
- `beta` 默认从全局参数取
- `targetB10` = `targetLife`（已有字段）
- 旧的 `calculateSampleSize(R, γ, r)` 三参数调用仍兼容

## 涉及文件

| 文件 | 修改内容 |
|------|---------|
| `js/pages/test-plan.js` | 重构 calculateSampleSize、calculateTestDuration、渲染/事件逻辑 |
| `index.html` | test-plan-template 增加全局参数、表格列、优化面板 |
| `css/styles.css` | 优化面板和对比表格样式 |

## 验证步骤

1. **Weibull 折算验证**：R=90%, γ=90%, r=0, β=2.2, B10=150h
   - 1.0×B10 → n=22（与纯二项一致）
   - 2.0×B10 → n≈6（显著减少）
2. **部件/整机分级**：部件级默认试验时间 2.2×B10，整机级 1.3×B10
3. **向后兼容**：旧数据无 beta/testLevel 字段时正常显示
4. **语法检查**：`node --check js/pages/test-plan.js` 通过
