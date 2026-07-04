# 测试计划策略优化与表格布局修复 - Verification Checklist

- [x] Checkpoint 1: custom 策略下试验时间 = targetLife × durationMultiplier
- [x] Checkpoint 2: standard 策略下使用截尾系数（定时1.2、定数1.3、完全1.5）
- [x] Checkpoint 3: optimized 策略下部件级2.2×、整机级1.3×
- [x] Checkpoint 4: 表格中显示"时间倍率"输入框
- [x] Checkpoint 5: 修改倍率后试验时长和样本量自动更新
- [x] Checkpoint 6: 1920px屏幕下表格完整显示无需横向滚动
- [x] Checkpoint 7: 表格内容清晰可读
- [x] Checkpoint 8: node --check js/pages/test-plan.js 通过
- [x] Checkpoint 9: 向后兼容（旧数据无 durationMultiplier 字段不报错）
