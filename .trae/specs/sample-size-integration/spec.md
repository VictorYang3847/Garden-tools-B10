# 样本量计算器整合到测试计划 - PRD

## Overview
- **Summary**: 将独立的样本量计算器模块整合到测试计划模块中，作为制定测试计划前的分析工具。保留合格性验证功能，按照测试计划的 Weibull 逻辑重写寿命测定模块。
- **Purpose**: 用户反馈样本量计算器的寿命测定功能不好，且应作为测试计划的前置分析工具，而非独立模块。
- **Target Users**: 可靠性工程师、测试工程师

## Goals
- [x] 将样本量计算器整合到测试计划模块中，作为"样本量分析"Tab
- [x] 保留合格性验证（适合寿命无关件）
- [x] 按照测试计划逻辑重写寿命测定（Weibull分布、试验时间倍率）
- [x] 移除独立的样本量计算器路由和页面

## Non-Goals (Out of Scope)
- 不修改其他模块的逻辑
- 不改变测试计划主界面的试验项目明细

## Background & Context
当前样本量计算器的寿命测定使用正态近似公式，与测试计划的 Weibull 逻辑不一致。用户希望在制定测试计划前，先通过样本量分析工具确定合适的样本量和试验时长组合。

## Functional Requirements
- **FR-1**: 在测试计划模块中新增"样本量分析"Tab，包含合格性验证和寿命测定两个子面板
- **FR-2**: 合格性验证保持原有二项分布逻辑，适合寿命无关件（如开关、连接器）
- **FR-3**: 寿命测定重写为 Weibull 分布逻辑，与测试计划一致
- **FR-4**: 寿命测定支持输入 B10 目标、β、置信度、允许失效数、试验时间倍率
- **FR-5**: 寿命测定显示样本量、试验时长、总台时，并提供不同倍率的优化对比
- **FR-6**: 移除独立的样本量计算器路由

## Non-Functional Requirements
- **NFR-1**: 向后兼容，旧的样本量计算器数据不影响其他模块
- **NFR-2**: 分析结果可直接参考用于创建测试计划

## Constraints
- **Technical**: 保持现有代码风格，不引入新框架
- **Dependencies**: 复用 test-plan.js 中的 binomialSampleSize 和 calculateTestDuration 函数

## Assumptions
- 用户先使用样本量分析工具确定参数，再创建测试计划
- 合格性验证用于定性检验（如开关通断试验），寿命测定用于定量寿命试验

## Acceptance Criteria

### AC-1: 样本量分析 Tab 存在
- **Given**: 打开测试计划页面
- **When**: 查看 Tab 栏
- **Then**: 看到"样本量分析"Tab
- **Verification**: `human-judgment`

### AC-2: 合格性验证功能正常
- **Given**: 在样本量分析中选择合格性验证
- **When**: 输入可靠度、置信度、允许失效数
- **Then**: 显示正确的样本量和通过概率
- **Verification**: `programmatic`

### AC-3: 寿命测定使用 Weibull 逻辑
- **Given**: 在样本量分析中选择寿命测定
- **When**: 输入 B10=150h, β=2.2, γ=90%, r=0, 倍率=1.0
- **Then**: 样本量=22（与测试计划一致）
- **Verification**: `programmatic`

### AC-4: 寿命测定支持不同倍率
- **Given**: 在寿命测定中输入不同试验时间倍率
- **When**: 输入倍率=2.0
- **Then**: 样本量显著减少（约5-6台）
- **Verification**: `programmatic`

### AC-5: 独立样本量计算器路由移除
- **Given**: 在导航栏查看
- **When**: 寻找样本量计算器入口
- **Then**: 不再显示独立入口
- **Verification**: `human-judgment`

## Open Questions
- [x] 是否保留独立的样本量计算器页面？（建议移除，避免重复）
