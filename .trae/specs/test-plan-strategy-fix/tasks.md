# 测试计划策略优化与表格布局修复 - Implementation Plan

## [x] Task 1: 实现 custom 策略 + 添加试验时间倍率字段
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在 testItem 数据结构中添加 `durationMultiplier` 字段（自定义倍率）
  - 修改 `calculateTestDuration` 函数，处理 `custom` 策略
  - 修改 `createNewTestItem` 和 `ensureTestPlan` 支持新字段
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3
- **Test Requirements**:
  - `programmatic` TR-1.1: custom策略下试验时间 = targetLife × durationMultiplier
  - `programmatic` TR-1.2: standard策略下使用截尾系数（1.2/1.3/1.5）
  - `programmatic` TR-1.3: optimized策略下部件级2.2×，整机级1.3×

## [x] Task 2: 在试验项目明细表格中添加倍率输入列
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 在 index.html 的试验项目表中添加"时间倍率"列
  - 在 renderTestItems 中渲染倍率输入框
  - 在 bindTestItemsEvents 中添加倍率变化事件处理
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgment` TR-2.1: 表格中显示"时间倍率"输入框
  - `programmatic` TR-2.2: 修改倍率后试验时长和样本量自动更新

## [x] Task 3: 优化表格布局，移除横向滚动
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 减少各列的固定宽度，使用相对宽度或自适应
  - 将表格 min-width 从 1300px 降低到合理值
  - 合并或缩小非关键列（如台架条件）
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgment` TR-3.1: 1920px屏幕下表格完整显示无需横向滚动
  - `human-judgment` TR-3.2: 表格内容清晰可读
