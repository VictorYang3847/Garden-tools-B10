# 测试计划策略优化与表格布局修复 - PRD

## Overview
- **Summary**: 修复测试计划模块中优化策略选项无效的问题，添加自定义试验时间倍率功能，并优化表格布局使页面横向完整显示无需滚动。
- **Purpose**: 用户反馈优化策略（标准/Weibull优化/自定义）选择后没区别，且页面横向需要拖动使用，影响体验。
- **Target Users**: 可靠性工程师、测试工程师

## Goals
- [x] 修复自定义策略无效问题，支持用户自定义试验时间倍率
- [x] 在试验项目明细中添加"试验时间倍率"输入框
- [x] 优化表格布局，使页面在1920px屏幕下无需横向滚动

## Non-Goals (Out of Scope)
- 不修改其他模块的布局
- 不改变现有的 Weibull 折算逻辑

## Background & Context
当前 `calculateTestDuration` 函数只处理了 `standard` 和 `optimized` 两种策略，`custom` 策略没有实现，导致选择后和标准策略一样。表格 `min-width: 1300px` 加上11列的固定宽度，总宽度超过正常屏幕宽度。

## Functional Requirements
- **FR-1**: 每个测试项支持自定义试验时间倍率输入（当策略为 custom 时显示）
- **FR-2**: `custom` 策略下，试验时间 = targetLife × 自定义倍率
- **FR-3**: 表格布局优化，减少列宽度，1920px屏幕下无需横向滚动

## Non-Functional Requirements
- **NFR-1**: 向后兼容，旧数据没有倍率字段时不报错
- **NFR-2**: 策略切换时自动更新所有测试项的试验时间和样本量

## Constraints
- **Technical**: 保持现有代码风格，不引入新框架
- **Dependencies**: 依赖现有的 `calculateSampleSize` 和 `calculateTestDuration` 函数

## Assumptions
- 用户使用的屏幕宽度至少为 1366px（主流笔记本屏幕）
- 自定义倍率范围为 0.5~5.0（0.5×B10 ~ 5.0×B10）

## Acceptance Criteria

### AC-1: 自定义策略支持自定义倍率
- **Given**: 全局策略设置为"自定义"
- **When**: 在试验项目明细中输入试验时间倍率（如2.0）
- **Then**: 试验时长 = 目标寿命 × 倍率，样本量根据新时长重新计算
- **Verification**: `programmatic`

### AC-2: 标准策略使用截尾系数
- **Given**: 全局策略设置为"标准"
- **When**: 选择截尾类型（定时/定数/完全）
- **Then**: 试验时长 = 目标寿命 × 对应系数（1.2/1.3/1.5）
- **Verification**: `programmatic`

### AC-3: Weibull优化策略自动选择倍率
- **Given**: 全局策略设置为"Weibull优化"
- **When**: 选择测试级别（部件/整机）
- **Then**: 部件级倍率2.2，整机级倍率1.3
- **Verification**: `programmatic`

### AC-4: 页面横向完整显示
- **Given**: 在1920px宽度屏幕上打开测试计划页面
- **When**: 查看试验项目明细表格
- **Then**: 表格完整显示在视口中，无需横向滚动
- **Verification**: `human-judgment`

## Open Questions
- [x] 自定义倍率的默认值应该是多少？（建议使用标准策略的倍率）
