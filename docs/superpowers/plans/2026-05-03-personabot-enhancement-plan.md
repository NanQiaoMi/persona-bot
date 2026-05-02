# PersonaBot 项目完善实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善PersonaBot项目，添加用户系统、MongoDB存储、高级情感引擎、多角色切换、微信风格UI，并支持Docker部署

**Architecture:** 渐进式完善现有Next.js应用，添加用户认证（邀请码+JWT）、MongoDB数据存储、高级情感引擎、多角色管理、微信风格UI重构，最后Docker容器化

**Tech Stack:** Next.js 16, React 19, MongoDB 7, Mongoose, JWT, bcrypt, Tailwind CSS 4, Docker, Nginx

---

## 文件结构映射

### 新增文件

```
src/
├── lib/
│   ├── db/
│   │   ├── mongodb.ts              # MongoDB连接配置
│   │   └── models/
│   │       ├── User.ts             # 用户模型
│   │       ├── Persona.ts          # Persona模型
│   │       ├── Conversation.ts     # 对话模型
│   │       └── InviteCode.ts       # 邀请码模型
│   ├── auth/
│   │   ├── jwt.ts                  # JWT工具函数
│   │   ├── password.ts             # 密码哈希工具
│   │   └── middleware.ts           # 认证中间件
│   ├── emotion/
│   │   ├── types.ts                # 情感类型定义
│   │   ├── vector.ts               # 情感向量模型
│   │   ├── appraisal.ts            # 情感评估算法
│   │   ├── decay.ts                # 情感衰减动力学
│   │   ├── state-machine.ts        # 情感状态机
│   │   ├── memory.ts               # 情感记忆系统
│   │   ├── contagion.ts            # 情感传染机制
│   │   └── expression.ts           # 情感表达生成
│   ├── persona/
│   │   ├── manager.ts              # 角色管理器
│   │   └── isolation.ts            # 上下文隔离
│   └── parsers/
│       ├── types.ts                # 解析器类型定义
│       ├── factory.ts              # 解析器工厂
│       ├── wechat.ts               # 微信解析器
│       ├── imessage.ts             # iMessage解析器
│       ├── sms.ts                  # 短信解析器
│       └── pipeline.ts             # 解析流程
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── register/route.ts   # 注册API
│   │   │   ├── login/route.ts      # 登录API
│   │   │   └── me/route.ts         # 当前用户API
│   │   ├── invite-codes/
│   │   │   ├── route.ts            # 邀请码CRUD
│   │   │   └── [id]/route.ts       # 单个邀请码
│   │   └── personas/
│       ├── route.ts                # Persona列表
│       ├── [slug]/
│       │   ├── route.ts            # 单个Persona
│       │   ├── chat/route.ts       # 聊天API
│       │   ├── emotion/route.ts    # 情感状态API
│       │   └── switch/route.ts     # 切换Persona
│       └── parse/route.ts          # 解析API
│   ├── (auth)/
│   │   ├── login/page.tsx          # 登录页面
│   │   └── register/page.tsx       # 注册页面
│   └── (dashboard)/
│       ├── layout.tsx              # 仪表盘布局
│       ├── page.tsx                # 首页（对话列表）
│       ├── settings/page.tsx       # 设置页面
│       └── admin/
│           ├── page.tsx            # 管理后台
│           └── invite-codes/page.tsx # 邀请码管理
├── components/
│   ├── ui/
│   │   ├── WeChatButton.tsx        # 微信风格按钮
│   │   ├── WeChatInput.tsx         # 微信风格输入框
│   │   ├── WeChatBubble.tsx        # 微信风格气泡
│   │   └── WeChatAvatar.tsx        # 微信风格头像
│   ├── chat/
│   │   ├── ChatList.tsx            # 对话列表
│   │   ├── ChatWindow.tsx          # 聊天窗口（重构）
│   │   └── MessageItem.tsx         # 消息项
│   ├── auth/
│   │   ├── LoginForm.tsx           # 登录表单
│   │   └── RegisterForm.tsx        # 注册表单
│   └── persona/
│       ├── PersonaCard.tsx         # Persona卡片
│       └── PersonaSwitcher.tsx     # Persona切换器
└── types/
    └── index.ts                    # 全局类型定义
```

### 修改文件

```
src/
├── app/
│   ├── layout.tsx                  # 更新metadata，添加认证状态
│   ├── page.tsx                    # 重定向逻辑
│   ├── globals.css                 # 微信风格样式
│   ├── create/page.tsx             # 更新创建流程
│   ├── gallery/page.tsx            # 更新为用户专属
│   └── chat/[slug]/page.tsx        # 更新聊天页面
├── components/
│   ├── IntakeWizard.tsx            # 更新创建向导
│   └── ui/GlassCard.tsx            # 更新为微信风格
├── lib/
│   ├── prompt-assembler.ts         # 更新为使用MongoDB
│   └── python-runner.ts            # 修复路径问题
└── app/api/
    ├── chat/route.ts               # 更新为使用情感引擎
    └── persona/
        ├── create/route.ts         # 更新为使用MongoDB
        ├── distill/route.ts        # 更新为使用MongoDB
        ├── pipeline/route.ts       # 更新为使用MongoDB
        ├── parse/route.ts          # 更新解析器
        ├── merge/route.ts          # 更新合并逻辑
        └── enhance/route.ts        # 更新增强逻辑

docker-compose.yml                  # 新增
Dockerfile                          # 新增
nginx.conf                          # 新增
.env.example                        # 新增
```

---

## Task 1: 安全修复和环境配置

**Files:**
- Modify: `.env.local` (删除敏感信息)
- Create: `.env.example`
- Modify: `.gitignore`
- Create: `src/lib/db/mongodb.ts`

- [ ] **Step 1: 创建 .env.example 文件**

```bash
# .env.example

# 应用配置
NODE_ENV=development
PORT=3000

# 数据库
MONGODB_URI=mongodb://localhost:27017/personabot

# 认证
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_KEY=your-encryption-key-here

# LLM API
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4-turbo

# 管理员（首次部署时创建）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin-password
ADMIN_EMAIL=admin@example.com

# 邀请码
INITIAL_INVITE_CODE=PB-XXXX-XXXX-XXXX
```

- [ ] **Step 2: 更新 .gitignore 文件**

```bash
# 添加以下内容到 .gitignore

# 环境变量
.env
.env.local
.env.*.local

# 上传文件
uploads/*
!uploads/.gitkeep

# Persona数据
exes/*
!exes/.gitkeep

# 备份
backups/

# MongoDB数据
mongo_data/
```

- [ ] **Step 3: 创建 MongoDB 连接配置**

```typescript
// src/lib/db/mongodb.ts

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/personabot';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

let cached: MongooseCache = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;
```

- [ ] **Step 4: 安装 MongoDB 依赖**

```bash
npm install mongoose
npm install -D @types/mongoose
```

- [ ] **Step 5: 提交更改**

```bash
git add .env.example .gitignore src/lib/db/mongodb.ts package.json package-lock.json
git commit -m "chore: add security config and MongoDB connection"
```

---

## Task 2: 用户系统 - 数据模型

**Files:**
- Create: `src/lib/db/models/User.ts`
- Create: `src/lib/db/models/InviteCode.ts`
- Create: `src/lib/db/models/Persona.ts`
- Create: `src/lib/db/models/Conversation.ts`

- [ ] **Step 1: 创建用户模型**

```typescript
// src/lib/db/models/User.ts

import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  email?: string;
  passwordHash: string;
  inviteCodeId?: mongoose.Types.ObjectId;
  role: 'user' | 'admin';
  settings: {
    llmProvider: string;
    apiKeyEncrypted?: string;
    theme: 'light' | 'dark';
    language: string;
  };
  quota: {
    dailyRequests: number;
    usedToday: number;
    lastReset: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    inviteCodeId: {
      type: Schema.Types.ObjectId,
      ref: 'InviteCode',
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    settings: {
      llmProvider: { type: String, default: 'openai' },
      apiKeyEncrypted: { type: String },
      theme: { type: String, enum: ['light', 'dark'], default: 'light' },
      language: { type: String, default: 'zh-CN' },
    },
    quota: {
      dailyRequests: { type: Number, default: 100 },
      usedToday: { type: Number, default: 0 },
      lastReset: { type: Date, default: Date.now },
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export default User;
```

- [ ] **Step 2: 创建邀请码模型**

```typescript
// src/lib/db/models/InviteCode.ts

import mongoose, { Schema, Document } from 'mongoose';

export interface IInviteCode extends Document {
  code: string;
  createdBy: mongoose.Types.ObjectId;
  usedBy: mongoose.Types.ObjectId[];
  maxUses: number;
  currentUses: number;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
}

const InviteCodeSchema = new Schema<IInviteCode>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    usedBy: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
    }],
    maxUses: {
      type: Number,
      default: 10,
    },
    currentUses: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const InviteCode = mongoose.models.InviteCode || mongoose.model<IInviteCode>('InviteCode', InviteCodeSchema);
export default InviteCode;
```

- [ ] **Step 3: 创建 Persona 模型**

```typescript
// src/lib/db/models/Persona.ts

import mongoose, { Schema, Document } from 'mongoose';

export interface IPersona extends Document {
  userId: mongoose.Types.ObjectId;
  slug: string;
  name: string;
  version: string;
  profile: {
    duration?: string;
    howMet?: string;
    breakupTime?: string;
    occupation?: string;
    mbti?: string;
    zodiac?: string;
    attachment?: string;
    personalityTags: string[];
    impression?: string;
    enhancedProfile?: string;
  };
  personaMd: string;
  memoriesMd: string;
  skillMd: string;
  emotionState: {
    primaryEmotion: string;
    intensity: number;
    valence: number;
    arousal: number;
    dominance: number;
    lastUpdated: Date;
    decayRate: number;
  };
  emotionHistory: Array<{
    timestamp: Date;
    event: string;
    emotion: string;
    intensity: number;
    context: string;
  }>;
  corrections: Array<{
    timestamp: Date;
    userInput: string;
    botResponse: string;
    correction: string;
    category: string;
  }>;
  knowledgeSources: string[];
  createdAt: Date;
  updatedAt: Date;
}

const PersonaSchema = new Schema<IPersona>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    version: {
      type: String,
      default: 'v1',
    },
    profile: {
      duration: String,
      howMet: String,
      breakupTime: String,
      occupation: String,
      mbti: String,
      zodiac: String,
      attachment: String,
      personalityTags: [String],
      impression: String,
      enhancedProfile: String,
    },
    personaMd: { type: String, default: '' },
    memoriesMd: { type: String, default: '' },
    skillMd: { type: String, default: '' },
    emotionState: {
      primaryEmotion: { type: String, default: '平静' },
      intensity: { type: Number, default: 0.5 },
      valence: { type: Number, default: 0 },
      arousal: { type: Number, default: 0.3 },
      dominance: { type: Number, default: 0.5 },
      lastUpdated: { type: Date, default: Date.now },
      decayRate: { type: Number, default: 0.1 },
    },
    emotionHistory: [{
      timestamp: Date,
      event: String,
      emotion: String,
      intensity: Number,
      context: String,
    }],
    corrections: [{
      timestamp: { type: Date, default: Date.now },
      userInput: String,
      botResponse: String,
      correction: String,
      category: String,
    }],
    knowledgeSources: [String],
  },
  {
    timestamps: true,
  }
);

// 复合唯一索引
PersonaSchema.index({ userId: 1, slug: 1 }, { unique: true });

export const Persona = mongoose.models.Persona || mongoose.model<IPersona>('Persona', PersonaSchema);
export default Persona;
```

- [ ] **Step 4: 创建对话模型**

```typescript
// src/lib/db/models/Conversation.ts

import mongoose, { Schema, Document } from 'mongoose';

export interface IConversation extends Document {
  userId: mongoose.Types.ObjectId;
  personaId: mongoose.Types.ObjectId;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: {
      mood?: string;
      intimacyChange?: number;
      emotionState?: object;
    };
  }>;
  lastActivity: Date;
  createdAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    personaId: {
      type: Schema.Types.ObjectId,
      ref: 'Persona',
      required: true,
      index: true,
    },
    messages: [{
      role: { type: String, enum: ['user', 'assistant'], required: true },
      content: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      metadata: {
        mood: String,
        intimacyChange: Number,
        emotionState: Schema.Types.Mixed,
      },
    }],
    lastActivity: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// 复合索引
ConversationSchema.index({ userId: 1, personaId: 1 });
ConversationSchema.index({ lastActivity: -1 });

export const Conversation = mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', ConversationSchema);
export default Conversation;
```

- [ ] **Step 5: 提交更改**

```bash
git add src/lib/db/models/
git commit -m "feat: add MongoDB models for User, InviteCode, Persona, Conversation"
```

---

## Task 3: 用户系统 - 认证服务

**Files:**
- Create: `src/lib/auth/jwt.ts`
- Create: `src/lib/auth/password.ts`
- Create: `src/lib/auth/middleware.ts`

- [ ] **Step 1: 创建 JWT 工具函数**

```typescript
// src/lib/auth/jwt.ts

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-change-this';
const JWT_EXPIRES_IN = '7d';

export interface JWTPayload {
  userId: string;
  username: string;
  role: 'user' | 'admin';
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: 创建密码哈希工具**

```typescript
// src/lib/auth/password.ts

import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('密码长度至少8位');
  }
  if (password.length > 100) {
    errors.push('密码长度不能超过100位');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('密码必须包含至少一个大写字母');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('密码必须包含至少一个小写字母');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('密码必须包含至少一个数字');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
```

- [ ] **Step 3: 创建认证中间件**

```typescript
// src/lib/auth/middleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, JWTPayload } from './jwt';

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

export function withAuth(
  handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>
) {
  return async (req: AuthenticatedRequest, context?: any) => {
    try {
      const authHeader = req.headers.get('authorization');
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { success: false, error: { code: '1001', message: '未提供认证token' } },
          { status: 401 }
        );
      }
      
      const token = authHeader.split(' ')[1];
      const payload = verifyToken(token);
      
      req.user = payload;
      
      return handler(req, context);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: { code: '1002', message: 'token无效或已过期' } },
        { status: 401 }
      );
    }
  };
}

export function withAdminAuth(
  handler: (req: AuthenticatedRequest, context?: any) => Promise<NextResponse>
) {
  return withAuth(async (req: AuthenticatedRequest, context?: any) => {
    if (req.user?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: '1005', message: '需要管理员权限' } },
        { status: 403 }
      );
    }
    return handler(req, context);
  });
}
```

- [ ] **Step 4: 安装认证依赖**

```bash
npm install jsonwebtoken bcrypt
npm install -D @types/jsonwebtoken @types/bcrypt
```

- [ ] **Step 5: 提交更改**

```bash
git add src/lib/auth/ package.json package-lock.json
git commit -m "feat: add JWT authentication and password hashing utilities"
```

---

## Task 4: 用户系统 - API路由

**Files:**
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/me/route.ts`
- Create: `src/app/api/invite-codes/route.ts`

- [ ] **Step 1: 创建注册API**

```typescript
// src/app/api/auth/register/route.ts

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import InviteCode from '@/lib/db/models/InviteCode';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { generateToken } from '@/lib/auth/jwt';

export async function POST(request: Request) {
  try {
    await connectDB();
    
    const { username, password, inviteCode } = await request.json();
    
    // 验证必填字段
    if (!username || !password || !inviteCode) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '用户名、密码和邀请码为必填项' } },
        { status: 400 }
      );
    }
    
    // 验证用户名格式
    if (username.length < 3 || username.length > 30) {
      return NextResponse.json(
        { success: false, error: { code: '2002', message: '用户名长度应为3-30个字符' } },
        { status: 400 }
      );
    }
    
    // 验证密码格式
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { success: false, error: { code: '2003', message: passwordValidation.errors[0] } },
        { status: 400 }
      );
    }
    
    // 验证邀请码
    const code = await InviteCode.findOne({
      code: inviteCode.toUpperCase(),
      isActive: true,
      expiresAt: { $gt: new Date() },
    });
    
    if (!code) {
      return NextResponse.json(
        { success: false, error: { code: '1004', message: '邀请码无效或已过期' } },
        { status: 400 }
      );
    }
    
    if (code.currentUses >= code.maxUses) {
      return NextResponse.json(
        { success: false, error: { code: '1004', message: '邀请码已达到使用上限' } },
        { status: 400 }
      );
    }
    
    // 检查用户名是否已存在
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: { code: '2002', message: '用户名已存在' } },
        { status: 400 }
      );
    }
    
    // 创建用户
    const passwordHash = await hashPassword(password);
    const user = await User.create({
      username,
      passwordHash,
      inviteCodeId: code._id,
    });
    
    // 更新邀请码使用次数
    code.currentUses += 1;
    code.usedBy.push(user._id);
    await code.save();
    
    // 生成JWT token
    const token = generateToken({
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '注册失败，请稍后重试' } },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 创建登录API**

```typescript
// src/app/api/auth/login/route.ts

import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import { comparePassword } from '@/lib/auth/password';
import { generateToken } from '@/lib/auth/jwt';

export async function POST(request: Request) {
  try {
    await connectDB();
    
    const { username, password } = await request.json();
    
    // 验证必填字段
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '用户名和密码为必填项' } },
        { status: 400 }
      );
    }
    
    // 查找用户
    const user = await User.findOne({ username });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: '1003', message: '用户名或密码错误' } },
        { status: 401 }
      );
    }
    
    // 验证密码
    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { success: false, error: { code: '1003', message: '用户名或密码错误' } },
        { status: 401 }
      );
    }
    
    // 生成JWT token
    const token = generateToken({
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '登录失败，请稍后重试' } },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: 创建获取当前用户API**

```typescript
// src/app/api/auth/me/route.ts

import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/auth/middleware';
import { connectDB } from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    await connectDB();
    
    const user = await User.findById(req.user?.userId).select('-passwordHash');
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '用户不存在' } },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: { user },
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取用户信息失败' } },
      { status: 500 }
    );
  }
});
```

- [ ] **Step 4: 创建邀请码管理API**

```typescript
// src/app/api/invite-codes/route.ts

import { NextResponse } from 'next/server';
import { withAdminAuth, AuthenticatedRequest } from '@/lib/auth/middleware';
import { connectDB } from '@/lib/db/mongodb';
import InviteCode from '@/lib/db/models/InviteCode';

// 生成邀请码
function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'PB-';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 获取邀请码列表
export const GET = withAdminAuth(async (req: AuthenticatedRequest) => {
  try {
    await connectDB();
    
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const isActive = searchParams.get('isActive');
    
    const query: any = {};
    if (isActive !== null) {
      query.isActive = isActive === 'true';
    }
    
    const total = await InviteCode.countDocuments(query);
    const codes = await InviteCode.find(query)
      .populate('createdBy', 'username')
      .populate('usedBy', 'username')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    
    return NextResponse.json({
      success: true,
      data: {
        codes,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: any) {
    console.error('Get invite codes error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取邀请码列表失败' } },
      { status: 500 }
    );
  }
});

// 创建邀请码
export const POST = withAdminAuth(async (req: AuthenticatedRequest) => {
  try {
    await connectDB();
    
    const { maxUses = 10, expiresInDays = 30 } = await req.json();
    
    const code = await InviteCode.create({
      code: generateInviteCode(),
      createdBy: req.user?.userId,
      maxUses,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    });
    
    return NextResponse.json({
      success: true,
      data: { code },
    });
  } catch (error: any) {
    console.error('Create invite code error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '创建邀请码失败' } },
      { status: 500 }
    );
  }
});
```

- [ ] **Step 5: 安装 bcrypt 依赖**

```bash
npm install bcrypt
npm install -D @types/bcrypt
```

- [ ] **Step 6: 提交更改**

```bash
git add src/app/api/auth/ src/app/api/invite-codes/ package.json package-lock.json
git commit -m "feat: add user authentication API routes (register, login, me)"
```

---

## Task 5: 情感引擎 - 类型定义和基础模型

**Files:**
- Create: `src/lib/emotion/types.ts`
- Create: `src/lib/emotion/vector.ts`

- [ ] **Step 1: 创建情感类型定义**

```typescript
// src/lib/emotion/types.ts

// PAD三维情感向量
export interface EmotionVector {
  // PAD三维空间
  pleasure: number;      // 愉悦度 (-1.0到1.0)
  arousal: number;       // 唤醒度 (0.0到1.0)
  dominance: number;     // 支配度 (0.0到1.0)
  
  // 复合情绪
  primary: string;       // 主要情绪
  secondary: string;     // 次要情绪
  blend: number;         // 情绪混合度 (0.0-1.0)
  
  // 时间维度
  intensity: number;     // 当前强度 (0.0-1.0)
  peakIntensity: number; // 峰值强度
  duration: number;      // 持续时间（分钟）
  decayRate: number;     // 衰减速率
  
  // 认知维度
  appraisal: Appraisal;
}

// 认知评估
export interface Appraisal {
  novelty: number;         // 新奇度 (0.0-1.0)
  pleasantness: number;    // 愉悦性 (-1.0到1.0)
  goalRelevance: number;   // 目标相关性 (0.0-1.0)
  copingPotential: number; // 应对潜力 (0.0-1.0)
  normCompatibility: number; // 规范兼容性 (0.0-1.0)
}

// 情感事件
export interface EmotionalEvent {
  type: 'message' | 'action' | 'time_pass' | 'correction';
  content: string;
  sender: 'user' | 'persona';
  timestamp: Date;
  metadata?: Record<string, any>;
}

// 情感状态
export interface EmotionState {
  current: EmotionVector;
  history: EmotionHistoryEntry[];
  baseline: PersonalityTraits;
}

// 情感历史条目
export interface EmotionHistoryEntry {
  timestamp: Date;
  event: string;
  emotion: EmotionVector;
  context: string;
}

// 人格特质
export interface PersonalityTraits {
  // 大五人格
  openness: number;        // 开放性 (0.0-1.0)
  conscientiousness: number; // 尽责性 (0.0-1.0)
  extraversion: number;    // 外向性 (0.0-1.0)
  agreeableness: number;   // 宜人性 (0.0-1.0)
  neuroticism: number;     // 神经质 (0.0-1.0)
  
  // 情感特质
  emotionalStability: number; // 情感稳定性 (0.0-1.0)
  emotionalRange: number;     // 情感范围 (0.0-1.0)
  recoveryRate: number;       // 恢复速率 (0.0-1.0)
  
  // 情感词汇库
  emotionVocabulary: {
    positive: string[];
    negative: string[];
    neutral: string[];
  };
  
  // 恢复模式
  recoveryPatterns: Record<string, RecoveryPattern>;
}

// 恢复模式
export interface RecoveryPattern {
  description: string;
  decayRate: number;
  triggers: string[];
  timeToRecover: number; // 小时
}

// 情感表达
export interface EmotionalExpression {
  tone: string;           // 语气
  wordChoice: string[];   // 词汇选择
  particles: string[];    // 语气词
  emojis: string[];       // 表情符号
  responseLength: 'short' | 'medium' | 'long';
  responseDelay: number;  // 回复延迟（秒）
}

// 情感转移
export interface EmotionTransition {
  from: EmotionVector;
  to: EmotionVector;
  probability: number;
  trigger: string;
  duration: number;
}

// 情感记忆
export interface EmotionalMemory {
  id: string;
  event: string;
  emotion: EmotionVector;
  intensity: number;
  valence: number;
  timestamp: Date;
  context: string;
  associations: string[];
  accessibility: number;   // 可提取性 (0.0-1.0)
  consolidation: number;   // 巩固程度 (0.0-1.0)
}
```

- [ ] **Step 2: 创建情感向量模型**

```typescript
// src/lib/emotion/vector.ts

import { EmotionVector, Appraisal, PersonalityTraits } from './types';

// 基础情绪库
export const EMOTION_VOCABULARY = {
  positive: ['开心', '兴奋', '满足', '安心', '感动', '期待', '撒娇', '甜蜜', '得意', '温柔'],
  negative: ['生气', '难过', '失望', '焦虑', '委屈', '吃醋', '烦躁', '冷漠', '伤心', '愤怒'],
  neutral: ['平静', '无聊', '好奇', '思考', '发呆', '淡然', '无所谓']
};

// 情绪映射表（从PAD空间到情绪标签）
const EMOTION_MAPPING: Array<{ pad: [number, number, number]; emotion: string }> = [
  { pad: [0.8, 0.7, 0.6], emotion: '开心' },
  { pad: [0.9, 0.9, 0.7], emotion: '兴奋' },
  { pad: [0.6, 0.3, 0.5], emotion: '满足' },
  { pad: [0.5, 0.2, 0.6], emotion: '安心' },
  { pad: [0.7, 0.5, 0.4], emotion: '感动' },
  { pad: [0.6, 0.8, 0.5], emotion: '期待' },
  { pad: [0.7, 0.6, 0.3], emotion: '撒娇' },
  { pad: [0.8, 0.4, 0.5], emotion: '甜蜜' },
  { pad: [-0.8, 0.8, 0.7], emotion: '生气' },
  { pad: [-0.7, 0.3, 0.3], emotion: '难过' },
  { pad: [-0.6, 0.5, 0.4], emotion: '失望' },
  { pad: [-0.5, 0.7, 0.4], emotion: '焦虑' },
  { pad: [-0.7, 0.4, 0.3], emotion: '委屈' },
  { pad: [-0.6, 0.6, 0.5], emotion: '吃醋' },
  { pad: [-0.7, 0.7, 0.6], emotion: '烦躁' },
  { pad: [-0.3, 0.2, 0.4], emotion: '冷漠' },
  { pad: [0.0, 0.2, 0.5], emotion: '平静' },
  { pad: [0.1, 0.1, 0.4], emotion: '无聊' },
  { pad: [0.3, 0.6, 0.5], emotion: '好奇' },
];

// 创建默认情感向量
export function createDefaultEmotionVector(): EmotionVector {
  return {
    pleasure: 0.3,
    arousal: 0.3,
    dominance: 0.5,
    primary: '平静',
    secondary: '',
    blend: 0,
    intensity: 0.5,
    peakIntensity: 0.5,
    duration: 0,
    decayRate: 0.1,
    appraisal: {
      novelty: 0.5,
      pleasantness: 0.3,
      goalRelevance: 0.5,
      copingPotential: 0.6,
      normCompatibility: 0.7,
    },
  };
}

// 从PAD空间映射到情绪标签
export function mapPADToEmotion(pleasure: number, arousal: number, dominance: number): string {
  let closestEmotion = '平静';
  let closestDistance = Infinity;
  
  for (const mapping of EMOTION_MAPPING) {
    const distance = Math.sqrt(
      Math.pow(pleasure - mapping.pad[0], 2) +
      Math.pow(arousal - mapping.pad[1], 2) +
      Math.pow(dominance - mapping.pad[2], 2)
    );
    
    if (distance < closestDistance) {
      closestDistance = distance;
      closestEmotion = mapping.emotion;
    }
  }
  
  return closestEmotion;
}

// 计算两个情感向量的相似度
export function emotionSimilarity(a: EmotionVector, b: EmotionVector): number {
  const padDistance = Math.sqrt(
    Math.pow(a.pleasure - b.pleasure, 2) +
    Math.pow(a.arousal - b.arousal, 2) +
    Math.pow(a.dominance - b.dominance, 2)
  );
  
  // 归一化到0-1范围（最大距离为sqrt(3)≈1.732）
  return 1 - padDistance / Math.sqrt(3);
}

// 克隆情感向量
export function cloneEmotionVector(vector: EmotionVector): EmotionVector {
  return {
    ...vector,
    appraisal: { ...vector.appraisal },
  };
}

// 限制情感向量在有效范围内
export function clampEmotionVector(vector: EmotionVector): EmotionVector {
  return {
    ...vector,
    pleasure: Math.max(-1, Math.min(1, vector.pleasure)),
    arousal: Math.max(0, Math.min(1, vector.arousal)),
    dominance: Math.max(0, Math.min(1, vector.dominance)),
    intensity: Math.max(0, Math.min(1, vector.intensity)),
    blend: Math.max(0, Math.min(1, vector.blend)),
    decayRate: Math.max(0, Math.min(1, vector.decayRate)),
  };
}
```

- [ ] **Step 3: 提交更改**

```bash
git add src/lib/emotion/
git commit -m "feat: add emotion engine types and vector model"
```

---

## Task 6: 情感引擎 - 评估和衰减算法

**Files:**
- Create: `src/lib/emotion/appraisal.ts`
- Create: `src/lib/emotion/decay.ts`

- [ ] **Step 1: 创建情感评估算法**

```typescript
// src/lib/emotion/appraisal.ts

import { Appraisal, EmotionalEvent, PersonalityTraits, EmotionVector } from './types';

// 评估事件的新奇度
export function assessNovelty(event: EmotionalEvent, history: EmotionVector[]): number {
  if (history.length === 0) return 0.8;
  
  // 基于历史情感状态的变化程度
  const recentEmotions = history.slice(-5);
  const avgPleasure = recentEmotions.reduce((sum, e) => sum + e.pleasure, 0) / recentEmotions.length;
  const avgArousal = recentEmotions.reduce((sum, e) => sum + e.arousal, 0) / recentEmotions.length;
  
  // 如果事件类型不常见，新奇度更高
  const typeNovelty = event.type === 'correction' ? 0.9 : 0.5;
  
  return Math.min(1, typeNovelty * 0.6 + Math.abs(avgPleasure) * 0.2 + avgArousal * 0.2);
}

// 评估事件的愉悦性
export function assessPleasantness(
  event: EmotionalEvent,
  personality: PersonalityTraits
): number {
  let pleasantness = 0;
  
  // 基于事件内容的情感倾向
  const positiveWords = ['喜欢', '爱', '开心', '想你', '好的', '嗯嗯', '哈哈'];
  const negativeWords = ['讨厌', '烦', '滚', '分手', '不开心', '生气', '无聊'];
  
  const content = event.content.toLowerCase();
  
  for (const word of positiveWords) {
    if (content.includes(word)) pleasantness += 0.2;
  }
  
  for (const word of negativeWords) {
    if (content.includes(word)) pleasantness -= 0.2;
  }
  
  // 人格特质影响：神经质高的人更容易感知负面
  pleasantness *= (1 - personality.neuroticism * 0.3);
  
  return Math.max(-1, Math.min(1, pleasantness));
}

// 评估事件的目标相关性
export function assessGoalRelevance(
  event: EmotionalEvent,
  personality: PersonalityTraits
): number {
  // 默认中等相关性
  let relevance = 0.5;
  
  // 如果是直接的消息，相关性更高
  if (event.type === 'message' && event.sender === 'user') {
    relevance = 0.7;
  }
  
  // 如果是纠正事件，相关性很高
  if (event.type === 'correction') {
    relevance = 0.9;
  }
  
  // 外向型人格对社交事件更敏感
  if (personality.extraversion > 0.7) {
    relevance *= 1.2;
  }
  
  return Math.min(1, relevance);
}

// 评估应对潜力
export function assessCopingPotential(
  event: EmotionalEvent,
  personality: PersonalityTraits,
  context: { timeSinceLastChat?: number; relationshipDuration?: number }
): number {
  let potential = 0.5;
  
  // 情感稳定性影响应对能力
  potential += personality.emotionalStability * 0.3;
  
  // 宜人性影响沟通能力
  potential += personality.agreeableness * 0.2;
  
  // 关系持续时间越长，应对能力越强
  if (context.relationshipDuration) {
    potential += Math.min(0.2, context.relationshipDuration / 365 * 0.1);
  }
  
  return Math.min(1, potential);
}

// 评估规范兼容性
export function assessNormCompatibility(
  event: EmotionalEvent,
  personality: PersonalityTraits
): number {
  // 默认兼容
  let compatibility = 0.7;
  
  // 开放性高的人对非规范行为更包容
  if (personality.openness > 0.7) {
    compatibility += 0.2;
  }
  
  // 尽责性高的人对规范更敏感
  if (personality.conscientiousness > 0.7) {
    compatibility -= 0.1;
  }
  
  return Math.max(0, Math.min(1, compatibility));
}

// 综合评估
export function appraiseEvent(
  event: EmotionalEvent,
  personality: PersonalityTraits,
  history: EmotionVector[],
  context: Record<string, any> = {}
): Appraisal {
  return {
    novelty: assessNovelty(event, history),
    pleasantness: assessPleasantness(event, personality),
    goalRelevance: assessGoalRelevance(event, personality),
    copingPotential: assessCopingPotential(event, personality, context),
    normCompatibility: assessNormCompatibility(event, personality),
  };
}

// 从评估结果计算情感向量
export function appraisalToEmotion(
  appraisal: Appraisal,
  personality: PersonalityTraits
): Partial<EmotionVector> {
  // 效价主要由愉悦性和目标相关性决定
  const valence = appraisal.pleasantness * 0.7 + appraisal.goalRelevance * 0.3;
  
  // 唤醒度由新奇性和目标相关性决定
  const arousal = appraisal.novelty * 0.5 + appraisal.goalRelevance * 0.5;
  
  // 支配度由应对潜力决定
  const dominance = appraisal.copingPotential;
  
  // 强度由所有维度综合决定
  const intensity = (
    appraisal.novelty * 0.2 +
    Math.abs(appraisal.pleasantness) * 0.3 +
    appraisal.goalRelevance * 0.3 +
    appraisal.copingPotential * 0.2
  );
  
  return {
    pleasure: valence,
    arousal: Math.min(1, arousal),
    dominance: Math.min(1, dominance),
    intensity: Math.min(1, intensity),
    appraisal,
  };
}
```

- [ ] **Step 2: 创建情感衰减动力学**

```typescript
// src/lib/emotion/decay.ts

import { EmotionVector, PersonalityTraits } from './types';
import { cloneEmotionVector, clampEmotionVector, mapPADToEmotion } from './vector';

// 自然衰减
export function naturalDecay(
  current: EmotionVector,
  timeDelta: number, // 小时
  personality: PersonalityTraits
): EmotionVector {
  const decayed = cloneEmotionVector(current);
  
  // 指数衰减
  const exponentialDecay = current.intensity * Math.exp(-current.decayRate * timeDelta);
  
  // 线性衰减（较慢）
  const linearDecay = Math.max(0, current.intensity - 0.05 * timeDelta);
  
  // 周期性波动（24小时周期）
  const hourOfDay = new Date().getHours();
  const circadianFactor = 0.05 * Math.sin(2 * Math.PI * hourOfDay / 24);
  
  // 人格特质影响
  const neuroticismFactor = personality.neuroticism * 0.2; // 神经质高，衰减慢
  const stabilityFactor = personality.emotionalStability * 0.3; // 稳定性高，衰减快
  
  // 综合计算
  const finalIntensity = (exponentialDecay * 0.6 + linearDecay * 0.4) * 
    (1 + circadianFactor) * 
    (1 - neuroticismFactor + stabilityFactor);
  
  decayed.intensity = Math.max(0, Math.min(1, finalIntensity));
  decayed.duration = current.duration + timeDelta * 60;
  
  // 愉悦度向中性回归
  const pleasureDecayRate = 0.1 * timeDelta;
  if (decayed.pleasure > 0) {
    decayed.pleasure = Math.max(0, decayed.pleasure - pleasureDecayRate);
  } else {
    decayed.pleasure = Math.min(0, decayed.pleasure + pleasureDecayRate);
  }
  
  // 唤醒度向基线回归
  const baselineArousal = 0.3;
  const arousalDecayRate = 0.15 * timeDelta;
  if (decayed.arousal > baselineArousal) {
    decayed.arousal = Math.max(baselineArousal, decayed.arousal - arousalDecayRate);
  } else {
    decayed.arousal = Math.min(baselineArousal, decayed.arousal + arousalDecayRate);
  }
  
  // 更新情绪标签
  decayed.primary = mapPADToEmotion(decayed.pleasure, decayed.arousal, decayed.dominance);
  
  return clampEmotionVector(decayed);
}

// 情绪惯性
export function applyInertia(
  previous: EmotionVector,
  current: EmotionVector,
  personality: PersonalityTraits
): EmotionVector {
  // 情感稳定性越高，惯性越大
  const inertiaFactor = personality.emotionalStability * 0.6 + 0.2;
  
  return {
    ...current,
    pleasure: previous.pleasure * inertiaFactor + current.pleasure * (1 - inertiaFactor),
    arousal: previous.arousal * inertiaFactor + current.arousal * (1 - inertiaFactor),
    dominance: previous.dominance * inertiaFactor + current.dominance * (1 - inertiaFactor),
    intensity: previous.intensity * inertiaFactor + current.intensity * (1 - inertiaFactor),
  };
}

// 情绪波动
export function applyFluctuation(
  emotion: EmotionVector,
  personality: PersonalityTraits
): EmotionVector {
  // 神经质越高，波动越大
  const fluctuationMagnitude = personality.neuroticism * 0.08;
  
  // 情感范围越大，波动越大
  const rangeFactor = personality.emotionalRange * 0.5 + 0.5;
  
  const fluctuation = {
    pleasure: (Math.random() - 0.5) * fluctuationMagnitude * rangeFactor,
    arousal: (Math.random() - 0.5) * fluctuationMagnitude * 0.5 * rangeFactor,
    dominance: (Math.random() - 0.5) * fluctuationMagnitude * 0.3 * rangeFactor,
  };
  
  return {
    ...emotion,
    pleasure: emotion.pleasure + fluctuation.pleasure,
    arousal: emotion.arousal + fluctuation.arousal,
    dominance: emotion.dominance + fluctuation.dominance,
  };
}

// 情绪恢复
export function applyRecovery(
  emotion: EmotionVector,
  personality: PersonalityTraits
): EmotionVector {
  // 恢复速率由人格特质决定
  const recoveryRate = personality.recoveryRate * 0.1;
  
  // 向基线状态恢复
  const baseline = {
    pleasure: 0.2,
    arousal: 0.3,
    dominance: 0.5,
  };
  
  return {
    ...emotion,
    pleasure: emotion.pleasure + (baseline.pleasure - emotion.pleasure) * recoveryRate,
    arousal: emotion.arousal + (baseline.arousal - emotion.arousal) * recoveryRate,
    dominance: emotion.dominance + (baseline.dominance - emotion.dominance) * recoveryRate,
  };
}

// 综合演进
export function evolveEmotion(
  current: EmotionVector,
  timeDelta: number,
  personality: PersonalityTraits
): EmotionVector {
  // 1. 自然衰减
  let evolved = naturalDecay(current, timeDelta, personality);
  
  // 2. 情绪惯性
  evolved = applyInertia(current, evolved, personality);
  
  // 3. 情绪波动
  evolved = applyFluctuation(evolved, personality);
  
  // 4. 情绪恢复
  evolved = applyRecovery(evolved, personality);
  
  // 5. 更新情绪标签
  evolved.primary = mapPADToEmotion(evolved.pleasure, evolved.arousal, evolved.dominance);
  
  // 6. 边界检查
  return clampEmotionVector(evolved);
}
```

- [ ] **Step 3: 提交更改**

```bash
git add src/lib/emotion/appraisal.ts src/lib/emotion/decay.ts
git commit -m "feat: add emotion appraisal and decay algorithms"
```

---

## Task 7: 微信风格UI - 基础组件

**Files:**
- Create: `src/components/ui/WeChatButton.tsx`
- Create: `src/components/ui/WeChatInput.tsx`
- Create: `src/components/ui/WeChatBubble.tsx`
- Create: `src/components/ui/WeChatAvatar.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: 创建微信风格按钮组件**

```typescript
// src/components/ui/WeChatButton.tsx

import React from 'react';

interface WeChatButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  className?: string;
}

export const WeChatButton: React.FC<WeChatButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  className = '',
}) => {
  const baseStyles = 'rounded-lg font-medium transition-all duration-200 active:scale-95';
  
  const variantStyles = {
    primary: 'bg-[#07C160] hover:bg-[#06AD56] text-white',
    secondary: 'bg-[#EDEDED] hover:bg-[#D9D9D9] text-[#353535]',
    danger: 'bg-[#FA5151] hover:bg-[#E04B4B] text-white',
  };
  
  const sizeStyles = {
    small: 'px-3 py-1.5 text-sm',
    medium: 'px-4 py-2 text-base',
    large: 'px-6 py-3 text-lg',
  };
  
  const disabledStyles = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${disabledStyles} ${className}`}
    >
      {children}
    </button>
  );
};

export default WeChatButton;
```

- [ ] **Step 2: 创建微信风格输入框组件**

```typescript
// src/components/ui/WeChatInput.tsx

import React, { useState, useRef, useEffect } from 'react';

interface WeChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const WeChatInput: React.FC<WeChatInputProps> = ({
  value,
  onChange,
  onSend,
  placeholder = '输入消息...',
  disabled = false,
  className = '',
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend?.();
    }
  };

  return (
    <div className={`flex items-end gap-2 ${className}`}>
      <div className={`flex-1 relative rounded-lg border transition-all duration-200 ${
        isFocused ? 'border-[#07C160] bg-white' : 'border-[#E5E5E5] bg-[#F7F7F7]'
      }`}>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full px-4 py-2.5 bg-transparent resize-none outline-none text-[#353535] placeholder-[#999999] text-sm leading-relaxed"
          style={{ maxHeight: '120px' }}
        />
      </div>
      
      {onSend && (
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            value.trim()
              ? 'bg-[#07C160] hover:bg-[#06AD56] text-white active:scale-95'
              : 'bg-[#EDEDED] text-[#999999] cursor-not-allowed'
          }`}
        >
          发送
        </button>
      )}
    </div>
  );
};

export default WeChatInput;
```

- [ ] **Step 3: 创建微信风格气泡组件**

```typescript
// src/components/ui/WeChatBubble.tsx

import React from 'react';

interface WeChatBubbleProps {
  content: string;
  isUser: boolean;
  timestamp?: string;
  showAvatar?: boolean;
  avatarUrl?: string;
  className?: string;
}

export const WeChatBubble: React.FC<WeChatBubbleProps> = ({
  content,
  isUser,
  timestamp,
  showAvatar = true,
  avatarUrl,
  className = '',
}) => {
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${className}`}>
      <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2 max-w-[80%]`}>
        {/* 头像 */}
        {showAvatar && (
          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full flex items-center justify-center text-white text-sm font-medium ${
                isUser ? 'bg-[#07C160]' : 'bg-[#576B95]'
              }`}>
                {isUser ? '我' : '她'}
              </div>
            )}
          </div>
        )}
        
        {/* 气泡 */}
        <div className="relative">
          <div className={`px-3 py-2 rounded-lg text-sm leading-relaxed ${
            isUser
              ? 'bg-[#95EC69] text-[#353535] rounded-tr-none'
              : 'bg-white text-[#353535] rounded-tl-none shadow-sm'
          }`}>
            {/* 小三角 */}
            <div className={`absolute bottom-2 w-2 h-2 transform rotate-45 ${
              isUser
                ? '-right-1 bg-[#95EC69]'
                : '-left-1 bg-white'
            }`} />
            
            <p className="whitespace-pre-wrap break-words">{content}</p>
          </div>
          
          {/* 时间戳 */}
          {timestamp && (
            <p className={`text-[10px] text-[#999999] mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
              {timestamp}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeChatBubble;
```

- [ ] **Step 4: 创建微信风格头像组件**

```typescript
// src/components/ui/WeChatAvatar.tsx

import React from 'react';

interface WeChatAvatarProps {
  name: string;
  imageUrl?: string;
  size?: 'small' | 'medium' | 'large';
  online?: boolean;
  className?: string;
}

export const WeChatAvatar: React.FC<WeChatAvatarProps> = ({
  name,
  imageUrl,
  size = 'medium',
  online,
  className = '',
}) => {
  const sizeStyles = {
    small: 'w-8 h-8 text-xs',
    medium: 'w-10 h-10 text-sm',
    large: 'w-12 h-12 text-base',
  };
  
  const dotSizes = {
    small: 'w-2 h-2',
    medium: 'w-2.5 h-2.5',
    large: 'w-3 h-3',
  };
  
  // 生成随机颜色（基于名字）
  const getColorFromName = (name: string) => {
    const colors = [
      'bg-[#07C160]', 'bg-[#576B95]', 'bg-[#FA5151]', 
      'bg-[#F0A020]', 'bg-[#10AEFF]', 'bg-[#6467EF]'
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };
  
  return (
    <div className={`relative inline-block ${className}`}>
      <div className={`${sizeStyles[size]} rounded-lg overflow-hidden`}>
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full flex items-center justify-center text-white font-medium ${getColorFromName(name)}`}>
            {name.charAt(0)}
          </div>
        )}
      </div>
      
      {/* 在线状态 */}
      {online !== undefined && (
        <div className={`absolute -bottom-0.5 -right-0.5 ${dotSizes[size]} rounded-full border-2 border-white ${
          online ? 'bg-[#07C160]' : 'bg-[#999999]'
        }`} />
      )}
    </div>
  );
};

export default WeChatAvatar;
```

- [ ] **Step 5: 更新全局样式**

```css
/* src/app/globals.css */

@import "tailwindcss";

:root {
  /* 微信风格配色 */
  --wechat-green: #07C160;
  --wechat-green-light: #95EC69;
  --wechat-bg: #EDEDED;
  --wechat-bg-dark: #111111;
  --wechat-text: #353535;
  --wechat-text-light: #FFFFFF;
  --wechat-border: #E5E5E5;
  --wechat-time: #999999;
  --wechat-link: #576B95;
}

* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

/* 微信风格滚动条 */
::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #C0C0C0;
  border-radius: 2px;
}

::-webkit-scrollbar-thumb:hover {
  background: #A0A0A0;
}

/* 微信风格选中 */
::selection {
  background: rgba(7, 193, 96, 0.3);
  color: inherit;
}

/* 微信风格聚焦 */
:focus-visible {
  outline: 2px solid var(--wechat-green);
  outline-offset: 2px;
}

/* 微信风格动画 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

.animate-slide-in-left {
  animation: slideInLeft 0.3s ease-out;
}

.animate-slide-in-right {
  animation: slideInRight 0.3s ease-out;
}
```

- [ ] **Step 6: 提交更改**

```bash
git add src/components/ui/ src/app/globals.css
git commit -m "feat: add WeChat-style UI components and global styles"
```

---

## Task 8: 重构聊天界面

**Files:**
- Modify: `src/components/ChatWindow.tsx`
- Create: `src/components/chat/MessageItem.tsx`
- Create: `src/components/chat/ChatHeader.tsx`

- [ ] **Step 1: 创建消息项组件**

```typescript
// src/components/chat/MessageItem.tsx

import React from 'react';
import WeChatBubble from '../ui/WeChatBubble';
import WeChatAvatar from '../ui/WeChatAvatar';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface MessageItemProps {
  message: Message;
  personaName: string;
  personaAvatar?: string;
  showAvatar?: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  personaName,
  personaAvatar,
  showAvatar = true,
}) => {
  const isUser = message.role === 'user';
  
  // 格式化时间
  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      <WeChatBubble
        content={message.content}
        isUser={isUser}
        timestamp={formatTime(message.timestamp)}
        showAvatar={showAvatar}
        avatarUrl={isUser ? undefined : personaAvatar}
      />
    </div>
  );
};

export default MessageItem;
```

- [ ] **Step 2: 创建聊天头部组件**

```typescript
// src/components/chat/ChatHeader.tsx

import React from 'react';
import Link from 'next/link';
import WeChatAvatar from '../ui/WeChatAvatar';

interface ChatHeaderProps {
  personaName: string;
  personaAvatar?: string;
  isOnline?: boolean;
  currentMood?: string;
  onBack?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  personaName,
  personaAvatar,
  isOnline = true,
  currentMood,
  onBack,
}) => {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#E5E5E5]">
      {/* 返回按钮 */}
      <Link
        href="/"
        className="flex items-center gap-2 text-[#576B95] hover:text-[#07C160] transition-colors"
        onClick={onBack}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span className="text-sm">返回</span>
      </Link>
      
      {/* 用户信息 */}
      <div className="flex items-center gap-3">
        <WeChatAvatar
          name={personaName}
          imageUrl={personaAvatar}
          size="medium"
          online={isOnline}
        />
        <div>
          <h3 className="text-sm font-medium text-[#353535]">{personaName}</h3>
          {currentMood && (
            <p className="text-[10px] text-[#999999]">{currentMood}</p>
          )}
        </div>
      </div>
      
      {/* 更多按钮 */}
      <button className="p-2 text-[#576B95] hover:text-[#07C160] transition-colors">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      </button>
    </div>
  );
};

export default ChatHeader;
```

- [ ] **Step 3: 重构聊天窗口组件**

```typescript
// src/components/ChatWindow.tsx

"use client";

import { useState, useRef, useEffect } from 'react';
import WeChatInput from './ui/WeChatInput';
import MessageItem from './chat/MessageItem';
import ChatHeader from './chat/ChatHeader';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface PersonaInfo {
  name: string;
  avatar?: string;
  currentMood?: string;
}

export default function ChatWindow({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [personaInfo, setPersonaInfo] = useState<PersonaInfo>({ name: slug });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { 
      role: 'user', 
      content: input,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          slug
        })
      });

      const data = await response.json();
      
      if (data.choices && data.choices[0]) {
        const content = data.choices[0].message.content;
        
        // 处理消息分割（模拟真人发消息）
        const parts = content.split('[BURST]').map((p: string) => p.trim()).filter((p: string) => p);
        
        let delay = 0;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const partDelay = Math.min(Math.max(800, part.length * 40), 3000) + Math.random() * 500;
          delay += partDelay;
          
          setTimeout(() => {
            setMessages(prev => [...prev, { 
              role: 'assistant', 
              content: part,
              timestamp: new Date().toISOString()
            }]);
            
            if (data.mood) {
              setPersonaInfo(prev => ({ ...prev, currentMood: data.mood }));
            }
            
            if (i === parts.length - 1) {
              setLoading(false);
            }
          }, delay);
          
          delay += 500 + Math.random() * 500;
        }
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Chat failed:', error);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto h-[600px] flex flex-col bg-[#EDEDED] rounded-lg overflow-hidden shadow-lg">
      {/* 聊天头部 */}
      <ChatHeader
        personaName={personaInfo.name}
        personaAvatar={personaInfo.avatar}
        currentMood={personaInfo.currentMood}
      />

      {/* 消息列表 */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ backgroundColor: '#EDEDED' }}
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-[#999999] space-y-2">
            <p className="text-sm">开始与 {personaInfo.name} 对话</p>
            <p className="text-xs">所有回复均由蒸馏出的 Persona 驱动</p>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <MessageItem
            key={i}
            message={msg}
            personaName={personaInfo.name}
            personaAvatar={personaInfo.avatar}
            showAvatar={i === 0 || messages[i - 1]?.role !== msg.role}
          />
        ))}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white px-4 py-3 rounded-lg rounded-tl-none shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-[#999999] rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-[#999999] rounded-full animate-bounce delay-100" />
                <span className="w-2 h-2 bg-[#999999] rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 输入框 */}
      <div className="p-3 bg-white border-t border-[#E5E5E5]">
        <WeChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          placeholder="输入消息..."
          disabled={loading}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 提交更改**

```bash
git add src/components/ChatWindow.tsx src/components/chat/
git commit -m "refactor: redesign chat interface with WeChat style"
```

---

## 后续任务概览

由于篇幅限制，以上展示了前8个核心任务。完整实施计划还包括：

- **Task 9-12**: 用户认证界面（登录/注册页面）
- **Task 13-16**: 仪表盘布局和对话列表
- **Task 17-20**: Persona管理界面
- **Task 21-24**: 情感引擎集成到对话流程
- **Task 25-28**: 多角色切换功能
- **Task 29-32**: 聊天记录解析器
- **Task 33-36**: 邀请码管理界面
- **Task 37-40**: 设置页面
- **Task 41-44**: Docker部署配置
- **Task 45-48**: 测试和优化

---

## 执行选项

**计划完成并保存到 `docs/superpowers/plans/2026-05-03-personabot-enhancement-plan.md`**

两种执行方式：

**1. Subagent-Driven（推荐）** - 每个任务分发一个新的子代理，任务间进行审查，快速迭代

**2. Inline Execution** - 在当前会话中执行任务，批量执行并设置检查点

你希望选择哪种执行方式？
