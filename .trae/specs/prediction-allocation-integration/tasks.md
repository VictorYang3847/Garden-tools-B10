# Tasks

- [x] Task 1: 预测模块表头添加 help-icon（π_S、π_Q、π_T、基础失效率）
  - [x] SubTask 1.1: 在 index.html 的 prediction-template 元器件表头，为 π_S、π_Q、π_T、基础失效率列添加 `<span class="help-icon" data-tooltip="...">?</span>`
  - [x] SubTask 1.2: 验证悬停提示正常显示

- [x] Task 2: 预测模块结果区新增 β 输入和等效 B10/λ 显示
  - [x] SubTask 2.1: 在 index.html 预测结果区新增 β 输入框（id="pred-beta"，默认 2.2）和两个 metric-card（等效 B10 id="pred-equiv-b10"、等效 λ id="pred-equiv-lambda"）
  - [x] SubTask 2.2: 在 prediction.js 的计算结果渲染逻辑中，根据 MTBF 和 β 反算 B10 = MTBF × [-ln(0.9)]^(1/β) / Γ(1+1/β)，以及 λ = 0.10536/B10 × 10⁶
  - [x] SubTask 2.3: γ 函数复用 home.js/calculator.js 中的 gammaApprox 实现

- [x] Task 3: β 参数在预测和分配间双向同步
  - [x] SubTask 3.1: 预测侧 β 输入 change 事件 → 更新 allocationData.beta 并刷新分配表格
  - [x] SubTask 3.2: 分配侧 β 输入 change 事件 → 更新预测侧 β 输入框值

- [x] Task 4: 系统结构参数同步
  - [x] SubTask 4.1: 预测侧结构 change → 分配侧结构同步（vote23 映射为 series）
  - [x] SubTask 4.2: 分配侧结构 change → 预测侧结构同步

- [x] Task 5: 新增"与可靠性预计比对"交叉验证面板
  - [x] SubTask 5.1: 在 index.html 分配 Tab 中，FMEA 比对面板上方新增"与可靠性预计比对"面板 HTML
  - [x] SubTask 5.2: 在 prediction.js 新增 renderPredComparison 函数，读取预测模块的等效 B10 和分配模块的目标 B10，计算差异百分比和一致性评价
  - [x] SubTask 5.3: 在分配计算完成后调用 renderPredComparison 刷新面板

# Task Dependencies
- Task 2 依赖 Task 1（同区域修改，先完成表头再加结果区）
- Task 3 依赖 Task 2（需要预测侧 β 输入框先存在）
- Task 5 依赖 Task 2（交叉验证需要预测侧的等效 B10 结果）
- Task 4 独立，可与 Task 3 并行
