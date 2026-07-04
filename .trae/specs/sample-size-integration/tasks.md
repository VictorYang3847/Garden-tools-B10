# 样本量计算器整合到测试计划 - Implementation Plan

## [x] Task 1: 在测试计划模块中添加"样本量分析"Tab
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在 test-plan-template 的 Tab 栏中添加"样本量分析"Tab
  - 创建样本量分析面板的 HTML 结构
  - 包含合格性验证和寿命测定两个子面板
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgment` TR-1.1: 测试计划页面显示"样本量分析"Tab
  - `human-judgment` TR-1.2: 点击 Tab 显示分析面板

## [x] Task 2: 实现合格性验证功能
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 复用 sample-size.js 中的二项分布逻辑
  - 支持输入：可靠度、置信度、允许失效数
  - 显示：样本量、通过概率、公式说明
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: R=90%, γ=90%, r=0 → n=22, passProb=90%^22≈11.3%
  - `programmatic` TR-2.2: R=95%, γ=90%, r=1 → n=45

## [x] Task 3: 实现寿命测定功能（Weibull逻辑）
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 按照测试计划逻辑重写寿命测定
  - 支持输入：B10目标、β、置信度、允许失效数、试验时间倍率
  - 使用 Weibull 折算公式：R_test = exp(-K10 × (T/B10)^β)
  - 显示：样本量、试验时长、总台时、优化对比表
- **Acceptance Criteria Addressed**: AC-3, AC-4
- **Test Requirements**:
  - `programmatic` TR-3.1: B10=150h, β=2.2, γ=90%, r=0, 倍率=1.0 → n=22
  - `programmatic` TR-3.2: B10=150h, β=2.2, γ=90%, r=0, 倍率=2.0 → n≈5-6
  - `programmatic` TR-3.3: 优化对比表显示不同倍率的样本量和节省比例

## [x] Task 4: 移除独立样本量计算器路由
- **Priority**: medium
- **Depends On**: Task 3
- **Description**: 
  - 在 router.js 中移除 sample-size 路由
  - 在侧边栏导航中移除样本量计算器入口
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `human-judgment` TR-4.1: 导航栏不再显示独立的样本量计算器入口

## [ ] Task 5: 语法验证与测试
- **Priority**: high
- **Depends On**: Task 4
- **Description**: 
  - node --check 验证所有 JS 文件
  - 手动验证功能完整性
- **Acceptance Criteria Addressed**: 所有 AC
- **Test Requirements**:
  - `programmatic` TR-5.1: node --check js/pages/test-plan.js 通过
  - `programmatic` TR-5.2: node --check js/router.js 通过
