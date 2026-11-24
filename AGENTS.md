<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PersonaBot v2.0 (Grok Edition) — 项目地图与工程规范

## 1. 项目定位
PersonaBot 是一个将**真实聊天记录蒸馏人物灵魂（五层人格 + 共同记忆）**与 **Grok 式实时全能大脑（DeepSearch 实时联网、Think 内心潜台词、多档人格尺度、时间感知与多模态交互）** 融为一体的沉浸式拟人 AI 对话工作台。

## 2. 技术栈
- **全栈框架**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **样式**: Tailwind CSS v4 + CSS Variables（支持深空暗色 / 清爽亮色主题）
- **AI 与检索**: 纯 TypeScript 多阶段流式编排器（SSE）+ 默认本地网关 (`http://127.0.0.1:18630/v1`, 支持 `gpt-5.6`/`auto` 与 `gpt-image-2*` 表情包/拍照生图) + OpenAI/xAI Grok/DeepSeek 兼容接口 + 免 Key 实时搜索与 Tavily/Serper 双擎适配器 + 离线演示智能兜底
- **存储层**: 统一存储仓储层（默认 `exes/` + `.data/` 本地结构化文件及 `.data/generated-media/` 生成媒体持久化，配置 `MONGODB_URI` 时自动适配 MongoDB）
- **测试与 CI**: Vitest + ESLint + TypeScript (`tsc --noEmit`) + GitHub Actions

## 3. 核心目录结构
- `src/app/` — App Router 页面与 REST/SSE API 路由（唯一 `/` 入口，`/chat/[slug]`、`/create`、`/gallery`）
- `src/components/` — UI 组件（`workspace/` 三栏工作台、`persona/` 蒸馏向导、`settings/` 模型配置舱）
- `src/lib/storage/` — 统一存储仓储层（本地结构化文件 + 快照回滚与灵魂包导入导出 + MongoDB 适配 + 内置标杆角色自动初始化）
- `src/lib/persona/` — 内置 Grok 标杆角色库、全套重写 Prompt、纯 TS 五阶段蒸馏引擎、自动记忆与习惯自进化 (`evolution.ts`) 与 Prompt 组装器
- `src/lib/grok/` — DeepSearch 联网、人格模式修饰器、时间感知主动破冰、SSE 流式编排器
- `src/lib/emotion/` — PAD 三维情绪状态机、时间衰减与好感度引擎
- `src/lib/parsers/` — 纯 TS 聊天记录解析器（微信 TXT/HTML/JSON、iMessage、通用文本）
- `tests/` — Vitest 自动化测试套件
- `docs/` — 架构文档（`ARCHITECTURE.md`）、演进计划（`PLAN.md`）、决策记录（`DECISIONS.md`）

## 4. 常用开发与验证命令
```bash
npm install          # 安装依赖
npm run dev          # 启动本地开发服务器 (http://localhost:3000)
npm run lint         # ESLint 静态检查
npm run typecheck    # TypeScript 类型检查
npm test             # 运行 Vitest 自动化测试
npm run build        # 验证 Next.js 生产构建
```

## 5. 开发铁律与禁忌
1. **禁止引入 Python 子进程**：所有聊天记录解析、角色蒸馏与文件管理必须使用纯 TypeScript 实现，严禁 `spawn('python', ...)`。
2. **Next.js 16 异步 Params**：所有动态路由页面与 API Route 中的 `params` 均是 `Promise`，必须先 `await params`。
3. **零配置开箱即用**：任何核心路由或工作台操作不得在未配置 `MONGODB_URI` 或 `LLM_API_KEY` 时直接抛出 500 崩溃，必须走本地仓储与离线演示兜底。
4. **严禁直推主分支与越权合并 PR**：所有改动必须走功能分支 + 本地四项检查全绿 + PR + CI 全绿流程。
5. **严禁提交密钥**：`.env`、真实 API Key 与用户隐私聊天记录不得提交至 Git 仓库。
