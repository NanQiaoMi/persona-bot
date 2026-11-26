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
1. **阶段 1 (`feat/emotion-traits-and-sulking`)**：升级语义情绪评估与消除正向偏置、接入搭便车 `[AFFECT]` 判定、将大五性格参数转译为 Prompt 行为准则、实现 1~3 轮「闹别扭 / 冷处理 → 哄好解除」状态机，并在右侧情绪雷达提供状态展示与一键翻篇。
2. **阶段 2 (`feat/persona-fewshot-and-autonomy`)**：动态 Few-Shot 示范对话注入、系统提示词瘦身与真实熟人分歧权/小脾气护栏、拍照态度分层。
3. **阶段 3 (`feat/unified-daily-life-state`)**：统一「今日生活与心境板」，串联单聊、朋友圈、群聊与主动破冰。
4. **阶段 4 (`feat/user-impression-and-relation-stage`)**：按角色完全隔离的「TA 眼中的你」认知档案 + 4 档关系阶段分层 + 记忆同义词召回增强。
