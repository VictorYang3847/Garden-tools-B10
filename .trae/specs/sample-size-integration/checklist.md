# 样本量计算器整合到测试计划 - Verification Checklist

- [ ] Checkpoint 1: 测试计划页面显示"样本量分析"Tab
- [ ] Checkpoint 2: 合格性验证 R=90%, γ=90%, r=0 → n=22
- [ ] Checkpoint 3: 合格性验证 R=95%, γ=90%, r=1 → n=45
- [ ] Checkpoint 4: 寿命测定 B10=150h, β=2.2, γ=90%, r=0, 倍率=1.0 → n=22
- [ ] Checkpoint 5: 寿命测定 B10=150h, β=2.2, γ=90%, r=0, 倍率=2.0 → n≈5-6
- [ ] Checkpoint 6: 寿命测定显示优化对比表
- [ ] Checkpoint 7: 导航栏不再显示独立的样本量计算器入口
- [ ] Checkpoint 8: node --check js/pages/test-plan.js 通过
- [ ] Checkpoint 9: node --check js/router.js 通过
- [ ] Checkpoint 10: 向后兼容（不影响其他模块）
