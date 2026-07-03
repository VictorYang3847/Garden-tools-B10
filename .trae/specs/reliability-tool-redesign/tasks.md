# 可靠性工具改版 - The Implementation Plan (Decomposed and Prioritized Task List)

## [ ] Task 1: 全局架构与导航框架
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 重构 index.html 为左侧导航 + 顶部栏 + 主内容区三栏布局
  - 左侧导航栏：10 个模块（图标 + 文字），支持展开/收起
  - 顶部栏：项目/产品/型号选择器 + 面包屑 + 全局操作（导入/导出/设置）
  - 主内容区：动态切换各模块内容
  - 深色主题 CSS 变量统一管理
  - Hash 路由：#/fmea、#/prediction、#/life-data 等
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-9, AC-10
- **Test Requirements**:
  - `programmatic` TR-1.1: 10 个导航项全部存在，点击后 hash 更新
  - `programmatic` TR-1.2: 刷新页面后当前模块和项目状态恢复
  - `human-judgement` TR-1.3: 布局美观，左侧导航、顶部栏、主内容区分明
  - `human-judgement` TR-1.4: 窗口宽度 < 768px 时导航栏可折叠
- **Notes**: 这是基础框架，必须第一个完成

## [ ] Task 2: 数据层重构（项目/产品/型号三级 + 10 模块数据模型）
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 重构 store.js，建立三级数据结构：Project → Product → Model
  - 每个 Model 下挂载 10 个模块的数据节点
  - 设计各模块默认数据结构（FMEA、寿命分析、测试计划等）
  - 统一的 CRUD API：getProject、addModel、getModuleData、setModuleData
  - localStorage 持久化 + JSON 导入导出
  - 数据迁移：v2.x → v3.0 数据格式兼容
- **Acceptance Criteria Addressed**: AC-8, AC-10
- **Test Requirements**:
  - `programmatic` TR-2.1: 新建项目 → 产品 → 型号，数据结构正确
  - `programmatic` TR-2.2: 各模块数据独立存取，互不干扰
  - `programmatic` TR-2.3: 导出 JSON 后重新导入，数据完整一致
  - `programmatic` TR-2.4: 旧版 v2.2 数据导入后自动迁移到 v3.0 格式
- **Notes**: 所有后续模块都依赖这个数据层

## [ ] Task 3: FMEA 模块（失效模式与影响分析）
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 支持 DFMEA / PFMEA 切换
  - 表格形式录入：过程/功能、失效模式、失效后果、严重度(S)、失效原因、发生度(O)、现行控制、探测度(D)、RPN、AP 等级、建议措施、责任、完成日期、措施结果、重新评估
  - S/O/D 评分：1-10 分下拉选择
  - RPN 自动计算 = S × O × D
  - Action Priority 自动判定（AIAG-VDA 第四版标准矩阵）
  - 添加/删除行、复制行
  - 筛选与排序（按 RPN、按 AP、按严重度）
  - 导出为 CSV/Excel
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 输入 S/O/D 后 RPN 自动正确计算
  - `programmatic` TR-3.2: AP 等级（H/M/L）根据 SOD 组合正确判定
  - `programmatic` TR-3.3: 添加/删除行后数据正确更新
  - `human-judgement` TR-3.4: 表格布局清晰，操作便捷

## [ ] Task 4: 寿命数据分析模块（整合现有 B10 功能 + 扩展）
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 迁移现有 Weibull 分析功能（定义、规划、结果整合为一个模块）
  - 新增分布类型：指数分布、对数正态分布
  - 新增参数估计方法：MLE、RRX、RRY
  - 新增 B10/B50 寿命计算
  - 新增置信区间估计
  - 批次管理（保留现有功能）
  - 概率图、CDF 图、PDF 图、危险率图
  - 失效模式/零件分解分析（保留现有功能）
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: Weibull 分布拟合结果与旧版一致
  - `programmatic` TR-4.2: 指数分布拟合正确（λ = 1/MTBF）
  - `programmatic` TR-4.3: 导入 CSV 数据后自动拟合并显示结果
  - `human-judgement` TR-4.4: 图表清晰，配色与整体一致

## [ ] Task 5: 测试计划与评估模块
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 整合现有测试规划页功能
  - ALT 加速寿命试验计划：加速应力类型（温度/湿度/振动）、加速模型（Arrhenius/Coffin-Manson）、加速因子计算
  - HALT 高加速寿命试验记录：应力类型、步长、持续时间、失效记录
  - 样本量计算：给定置信度、可接受失效数、目标可靠性，计算最小样本量
  - 试验方案设计：定时截尾/定数截尾/完全失效
  - 试验数据录入与管理
  - 台架条件记录（保留现有功能）
- **Acceptance Criteria Addressed**: AC-5, AC-7
- **Test Requirements**:
  - `programmatic` TR-5.1: 样本量计算结果正确
  - `programmatic` TR-5.2: 加速因子（Arrhenius 模型）计算正确
  - `programmatic` TR-5.3: 可以从 FMEA 模块导入失效模式作为测试项
  - `human-judgement` TR-5.4: 试验方案展示清晰

## [ ] Task 6: 故障树分析 (FTA) 模块
- **Priority**: medium
- **Depends On**: Task 2
- **Description**:
  - 顶事件定义
  - 树形结构展示故障树
  - 节点类型：顶事件、中间事件、基本事件、AND 门、OR 门、表决门
  - 节点增删改操作
  - 最小割集求解（下行法）
  - 定量分析：顶事件概率计算
  - 重要度分析：结构重要度、概率重要度
  - 图形化展示：Canvas / SVG 绘制树形图
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `programmatic` TR-6.1: 简单 AND/OR 树顶事件概率计算正确
  - `programmatic` TR-6.2: 最小割集求解正确
  - `human-judgement` TR-6.3: 树形图布局清晰，可缩放/拖拽
  - `human-judgement` TR-6.4: 操作流程直观

## [ ] Task 7: 可靠性预测模块
- **Priority**: medium
- **Depends On**: Task 2
- **Description**:
  - 系统结构建模：串联/并联/混联
  - 元器件库：电阻、电容、电感、二极管、晶体管、IC、连接器、继电器
  - MIL-HDBK-217F 失效率计算（基础版：应力分析法）
  - 温度降额因子、电应力降额因子
  - 系统 MTBF 计算
  - 可靠度函数 R(t) 计算
  - 系统可靠性框图展示
- **Acceptance Criteria Addressed**: 
- **Test Requirements**:
  - `programmatic` TR-7.1: 串联系统 MTBF = 1/Σλᵢ 计算正确
  - `programmatic` TR-7.2: 并联系统可靠度计算正确
  - `programmatic` TR-7.3: 温度降额因子计算正确
  - `human-judgement` TR-7.4: 元器件录入流程清晰

## [ ] Task 8: 可靠性增长模块
- **Priority**: medium
- **Depends On**: Task 2
- **Description**:
  - Duane 模型：累计失效数 vs 累计时间，双对数坐标拟合
  - Crow-AMSAA 模型：强度函数 β(t) = λβt^(β-1)
  - 可靠性增长曲线绘制
  - MTBF 增长趋势分析
  - 增长目标跟踪与达标判断
  - RGV 试验设计：基于 MIL-STD-781 的统计检验方案
- **Acceptance Criteria Addressed**: 
- **Test Requirements**:
  - `programmatic` TR-8.1: Duane 模型斜率和截距计算正确
  - `programmatic` TR-8.2: Crow-AMSAA 的 β 和 λ 估计正确
  - `human-judgement` TR-8.3: 增长曲线图表清晰

## [ ] Task 9: 维护与可用性分析模块
- **Priority**: low
- **Depends On**: Task 2
- **Description**:
  - 可用度计算：固有可用度 A = MTBF/(MTBF+MTTR)
  - 可达可用度 Av、使用可用度 AP
  - 备件需求预测：基于泊松分布的备件量计算
  - 维修时间分布：对数正态分布建模
  - 预防性维护周期优化
  - 可用性框图
- **Acceptance Criteria Addressed**: 
- **Test Requirements**:
  - `programmatic` TR-9.1: 固有可用度计算正确
  - `programmatic` TR-9.2: 备件需求量计算正确（给定置信度）
  - `human-judgement` TR-9.3: 结果展示清晰

## [ ] Task 10: 降额与裕度分析模块
- **Priority**: low
- **Depends On**: Task 2
- **Description**:
  - 元器件降额检查清单
  - 降额标准库：Mil-Hdbk-217、GJB/Z 35
  - 降额等级：Ⅰ/Ⅱ/Ⅲ 级
  - 热裕度分析：工作温度 vs 额定温度
  - 电气裕度分析：电压/电流/功率降额比
  - 降额合规报告：通过/警告/失败
  - 支持元器件类型：电阻、电容、电感、二极管、晶体管、IC、连接器
- **Acceptance Criteria Addressed**: 
- **Test Requirements**:
  - `programmatic` TR-10.1: 降额比 = 工作值/额定值 计算正确
  - `programmatic` TR-10.2: 降额等级判定正确（根据标准库）
  - `human-judgement` TR-10.3: 合规报告清晰易懂

## [ ] Task 11: 环境适应性分析模块
- **Priority**: low
- **Depends On**: Task 2
- **Description**:
  - 温度循环分析：Miner 累积损伤法则
  - 热冲击分析
  - 振动分析：正弦振动、随机振动
  - 环境应力映射：温度、湿度、盐雾、粉尘
  - 环境试验标准库：IEC 60068、GJB 150、MIL-STD-810
  - 环境因子计算
  - ESS 环境应力筛选方案
- **Acceptance Criteria Addressed**: 
- **Test Requirements**:
  - `programmatic` TR-11.1: Miner 累积损伤计算正确
  - `programmatic` TR-11.2: 温度循环加速因子（Coffin-Manson）计算正确
  - `human-judgement` TR-11.3: 试验标准库展示清晰

## [ ] Task 12: 数据管理与报告模块 + 跨模块联动
- **Priority**: medium
- **Depends On**: Task 3, 4, 5, 6, 7, 8, 9, 10, 11
- **Description**:
  - 项目/产品/型号的增删改管理界面
  - 全局导入导出（JSON/CSV/Excel）
  - 报告生成：HTML 格式打印/PDF
  - 版本管理：数据快照、对比
  - 跨模块数据联动：FMEA → 测试计划 → 寿命分析
  - 模板库：FMEA 模板、测试计划模板
- **Acceptance Criteria Addressed**: AC-7, AC-8
- **Test Requirements**:
  - `programmatic` TR-12.1: 全局导出的 JSON 可以完整导入恢复
  - `programmatic` TR-12.2: FMEA 失效模式可以同步到测试计划
  - `human-judgement` TR-12.3: 报告格式美观、信息完整
  - `human-judgement` TR-12.4: 项目管理操作便捷

## [ ] Task 13: 整体测试与优化
- **Priority**: high
- **Depends On**: Task 1-12 核心模块
- **Description**:
  - 全功能回归测试
  - 性能优化（大数据量场景）
  - UI/UX 细节打磨
  - 响应式适配验证
  - 浏览器兼容性验证
  - README 和使用文档更新
- **Acceptance Criteria Addressed**: AC-1 ~ AC-10 全部
- **Test Requirements**:
  - `programmatic` TR-13.1: 所有模块基本功能可用
  - `programmatic` TR-13.2: 数据导入导出完整
  - `human-judgement` TR-13.3: 整体 UI 美观、一致
  - `human-judgement` TR-13.4: 操作流程顺畅
- **Notes**: 分阶段验收，每完成一个核心模块就测试
