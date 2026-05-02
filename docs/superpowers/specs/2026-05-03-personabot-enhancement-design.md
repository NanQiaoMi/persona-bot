# PersonaBot 项目完善设计文档

> 版本：v1.0 | 日期：2026-05-03 | 状态：已批准

---

## 一、项目概述

### 1.1 项目定位

PersonaBot 是一个基于 Next.js 的拟人化 AI 聊天机器人平台，允许用户从聊天记录中蒸馏出人物 Persona，生成像真人一样说话的 AI。

### 1.2 核心需求

| 需求 | 描述 |
|------|------|
| 部署目标 | 公开服务，支持多用户 |
| 用户系统 | 邀请码机制，控制用户数量 |
| 数据存储 | MongoDB，支持灵活的数据结构 |
| API密钥 | 混合模式（系统默认 + 用户自带） |
| 情感引擎 | 高级版本，包含复杂算法 |
| 角色数量 | 每用户 5-10 个 Persona |
| 聊天格式 | 全格式支持（微信、iMessage、短信等） |
| 部署方式 | Docker 容器化 |
| UI设计 | 微信风格，更真实的对话体验 |

---

## 二、整体架构设计

### 2.1 架构层次

```
┌─────────────────────────────────────────┐
│           前端层 (Next.js App)           │
│  - 微信风格UI设计                        │
│  - 用户认证界面                          │
│  - 响应式布局                            │
├─────────────────────────────────────────┤
│           API层 (Next.js API Routes)    │
│  - RESTful API设计                       │
│  - JWT认证中间件                         │
│  - 请求验证和速率限制                    │
├─────────────────────────────────────────┤
│           服务层 (Business Logic)        │
│  - 用户服务 (认证、授权)                 │
│  - Persona服务 (CRUD、蒸馏)              │
│  - 情感引擎服务                          │
│  - 聊天记录解析服务                      │
├─────────────────────────────────────────┤
│           数据层 (MongoDB)               │
│  - 用户集合 (users)                      │
│  - Persona集合 (personas)                │
│  - 对话集合 (conversations)              │
│  - 邀请码集合 (invite_codes)             │
└─────────────────────────────────────────┘
```

### 2.2 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端 | Next.js 16 + React 19 | 现有技术栈 |
| UI框架 | Tailwind CSS 4 | 微信风格定制 |
| 后端 | Next.js API Routes | 现有技术栈 |
| 数据库 | MongoDB 7 | 文档型数据库 |
| ODM | Mongoose | MongoDB对象建模 |
| 认证 | JWT + bcrypt | 安全认证 |
| 容器化 | Docker + Docker Compose | 一键部署 |
| 反向代理 | Nginx | 生产环境 |

---

## 三、UI设计规范

### 3.1 设计原则

- **微信风格**：模仿微信对话界面，提供熟悉的用户体验
- **简洁清晰**：减少装饰元素，突出内容
- **响应式**：适配桌面和移动端
- **一致性**：统一的视觉语言和交互模式

### 3.2 配色方案

```css
/* 微信风格配色 */
--wechat-green: #07C160;
--wechat-green-light: #95EC69;
--wechat-bg: #EDEDED;
--wechat-bg-dark: #111111;
--wechat-text: #353535;
--wechat-text-light: #FFFFFF;
--wechat-border: #E5E5E5;
--wechat-time: #999999;
```

### 3.3 聊天界面设计

```
┌─────────────────────────────────────┐
│  ← 返回        小美          ···   │  ← 顶部导航栏
├─────────────────────────────────────┤
│                                     │
│         ── 下午 2:30 ──            │  ← 时间戳
│                                     │
│    ┌─────────────────┐             │
│    │ 今天天气怎么样？ │             │  ← 用户消息（右对齐，绿色气泡）
│    └─────────────────┘             │
│                                     │
│  ┌─────────────────┐               │
│  │ 今天太阳好大！   │               │  ← AI消息（左对齐，白色气泡）
│  │ 适合出去玩～     │               │
│  └─────────────────┘               │
│                                     │
├─────────────────────────────────────┤
│  [语音] [输入消息...]      [表情+] │  ← 底部输入栏
└─────────────────────────────────────┘
```

### 3.4 组件规范

- **气泡样式**：圆角矩形，带小三角指向
- **头像**：圆形，40x40px
- **时间戳**：居中显示，灰色小字
- **消息类型**：文本、图片、语音的微信风格展示
- **状态指示**：已读/未读、正在输入...

---

## 四、用户系统设计

### 4.1 数据模型

#### users集合

```typescript
{
  _id: ObjectId,
  username: string,           // 用户名（唯一）
  email: string,              // 邮箱（可选，唯一）
  passwordHash: string,       // 密码哈希（bcrypt）
  inviteCodeId: ObjectId,     // 使用的邀请码
  role: 'user' | 'admin',    // 角色
  settings: {
    llmProvider: string,      // LLM提供商
    apiKeyEncrypted: string,  // 加密的API密钥
    theme: 'light' | 'dark', // 主题
    language: string          // 语言
  },
  quota: {
    dailyRequests: number,    // 每日请求配额
    usedToday: number,        // 今日已用
    lastReset: Date           // 上次重置时间
  },
  createdAt: Date,
  updatedAt: Date
}
```

#### invite_codes集合

```typescript
{
  _id: ObjectId,
  code: string,               // 邀请码（唯一，格式：PB-XXXX-XXXX-XXXX）
  createdBy: ObjectId,        // 创建者（管理员）
  usedBy: ObjectId[],         // 使用者列表
  maxUses: number,            // 最大使用次数
  currentUses: number,        // 当前使用次数
  expiresAt: Date,            // 过期时间
  isActive: boolean,          // 是否激活
  createdAt: Date
}
```

### 4.2 认证流程

```
注册流程：
1. 用户输入邀请码
2. 验证邀请码有效性
3. 填写用户名、密码
4. 创建用户账号
5. 返回JWT token

登录流程：
1. 输入用户名/邮箱 + 密码
2. 验证凭据
3. 返回JWT token

API认证：
1. 请求头携带Bearer token
2. 验证token有效性
3. 注入用户信息到请求
```

### 4.3 权限控制

| 角色 | 权限 |
|------|------|
| 普通用户 | 创建/管理自己的Persona、使用系统API密钥（有配额限制）、查看自己的聊天历史 |
| 管理员 | 所有普通用户权限 + 管理邀请码 + 查看系统统计 + 配置系统设置 |

---

## 五、数据存储设计

### 5.1 MongoDB集合设计

#### personas集合

```typescript
{
  _id: ObjectId,
  userId: ObjectId,           // 所属用户
  slug: string,               // URL友好标识
  name: string,               // 显示名称
  version: string,            // 版本号
  profile: {
    duration: string,         // 在一起时长
    howMet: string,           // 认识方式
    breakupTime: string,      // 分手时长
    occupation: string,       // 职业
    mbti: string,             // MBTI类型
    zodiac: string,           // 星座
    attachment: string,       // 依恋类型
    personalityTags: string[],// 性格标签
    impression: string,       // 主观印象
    enhancedProfile: string   // AI深度侧写
  },
  personaMd: string,          // persona.md内容
  memoriesMd: string,         // memories.md内容
  skillMd: string,            // SKILL.md内容
  emotionState: {             // 当前情感状态
    primaryEmotion: string,
    intensity: number,
    valence: number,
    arousal: number,
    dominance: number,
    lastUpdated: Date,
    decayRate: number
  },
  emotionHistory: [{          // 情感历史
    timestamp: Date,
    event: string,
    emotion: string,
    intensity: number,
    context: string
  }],
  corrections: [{             // 纠偏记录
    timestamp: Date,
    userInput: string,
    botResponse: string,
    correction: string,
    category: string
  }],
  knowledgeSources: string[], // 知识来源
  createdAt: Date,
  updatedAt: Date
}
```

#### conversations集合

```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  personaId: ObjectId,
  messages: [{
    role: 'user' | 'assistant',
    content: string,
    timestamp: Date,
    metadata: {
      mood: string,
      intimacyChange: number,
      emotionState: object
    }
  }],
  lastActivity: Date,
  createdAt: Date
}
```

### 5.2 索引设计

```javascript
// users集合
{ username: 1 } // 唯一索引
{ email: 1 }    // 唯一索引（稀疏）

// personas集合
{ userId: 1, slug: 1 } // 复合唯一索引

// conversations集合
{ userId: 1, personaId: 1 } // 复合索引
{ lastActivity: -1 }         // 排序索引

// invite_codes集合
{ code: 1 }      // 唯一索引
{ isActive: 1 }  // 查询索引
```

---

## 六、情感引擎设计

### 6.1 多维度情感模型

基于心理学OCC模型和PAD模型：

```typescript
interface EmotionVector {
  // PAD三维空间
  pleasure: number;      // 愉悦度 (-1.0到1.0)
  arousal: number;       // 唤醒度 (0.0到1.0)
  dominance: number;     // 支配度 (0.0到1.0)
  
  // 复合情绪
  primary: string;       // 主要情绪
  secondary: string;     // 次要情绪
  blend: number;         // 情绪混合度 (0.0-1.0)
  
  // 时间维度
  intensity: number;     // 当前强度
  peakIntensity: number; // 峰值强度
  duration: number;      // 持续时间（分钟）
  decayRate: number;     // 衰减速率
  
  // 认知维度
  appraisal: {
    novelty: number;       // 新奇度
    pleasantness: number;  // 愉悦性
    goalRelevance: number; // 目标相关性
    copingPotential: number; // 应对潜力
    normCompatibility: number; // 规范兼容性
  };
}
```

### 6.2 核心算法

#### 情感评估算法（基于Appraisal Theory）

```typescript
async function appraiseEvent(
  event: EmotionalEvent,
  personality: PersonalityTraits,
  currentContext: Context
): Promise<EmotionVector> {
  // 1. 认知评估
  const appraisal = {
    novelty: assessNovelty(event, history),
    pleasantness: assessPleasantness(event, personality),
    goalRelevance: assessGoalRelevance(event, goals),
    copingPotential: assessCopingPotential(event, personality, context),
    normCompatibility: assessNormCompatibility(event, norms)
  };
  
  // 2. 情绪映射（基于OCC模型）
  const emotion = mapAppraisalToEmotion(appraisal);
  
  // 3. 强度计算
  const intensity = calculateIntensity(appraisal, personality);
  
  // 4. 时间演化
  const timeEvolution = calculateTimeEvolution(emotion, personality);
  
  return { ...emotion, ...timeEvolution, appraisal };
}
```

#### 情感衰减动力学

```typescript
function emotionDecay(
  current: EmotionVector,
  timeDelta: number,
  personality: PersonalityTraits
): EmotionVector {
  // 指数衰减 + 线性衰减 + 周期性波动
  const exponentialDecay = current.intensity * Math.exp(-current.decayRate * timeDelta);
  const linearDecay = Math.max(0, current.intensity - 0.1 * timeDelta);
  const oscillation = 0.05 * Math.sin(2 * Math.PI * timeDelta / 24);
  
  // 人格特质影响
  const neuroticismFactor = personality.neuroticism * 0.3;
  const stabilityFactor = personality.emotionalStability * 0.5;
  
  const finalIntensity = (exponentialDecay * 0.6 + linearDecay * 0.4) * 
    (1 + oscillation) * (1 - neuroticismFactor + stabilityFactor);
  
  return {
    ...current,
    intensity: Math.max(0, Math.min(1, finalIntensity)),
    duration: current.duration + timeDelta * 60
  };
}
```

### 6.3 情感状态机

```typescript
class EmotionStateMachine {
  async transition(
    event: EmotionalEvent,
    context: Context
  ): Promise<EmotionTransition> {
    // 1. 评估事件
    const appraisal = await this.appraiseEvent(event, context);
    
    // 2. 查找可能的状态转移
    const possibleTransitions = this.findTransitions(appraisal);
    
    // 3. 计算转移概率
    const probabilities = this.calculateTransitionProbabilities(
      possibleTransitions, appraisal, context
    );
    
    // 4. 选择转移（带随机性）
    const selected = this.selectTransition(probabilities);
    
    // 5. 执行转移
    await this.executeTransition(selected);
    
    return selected;
  }
}
```

### 6.4 情感记忆系统

```typescript
class EmotionalMemorySystem {
  // 情绪一致性记忆提取
  async retrieveByEmotion(
    currentEmotion: EmotionVector,
    limit: number = 5
  ): Promise<EmotionalMemory[]> {
    return this.memories
      .map(m => ({
        memory: m,
        similarity: this.emotionSimilarity(currentEmotion, m.emotion),
        accessibility: m.accessibility
      }))
      .sort((a, b) => {
        const scoreA = a.similarity * 0.6 + a.accessibility * 0.4;
        const scoreB = b.similarity * 0.6 + b.accessibility * 0.4;
        return scoreB - scoreA;
      })
      .slice(0, limit)
      .map(item => item.memory);
  }
}
```

### 6.5 情感传染机制

```typescript
class EmotionalContagion {
  async applyContagion(
    aiEmotion: EmotionVector,
    userEmotion: EmotionVector,
    relationship: RelationshipType,
    personality: PersonalityTraits
  ): Promise<EmotionVector> {
    const contagionStrength = this.getContagionStrength(relationship);
    const susceptibility = this.getSusceptibility(personality);
    
    const emotionShift = {
      pleasure: (userEmotion.pleasure - aiEmotion.pleasure) * contagionStrength * susceptibility,
      arousal: (userEmotion.arousal - aiEmotion.arousal) * contagionStrength * susceptibility * 0.5,
      dominance: 0
    };
    
    return {
      ...aiEmotion,
      pleasure: aiEmotion.pleasure + emotionShift.pleasure * 0.3,
      arousal: aiEmotion.arousal + emotionShift.arousal * 0.2,
      intensity: Math.min(1, aiEmotion.intensity + Math.abs(emotionShift.pleasure) * 0.1)
    };
  }
}
```

---

## 七、多角色切换设计

### 7.1 角色隔离架构

```typescript
interface PersonaContext {
  personaId: string;
  userId: string;
  
  // 独立数据空间
  persona: PersonaData;
  memories: MemoryData;
  emotionState: EmotionVector;
  emotionHistory: EmotionHistory[];
  corrections: Correction[];
  
  // 会话状态
  conversationId: string;
  messageHistory: Message[];
  lastActivity: Date;
  
  // 运行时状态
  isLoaded: boolean;
  lastAccess: Date;
}
```

### 7.2 角色管理器

```typescript
class PersonaManager {
  private activePersonas: Map<string, PersonaContext>;
  private personaPool: Map<string, PersonaContext>;
  private maxPoolSize: number = 10;
  
  async switchPersona(userId: string, targetSlug: string): Promise<PersonaContext> {
    // 1. 保存当前角色状态
    const current = this.activePersonas.get(userId);
    if (current) {
      await this.savePersonaState(current);
      this.releaseToPool(current);
    }
    
    // 2. 加载目标角色
    const target = await this.loadPersona(userId, targetSlug);
    
    // 3. 初始化情感状态
    await this.initializeEmotionState(target);
    
    // 4. 设置为活跃角色
    this.activePersonas.set(userId, target);
    
    return target;
  }
}
```

### 7.3 上下文隔离机制

```typescript
class ContextIsolation {
  static readonly ISOLATION_LEVELS = {
    FULL: 'full',           // 完全隔离
    PARTIAL: 'partial',     // 部分隔离
    SHARED: 'shared'        // 共享上下文
  };
  
  static getIsolationStrategy(persona1: PersonaData, persona2: PersonaData): string {
    if (persona1.userId === persona2.userId) {
      return this.ISOLATION_LEVELS.FULL;
    }
    if (persona1.slug === persona2.slug) {
      return this.ISOLATION_LEVELS.PARTIAL;
    }
    return this.ISOLATION_LEVELS.FULL;
  }
}
```

---

## 八、聊天记录解析设计

### 8.1 统一解析接口

```typescript
interface ChatParser {
  type: 'wechat' | 'imessage' | 'sms' | 'telegram' | 'whatsapp' | 'instagram';
  parse(file: File, options: ParseOptions): Promise<ParseResult>;
  validate(file: File): Promise<ValidationResult>;
  extractMetadata(file: File): Promise<ChatMetadata>;
}
```

### 8.2 支持的格式

| 格式 | 解析器 | 支持的文件类型 |
|------|--------|---------------|
| 微信 | WeChatParser | HTML, TXT |
| iMessage | IMessageParser | CSV, JSON, HTML |
| 短信 | SmsParser | XML, CSV |
| Telegram | TelegramParser | JSON |
| WhatsApp | WhatsAppParser | TXT |
| Instagram | InstagramParser | JSON |

### 8.3 解析流程

```typescript
class ChatParsingPipeline {
  async parseAndStore(
    file: File,
    userId: string,
    personaId: string,
    options: ParseOptions
  ): Promise<ParseResult> {
    // 1. 获取解析器
    const parser = await this.getParser(file, options.type);
    
    // 2. 验证文件
    const validation = await parser.validate(file);
    if (!validation.valid) {
      throw new Error(`Invalid file: ${validation.errors.join(', ')}`);
    }
    
    // 3. 解析文件
    const result = await parser.parse(file, options);
    
    // 4. 存储解析结果
    await this.storeParsedData(result, userId, personaId);
    
    // 5. 更新统计信息
    await this.updateStatistics(result, userId, personaId);
    
    return result;
  }
}
```

---

## 九、部署与安全设计

### 9.1 Docker容器化

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/personabot
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - mongo

  mongo:
    image: mongo:7
    volumes:
      - mongo_data:/data/db

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - app

volumes:
  mongo_data:
```

### 9.2 安全措施

| 安全措施 | 实现方式 |
|---------|---------|
| 密码安全 | bcrypt哈希，salt rounds = 12 |
| API密钥 | AES-256加密存储 |
| JWT | 7天过期，httpOnly cookie |
| 速率限制 | 每用户每日请求配额 |
| 输入验证 | Zod schema验证 |
| HTTPS | Nginx SSL终止 |
| CORS | 严格的跨域策略 |
| 日志 | 结构化日志，敏感数据脱敏 |

### 9.3 备份策略

- 每日自动备份MongoDB
- 保留最近30天的备份
- 支持手动备份和恢复
- 备份文件加密存储

---

## 十、实施计划

### 10.1 阶段划分

| 阶段 | 任务 | 预计时间 |
|------|------|---------|
| Phase 1 | 安全修复 + 基础架构 | 1周 |
| Phase 2 | 用户系统 + 数据库 | 1周 |
| Phase 3 | 情感引擎 | 2周 |
| Phase 4 | 多角色切换 | 1周 |
| Phase 5 | 聊天记录解析 | 1周 |
| Phase 6 | UI重构 | 1周 |
| Phase 7 | Docker部署 | 3天 |
| Phase 8 | 测试和优化 | 1周 |

### 10.2 详细任务

#### Phase 1：安全修复 + 基础架构（第1周）

- [ ] 移除.env.local中的API密钥
- [ ] 添加.gitignore规则
- [ ] 设置环境变量模板
- [ ] 创建MongoDB连接配置
- [ ] 安装Mongoose依赖
- [ ] 创建数据库模型

#### Phase 2：用户系统 + 数据库（第2周）

- [ ] 实现用户注册API
- [ ] 实现用户登录API
- [ ] 实现JWT认证中间件
- [ ] 实现邀请码系统
- [ ] 实现用户设置API
- [ ] 创建用户管理界面

#### Phase 3：情感引擎（第3-4周）

- [ ] 实现情感向量模型
- [ ] 实现情感评估算法
- [ ] 实现情感衰减动力学
- [ ] 实现情感状态机
- [ ] 实现情感记忆系统
- [ ] 实现情感传染机制
- [ ] 集成到对话流程

#### Phase 4：多角色切换（第5周）

- [ ] 实现角色管理器
- [ ] 实现上下文隔离
- [ ] 实现角色切换命令
- [ ] 实现角色数据迁移
- [ ] 实现角色列表界面

#### Phase 5：聊天记录解析（第6周）

- [ ] 实现统一解析接口
- [ ] 实现微信解析器
- [ ] 实现iMessage解析器
- [ ] 实现短信解析器
- [ ] 实现其他格式解析器
- [ ] 实现解析质量检查

#### Phase 6：UI重构（第7周）

- [ ] 设计微信风格组件库
- [ ] 重构聊天界面
- [ ] 重构首页
- [ ] 重构创建页面
- [ ] 优化移动端体验

#### Phase 7：Docker部署（第8周前3天）

- [ ] 创建Dockerfile
- [ ] 创建docker-compose.yml
- [ ] 配置Nginx
- [ ] 编写部署文档
- [ ] 测试部署流程

#### Phase 8：测试和优化（第8周后4天）

- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能测试
- [ ] 安全测试
- [ ] 文档完善

---

## 十一、风险与缓解

| 风险 | 严重度 | 概率 | 缓解措施 |
|------|--------|------|---------|
| MongoDB性能问题 | 中 | 低 | 索引优化、查询优化、分页 |
| 情感引擎不稳定 | 中 | 中 | 增加约束、基线状态兜底 |
| 数据迁移失败 | 高 | 低 | 完整备份、逐步迁移、验证 |
| 安全漏洞 | 高 | 低 | 安全审计、依赖更新、输入验证 |
| Docker部署问题 | 中 | 中 | 完整测试、回滚机制 |

---

## 十二、待确认项

| 编号 | 待确认项 | 影响 | 建议 |
|------|---------|------|------|
| D1 | MongoDB云服务选择 | 部署成本和性能 | 推荐MongoDB Atlas |
| D2 | LLM API配额限制 | 用户体验 | 设置合理的每日配额 |
| D3 | 文件上传大小限制 | 聊天记录解析 | 建议限制50MB |
| D4 | 管理员账号初始化 | 首次部署 | 通过环境变量配置 |

---

## 十三、补充规范

### 13.1 API错误响应规范

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

// 错误码定义
enum ErrorCodes {
  // 认证错误 (1xxx)
  INVALID_TOKEN = '1001',
  TOKEN_EXPIRED = '1002',
  INVALID_CREDENTIALS = '1003',
  INVALID_INVITE_CODE = '1004',
  
  // 用户错误 (2xxx)
  USER_NOT_FOUND = '2001',
  USER_ALREADY_EXISTS = '2002',
  QUOTA_EXCEEDED = '2003',
  
  // Persona错误 (3xxx)
  PERSONA_NOT_FOUND = '3001',
  PERSONA_LIMIT_REACHED = '3002',
  PERSONA_CREATION_FAILED = '3003',
  
  // 解析错误 (4xxx)
  INVALID_FILE_FORMAT = '4001',
  PARSE_FAILED = '4002',
  FILE_TOO_LARGE = '4003',
  
  // 系统错误 (5xxx)
  INTERNAL_ERROR = '5001',
  DATABASE_ERROR = '5002',
  LLM_API_ERROR = '5003'
}
```

### 13.2 日志规范

```typescript
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: {
    userId?: string;
    requestId?: string;
    path?: string;
    method?: string;
    duration?: number;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// 日志级别
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}
```

### 13.3 监控指标

```typescript
interface Metrics {
  // 请求指标
  requests: {
    total: number;
    success: number;
    failed: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  
  // 用户指标
  users: {
    total: number;
    active: number;
    newToday: number;
  };
  
  // Persona指标
  personas: {
    total: number;
    createdToday: number;
    activeChats: number;
  };
  
  // 系统指标
  system: {
    cpuUsage: number;
    memoryUsage: number;
    databaseConnections: number;
    llmApiCalls: number;
    llmApiErrors: number;
  };
}
```

### 13.4 性能要求

| 指标 | 目标值 | 说明 |
|------|--------|------|
| API响应时间 | < 200ms (P95) | 不含LLM调用 |
| LLM响应时间 | < 5s (P95) | 取决于LLM提供商 |
| 页面加载时间 | < 2s | 首屏加载 |
| 数据库查询 | < 50ms (P95) | 索引优化后 |
| 并发用户 | > 100 | 单实例支持 |
| 可用性 | > 99.9% | 月度统计 |

---

*文档版本：v1.0 | 基于用户需求确认 | 已完成规范审查*
