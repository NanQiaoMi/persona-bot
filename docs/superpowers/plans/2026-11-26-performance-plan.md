# 性能优化计划（2026-11-26）

> 级别：L。本文件是蓝图，经用户确认后才开工。
> 分工：Opus 负责方案设计、核心改造、审查每个子代理的 diff；Haiku 子代理负责机械性改动、批量替换、测量与跑四项检查。

## 0. 诊断结论（已实测 / 已读代码）

| # | 问题 | 证据 | 卡顿体感 |
|---|------|------|----------|
| A | **流式回复每个字都让整页重画** | `GrokWorkspace.tsx` 33 个 state、17 个 effect；SSE 循环里每个 `reply` 事件都 `setStreaming`（:1240–1340）；全项目 **0 个 `React.memo`**；`ChatStage` 的消息列表是内联 `messages.map`（:722），每条消息每次都重新做 markdown/正则解析（:93–152）；传给 `ChatStage`/`RightInspector`/`LeftSidebar` 的回调大多是内联箭头函数 | AI 打字时输入框发涩、滚动掉帧、风扇转 |
| B | **生成图片原图直出** | `.data/generated-media/` 137 张 PNG 共 284 MB，单张 2.5–3.5 MB；19 处 `<img>` 都没有 `loading="lazy"`、`decoding="async"` 和宽高，也没用 `next/image` | 打开有照片的聊天、右栏相册、朋友圈时卡一下、内存高 |
| C | **轮询过重** | 有图在生成时每 4 秒拉 100 条消息（:560–593），再用 `JSON.stringify` 逐条对比（`switch-sync.ts:73`）；群聊 15 秒 ambient、5 分钟 catch-up 逐群串行 POST | 生成图期间持续轻微卡顿 |
| D | **服务端存储无缓存** | `listPersonas` 每次 readdir 后对每个角色读约 7 个文件 + 整份 conversations.json（最大 175 KB）；仓储层没有任何内存缓存；会话文件按 2 空格缩进写入 | 切换角色、侧栏刷新、接口变慢 |
| E | **常驻动画与毛玻璃** | 20+ 组 `infinite` 动画（吉祥物呼吸/眨眼/光环、shimmer、波形）；`backdrop-blur-xl` 常驻在聊天头部（ChatStage:443），`blur-3xl` 光晕（:439），共 30+ 处 backdrop-filter | 静置不动时 CPU/GPU 也不归零，笔记本发热 |
| F | 构建告警 | Turbopack NFT 告警：`repository.ts` 的动态路径把整个项目拉进 trace | 不影响体验，顺手修 |

客户端 JS 总量约 1.1 MB、CSS 101 KB，**不是主要矛盾**，暂不做包体积专项。

## 1. 基线测量（PR 前置，不改代码）

由 Haiku 执行，结果写入 `docs/perf-baseline.md`，每个 PR 合入后复测同一套指标：

1. **流式渲染**：离线演示模式下，在一个已有 50+ 条消息的会话里发一句话，用浏览器 `PerformanceObserver('longtask')` 统计回复期间 >50ms 的长任务数与总时长。
2. **重渲染计数**：开发模式下临时加 React Profiler `onRender` 计数（只在测量分支，不提交），记录一次回复期间 `ChatStage` 历史消息行、`LeftSidebar`、`RightInspector` 的 commit 次数。
3. **接口耗时**：`curl -w '%{time_total}'` 各打 20 次 `/api/personas`、`/api/conversations?slug=mi-mi&limit=100`、`/api/groups`，取 p50/p95。
4. **图片**：打开含照片的会话 + 右栏相册，记录传输字节数与 JS 堆内存。
5. **静置 CPU**：页面不操作 30 秒，Performance 面板记录主线程占用与每秒帧数。

## 2. 分 PR 实施（按收益 / 风险排序）

每个 PR 都从最新 `origin/master` 切出，本地 lint / typecheck / test / build 全绿后再推。

### PR-1 `perf/stream-render-isolation`：流式回复只重画正在打字的那一条（收益最大）
- **Opus**：
  - 把消息行抽成 `MessageRow`（及 `GroupMessageRow`）并 `memo`，按 `message` 引用 + 少量标量 props 比较；行内 markdown 解析用 `useMemo`。
  - 把「正在流式输出的气泡」拆成独立组件 `StreamingBubble`，只订阅 `streaming`；历史列表组件不再接收 `streaming`。
  - SSE 循环里的 `reply`/`thought` 更新改为 `requestAnimationFrame` 合并，每帧最多一次 `setState`。
  - `ChatStage` / `RightInspector` / `LeftSidebar` 包 `memo`。
- **Haiku**：按 Opus 给的清单，把 `GrokWorkspace.tsx` 里传给这三个组件的内联箭头函数逐个改成 `useCallback`（依赖用 ref 读最新值），每改一个跑一次 typecheck；最后跑四项检查。
- **验收**：一次回复期间历史消息行 commit 次数 = 0；`LeftSidebar`/`RightInspector` 不随字刷新；长任务总时长较基线下降 ≥ 60%。
- **测试**：给 rAF 合并器写单测（多次 push 只 flush 一次、结束时强制 flush 最后一帧）。

### PR-2 `perf/media-thumbnails`：图片按需加载 + 缩略图
- **Haiku**：19 处 `<img>` 统一补 `loading="lazy" decoding="async"` 和固定宽高 / `aspect-ratio`，避免布局跳动（灯箱大图除外，不加 lazy）。
- **Opus**：生成图落盘时额外存一份缩略图（长边 640px、WebP），`/api/media/[filename]?w=thumb` 返回缩略图；聊天卡片、相册、朋友圈用缩略图，点开灯箱才加载原图。历史 137 张图写一次性迁移脚本，由 Haiku 运行。
- **待你决定**：缩略图怎么生成（见第 4 节问题 1）。
- **验收**：打开相册传输量下降 ≥ 80%；灯箱仍是原图清晰度。

### PR-3 `perf/polling-diet`：轮询瘦身
- **Opus**：新增轻量接口 `GET /api/media/status?ids=…`，只返回待生成卡片的状态；有变化时才拉整段消息。轮询间隔 4→8→15 秒逐步放慢，页面切到后台就暂停。
- **Haiku**：`mergeServerWithLocalPending` 的 `JSON.stringify` 全量比较改为「id + 内容长度 + mediaCards 状态」浅比较，补单测覆盖原有用例。
- **验收**：生成一张图的全过程中，消息接口请求次数下降 ≥ 70%，原有 switch-sync 测试全绿。

### PR-4 `perf/storage-cache`：服务端读缓存
- **Opus**：仓储层加进程内读缓存（挂 `globalThis`，和现有锁表同一套隔离方式），所有写方法写入后立即更新或作废缓存，按 `mtime` 兜底校验，防止外部改文件后读到旧数据；`listPersonas` 改成并行读取，只取 meta + 最后一条消息；MongoDB 路径不动。
- **Haiku**：`conversations.json` 等写入去掉缩进；修 Turbopack NFT 告警（静态化路径或加 `turbopackIgnore` 注释）；补测试：写后读一致、并发写不丢数据、临时目录隔离。
- **验收**：`/api/personas` p50 下降 ≥ 70%；全部存储测试全绿。

### PR-5 `perf/idle-motion`：静置时安静下来
- **Haiku**：
  - `globals.css` 增加 `@media (prefers-reduced-motion: reduce)` 关闭所有 infinite 动画。
  - 页面隐藏时给 `<html>` 加 `data-hidden`，CSS 统一 `animation-play-state: paused`。
  - 聊天头部 `backdrop-blur-xl` 降到 `backdrop-blur-sm` 或改成半透明纯色；`blur-3xl` 光晕改成静态径向渐变。
- **Opus**：审查视觉回归（用内置浏览器在暗色 / 亮色下各截一张前后对比图给你看）。
- **验收**：静置 30 秒主线程占用较基线下降 ≥ 50%，视觉基本不变（由你确认截图）。

### （可选）PR-6 `refactor/workspace-state-split`
把 `GrokWorkspace` 的 33 个 state 按领域拆成 `useChatSession` / `useGroups` / `useMediaPolling` 等 hooks。改动大、收益主要在可维护性，**建议等 PR-1～5 的效果出来再决定做不做**。

## 3. 子代理协作规则
- 每个 Haiku 任务都有明确的文件清单、改法示例和完成标准；只改清单内的文件，不提交、不切分支。
- Haiku 交回后由 Opus 读 diff 审查，确认无误后才提交；四项检查由 Haiku 跑，Opus 看真实输出后再汇报。
- 同一时间只有一个子代理改同一个文件。

## 4. 已确认的决定（2026-11-26）
1. 缩略图：引入 `sharp`，图片落盘时生成 640px WebP。
2. 开工时机：等 PR #53 合并后，从最新 `origin/master` 切分支开工。
3. 7 个未跟踪的设计稿文件原地保留，不动。
