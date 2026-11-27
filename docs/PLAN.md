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
2. **PR 2 (`feat/temperament-and-emotion-loop`) — PAD 引擎修复、6 原型×3 档脾气与跨渠道情绪闭环**（进行中）
   - 根治 PAD 引擎 5 处数学与状态缺陷（动态 `novelty`/`arousal`/`dominance`/`intensity`、修复衰减正负号反转、惯性混合后重算 `primary`、`applyLlmAffectSignal` 基于 `currentSnapshot` 升级连续 `cold` 并重算主情绪、去除强制拉正基线）。
   - 落地 `temperament.ts`：6 种脾气原型（`snappy`/`tsundere`/`hurt`/`cold`/`avoidant`/`jealous`）× 3 档烈度（`gentle`/`realistic`/`spicy`）+ 专属雷区/哄法与 `spicy` 轻度旧账。
   - 升级 4 款内置角色预设（中文 `primary`、完整 `spec.mind`/`temperament`/`traits`/`baselineTraits`）与离线兜底区分度；`evolution.ts` 加入 ±0.20 初始锚点护栏。
   - 打通主动破冰（`sulkingLevel >= 2` 门控、有界好感、`proactive-engine.ts` 去错拼模板内心戏）与群聊情绪联动。
3. **PR 3 (`feat/unified-daily-life-state`) — 专属作息、统一「今日生活与心境板」与轻量群聊关系**
4. **PR 4 (`feat/user-impression-and-relation-stage`) — 4 档关系阶段、隔离「TA 眼中的你」与记忆召回增强**
5. **PR 5 (`feat/persona-tuning-ui-and-soul-eval`) — 蒸馏深化、性格脾气调音台 UI 与真模型对抗剧本评测**
