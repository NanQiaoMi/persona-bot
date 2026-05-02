# PersonaBot — 基于CowAgent+Ex-Skill的微信拟人聊天机器人

> 完整项目开发文档 v1.0 | 六轮深度访谈产出

---

## 一、项目概述

### 1.1 项目定位

将 [ex-skill](https://github.com/perkfly/ex-skill)（前任.skill）的Persona拟人生成能力，以CowAgent Skill插件形式集成到 [CowAgent](https://github.com/zhayujie/CowAgent)（chatgpt-on-wechat）框架中，实现一个可通过微信交互的拟人化AI聊天机器人。

### 1.2 核心价值主张

- 从真实聊天记录+性格描述中蒸馏出人物Persona
- 基于Persona的5层性格结构进行拟人化对话
- 跨会话情感状态持久化与演进
- 支持多角色切换、全模态消息处理、Agent工具调用风格化输出

### 1.3 技术栈总览

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 运行框架 | CowAgent 2.0.7+ | 微信通道 + Agent引擎 + Skills系统 |
| 集成方式 | CowAgent Skill插件 | 遵循SKILL.md frontmatter规范 |
| LLM | 待用户指定API地址和Key | Prompt需深度重写适配 |
| 语言 | Python 3.9~3.13 | CowAgent运行时要求 |
| 数据解析 | WechatExporter导出 + 自研Parser | HTML/TXT格式解析 |
| 数据存储 | 本地文件系统（CowAgent工作空间） | persona数据 + 情感状态 + 记忆 |
| 运行环境 | 本地 Windows/Mac | 微信扫码登录 |

---

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    微信个人号通道                         │
│              (CowAgent weixin channel)                   │
└──────────────────────┬──────────────────────────────────┘
                       │ 消息收发
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   CowAgent 核心引擎                       │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐              │
│  │ 消息路由 │  │ Agent调度 │  │ 工具系统   │              │
│  └────┬────┘  └─────┬────┘  └─────┬─────┘              │
│       │             │             │                      │
│       ▼             ▼             ▼                      │
│  ┌─────────────────────────────────────────────┐        │
│  │           PersonaBot Skill                   │        │
│  │  ┌─────────────┐  ┌──────────────────────┐  │        │
│  │  │ Persona管理器 │  │  Prompt组装器        │  │        │
│  │  │ - 创建/切换   │  │  - 全量拼接注入      │  │        │
│  │  │ - 增量更新    │  │  - 分层组装策略      │  │        │
│  │  │ - 纠偏重建    │  │  - Persona风格过滤   │  │        │
│  │  └─────────────┘  └──────────────────────┘  │        │
│  │  ┌─────────────┐  ┌──────────────────────┐  │        │
│  │  │ 情感引擎     │  │  记忆管理器          │  │        │
│  │  │ - LLM推理演进│  │  - 双层记忆融合      │  │        │
│  │  │ - 状态持久化 │  │  - Persona Memories  │  │        │
│  │  │ - 情感演进   │  │  - CowAgent长期记忆  │  │        │
│  │  └─────────────┘  └──────────────────────┘  │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### 2.2 CowAgent Skill结构

严格遵循CowAgent的Skill规范，目录结构如下：

```
skills/persona-bot/
├── SKILL.md                    # Skill入口（AgentSkills标准frontmatter）
├── prompts/
│   ├── intake.md               # 对话式信息录入Prompt（深度重写版）
│   ├── memories_analyzer.md    # 共同记忆提取Prompt（深度重写版）
│   ├── persona_analyzer.md     # 性格行为提取Prompt（深度重写版）
│   ├── memories_builder.md     # memories.md生成模板（深度重写版）
│   ├── persona_builder.md      # persona.md五层结构模板（深度重写版）
│   ├── merger.md               # 增量merge逻辑Prompt（深度重写版）
│   ├── correction_handler.md   # 对话纠正处理Prompt（深度重写版）
│   ├── emotion_evolver.md      # 情感演进推理Prompt（新增）
│   ├── response_styler.md      # Persona风格过滤Prompt（新增）
│   └── ooc_guard.md            # OOC防护规则Prompt（新增）
├── tools/
│   ├── wechat_parser.py        # 微信聊天记录解析（适配WechatExporter格式）
│   ├── imessage_parser.py      # iMessage解析
│   ├── sms_parser.py           # 短信解析
│   ├── photo_analyzer.py       # 照片EXIF元数据分析
│   ├── social_media_parser.py  # 社交媒体解析
│   ├── skill_writer.py         # Skill文件管理
│   ├── version_manager.py      # 版本存档与回滚
│   ├── emotion_engine.py       # 情感状态机引擎（新增）
│   ├── prompt_assembler.py     # Prompt组装器（新增）
│   └── persona_manager.py      # Persona生命周期管理（新增）
├── exes/                       # 生成的Persona数据（gitignored）
│   └── {slug}/
│       ├── persona.md          # 五层性格结构
│       ├── memories.md         # 共同记忆
│       ├── corrections.json    # 纠偏记录
│       ├── emotion_state.json  # 当前情感状态
│       ├── emotion_history.json# 情感历史
│       └── versions/           # 版本存档
└── config/
    └── default_personality_tags.json  # 默认性格标签库
```

### 2.3 SKILL.md Frontmatter设计

```yaml
---
name: persona-bot
description: 拟人化聊天机器人，从聊天记录中蒸馏Persona，支持多角色切换、情感演进、全模态拟人
commands:
  - name: create-persona
    description: 创建新的Persona角色
    trigger: /create-persona
  - name: list-personas
    description: 列出所有Persona角色
    trigger: /list-personas
  - name: switch-persona
    description: 切换当前活跃Persona
    trigger: /switch-persona {slug}
  - name: update-persona
    description: 增量更新Persona数据
    trigger: /update-persona {slug}
  - name: rebuild-persona
    description: 全量重建Persona
    trigger: /rebuild-persona {slug}
  - name: delete-persona
    description: 删除Persona角色
    trigger: /delete-persona {slug}
  - name: persona-status
    description: 查看当前Persona情感状态
    trigger: /persona-status
  - name: persona-correct
    description: 纠正Persona行为
    trigger: /persona-correct {slug} {description}
---
```

---

## 三、核心模块详细设计

### 3.1 Persona创建Pipeline

#### 3.1.1 对话式创建流程

用户在微信中发送 `/create-persona` 触发创建流程，通过多轮对话完成信息录入：

```
阶段1: 基础信息录入 (intake)
  Bot → "请告诉我她的昵称"
  User → "小美"
  Bot → "你们的关系是什么？如：在一起三年 大学同学 分手一年"
  User → "在一起三年 大学同学 分手一年"
  Bot → "她的性格标签？如：爱撒娇 翻旧账 焦虑型"
  User → "ENFP 双子座 焦虑型 爱撒娇 翻旧账"
  Bot → "请将微信聊天记录导出文件放到 ~/cow/persona_import/ 目录，输入done继续"

阶段2: 数据解析
  - 扫描 ~/cow/persona_import/ 目录
  - 调用 wechat_parser.py 解析HTML/TXT
  - 输出结构化对话数据

阶段3: 记忆提取 (memories_analyzer)
  - 输入：结构化对话数据 + 基础信息
  - LLM调用：提取共同记忆（关系时间线、日常仪式、偏好习惯、情感模式）
  - 输出：原始记忆片段

阶段4: 性格提取 (persona_analyzer)
  - 输入：结构化对话数据 + 基础信息 + 性格标签
  - LLM调用：提取5层性格结构
  - 输出：原始性格特征

阶段5: 记忆文档生成 (memories_builder)
  - 输入：原始记忆片段
  - LLM调用：组织为memories.md格式
  - 输出：memories.md

阶段6: 性格文档生成 (persona_builder)
  - 输入：原始性格特征
  - LLM调用：组织为persona.md五层结构
  - 输出：persona.md

阶段7: 初始化情感状态
  - 创建emotion_state.json初始状态
  - 创建版本存档
```

#### 3.1.2 生成中断容错

采用"重新开始+数据复用"策略：
- 阶段1-2的输出（基础信息+解析后对话数据）缓存到 `~/.cow/persona_temp/{session_id}/`
- 中断后重新触发时，检测temp目录中是否有可用缓存
- 有缓存则跳过已完成的阶段，从断点继续
- 每次全量生成完成后清理temp目录

#### 3.1.3 全量精细生成策略

解析三年聊天记录（10万+消息）的分批处理方案：

```python
BATCH_SIZE = 500  # 每批处理500条消息
OVERLAP = 50      # 批次间重叠50条保证上下文连贯

def process_chat_records(records):
    batches = split_into_batches(records, BATCH_SIZE, OVERLAP)
    all_memories = []
    all_traits = []
    
    for i, batch in enumerate(batches):
        memories = llm_call(memories_analyzer_prompt, batch)
        traits = llm_call(persona_analyzer_prompt, batch)
        all_memories.append(memories)
        all_traits.append(traits)
    
    # 合并所有批次的提取结果
    merged_memories = llm_call(merger_prompt, all_memories)
    merged_traits = llm_call(merger_prompt, all_traits)
    
    # 生成最终文档
    memories_md = llm_call(memories_builder_prompt, merged_memories)
    persona_md = llm_call(persona_builder_prompt, merged_traits)
    
    return memories_md, persona_md
```

预计token消耗估算（10万条消息）：
- 解析阶段：约 200k input tokens（分批）
- 提取阶段：约 300k input + 100k output tokens
- 生成阶段：约 50k input + 30k output tokens
- **总计：约 680k tokens，预计耗时 10-20分钟**

### 3.2 记忆系统 — 双层融合架构

#### 3.2.1 两层记忆的职责划分

| 维度 | Persona Memories (ex-skill) | CowAgent长期记忆 |
|------|---------------------------|-----------------|
| 来源 | 从历史聊天记录蒸馏 | 实时对话记录自动归档 |
| 性质 | 主观情感记忆（"她记得..."） | 客观对话记录（"实际说了..."） |
| 更新方式 | 增量merge/月度全量重建 | CowAgent自动（核心记忆/日级记忆/梦境蒸馏） |
| 用途 | 提供人物背景、关系细节、情感锚点 | 提供近期对话上下文、事件时间线 |

#### 3.2.2 记忆协作机制

当用户问"还记得我们去年去三亚吗"时：

```
1. CowAgent长期记忆检索 → 找到近期对话中关于三亚的提及
2. Persona Memories检索 → 找到"去年8月一起去三亚"的共同记忆
3. 两套记忆合并，Persona Memories提供情感细节（"她最喜欢那个椰子冰"）
4. CowAgent记忆提供时效信息（"你上周刚提过想再去"）
5. 结合当前情感状态组织回复
```

#### 3.2.3 记忆冲突处理

当两层记忆矛盾时（如Persona记忆中有某事件，但CowAgent记忆中从未提及）：
- **以Persona Memories为优先**：它们代表角色的主观记忆
- CowAgent记忆作为补充和修正源
- 冲突时在回复中偏向Persona视角（角色应该记得的事比实际发生的更重要）

### 3.3 情感引擎

#### 3.3.1 情感状态数据结构

```json
{
  "slug": "xiaomei",
  "current_state": {
    "primary_emotion": "slightly_annoyed",
    "intensity": 0.6,
    "trigger": "user_ignored_message_yesterday",
    "last_updated": "2026-05-02T08:30:00Z",
    "decay_rate": 0.15
  },
  "emotion_history": [
    {
      "timestamp": "2026-05-01T22:00:00Z",
      "event": "user_sent_good_night",
      "resulting_emotion": "content",
      "intensity": 0.8
    },
    {
      "timestamp": "2026-05-01T23:30:00Z",
      "event": "user_did_not_respond_to_message",
      "resulting_emotion": "slightly_annoyed",
      "intensity": 0.6
    }
  ],
  "baseline_personality": {
    "emotional_range": ["撒娇", "赌气", "开心", "焦虑", "冷淡", "黏人"],
    "default_state": "playful",
    "recovery_patterns": {
      "from_anger": "需要主动哄，简单道歉不够",
      "from_cold": "需要持续关心，一次热情不够",
      "from_anxiety": "需要确认和陪伴"
    }
  }
}
```

#### 3.3.2 LLM推理情感演进

核心机制：每次对话开始前，用LLM推理当前情感状态。

**触发时机：**
1. 用户发送消息时（对话开始）
2. CowAgent定时任务触发（无对话时的情感演进）

**对话时情感初始化Prompt：**

```
你是{slug}的情感状态分析器。根据以下信息推断她此刻的心情：

【性格特征】{persona_emotion_logic_layer}
【上次情感状态】{last_emotion_state}
【距上次对话】{time_since_last_chat}
【最近3次对话摘要】{recent_chat_summary}
【情感恢复模式】{recovery_patterns}

请输出：
1. 当前主要情绪（从她的情感词汇库中选择）
2. 情绪强度（0.0-1.0）
3. 她此刻开口第一句话的态度倾向（热情/冷淡/赌气/撒娇/正常）
4. 简要推理过程

输出格式：JSON
```

**空闲时情感演进（定时任务）：**

```
你是{slug}的情感模拟器。现在是{current_time}，距离上次对话已过{hours_since_last}小时。

【性格特征】{persona_emotion_logic_layer}
【当前情感状态】{current_emotion_state}
【情感恢复模式】{recovery_patterns}

根据她的性格，模拟在这段时间里她的情感如何变化：
1. 负面情绪是否自然衰减？衰减速率？
2. 是否产生了新的情绪？（如被冷落→赌气）
3. 如果现在她主动发消息，会说什么？

输出：更新后的情感状态JSON
```

#### 3.3.3 定时情感演进任务

在CowAgent的定时任务系统中注册：

```json
{
  "schedule": "every_4_hours",
  "task": "emotion_evolve",
  "params": {
    "persona_slug": "xiaomei",
    "idle_threshold_hours": 2
  }
}
```

当空闲超过2小时时，每4小时触发一次情感演进推理。

### 3.4 系统Prompt组装器 — 全量拼接注入

#### 3.4.1 组装结构

每次用户消息到达时，按以下顺序拼接system prompt：

```
┌─────────────────────────────────────────────────────────┐
│ [1] 全局系统指令 (约500 tokens)                          │
│     - 角色扮演强制规则                                   │
│     - 绝不暴露AI身份                                    │
│     - 回复语言和风格总纲                                 │
├─────────────────────────────────────────────────────────┤
│ [2] Persona核心 — persona.md全文 (约2000-5000 tokens)   │
│     - 硬规则层                                          │
│     - 身份层                                            │
│     - 表达风格层                                        │
│     - 情感逻辑层                                        │
│     - 关系行为层                                        │
├─────────────────────────────────────────────────────────┤
│ [3] 共同记忆 — memories.md全文 (约3000-8000 tokens)     │
│     - 关系时间线                                        │
│     - 日常仪式                                          │
│     - 偏好习惯                                          │
│     - 情感模式                                          │
├─────────────────────────────────────────────────────────┤
│ [4] 当前情感状态 (约200 tokens)                          │
│     - emotion_state.json摘要                            │
│     - 当前情绪 + 强度 + 态度倾向                        │
├─────────────────────────────────────────────────────────┤
│ [5] Correction层 (约0-1000 tokens)                      │
│     - 累积的纠偏记录                                    │
├─────────────────────────────────────────────────────────┤
│ [6] CowAgent工具定义 (约1000-2000 tokens)               │
│     - 可用工具列表                                      │
│     - 工具使用约束（输出必须经persona风格过滤）           │
├─────────────────────────────────────────────────────────┤
│ [7] 当前对话上下文 (动态)                               │
│     - CowAgent长期记忆检索结果                          │
│     - 近期对话历史                                      │
└─────────────────────────────────────────────────────────┘

预估总量：7000-17000 tokens (不含对话历史)
加上对话历史和用户消息：可能达到 20000-50000 tokens
```

#### 3.4.2 Prompt组装代码核心逻辑

```python
class PromptAssembler:
    def assemble_system_prompt(self, slug: str, context: dict) -> str:
        persona = self.load_persona(slug)
        emotion = self.load_emotion_state(slug)
        corrections = self.load_corrections(slug)
        cow_memory = context.get("cow_memory", "")
        
        parts = []
        
        # [1] 全局系统指令
        parts.append(self.render_global_directives(slug))
        
        # [2] Persona核心
        parts.append(persona["persona_md"])
        
        # [3] 共同记忆
        parts.append(persona["memories_md"])
        
        # [4] 当前情感状态
        parts.append(self.render_emotion_state(emotion))
        
        # [5] Correction层
        if corrections:
            parts.append(self.render_corrections(corrections))
        
        # [6] CowAgent工具定义（风格化约束）
        parts.append(self.render_tool_definitions_with_persona_constraint(slug))
        
        # [7] CowAgent长期记忆
        if cow_memory:
            parts.append(self.render_cow_memory(cow_memory))
        
        return "\n\n---\n\n".join(parts)
    
    def render_tool_definitions_with_persona_constraint(self, slug: str) -> str:
        return f"""你可以使用以下工具来帮助回复，但所有工具返回的结果必须用你的语气和风格重新表达。
绝对不能直接输出工具的原始返回数据。
工具调用结果只是你获取信息的手段，最终回复必须完全符合你的persona。

{self.get_tool_definitions()}"""
```

#### 3.4.3 Token超限处理

当全量拼接后总token超过模型限制时：
1. **优先保留**：全局指令 > Persona核心 > 情感状态 > Correction
2. **可压缩**：memories.md → 摘要压缩；CowAgent记忆 → 仅保留最近N轮
3. **可裁剪**：工具定义（仅保留高频工具）；对话历史（窗口滑动）
4. 利用CowAgent的 `agent_max_context_tokens` 配置项自动触发智能压缩

### 3.5 多角色切换机制

#### 3.5.1 命令切换流程

```
用户 → /switch-persona xiaomei
Bot  → 已切换到「小美」模式 🎀
       当前状态：有点小赌气（你昨天没回消息）
       
用户 → /switch-persona ajie
Bot  → 已切换到「阿杰」模式 🎸
       当前状态：正常，刚看完球赛
```

#### 3.5.2 上下文隔离

每个Persona拥有独立的：
- persona.md / memories.md
- emotion_state.json / emotion_history.json
- corrections.json
- CowAgent长期记忆分区（通过session_id隔离）
- 版本存档目录

切换时：
1. 保存当前Persona的对话状态
2. 加载目标Persona的全套数据
3. 重新组装system prompt
4. 重置对话上下文窗口

### 3.6 全模态拟人处理

#### 3.6.1 各消息类型处理策略

| 消息类型 | 输入处理 | 输出策略 |
|---------|---------|---------|
| 文本 | 直接进入persona回复流程 | persona风格化回复 |
| 图片 | 多模态模型分析内容 | 用persona视角描述/评论（"这只猫好可爱！和我们上次在小区看到的好像"） |
| 语音 | Whisper转文本 + 语音情感识别 | 结合语音情感+persona当前情绪回复，可选语音回复 |
| 表情包 | 表情包内容识别 | persona风格回应（可回复文字或推荐表情包描述） |
| 位置 | 解析位置信息 | persona视角评论（"诶你去三里屯了？不带我！"） |
| 文件 | 文件内容解析 | persona风格评价 |
| 视频 | 视频关键帧提取+分析 | persona视角评论 |

#### 3.6.2 多模态Prompt注入

在system prompt中增加多模态指令段：

```
【多模态处理规则】
- 当用户发图片时：先描述你看到的，然后用你的语气评论
- 当用户发语音时：注意语音中的情感（撒娇/生气/开心），结合你当前的心情回应
- 当用户发位置时：联想你们相关的记忆，用你的态度评论
- 当你使用工具获取信息时：必须用你的语气重新表达结果，绝不暴露工具调用痕迹
```

### 3.7 Persona风格过滤 — Agent工具输出风格化

#### 3.7.1 Persona优先+Agent辅助的实现

```
用户消息 → Persona判断（她此时的心情和态度）
         ↓
    需要工具调用吗？
    ├── 不需要 → Persona直接生成回复
    └── 需要 → Agent调用工具获取原始数据
                   ↓
              Persona风格过滤
              （将原始数据转化为她的表达方式）
                   ↓
              最终回复
```

示例：

```
用户：今天天气怎么样
Agent工具：北京，晴，25°C，微风
Persona风格过滤（小美，撒娇型）：
  → "今天太阳好大！适合出去玩～你带我去逛街嘛 🌞"
  
Persona风格过滤（阿杰，直男型）：
  → "晴天 25度 还行 出去溜达溜达"
```

### 3.8 纠偏机制 — 累积触发重建

#### 3.8.1 纠偏记录收集

```json
{
  "slug": "xiaomei",
  "corrections": [
    {
      "timestamp": "2026-05-01T15:30:00Z",
      "user_input": "我不开心",
      "bot_response": "怎么了？告诉我发生了什么",
      "correction": "她不会这样温柔地问，她会先发个表情包然后说'哦'",
      "category": "expression_style"
    },
    {
      "timestamp": "2026-05-01T16:00:00Z",
      "user_input": "想你了",
      "bot_response": "我也想你",
      "correction": "她不会直接说想我，她会说'谁想你了 自作多情'",
      "category": "emotional_expression"
    }
  ],
  "rebuild_threshold": 5,
  "current_count": 2
}
```

#### 3.8.2 重建触发条件

- 累积纠偏记录达到 `rebuild_threshold`（默认5条）
- 或用户主动触发 `/rebuild-persona {slug}`
- 或月度定时全量重建

#### 3.8.3 重建流程

1. 收集所有corrections记录
2. 将corrections分类（表达风格类 / 情感逻辑类 / 事实记忆类）
3. 调用LLM重写persona.md中对应的层级
4. 保留未被纠正的部分不变
5. 创建新版本存档
6. 清空corrections计数器
7. 热加载新persona

### 3.9 增量更新机制 — 混合策略

#### 3.9.1 日常增量merge

触发方式：`/update-persona xiaomei`

1. 用户将新的聊天记录导出文件放到 `~/cow/persona_import/` 目录
2. wechat_parser.py 解析新数据
3. 与已有对话数据比对，提取增量部分
4. LLM调用merger prompt，增量分析新数据中的记忆和性格特征
5. merge到现有memories.md和persona.md中（不覆盖已有结论）
6. 创建版本存档

#### 3.9.2 月度全量重建

在CowAgent定时任务中注册：

```json
{
  "schedule": "monthly",
  "task": "persona_rebuild",
  "params": {
    "persona_slug": "xiaomei"
  }
}
```

月度重建流程：
1. 汇总所有历史对话数据（原始 + 增量）
2. 全量重新执行memories_analyzer → persona_analyzer → builder pipeline
3. 与现有persona对比，保留corrections层
4. 创建新版本存档
5. 热加载新persona

### 3.10 微信风控 — 频率控制+拟人延迟

#### 3.10.1 发送频率控制

```python
class WeChatRateLimiter:
    MIN_INTERVAL = 3       # 两条消息最小间隔（秒）
    MAX_INTERVAL = 15      # 最大间隔（秒）
    DAILY_LIMIT = 200      # 每日最大发送消息数
    GROUP_DAILY_LIMIT = 100 # 每日群聊最大发送数
    
    def get_send_delay(self, message_length: int) -> float:
        """模拟人类打字延迟"""
        base_delay = len(message_length) * 0.1  # 每字0.1秒
        random_delay = random.uniform(self.MIN_INTERVAL, self.MAX_INTERVAL)
        return base_delay + random_delay
    
    def should_send(self, context: dict) -> bool:
        if self.daily_count >= self.DAILY_LIMIT:
            return False
        if context.get("is_group") and self.group_daily_count >= self.GROUP_DAILY_LIMIT:
            return False
        return True
```

#### 3.10.2 拟人行为策略

- 回复延迟：根据消息长度模拟打字时间 + 随机延迟
- 消息拆分：长回复拆分为2-3条消息分开发送（模拟真人发消息习惯）
- 不秒回：对非紧急消息随机延迟1-5分钟再回复
- 群聊节制：群聊中不主动发言，只在@或关键词触发时回复
- 主动消息：偶尔主动发消息（基于persona性格和情感状态），但频率极低（每天0-2次）

---

## 四、Prompt深度重写方案

### 4.1 重写原则

ex-skill的7个原始Prompt针对Claude深度优化，需要针对目标模型重写，原则如下：

1. **结构显式化**：Claude善于理解隐含逻辑，其他模型需要更显式的步骤指引
2. **示例驱动**：每个Prompt增加2-3个输入输出示例（Few-shot）
3. **输出格式强化**：用JSON Schema或Markdown模板严格约束输出格式
4. **思考链显式化**：将Claude的隐式推理显式化为step-by-step指令
5. **约束前置**：所有硬性约束放在Prompt开头，而非分散在中间

### 4.2 各Prompt重写要点

#### 4.2.1 intake.md — 对话式信息录入

原始：Claude对话流式交互
重写要点：
- 每个字段单独一轮对话，不合并
- 明确的字段验证规则
- 支持跳过（"可以跳过"提示）
- 增加字段的含义解释（非简单标签）

#### 4.2.2 memories_analyzer.md — 共同记忆提取

原始：Claude长上下文理解 + 隐式情感判断
重写要点：
- 明确4个提取维度：时间线/仪式/偏好/情感模式
- 每个维度给出具体的提取示例
- 增加情感判断的显式规则（"当她说X时，实际情感是Y"）
- 输出JSON格式，每条记忆包含：内容/情感标签/重要性/时间锚点

#### 4.2.3 persona_analyzer.md — 性格行为提取

原始：5层结构隐式推导
重写要点：
- 5层结构逐一显式提取，每层独立prompt调用
- 增加性格标签翻译表（用户口语 → 心理学术语）
- 输出JSON格式，每层包含：规则/示例/反例/触发条件
- 增加冲突检测：当用户描述与聊天记录矛盾时标记

#### 4.2.4 persona_builder.md — 五层结构生成

原始：Claude自由组织markdown
重写要点：
- 严格定义每层的markdown格式模板
- 每层必须包含：规则声明/典型示例/边界示例/绝对禁止
- 硬规则层用最高约束力度（"绝对不可违反"）
- 情感逻辑层用决策树格式（"如果X则Y，否则Z"）

#### 4.2.5 新增：emotion_evolver.md — 情感演进推理

此Prompt为项目新增，需要设计：
- 输入：当前情感状态 + 时间间隔 + 性格特征 + 恢复模式
- 输出：更新后的情感状态JSON
- 约束：情感变化必须符合persona的情感逻辑层
- 考虑因素：时间衰减、事件权重、性格倾向、随机扰动

#### 4.2.6 新增：response_styler.md — 回复风格过滤

此Prompt为项目新增：
- 输入：Agent工具返回的原始数据 + 当前情感状态 + persona风格定义
- 输出：persona风格化的回复
- 约束：不改变事实信息，只改变表达方式
- 示例驱动：提供3-5个"原始数据→风格化回复"的对照示例

#### 4.2.7 新增：ooc_guard.md — OOC防护规则

此Prompt为项目新增：
- 在system prompt中加入角色边界强制规则
- 定义"绝对禁止"行为清单（如提及自己是AI、使用超出知识范围的信息）
- 定义安全回复模板（遇到不确定场景时的兜底回复）
- 基于persona硬规则层自动生成约束

### 4.3 Prompt重写验证流程

1. 准备测试数据：100条微信聊天记录 + 完整性格描述
2. 分别用原始Claude Prompt和新Prompt生成persona
3. 对比两份persona的质量差异
4. 迭代调整新Prompt直至效果可接受
5. 用生成的persona进行20轮对话测试
6. 主观评估拟人化程度

---

## 五、数据流全景

### 5.1 消息处理主流程

```
微信消息到达
    │
    ▼
CowAgent weixin channel 接收
    │
    ▼
消息路由 → PersonaBot Skill
    │
    ├── 管理命令？→ 执行对应管理操作（创建/切换/更新/纠偏）
    │
    └── 普通消息 →
        │
        ▼
    [Step 1] 加载当前Persona
        │  persona.md + memories.md + corrections
        ▼
    [Step 2] 情感状态初始化
        │  如果距上次对话>30min → LLM推理当前情感
        │  否则沿用内存中的情感状态
        ▼
    [Step 3] 多模态消息预处理
        │  图片→多模态分析 / 语音→Whisper转文本 / 其他→对应处理
        ▼
    [Step 4] 组装System Prompt
        │  全量拼接：全局指令+Persona+Memories+情感+Correction+工具+记忆
        ▼
    [Step 5] LLM推理
        │  Persona优先：先判断是否需要工具调用
        │  如需工具 → Agent调用 → 风格过滤
        │  如不需 → Persona直接生成
        ▼
    [Step 6] 后处理
        │  频率控制 + 拟人延迟
        │  消息拆分（长回复拆为多条）
        ▼
    [Step 7] 发送回复
        │
        ▼
    [Step 8] 更新状态
        │  更新情感状态
        │  写入CowAgent长期记忆
        │  检查纠偏累积
        ▼
    完成
```

### 5.2 Persona创建数据流

```
用户发送 /create-persona
    │
    ▼
多轮对话录入基础信息
（昵称、关系、性格标签）
    │
    ▼
用户将聊天记录导出文件放到指定目录
    │
    ▼
wechat_parser.py 解析
    │  输入：HTML/TXT文件
    │  输出：结构化JSON [{sender, content, timestamp, type}]
    ▼
缓存到temp目录
    │
    ▼
分批LLM调用 — memories_analyzer
    │  每批500条，重叠50条
    │  输出：每批记忆片段
    ▼
分批LLM调用 — persona_analyzer
    │  每批500条，重叠50条
    │  输出：每批性格特征
    ▼
LLM调用 — merger（合并所有批次结果）
    │  输出：合并后的记忆 + 性格特征
    ▼
LLM调用 — memories_builder
    │  输出：memories.md
    ▼
LLM调用 — persona_builder
    │  输出：persona.md（五层结构）
    ▼
初始化 emotion_state.json
    │
    ▼
创建版本存档
    │
    ▼
写入 exes/{slug}/ 目录
    │
    ▼
热加载到当前会话
    │
    ▼
通知用户创建完成
```

---

## 六、开发计划

### 6.1 整体策略：快速出可用版再迭代

### 6.2 开发阶段

#### Phase 1：基础框架搭建（1-2周）

**目标**：Skill骨架可加载运行，微信通道正常收发消息

- [ ] 创建CowAgent Skill目录结构，编写SKILL.md
- [ ] 实现persona_manager.py基础框架（CRUD操作）
- [ ] 实现prompt_assembler.py基础框架（全量拼接）
- [ ] 实现wechat_parser.py（WechatExporter HTML/TXT解析）
- [ ] 编写简化版intake.md和persona_builder.md（先用最简单的prompt跑通流程）
- [ ] 集成到CowAgent，验证Skill加载和微信消息收发
- [ ] 基础的单persona对话（仅文本，无情感演进）

**交付物**：可通过微信与单个简化版persona对话的最小系统

#### Phase 2：Prompt深度重写（1-2周）

**目标**：7个核心Prompt + 3个新增Prompt全部重写并验证

- [ ] 重写intake.md — 对话式信息录入
- [ ] 重写memories_analyzer.md — 共同记忆提取
- [ ] 重写persona_analyzer.md — 性格行为提取
- [ ] 重写memories_builder.md — 记忆文档生成
- [ ] 重写persona_builder.md — 五层结构生成
- [ ] 重写merger.md — 增量合并逻辑
- [ ] 重写correction_handler.md — 纠偏处理
- [ ] 编写emotion_evolver.md — 情感演进推理（新增）
- [ ] 编写response_styler.md — 回复风格过滤（新增）
- [ ] 编写ooc_guard.md — OOC防护规则（新增）
- [ ] 使用测试数据验证所有Prompt效果

**交付物**：经过验证的完整Prompt集合

#### Phase 3：情感引擎+多角色（1周）

**目标**：情感状态持久化、LLM推理演进、多角色切换

- [ ] 实现emotion_engine.py
- [ ] 实现emotion_state.json读写和更新逻辑
- [ ] 实现对话时情感初始化（LLM推理）
- [ ] 实现空闲时情感演进（CowAgent定时任务）
- [ ] 实现/switch-persona多角色切换
- [ ] 实现每个Persona的独立数据空间
- [ ] 实现上下文隔离

**交付物**：支持情感演进和多角色切换的完整系统

#### Phase 4：全模态+Agent风格化（1周）

**目标**：图片/语音/位置等全模态处理，Agent工具输出风格化

- [ ] 图片消息 → 多模态分析 → persona视角评论
- [ ] 语音消息 → Whisper转文本 → 情感识别 → persona回复
- [ ] 位置/文件/视频消息处理
- [ ] Agent工具调用 → response_styler风格过滤
- [ ] 频率控制和拟人延迟
- [ ] 消息拆分发送

**交付物**：全功能完整版

#### Phase 5：增量更新+纠偏+优化（1周）

**目标**：增量merge、累积纠偏重建、月度全量重建

- [ ] 实现增量merge流程
- [ ] 实现corrections.json累积机制
- [ ] 实现纠偏触发重建
- [ ] 实现月度全量重建定时任务
- [ ] 实现生成中断容错（temp缓存+断点续传）
- [ ] 可选内容过滤器
- [ ] 性能优化和bug修复

**交付物**：生产可用完整版

### 6.3 里程碑

| 里程碑 | 交付内容 | 预计时间 |
|--------|---------|---------|
| M1 | Phase 1完成，微信可对话 | 第2周末 |
| M2 | Phase 2完成，Prompt验证通过 | 第4周末 |
| M3 | Phase 3完成，情感+多角色 | 第5周末 |
| M4 | Phase 4完成，全模态+风格化 | 第6周末 |
| M5 | Phase 5完成，全部功能 | 第7周末 |

---

## 七、风险与缓解

| 风险 | 严重度 | 概率 | 缓解措施 |
|------|--------|------|---------|
| 微信封号 | 高 | 中 | 频率控制+拟人延迟+消息拆分+群聊节制 |
| Prompt重写后效果不及Claude | 高 | 高 | 增加Few-shot示例+逐步验证+迭代优化 |
| 全量生成token成本过高 | 中 | 中 | 分批处理+缓存+增量更新优先 |
| LLM情感推理不稳定 | 中 | 中 | 增加情感变化幅度约束+基线状态兜底 |
| Persona OOC崩塌 | 中 | 中 | 硬规则约束+OOC防护Prompt+容忍度策略 |
| CowAgent Skill引擎限制 | 低 | 低 | 严格遵循规范+必要时用多Skill拆分 |
| 聊天记录导出困难 | 中 | 中 | 支持多种导入方式（文件/粘贴/照片） |

---

## 八、配置模板

### 8.1 CowAgent config.json 新增配置项

```json
{
  "persona_bot_enabled": true,
  "persona_bot_default_slug": "",
  "persona_bot_emotion_evolve_interval_hours": 4,
  "persona_bot_idle_threshold_hours": 2,
  "persona_bot_rebuild_threshold": 5,
  "persona_bot_monthly_rebuild": true,
  "persona_bot_max_context_tokens": 50000,
  "persona_bot_rate_limit_daily": 200,
  "persona_bot_rate_limit_group_daily": 100,
  "persona_bot_content_filter_enabled": false,
  "persona_bot_import_dir": "~/cow/persona_import",
  "persona_bot_temp_dir": "~/cow/persona_temp"
}
```

### 8.2 默认性格标签库（default_personality_tags.json）

```json
{
  "恋爱性格": ["爱撒娇", "冷暴力", "翻旧账", "黏人", "独立", "细腻敏感", "忽冷忽热", "作", "玻璃心", "控制欲强"],
  "吵架模式": ["冷战派", "爆发派", "讲道理派", "先道歉型", "死不认错"],
  "依恋类型": ["安全型", "焦虑型", "回避型", "混乱型"],
  "爱的表达": ["言语肯定", "服务行为", "送礼物", "肢体接触", "高质量陪伴"],
  "社交模式": ["社交牛逼症", "社恐", "慢热", "自来熟", "外冷内热"]
}
```

---

## 九、测试策略

### 9.1 主观体验测试方案

1. **Persona创建测试**：用自己的真实聊天记录创建persona，主观判断生成质量
2. **对话质量测试**：与persona进行20轮对话，记录OOC次数和不自然回复
3. **情感演进测试**：故意冷落2天后再对话，验证情感状态是否合理变化
4. **多角色测试**：创建2-3个不同性格的persona，验证切换是否正常、上下文是否隔离
5. **Agent工具测试**：查询天气/搜索等场景，验证工具结果是否被正确风格化
6. **增量更新测试**：添加新聊天记录后更新persona，验证增量merge效果
7. **纠偏测试**：连续纠正5次，验证是否触发重建且效果改善

### 9.2 关键验证点

- [ ] persona创建pipeline端到端可运行
- [ ] 生成的persona.md包含完整的五层结构
- [ ] 生成的memories.md包含具体可引用的记忆细节
- [ ] 微信消息可正常收发并得到persona风格回复
- [ ] 情感状态可跨会话持久化
- [ ] 空闲时情感演进正常触发
- [ ] 多角色切换后上下文正确隔离
- [ ] Agent工具调用结果被persona风格化
- [ ] 增量merge不破坏现有persona
- [ ] 纠偏累积触发重建正常工作

---

## 十、待确认项

| 编号 | 待确认项 | 影响 | 建议 |
|------|---------|------|------|
| D1 | 用户指定的LLM API地址和Key | Prompt重写方向、token成本估算 | 尽早确认以启动Phase 2 |
| D2 | WechatExporter当前版本兼容性 | 聊天记录导出是否可行 | 先手动验证导出流程 |
| D3 | CowAgent Skill引擎的实际限制 | 是否需要多Skill拆分 | Phase 1中验证 |
| D4 | 多模态模型选择（图片理解） | 图片消息处理能力 | 跟随主模型选择 |
| D5 | 语音转文本模型选择 | 语音消息处理 | 可先用CowAgent内置Whisper |

---

*文档版本：v1.0 | 基于6轮深度访谈决策 | 待用户反馈后迭代优化*
