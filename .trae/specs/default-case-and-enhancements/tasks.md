# 默认案例生成与功能增强 - Implementation Plan

## [x] Task 1: 生成默认案例数据（家用锂电绿篱剪）
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 在 store.js 中新增 `createDefaultProject()` 函数
  - 首次打开应用（localStorage为空）自动调用创建默认案例
  - 默认案例包含10个模块的示例数据
  - 数据来源：用户提供的《可靠性工程实用指南》文档
  - 各模块默认数据：
    - FMEA：6条DFMEA记录（齿轮箱/电机/PCB/电池/刀片/开关）
    - 预测：4个子系统 + 整机预计
    - 寿命数据：2个批次（首轮6样本+第二轮6样本）
    - 测试计划：5项DVP&R试验
    - 增长：3轮试验数据
    - 降额：5-6个元器件降额案例
    - 环境：温度循环+振动+6种环境应力
    - FTA：整机不工作故障树
    - 维护：关键部件MTBF/MTTR
    - 数据管理：1个版本快照
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-7
- **Test Requirements**:
  - `programmatic` TR-1.1: localStorage为空时自动创建默认项目
  - `programmatic` TR-1.2: FMEA模块显示6条记录，S/O/D/RPN正确
  - `programmatic` TR-1.3: 寿命分析有2个批次数据
  - `programmatic` TR-1.4: 默认项目可以被删除
  - `human-judgement` TR-1.5: 各模块数据看起来合理，符合文档描述
- **Notes**: 这是核心任务，所有新功能都依赖有数据可展示

## [x] Task 2: 寿命分析增强
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 在寿命数据分析模块的"分析结果"Tab中增加：
    - 指定时长可靠度计算器（输入t，输出R(t)和失效率）
    - 质保期失效率显示（可自定义质保时长）
    - B50 寿命显示
  - 计算公式：
    - R(t) = exp(-(t/η)^β) （Weibull分布）
    - 失效率 = 1 - R(t)
  - 在 calculator-distributions.js 中补充相关函数
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-2.1: 输入t=40h, β=2.2, η=180h，R(t)≈94.7%
  - `programmatic` TR-2.2: B50寿命计算正确
  - `human-judgement` TR-2.3: 计算器布局清晰，结果一目了然
- **Notes**: 改动较小，放在寿命数据模块内

## [x] Task 3: 可靠性预测增强 - 增加可靠性分配子Tab
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 在可靠性预测模块增加第三个子Tab：可靠性分配
  - 综合评分加权法：
    - 评分维度：复杂度、成熟度(反)、环境严酷度、任务占比
    - 每项1-10分
    - 总分越高，权重越大，分配的失效率越高
  - 输入：
    - 整机目标B10
    - 各子系统名称和4项评分
  - 输出：
    - 各子系统权重占比
    - 各子系统分配B10
    - 各子系统90%置信下限
  - 默认数据：绿篱剪4个子系统（齿轮箱/电池/电机/电控）
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 4个子系统评分后权重和为100%
  - `programmatic` TR-3.2: 分配后各子系统B10都大于等于整机目标（串联系统）
  - `programmatic` TR-3.3: 权重计算正确，总分/总分=权重
  - `human-judgement` TR-3.4: 分配表格清晰易懂
- **Notes**: 放在预测模块里，和"元器件清单/系统结果"并列

## [x] Task 4: 测试计划增强 - DVP&R视图Tab
- **Priority**: medium
- **Depends On**: Task 1
- **Description**:
  - 在测试计划模块增加第四个子Tab：DVP&R
  - 标准DVP&R表格格式：
    - 序号、试验项目、试验对象、试验工况、样本量、截尾方式、验收标准、试验结果
  - 数据从"试验项目"Tab同步过来
  - 增加：试验对象、试验工况、验收标准字段
  - 默认数据：绿篱剪5项DVP&R试验（齿轮箱台架/电机带载/电芯循环/开关机械/整机加速）
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-4.1: 显示5项DVP&R试验记录
  - `programmatic` TR-4.2: 表格列完整，数据可读
  - `human-judgement` TR-4.3: 布局符合行业DVP&R标准格式
- **Notes**: 视图类功能，改动不大

## [x] Task 5: 可靠性增长增强 - 多轮试验对比
- **Priority**: medium
- **Depends On**: Task 1
- **Description**:
  - 增长模块改为支持多轮试验管理
  - 每轮试验有独立的失效记录
  - 增加轮次选择器（首轮/第二轮/终轮...）
  - 增长曲线支持多轮叠加对比
  - 每轮显示：β、B10、相对上一轮提升幅度
  - 增长总结：
    - 初始B10、当前B10、总提升幅度
    - 增长趋势判断
    - 达标预测
  - 默认数据：绿篱剪3轮增长数据
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `programmatic` TR-5.1: 支持至少3轮试验
  - `programmatic` TR-5.2: 每轮独立拟合，结果正确
  - `human-judgement` TR-5.3: 多轮曲线叠加清晰，颜色区分
  - `human-judgement` TR-5.4: 提升幅度和增长趋势一目了然
- **Notes**: 改动相对较大，需要重构增长模块的数据结构

## [x] Task 6: 整体验证与优化
- **Priority**: high
- **Depends On**: Task 1-5
- **Description**:
  - 全流程测试：从打开应用开始，浏览所有模块
  - 验证默认案例数据一致性
  - 验证新功能正常工作
  - 验证可以删除默认案例、新建空白项目
  - 性能检查
  - README更新
- **Acceptance Criteria Addressed**: AC-1 ~ AC-7
- **Test Requirements**:
  - `programmatic` TR-6.1: 所有模块加载无JS错误
  - `programmatic` TR-6.2: 默认数据在各模块正确显示
  - `human-judgement` TR-6.3: 整体用户体验流畅，新用户能快速上手
  - `human-judgement` TR-6.4: 代码质量合格，风格一致
- **Notes**: 最后收尾
