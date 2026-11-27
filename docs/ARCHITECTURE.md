# PersonaBot v2.0 (Grok Edition) 系统架构设计

## 1. 架构总览

PersonaBot v2.0 采用**纯 TypeScript 全栈内聚架构**，分为四层：

1. **表现层（Grok 沉浸式三栏工作台）**：
   - 左栏：角色切换列表（内置 Grok 标杆角色 + 用户蒸馏专属角色）、主题切换、设置入口。
   - 中栏：SSE 多阶段流式对话舞台，消息上方展示可折叠的「🌐 联网冲浪轨迹 + 💭 内心潜台词」，底部提供 Grok 胶囊控制栏（Think / DeepSearch / 人格模式 / 传图 / 语音）。
   - 右栏：角色状态舱（PAD 三维情绪雷达、好感度、五层性格 `persona.md`、共同记忆 `memories.md`、纠偏记录）。
2. **大脑编排层（Grok Brain & Emotion Engine）**：
   - `DeepSearch`：免 Key 实时网页/百科检索 + Tavily/Serper 双擎切换。
   - `Persona Modes`：支持 `authentic`（原味复刻）、`fun`（Grok 毒舌 Fun）、`companion`（高共情伴侣）、`analytical`（冷静智囊）4 档尺度。
   - `Emotion Engine`：PAD 三维情感状态机 + 时间差自然衰减 + 主动破冰生成。
   - `Stream Orchestrator`：通过 SSE (`text/event-stream`) 依次流式输出 `search` -> `thought` -> `emotion` -> `reply` -> `done`。
3. **蒸馏与解析层（Pure-TS Distiller & Parsers）**：
   - 彻底移除旧版脆弱的 Python 子进程调用，用纯 TS 实现微信/iMessage/通用聊天记录解析与 5 阶段五层人格蒸馏管线。
   - `PersonaSpec` v2 在兼容 v1 Markdown 的基础上补充 `mind`（思维风格、防御机制、分歧态度、口是心非度、动态 Few-Shot 池）、`temperament`（脾气原型、烈度档位、雷区与哄法）及 `baselineTraits` 初始锚点；对话编排采用「混合自适应思考（日常单次快路径 + 高张力 2.5s 超时轻量二段推演）」与四级 Prompt 优先级仲裁。
4. **统一存储仓储层（Unified Storage Repository）**：
   - 以本地结构化文件库（`exes/{slug}/` + `.data/settings.json`）为默认零配置后端，自动初始化 4 款标杆角色并向下兼容已有 `exes/` 数据；当环境变量配置 `MONGODB_URI` 时自动无缝适配 MongoDB。

## 2. 模块边界与数据流

```text
[用户输入 + 胶囊开关 + 可选图片]
        │
        ▼
/api/chat/stream (SSE)
   ├── 1. Storage Repository 加载角色档案、记忆、历史、PAD 情绪
   ├── 2. (可选) DeepSearch 检索实时资讯 -> 推送 event: search
   ├── 3. PromptAssembler 组装五层人格 + 模式 + 情绪 + 时间 + 联网摘要
   ├── 4. StreamOrchestrator 流式输出 -> event: thought -> event: emotion -> event: reply
   └── 5. Storage Repository 持久化最新会话、情绪与记忆更新
```

## 3. 扩展点设计
- **模型接入**：通过兼容 OpenAI Chat Completions 协议（`baseUrl` + `apiKey` + `model`），原生支持 xAI Grok、DeepSeek、OpenAI 及本地 Ollama。
- **搜索源**：通过统一 `SearchProvider` 接口扩展新的搜索后端。
- **多模态**：消息结构体保留 `attachments` 与 `mediaCards` 扩展字段，方便二期无缝接入云端生图或高拟真 TTS 接口。
