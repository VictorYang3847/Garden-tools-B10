# Tasks

- [x] Task 1: 新增合并/分轮模式切换UI组件
  - [x] SubTask 1.1: 在结果分析tab顶部添加模式切换开关（合并模式/分轮模式）
  - [x] SubTask 1.2: 分轮模式下添加轮次选择下拉框
  - [x] SubTask 1.3: 绑定模式切换和轮次选择的事件处理

- [x] Task 2: 实现分轮模式数据处理逻辑
  - [x] SubTask 2.1: 修改getFailureAndCensoredTimes函数，支持按批次过滤数据
  - [x] SubTask 2.2: 实现单批次数据独立拟合分布参数
  - [x] SubTask 2.3: 轮次切换时重新渲染图表和指标

- [x] Task 3: 移除产品信息定义tab
  - [x] SubTask 3.1: 从life-data.js中移除definition相关函数和事件绑定
  - [x] SubTask 3.2: 从index.html中移除definition tab模板内容
  - [x] SubTask 3.3: 更新tab切换逻辑，只保留data-entry和analysis两个tab

- [x] Task 4: 首页整合产品基础信息
  - [x] SubTask 4.1: 在home.js中添加产品信息数据结构
  - [x] SubTask 4.2: 在首页添加产品信息编辑卡片UI
  - [x] SubTask 4.3: 实现产品信息保存和读取逻辑，与寿命数据模块共享

- [x] Task 5: 数据结构优化
  - [x] SubTask 5.1: 将definition数据从lifeData模块迁移到model顶层或home模块
  - [x] SubTask 5.2: 确保首页产品信息与寿命数据分析模块的数据兼容性
  - [x] SubTask 5.3: 清理冗余的零件寿命计算代码

# Task Dependencies
- Task 2 depends on Task 1（UI组件依赖）
- Task 5 depends on Task 3, Task 4（数据迁移依赖）