# PersonaBot 核心架构决策记录 (ADR)

## ADR-001: 废弃 Node.js 调用 Python 子进程，全面转向纯 TypeScript
- **背景**: 旧版通过 `spawn('python', ...)` 调用 `lib/ex-skill/tools/*.py`，但该目录在仓库中缺失且强依赖本机 Python 环境，导致 `ENOENT` 崩溃与 CI 不可测。
- **决策**: 全部迁移为纯 TypeScript 模块（解析器、5 阶段蒸馏管线、Prompt 模板库与仓储层）。
- **收益**: 零外部运行时依赖、完整类型安全、Vitest 直接单测覆盖、Vercel/Docker/CI 一致运行。

## ADR-002: 采用统一存储仓储层（本地结构化文件默认 + MongoDB 可选）
- **背景**: 原代码库同时存在只读 `exes/` 文件的路由和强依赖 MongoDB 的路由，导致无数据库时无法启动且两边数据不互通。
- **决策**: 抽象 `src/lib/storage/repository.ts` 统一读写。默认持久化在 `exes/{slug}/` 与 `.data/` 下，开箱即用且保留 Markdown 角色卡可阅读性；若配置有效 `MONGODB_URI` 则提供数据库同步能力。

## ADR-003: 对话协议升级为多阶段 SSE 流（Search -> Thought -> Emotion -> Reply）
- **背景**: 同步 `POST /api/chat` 导致长等待白屏，无法呈现 Grok 标志性的联网检索与内心推理过程。
- **决策**: 建立 `/api/chat/stream` SSE 接口，分阶段推送联网来源、角色内心 OS、情绪好感度变化与流式回复气泡，并提供无 API Key 时的角色模板流式演示兜底。

## ADR-004: DeepSearch 采用免 Key 内置检索 + 专业搜索 API 双擎自适应
- **决策**: 默认通过免 Key 公开接口（Wikipedia / DuckDuckGo Instant Answer）结合主题兜底实现开箱即用联网；当用户填写 Tavily 或 Serper API Key 时自动升级为高精度全网搜索。
