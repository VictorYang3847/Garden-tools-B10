import { fmt } from "../utils.js";

export function renderAnalysisPage(model) {
  const root = document.getElementById("page-analysis");
  const batches = model.analysis?.batches ?? [];
  const hasResult = !!model.lastResult;

  root.innerHTML = `
    <div class="page-intro">
      <h2>测试结果分析</h2>
      <p>录入台架试验失效数据，进行 Weibull 拟合，计算实测 B10、β 值，并按零件 / 失效模式分组分析。<strong>完整分析功能将在 Phase 3 实现。</strong></p>
    </div>

    <section class="info-card">
      <h3>当前型号目标对照</h3>
      <div class="summary-grid">
        <div>型号 <strong>${model.name}</strong></div>
        <div>目标整机 B10 <strong>${hasResult ? fmt(model.lastResult.b10Target, 0) + " h" : "—"}</strong></div>
        <div>零件合成 B10 <strong>${hasResult ? fmt(model.lastResult.b10Parts, 0) + " h" : "—"}</strong></div>
        <div>已保存试验批次 <strong>${batches.length}</strong></div>
      </div>
      ${!hasResult ? '<p class="hint warn">请先在「产品定义」页计算并保存测试标准。</p>' : ""}
    </section>

    <section class="placeholder-card">
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <h3>尚无试验数据</h3>
        <p>Phase 3 将支持：</p>
        <ul>
          <li>试验批次管理（整机 / 分零件）</li>
          <li>失效时间与截尾数据录入（含 CSV 导入）</li>
          <li>Weibull 拟合 → B10、β、η 及置信区间</li>
          <li><strong>按零件</strong>与<strong>按失效模式</strong>分组分析</li>
          <li>Weibull 概率图 / CDF 与目标 B10 对比图</li>
          <li>与测试标准、测试规划判据自动对比</li>
        </ul>
        <button type="button" class="btn-secondary" disabled>+ 新建试验批次（Phase 3）</button>
      </div>
    </section>`;
}
