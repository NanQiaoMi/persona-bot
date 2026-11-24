# 人格系统 & 自优化（自进化）全面优化计划

> 日期：2026-11-24 · 级别：**L**（跨存储 / 编排器 / Prompt / UI，需分阶段多 PR 交付）
> 范围：`src/lib/persona/*`、`src/lib/emotion/*`、`src/lib/prompt-assembler.ts`、`src/lib/grok/stream-orchestrator.ts`、`src/lib/storage/*`、右侧 Inspector UI

---

## 0. 一句话目标

让角色 **「越聊越像本人，而不是越聊越像用户、越聊越像模板」**，并且每一次"自我学习"都 **有依据、可验证、可撤销**。

---

## 1. 现状诊断（基于代码走查）

### 1.1 根基性 Bug（直接影响体验，优先修）

| # | 问题 | 位置 | 用户感受 |
|---|------|------|----------|
| B1 | **情绪不跨轮**：每轮 `new EmotionEngine(traits)` 不传入已保存的 PAD 状态，永远从默认值开始；`evolveByTime` 衰减从未被调用 | `stream-orchestrator.ts:843` | 角色上一句还在生气，下一句就"重置"了，没有情绪连续性 |
| B2 | **好感度几乎单调上涨**：每轮正向 +1/+2，负向才 -1，无每日上限、无冷落衰减 | `stream-orchestrator.ts:851` | 聊几十轮必然 100，好感度失去意义 |
| B3 | **中文记忆检索基本失效**：`filterMemories` 按空格/标点切词，中文整句变成一个"关键词"，几乎命中不了；且每轮把全量记忆塞进 Prompt | `prompt-assembler.ts:53` | 记忆越多 Prompt 越臃肿，"想起往事"靠运气 |
| B4 | **自动快照挤掉手动存档**：快照上限 10 个，自进化每 4 轮存一次，约 40 轮后用户手动存档全被淘汰 | `repository.ts:430` | 想回滚到"那个时候的 TA"时发现找不回来 |
| B5 | **并发写丢数据**：`autoPersistTurnMemory`、`consolidatePersonaEvolution`、`updateEmotionAndIntimacy` 各自"读-改-写"同一份 persona，无锁；自进化节流状态存在内存 `Map`，重启即丢 | `evolution.ts:13`、`auto-memory.ts:110` | 偶发"刚学到的记忆消失"、重启后重复整理 |
| B6 | **蒸馏与聊天用的不是同一套模型配置**：蒸馏默认 `api.x.ai` + `grok-3` 且强制要求 API Key，本地网关用户永远走模板兜底；超时仅 15s | `distiller.ts:143` | 用本地网关时"导入聊天记录蒸馏"效果远差于预期 |
| B7 | **全局"年轻人微信铁律"压过角色本人设定**：Assembler 里写死"默认 0 emoji、6~24 字、不打句号"，排在人设之后、权重更高 | `prompt-assembler.ts:160` | 沉稳/年长/本来就爱发表情的角色被"统一口吻"，复刻失真 |

### 1.2 结构性问题（决定上限）

1. **只镜像用户，不锚定本人**：`analyzeUserChatStyle` 只统计 *用户* 的句长/emoji/标点并要求角色对齐 → 长期下来角色变成用户的"回声"，丢掉蒸馏出的本人特色。蒸馏时算出的口头禅/句长统计（`analyzeChatLogCorpus`）没有被结构化保存下来做锚点。
2. **人格是一整坨 Markdown**：进化靠字符串查找 `## 6.` / `## 7.` 标题插入，脆弱；每条习得规则没有来源、置信度、命中次数、状态。
3. **自进化是"开环"的**：每 4 轮 LLM 产出候选 → 直接写入 → 超出上限 FIFO 截断。
   - 无效果验证：不知道新规则让对话变好还是变差；
   - 无冲突消解：如"0 个 emoji"与"最多 1 个 emoji"可同时存在；
   - 去重只靠子串包含，换个说法就重复堆积；
   - 只增不减：旧但重要的记忆被 FIFO 挤掉，新但无用的反而保留。
4. **人格特质推断过于简陋**：`inferPersonalityTraits` 只看 3 组关键词，绝大多数角色的情绪参数都是默认 0.5。
5. **纠偏链路割裂**：纠偏写进 `## Correction 记录` 后又被自进化复制一份到"习惯"小节（`互动风格调整：…`），重复占 Prompt；`CORRECTION_HANDLER_PROMPT`、`MERGER_PROMPT`、`EMOTION_EVOLVER_PROMPT` 定义了却从未使用。
6. **没有任何量化评测**：无法回答"这次改动后角色更像本人了吗？"。

---

## 2. 优化蓝图（分 5 个阶段）

```
Phase 0 评测基线  ──►  Phase 1 修根基  ──►  Phase 2 人格结构化
                                              │
                         Phase 4 纠偏与可视化 ◄─┴─►  Phase 3 自进化闭环
```

### Phase 0：建立评测基线（先能量化，再谈优化）· M

**目的**：后续每个改动都能用数字说明"更像了 / 更稳了"。

- 新增 `src/lib/persona/eval/`：
  - `metrics.ts`：纯 TS 单条回复度量 —— emoji 数、平均气泡长度、句尾标点、口头禅命中率、AI 套话/禁用词命中、OOC 关键词（"我是AI""临时聊天"等）、主持人式反问比例。
  - `scorer.ts`：把度量与 **角色本人风格指纹**（见 Phase 2）对比，输出 0~100 的「像本人分」和「去 AI 味分」。
- 新增 `tests/fixtures/persona-eval/`：每个内置角色 15~20 条场景（日常、深夜、吵架、求安慰、问事实、要照片），配离线兜底回复做回归。
- 每条 assistant 消息落库时附带 `styleMetrics`（不进 Prompt，只供自进化与面板使用）。
- 可选：`npm run eval:persona` 调真实模型跑一遍出报告（不进 CI，避免花钱/不稳定）。

**验收**：`npm test` 含评测用例；能对任意一轮回复打分；记录一份当前基线分数到 `docs/`。

---

### Phase 1：修根基 Bug · S/M（每项可独立小 PR）

| 项 | 改法 | 验证 |
|----|------|------|
| B1 情绪连续 | 用 `persona.emotionState` 初始化 Engine；先按 `lastUpdated` 距今小时数调用 `evolveByTime` 衰减，再处理本轮事件 | 单测：连续两次负面消息强度累积；隔 12 小时后回落 |
| B2 好感度 | 增量改为基于 appraisal 的有界值（-3~+2），每日净增上限（如 +6），连续多天未聊缓慢回落；companion 模式只调系数不改上限 | 单测：100 轮正向对话不超过合理曲线 |
| B3 记忆检索 | 中文 bigram + 英文词切分做相关性打分，取 top-k（默认 6）进"高相关"区，其余记忆按预算截断（如 1200 字），近况类优先 | 单测：「我那只猫最近不吃饭」能命中「我养了一只橘猫」 |
| B4 快照配额 | 快照加 `kind: 'manual' \| 'auto'`；auto 保留最近 10 个，manual 单独保留（上限 30）且不被 auto 挤掉 | 单测：50 次 auto 后 manual 仍在 |
| B5 并发与节流 | 仓储层加按 slug 串行写队列（`withPersonaLock(slug, fn)`）；自进化游标 `lastEvolvedTurn` 持久化到 persona 元数据 | 单测：并发 3 个写操作不丢字段；重启后不重复触发 |
| B6 统一 LLM 客户端 | 抽出 `src/lib/llm/client.ts`（baseUrl/key/model/超时/JSON 解析/本地网关免 key 判定），聊天、蒸馏、自进化统一使用；蒸馏超时提升至 60s | 本地网关下蒸馏走真实 LLM；无配置时仍离线兜底不 500 |
| B7 风格优先级 | 全局铁律降级为"默认口吻"，只有当角色没有自己的风格指纹时才全量生效；Authentic 模式下以本人指纹为准，铁律只保留"去 AI 套话 / 防出戏"部分 | 评测：一个"爱用 emoji 的角色"在 Authentic 下 emoji 率接近原语料 |

---

### Phase 2：人格结构化 · L

**核心**：把"一坨 Markdown"升级为 **结构化人格规格 `PersonaSpec` + 渲染出的 Markdown**（兼容旧数据）。

```ts
interface PersonaSpec {
  layers: { core; identity; expression; emotionLogic; relationship; boundaries }; // 原五层（文本）
  fingerprint: StyleFingerprint;      // 本人风格指纹（来自原始聊天记录，锚点，不随对话漂移）
  traits: PersonalityTraits;          // Big5 + 情绪恢复模式（蒸馏时 LLM 产出，离线关键词兜底）
  learned: LearnedItem[];             // 习惯 / 风格规则 / 纠偏，统一管理
}
interface StyleFingerprint {
  avgBubbleLen; burstRate; emojiRate; topEmojis; trailingPeriodRate;
  exclamationRate; catchphrases: string[]; fillerWords: string[]; sampleQuotes: string[];
}
interface LearnedItem {
  id; kind: 'habit' | 'style' | 'correction' | 'fact';
  text; dimension?: 'emoji' | 'length' | 'punctuation' | 'tone' | ...; // 用于冲突消解
  source: 'llm' | 'heuristic' | 'user-correction'; evidenceMsgIds: string[];
  confidence: number; status: 'trial' | 'active' | 'retired' | 'locked';
  hitCount; createdAt; lastUsedAt;
}
```

- **双指纹混合**：最终风格 = 本人指纹（锚）× 模式权重 + 用户指纹（镜像）× 少量权重。Authentic 偏本人（如 0.8/0.2），Companion/Fun 可适当增加镜像。
- **蒸馏增强**：`analyzeChatLogCorpus` 产出完整 `StyleFingerprint` 并持久化；LLM 同时输出 traits JSON。
- **Prompt 分层与预算**：按优先级拼装并做长度预算 —— Layer0 + 已生效纠偏 > 当前情绪/时间 > 风格指令 > 相关记忆 > 画像其余部分；超预算从低优先级截断。
- **迁移**：读取旧 persona 时解析 `## Layer x` / `## 6.` / `## 7.` / `## Correction 记录` 生成 spec；保存时同时写 spec 与渲染后的 `personaMd`，灵魂包导入导出、快照、MongoDB 适配同步升级（带 `specVersion`）。

**验收**：旧角色无损迁移（快照对比单测）；Prompt 长度可控；Phase 0「像本人分」较基线提升。

---

### Phase 3：自进化闭环重做 · L

把现在的 **开环"每 4 轮写一次"** 改成 **闭环：观察 → 提议 → 试用 → 生效/淘汰 → 遗忘**。

1. **观察（信号采集）**
   - 显式：纠偏、重新生成、用户说"别这样 / 你好怪 / 太像 AI 了"。
   - 隐式：用户回复长度骤降、回复间隔拉长、会话中断、连续"？"困惑；每轮 `styleMetrics` 偏离本人指纹的程度。
2. **提议（候选生成）**
   - LLM 输出 `{kind, text, dimension, evidenceMsgIds, confidence}`；离线规则兜底继续保留。
   - **语义去重**：规范化 + bigram Jaccard 相似度 ≥ 阈值视为同一条，合并并提高置信度。
   - **冲突消解**：同一 `dimension` 只允许一条 active 规则，新规则需更高置信度才能替换。
   - **防漂移护栏**：任何会让风格明显偏离本人指纹的规则（如本人爱发表情，却学到"0 emoji"）直接降级为仅对当前用户生效的轻量偏好，或拒绝；不得改写 Layer 0。
3. **试用（Trial）**
   - 新规则先以 `trial` 状态进入 Prompt，观察后续 N 轮（默认 6 轮）的评测分与隐式信号。
   - 达标 → `active`；变差 → `retired` 并记录原因；用户 `locked` 的条目永不自动淘汰。
4. **遗忘与压缩（记忆）**
   - 记忆条目增加 `importance / recallCount / lastRecalledAt`，按综合分淘汰，取代 FIFO。
   - 过期日程归档到「过往小事」而非直接删除（还能被"上次你说要去…后来呢？"回忆起）。
   - 记忆超过阈值时调用 LLM 合并同类项（如多条"喜欢喝奶茶"类合并为一条）。
5. **触发策略**
   - 从"每 4 轮固定触发"改为 **信号驱动**：累计信号达到阈值 / 会话空闲 10 分钟后 / 用户手动"整理一下"。
   - 只有真正产生 active 变更时才打快照，减少无意义快照与 LLM 调用。

**验收**：单测覆盖去重、冲突、护栏、trial→active/retired 状态机、记忆淘汰；离线（无 Key / Vitest）路径完全确定性；评测分在模拟多轮对话中不下降（防退化）。

---

### Phase 4：纠偏体验与成长可视化 · M

- **聊天内一键纠偏**：消息右键/长按「不像 TA」→ 一句话说明 → 用 `CORRECTION_HANDLER_PROMPT` 提炼成规则（离线时原文入库）→ 下一轮立即生效并进入 trial 验证。
- **右侧 Inspector「成长日志」面板**：列出每条学到的记忆/习惯/风格规则（来源、证据消息、置信度、状态），支持 **撤销 / 锁定 / 编辑**；快照之间显示 diff。
- **清理死代码**：未使用的 `MERGER_PROMPT`、`EMOTION_EVOLVER_PROMPT` 接入或删除；评估 `isolation.ts` / `manager.ts`（仅 switch 路由在用）是否保留。

**验收**：浏览器实测纠偏 → 下一轮生效 → 面板可见可撤销；lint/typecheck/test/build 全绿。

---

## 3. PR 拆分与顺序（推荐）

| 顺序 | 分支 | 内容 | 级别 | 预计 |
|------|------|------|------|------|
| 1 | `feat/persona-eval-baseline` | Phase 0 评测度量 + 基线 | M | 1 天 |
| 2 | `fix/persona-core-state` | B1~B5（情绪连续、好感度、记忆检索、快照配额、写锁） | M | 1~1.5 天 |
| 3 | `refactor/unified-llm-client` | B6 + B7（统一 LLM 客户端、风格优先级） | M | 1 天 |
| 4 | `feat/persona-spec-structured` | Phase 2 结构化人格 + 迁移 + 双指纹 | L | 2~3 天 |
| 5 | `feat/evolution-closed-loop` | Phase 3 自进化闭环 + 记忆遗忘 | L | 2~3 天 |
| 6 | `feat/evolution-inspector-and-correction` | Phase 4 UI 纠偏与成长日志 | M | 1.5 天 |

> 推荐先做 1→2：评测先行能证明后续每一步的收益；第 2 步全是确定性 Bug，风险低、体感提升最明显。
> 每个 PR 都从最新 `origin/master` 切出，本地 lint / typecheck / test / build 全绿后再提 PR。

---

## 4. 风险与对策

| 风险 | 对策 |
|------|------|
| 结构化迁移损坏旧角色 | 迁移前自动打 manual 快照；读兼容旧格式；迁移单测覆盖内置角色 + 灵魂包样本 |
| 自进化调用 LLM 增加成本/延迟 | 信号驱动触发 + 空闲时执行 + 结果缓存；始终后台异步，不阻塞回复 |
| 规则漂移让角色"变味" | 本人指纹锚点 + 护栏 + trial 验证 + 一键撤销 |
| 零配置原则被破坏 | 每个新模块都有纯 TS 离线路径，Vitest 下完全确定性 |
| MongoDB 适配遗漏新字段 | Phase 2 同步更新 `db/models/Persona.ts` 并加适配层单测 |

---

## 5. 待确认的问题

1. **范围**：一次性按 6 个 PR 全部推进，还是先做 Phase 0 + Phase 1 看效果再决定？
2. **LLM 评审**：是否需要"让模型当裁判"给像本人分打分（更准但每次评测要花调用额度），还是只用纯规则打分？
3. **镜像强度**：你更希望角色"坚持本人说话方式"，还是"逐渐向你的说话方式靠拢"？（决定双指纹默认权重）
4. **成长日志面板**：是否需要对用户可见、可编辑？还是只做后台调试视图？
