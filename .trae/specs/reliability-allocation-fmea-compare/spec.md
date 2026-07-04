# 可靠性分配增强与 FMEA 比对 - PRD

## Overview
- **Summary**: 增强可靠性分配模块，添加失效率显示列；优化 FMEA 评分弹窗位置；添加 S/O/D 帮助提示；实现可靠性分配结果与 FMEA 主观失效率的比对功能。
- **Purpose**: 用户希望在可靠性分配中看到失效率，并与 FMEA 中的主观评估进行对比验证。
- **Target Users**: 可靠性工程师、测试工程师

## Goals
- [x] 可靠性分配表格增加失效率列（λ = ln(10/9)/B10）
- [x] FMEA S/O/D 列标题添加帮助问号，点击显示评分标准说明
- [x] FMEA 评分弹窗位置优化，避免出现在视口外
- [x] 可靠性分配完成后，与 FMEA 中主观选定的失效率进行比对

## Non-Goals (Out of Scope)
- 不修改其他模块的逻辑
- 不改变 FMEA 的评分标准

## Background & Context
当前可靠性分配只显示分配的 B10 寿命，用户希望看到对应的失效率。FMEA 的 S/O/D 评分标准对新用户不清晰，需要帮助提示。评分弹窗位置有时超出视口。用户希望验证分配结果是否与 FMEA 中的主观评估一致。

## Functional Requirements
- **FR-1**: 可靠性分配表格新增"失效率 λ(10⁻⁶/h)"列，根据分配的 B10 计算
- **FR-2**: FMEA S/O/D 列标题添加帮助问号图标，点击弹出评分标准说明
- **FR-3**: FMEA 评分弹窗位置优化，当超出视口时自动调整位置
- **FR-4**: 可靠性分配完成后，自动从 FMEA 获取各子系统的主观失效率估算，显示比对结果
- **FR-5**: 比对结果显示差异百分比和一致性评价

## Non-Functional Requirements
- **NFR-1**: 向后兼容，旧数据不影响功能
- **NFR-2**: 比对功能在 FMEA 无数据时不报错

## Constraints
- **Technical**: 保持现有代码风格
- **Dependencies**: FMEA 和可靠性分配数据都在同一个 model 中

## Assumptions
- FMEA 中的失效模式按子系统归类，可通过名称匹配
- 失效率计算：λ = ln(10/9) / B10 ≈ 0.10536 / B10

## Acceptance Criteria

### AC-1: 可靠性分配显示失效率
- **Given**: 在可靠性分配页面输入数据并计算
- **When**: 查看分配结果表格
- **Then**: 显示"失效率 λ(10⁻⁶/h)"列，数值 = 0.10536 / B10 × 10⁶
- **Verification**: `programmatic`

### AC-2: S/O/D 帮助问号
- **Given**: 在 FMEA 页面查看表格
- **When**: 将鼠标悬停在 S/O/D 列标题的问号上
- **Then**: 显示评分标准说明 tooltip
- **Verification**: `human-judgment`

### AC-3: 评分弹窗位置优化
- **Given**: 在 FMEA 页面点击 S/O/D 输入框
- **When**: 输入框靠近页面顶部或底部
- **Then**: 弹窗自动调整位置，完整显示在视口内
- **Verification**: `human-judgment`

### AC-4: 可靠性分配与 FMEA 比对
- **Given**: FMEA 中有子系统的失效模式数据
- **When**: 完成可靠性分配计算
- **Then**: 显示比对面板，包含分配失效率、FMEA 主观失效率、差异百分比、一致性评价
- **Verification**: `human-judgment`

### AC-5: 比对数据匹配
- **Given**: FMEA 中有"行星齿轮箱"的失效模式
- **When**: 可靠性分配中有同名子系统
- **Then**: 自动匹配并显示比对结果
- **Verification**: `programmatic`

## Open Questions
- [x] FMEA 中如何获取主观失效率？（通过 RPN 和严重度估算：λ ≈ RPN × 基准值）
