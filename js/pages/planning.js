import { mergeInputs } from "../store.js";
import { calculateAll } from "../calculator.js";
import { fmt } from "../utils.js";

const PART_MAP = {
  product: { label: "整机", unit: "h", fromResult: (r) => r.b10Target },
  motor: { label: "电机", unit: "h", partId: "motor" },
  battery: { label: "电池包", unit: "h", partId: "battery" },
  gearbox: { label: "齿轮箱/传动", unit: "h", partId: "gearbox" },
  blade: { label: "刀片组件", unit: "h", partId: "blade" },
  bearing: { label: "轴承", unit: "h", partId: "bearing" },
};

function getTargetB10(itemId, model, result) {
  if (!result) return null;
  const spec = PART_MAP[itemId];
  if (itemId === "product") return spec.fromResult(result);
  const part = result.partEntries.find((p) => p.id === spec.partId);
  return part?.included ? part.equivHours : null;
}

export function renderPlanningPage(model) {
  const root = document.getElementById("page-planning");
  const inputs = mergeInputs(model.record, model.definition);
  let result = model.lastResult;
  if (!result) {
    try {
      result = calculateAll(inputs);
    } catch {
      result = null;
    }
  }

  const items = model.planning?.items ?? [];

  let rows = "";
  for (const item of items) {
    const target = getTargetB10(item.id, model, result);
    const targetStr = target != null ? `${fmt(target, 0)} h` : "—（请先在产品定义页计算）";
    rows += `
      <tr>
        <td><strong>${item.name}</strong></td>
        <td class="target-cell">${targetStr}</td>
        <td>
          <select disabled class="disabled-field">
            <option ${item.censoringType === "time" ? "selected" : ""}>定时截尾</option>
            <option ${item.censoringType === "complete" ? "selected" : ""}>完全失效</option>
            <option ${item.censoringType === "failure_count" ? "selected" : ""}>定数截尾</option>
          </select>
        </td>
        <td><input disabled class="disabled-field" placeholder="Phase 2" value="${item.sampleSize ?? ""}" /></td>
        <td><input disabled class="disabled-field" placeholder="Phase 2" value="${item.testDuration ?? ""}" /></td>
        <td><span class="phase-tag">待开发</span></td>
      </tr>`;
  }

  root.innerHTML = `
    <div class="page-intro">
      <h2>测试规划</h2>
      <p>根据产品定义中的目标 B10，规划整机与各零件的试验样本量、截尾方式与试验时长。<strong>完整规划功能将在 Phase 2 实现。</strong></p>
    </div>

    <section class="info-card">
      <h3>当前型号测试标准摘要</h3>
      <div class="summary-grid">
        <div>型号 <strong>${model.name}</strong></div>
        <div>目标整机 B10 <strong>${result ? fmt(result.b10Target, 0) + " h" : "—"}</strong></div>
        <div>零件合成 B10 <strong>${result ? fmt(result.b10Parts, 0) + " h" : "—"}</strong></div>
        <div>瓶颈 <strong>${result?.bottleneck?.name ?? "—"}</strong></div>
      </div>
      ${!result ? '<p class="hint warn">请先在「产品定义」页完成计算并保存，以载入目标 B10。</p>' : ""}
    </section>

    <section>
      <h3>试验规划表 <span class="phase-tag">Phase 2 预览</span></h3>
      <p class="hint">第一版暂用简化样本量规则；下表展示规划结构，编辑功能后续开放。</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>规划对象</th>
              <th>引用目标 B10</th>
              <th>截尾类型</th>
              <th>样本量 n</th>
              <th>试验时长 (h)</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>

    <section class="placeholder-card">
      <h3>Phase 2 将包含</h3>
      <ul>
        <li>经验规则样本量（整机 10–15，磨损件 15–20）</li>
        <li>试验时长建议（1.0–1.5 × 目标 B10）</li>
        <li>定时截尾 / 完全失效 / 定数截尾可选</li>
        <li>通过判据与台架加载条件记录</li>
      </ul>
    </section>`;
}
