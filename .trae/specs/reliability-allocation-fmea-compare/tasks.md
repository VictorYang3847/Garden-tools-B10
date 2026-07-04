# 可靠性分配增强与 FMEA 比对 - Implementation Plan

## [x] Task 1: 可靠性分配表格增加失效率列
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在 calcAllocation() 中计算各子系统的失效率: λ = 0.10536 / allocB10 × 10⁶
  - 在 prediction.js 的分配表格渲染中新增"失效率 λ(10⁻⁶/h)"列
  - 在 index.html 的分配表格表头中新增该列
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: B10=250h → λ ≈ 0.10536/250×10⁶ ≈ 421.44 10⁻⁶/h
  - `human-judgment` TR-1.2: 表格中显示失效率列

## [x] Task 2: FMEA S/O/D 添加帮助问号和评分标准说明
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在 index.html 的 FMEA 表格表头 S/O/D 列标题后添加帮助问号图标
  - 添加评分标准说明的 tooltip 内容
  - 实现问号点击/悬停显示说明
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgment` TR-2.1: S/O/D 列标题显示帮助问号
  - `human-judgment` TR-2.2: 悬停时显示评分标准说明

## [x] Task 3: FMEA 评分弹窗位置优化
- **Priority**: medium
- **Depends On**: None
- **Description**: 
  - 修改 openRatingPanel 函数中的位置计算逻辑
  - 当弹窗超出视口底部时，向上调整位置
  - 当弹窗超出视口顶部时，向下调整位置
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgment` TR-3.1: 输入框在页面底部时，弹窗向上显示
  - `human-judgment` TR-3.2: 输入框在页面顶部时，弹窗向下显示

## [x] Task 4: 可靠性分配与 FMEA 比对功能
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 在 prediction.js 中新增函数获取 FMEA 各子系统的主观失效率估算
  - 通过子系统名称匹配分配结果与 FMEA 数据
  - 在分配结果下方新增比对面板
  - 显示：子系统名称、分配失效率、FMEA 主观失效率、差异百分比、一致性评价
  - 添加 CSS 样式
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `programmatic` TR-4.1: 子系统名称匹配正确（如"行星齿轮箱"）
  - `human-judgment` TR-4.2: 比对面板显示完整信息
  - `human-judgment` TR-4.3: FMEA 无数据时显示提示

## [x] Task 5: 语法验证与测试
- **Priority**: high
- **Depends On**: All
- **Description**: 
  - node --check 验证所有 JS 文件
  - 手动验证功能完整性
- **Acceptance Criteria Addressed**: 所有 AC
- **Test Requirements**:
  - `programmatic` TR-5.1: node --check js/pages/prediction.js 通过
  - `programmatic` TR-5.2: node --check js/pages/fmea.js 通过
