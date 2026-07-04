# 可靠性工具平台优化（第三阶段）- Implementation Plan

## [x] Task 1: FMEA 评分辅助弹窗
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 在 FMEA 表格中，点击 S/O/D 评分单元格时弹出评分标准面板
  - 三个评分标准各一套：
    - 严重度(S)：1~10分，从"无影响"到"危及安全/法规"
    - 发生度(O)：1~10分，从"几乎不可能"到"几乎必然发生"
    - 探测度(D)：1~10分，从"肯定能探测到"到"完全无法探测"
  - 面板中点击某个分数，自动填入表格对应单元格
  - 点击面板外部或关闭按钮，关闭面板
  - 面板位置：在点击的单元格旁边弹出（避免遮挡）
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-10
- **Test Requirements**:
  - `programmatic` TR-1.1: 点击S列单元格弹出评分面板
  - `programmatic` TR-1.2: 点击面板中的分数自动填入表格
  - `programmatic` TR-1.3: 点击面板外区域关闭面板
  - `programmatic` TR-1.4: S/O/D三个评分各自有对应的评分标准
  - `human-judgement` TR-1.5: 评分标准描述专业准确，符合行业惯例
  - `human-judgement` TR-1.6: 弹窗样式与深色主题一致
- **Notes**: 提升FMEA打分的一致性和专业性

## [x] Task 2: 可靠性预计 - 元器件库
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 在可靠性预测模块的"元器件清单"Tab旁边，增加"元器件库"面板
  - 或者在添加元器件行时，显示元器件库供选择
  - 内置元器件数据（分类）：
    - 电子类：碳膜电阻、陶瓷电容、电解电容、IC芯片、MOS管、二极管、LED
    - 机械类：滚珠轴承、齿轮(渗碳淬火)、弹簧、密封圈
    - 机电类：微动开关、继电器、连接器、无刷电机
  - 每个元器件包含：名称、类别、基础失效率(FIT)、备注
  - 功能：
    - 分类Tab切换（全部/电子/机械/机电）
    - 搜索框实时过滤
    - 点击元器件添加到BOM表（自动填充名称和基础失效率）
    - "添加自定义元器件"按钮
  - 元器件库数据存储在 localStorage，用户自定义的可以保存
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-5, AC-10
- **Test Requirements**:
  - `programmatic` TR-2.1: 有元器件库面板/按钮
  - `programmatic` TR-2.2: 内置至少15种元器件，分3类
  - `programmatic` TR-2.3: 点击元器件可添加到BOM表
  - `programmatic` TR-2.4: 搜索功能正常，实时过滤
  - `human-judgement` TR-2.5: 元器件库布局清晰，使用方便
- **Notes**: 提升可靠性预计的输入效率

## [x] Task 3: 可靠性增长 - 改进措施库
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 在可靠性增长模块中，增加"改进措施库"功能
  - 内置常见失效模式的改进措施：
    - 齿轮磨损类：
      - 齿轮渗碳淬火提升硬度（寿命提升3~5倍）
      - 换高温合成润滑脂（寿命提升1.5~2倍）
      - 增加迷宫密封防尘（寿命提升1.3~1.8倍）
      - 齿廓修形降低接触应力（寿命提升1.2~1.5倍）
    - 电机轴承类：
      - 换双面密封轴承（寿命提升2~3倍）
      - 优化装配同轴度（寿命提升1.2~1.5倍）
      - 选用高速润滑脂（寿命提升1.2倍）
    - 开关触点类：
      - 换银镍合金触点（寿命提升5倍以上）
      - 增加硅胶防尘罩（寿命提升1.5~2倍）
      - 电流降额使用（寿命提升1.5倍）
    - 锂电池类：
      - 放电倍率从1C降额至0.8C（寿命提升1.3~1.5倍）
      - BMS收窄充放电截止电压（寿命提升1.2倍）
      - 电芯间增加散热间隙（寿命提升1.1~1.3倍）
    - PCB/电子类：
      - PCB喷涂三防漆（寿命提升1.5~2倍）
      - 功率器件降额50%（寿命提升2倍以上）
      - 增加散热片降低结温（寿命提升1.5~2倍）
  - 功能：
    - 在添加改进措施时，显示"从措施库选择"按钮
    - 点击后弹出措施库面板，分类展示
    - 点击某个措施，自动添加到当前轮次的改进措施列表
    - 支持搜索筛选
    - 支持添加自定义措施到库中
- **Acceptance Criteria Addressed**: AC-6, AC-7, AC-10
- **Test Requirements**:
  - `programmatic` TR-3.1: 有改进措施库入口
  - `programmatic` TR-3.2: 内置至少15条改进措施，分5类
  - `programmatic` TR-3.3: 点击措施可添加到当前轮次
  - `human-judgement` TR-3.4: 措施描述专业，预期提升幅度合理
  - `human-judgement` TR-3.5: 界面清晰，操作流畅
- **Notes**: 把行业经验沉淀到工具里，帮助新人快速上手

## [x] Task 4: 全局帮助提示系统
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 为关键参数添加"?"帮助图标
  - 鼠标悬停显示 tooltip（延迟200ms显示）
  - 点击图标也可显示/隐藏
  - tooltip样式：深色背景、白色文字、小箭头、圆角
  - 需要添加帮助提示的地方：

    **可靠性分配Tab**：
    - 复杂度评分旁
    - 成熟度(反)评分旁
    - 环境严酷度评分旁
    - 任务占比评分旁

    **寿命分析**：
    - 形状参数β旁
    - 特征寿命η旁
    - 置信度旁
    - 右删失/失效数据类型旁

    **样本量计算器**：
    - 目标可靠度旁
    - 置信度旁
    - 允许失效数旁
    - 目标精度旁

    **测试计划**：
    - 截尾方式旁
    - 加速模型旁
    - ALT应力水平旁

  - 实现方式：
    - 给需要帮助的label后面加 `<span class="help-icon" title="...">?</span>`
    - CSS实现tooltip效果（用::after伪元素 + attr()）
    - 统一的 .help-icon 样式
- **Acceptance Criteria Addressed**: AC-8, AC-9, AC-10
- **Test Requirements**:
  - `programmatic` TR-4.1: 关键参数旁有"?"帮助图标
  - `programmatic` TR-4.2: 悬停显示tooltip说明
  - `human-judgement` TR-4.3: tooltip样式统一美观
  - `human-judgement` TR-4.4: 帮助说明清晰准确
  - `human-judgement` TR-4.5: 不影响正常操作
- **Notes**: 降低学习成本，提升易用性

## [ ] Task 5: 整体验证
- **Priority**: high
- **Depends On**: Task 1-4
- **Description**:
  - 全流程测试所有新增功能
  - 检查JS语法错误
  - 检查样式一致性
  - 确保不破坏现有功能
  - 数据兼容性测试
- **Acceptance Criteria Addressed**: AC-10
- **Test Requirements**:
  - `programmatic` TR-5.1: 所有修改的JS文件语法检查通过
  - `programmatic` TR-5.2: 各模块切换无报错
  - `programmatic` TR-5.3: 现有功能不受影响
  - `human-judgement` TR-5.4: 整体风格统一
- **Notes**: 最后做整体验证
