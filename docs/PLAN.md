# PersonaBot v2.0 演进计划与 PR 拆分

## 交付路线（4 个原子 PR）

1. **PR #1 (`chore/arch-foundation-and-ci`) — 工程基建、清理与存储统一**
   - 清理根目录遗留爬虫脚本与截图、解决 `/` 双页面路由冲突、移除断裂的 Python 桥接。
   - 补齐 `AGENTS.md`、`docs/` 架构文档、Vitest 测试框架与 GitHub Actions CI。
   - 落地 `src/lib/storage/` 统一仓储层与 4 款内置 Grok 标杆角色预设。

2. **PR #2 (`feat/grok-brain-and-stream-engine`) — Grok 大脑与纯 TS 蒸馏管线**
   - 实现纯 TS 10 套深度重写 Prompt 与 5 阶段角色蒸馏管线。
   - 实现 DeepSearch 双擎实时联网、4 档人格模式调节、时间感知主动破冰与 SSE 多阶段流式引擎。

3. **PR #3 (`feat/grok-workspace-and-multimodal`) — Grok 三栏工作台与多模态交互**
   - 构建深空暗色 / 清爽亮色主题系统与 Grok 三栏工作台 UI。
   - 实现底部 Grok 胶囊控制栏、可折叠「联网轨迹 + 内心 OS」微卡片、右侧情绪状态舱及看图/情境自拍/浏览器语音交互。

4. **PR #4 (`feat/persona-studio-and-settings`) — 角色蒸馏工作室与可视化配置舱**
   - 重构 `/create`（3 步快速捏人 + 聊天记录导入流式蒸馏）与 `/gallery` 角色广场。
   - 构建可视化「模型与联网配置舱」（支持 xAI Grok / DeepSeek / OpenAI 一键切换与连通性测试）。

## 暂缓清单（二期规划）
- 真实个人微信号挂机自动代聊（规避账号风控）。
- 本地重型生图（ComfyUI / Stable Diffusion）部署耦合。

## 活人感性格系统 4 阶段升级计划
1. **阶段 1 (`feat/emotion-traits-and-sulking`)**：升级语义情绪评估与消除正向偏置、接入搭便车 `[AFFECT]` 判定、将大五性格参数转译为 Prompt 行为准则、实现 1~3 轮「闹别扭 / 冷处理 → 哄好解除」状态机，并在右侧情绪雷达提供状态展示与一键翻篇。（已完成）

## 性格深化、真实思考与多原型脾气 5 PR 蓝图（2026-11 迭代）
1. **PR 1 (`feat/persona-mind-and-autonomy`) — 人格思考内核、混合自适应思考与建人收口**（已合入 `#70`）
2. **PR 2 (`feat/temperament-and-emotion-loop`) — PAD 引擎修复、6 原型×3 档脾气与跨渠道情绪闭环**（已合入 `#71`）
3. **PR 3 (`feat/unified-daily-life-state`) — 专属作息、统一「今日生活与心境板」与轻量群聊关系**（已合入 `#72`）
4. **PR 4 (`feat/user-impression-and-relation-stage`) — 4 档关系阶段、隔离「TA 眼中的你」与记忆召回增强**（已合入 `#73`）
   - 新增 `relation-stage.ts`：将 0~100 亲密度映射为「初识边界 / 熟人互损 / 密友偏爱 / 挚交默契」4 档行为指令。
   - 新增 `user-impression.ts` 与 `PersonaSpec.userImpression`：按角色完全隔离沉淀「TA 眼中的你」（专属称呼、主观印象、观察到的习惯/软肋、近期相处感受），接入 `evolution.ts` 自进化与 `PromptAssembler`。
   - 增强 `memory-retrieval.ts`：引入 12 组中文日常同义词簇扩展查询，并融合 `spec.memoryStats`（重要度与召回次数）重排召回结果及预算裁剪优先级。
5. **PR 5 (`feat/persona-tuning-ui-and-soul-eval`) — 蒸馏深化、性格脾气调音台 UI 与真模型对抗剧本评测**（已完成）
   - 升级 `prompts.ts` 与 `distiller.ts`：在创建蒸馏源头提取结构化 `traits` / `mind` / `temperament` 与 5 场景示范对话池。
   - 在 `spec.ts` 实现 `mergePersonaSpecPatch` 修复 `PUT /api/personas/[slug]` 局部更新覆盖 `learned`/`fingerprint`/`memoryStats` 的风险，并新增 `GET/PUT /api/personas/[slug]/daily-life`。
   - 升级 `RightInspector.tsx` + 新增 `PersonaTuningPanel.tsx`：提供 7 维性格滑块（含 `emotionalStability`）、6 原型与 3 档烈度开关、雷区与哄法标签编辑器、«今日心境»与«TA 眼中的你»查看编辑。
   - 新增 `live-scenarios.ts`（15 个对抗剧本）与 `eval/persona-live-eval.ts`（`npm run eval:persona:live`）评测脚手架及单元测试。
