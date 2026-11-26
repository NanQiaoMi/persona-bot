# 启动动画计划（「小团子醒来」）· M 级

> 状态：**已确认（按推荐方案），已实现于 `feat/splash-animation`**。

---

## 0. 现状盘点

| 项目 | 现状 | 对本需求的影响 |
|------|------|----------------|
| 首屏加载态 | `ChatStage.tsx:374-383`：`persona` 为空时居中显示一只黑色 `BlobMascot`（thinking 状态）+「正在连接 PersonaBot...」 | 这就是要替换 / 升级的地方 |
| 数据就绪信号 | `GrokWorkspace.tsx:425-440`：先并行拉 `loadPersonaList()` + `loadGroups()`，再拉 `loadActivePersonaDetail(activeSlug)`，最后 `setActivePersona` | 「首次拿到 `activePersona`」就是天然的退场信号；三个步骤可以当作真实进度 |
| 加载失败 | `loadActivePersonaDetail` 出错只 `console.error`，`persona` 会一直为空 → 现在的加载态会一直转下去 | 启动动画必须有超时退场，不能把人卡在门口 |
| 主题 | `layout.tsx` 写死 `data-theme="light"`，等 JS 跑起来后才读 `localStorage("personabot-theme")` 切成暗色 | **暗色用户现在每次打开都会先闪一下白屏**。启动动画要好看，必须先修掉这个闪烁 |
| 吉祥物 | `BlobMascot`（客户端组件，带鼠标跟随、眨眼、呼吸）；`mascot-palette.ts` 有 13 种形状 path、11 种颜色 | 启动画面复用形状 path 和配色，但不直接用 `BlobMascot` 组件（理由见 3.2） |
| 已有动效 | `globals.css` 已有 `blob-breathe / blob-blink / msg-spring-in / fade-in / text-shimmer / orbit-spin` 等 keyframes，并已有一段 `prefers-reduced-motion` 降级 | 启动动画的关键帧放在同一文件，沿用命名与降级写法 |
| 入口 | `/` 和 `/chat/[slug]` 都渲染 `GrokWorkspace` | 启动动画挂在 `GrokWorkspace` 里，两个入口都能用 |
| 未合并的 `feat/motion-system` | 有 `useReducedMotion` hook（36 行）、`--motion-fast/base/slow`、`--ease-standard/emphasized/spring` 变量、FLIP 工具 | **这 6 个界面分支都比 master 落后 50 个提交**（分叉点 `ce82a0f`），不能直接在上面叠。做法：从最新 master 切新分支，只**复制**其中的 `useReducedMotion` 和 6 个动效变量（变量名、取值保持一致），以后那些分支合并时冲突最小。不删除、不改动那 6 个分支 |

---

## 1. 目标与不做的事

**目标**
1. 第一次打开时，有一段约 1.2 秒、有记忆点的品牌开场：吉祥物「醒来」，几位角色的颜色聚到一起，然后让位给工作台。
2. **不拖慢首屏**：数据请求和以前同一时间开始；数据到了就退场，动画不额外拖住数据。
3. 亮 / 暗主题首帧就对，不闪白。
4. 尊重「减少动态效果」；任何时候点一下或按任意键都能跳过。
5. 零新依赖。

**不做**
- 不做假的百分比进度条。
- 不做声音。
- 不改聊天、群聊、侧栏的任何业务逻辑。
- 不改其它页面（`/create`、`/gallery`、`/models`）。

---

## 2. 分镜与时间轴

时间从浏览器拿到 HTML 开始算（t=0）。启动画面是**服务端直接输出的 HTML + 纯 CSS 动画**，所以 JS 还没下载完它就已经在动了。

### 2.1 完整版（本次浏览器会话第一次打开）

| 段落 | 时间 | 画面 | 缓动 |
|------|------|------|------|
| ① 入场 | 0 – 120ms | 背景就是 `--bg-primary`（首帧主题已对）。中心一圈很淡的品牌色光晕（`--accent-teal`，亮色 8% / 暗色 14% 透明度）淡入 | `ease-out` |
| ② 落下 | 120 – 520ms | 圆形团子从上方 16px、缩放 0.6 落到中心，落地时压扁一下（scaleX 1.08 / scaleY 0.92）再弹回 | `--ease-spring` `cubic-bezier(0.22,1,0.36,1)`，弹回段 `--ease-emphasized` |
| ③ 睁眼 | 520 – 760ms | 两只眼睛从一条缝（scaleY 0.1）睁开，紧接着眨一次眼，眼珠往左看一下再回中 | 睁眼 `--ease-standard`，眨眼 120ms 线性 |
| ④ 聚灵 | 600 – 1000ms | 4 个小色点（取 4 位内置角色的吉祥物颜色，写死在服务端，不依赖接口）从画面四周 24px 外依次飞向团子，间隔 60ms，碰到团子时团子轻微「咕噜」一下（scale 1.04） | `--ease-spring` |
| ⑤ 文字 | 760 – 1100ms | 团子下方「PersonaBot」逐字上浮淡入（每字间隔 25ms，位移 6px）；再淡入一行小字状态 | `--ease-standard` |
| ⑥ 等待（仅当数据还没到） | 1100ms 之后 | 团子进入现有的 `blob-breathe` 呼吸；状态小字用现有 `text-shimmer` 流光，文案随真实步骤变化（见 4.2）；3 个小圆点代表 3 个加载步骤，完成一个亮一个 | 循环 |
| ⑦ 退场 | 数据就绪且 ≥ 900ms 后开始，共 360ms | 团子放大到 1.15 并淡出；整层遮罩淡出（实现时去掉了模糊：全屏 blur 每帧都要重绘，和「只动 transform / opacity」冲突）；底下工作台从 scale 0.985、透明度 0.6 过渡到 1 | `--ease-standard`，遮罩 300ms、工作台 360ms |

**退场规则**
- 数据在 900ms 之前就到了：等到 900ms（团子已经睁眼、色点在聚拢）再退场，保证开场完整但不冗长。
- 数据在 900ms 之后才到：数据一到立刻退场，不等动画播完。
- 一直没到：**8 秒**强制退场，露出工作台（届时 ChatStage 显示原有的简化加载态 / 错误提示）。
- 退场一开始遮罩就 `pointer-events: none`，用户可以立即点工作台。

### 2.2 简短版（同一会话内刷新 / 再次打开）

- 只有团子 + 光晕，0 – 200ms 淡入缩放到位，无聚灵、无逐字。
- 数据到了立刻退场（无最短时长），退场 220ms。
- 数据很快（< 150ms）到时整段几乎看不到，这是预期效果。

### 2.3 减少动态效果版（系统开启「减少动态效果」）

- 静态团子 + 「PersonaBot」+ 状态小字，没有任何位移、缩放、闪烁、流光。
- 数据到了用 150ms 纯透明度淡出。

### 2.4 跳过

- 遮罩上点击、触摸、按任意键（含 Esc）→ 立刻进入退场（220ms）。
- 跳过后如果数据还没到，工作台里显示 ChatStage 的加载态（保留现有逻辑，只把文案从「正在连接」改成更轻的骨架或小字）。

---

## 3. 技术方案

### 3.1 选型：纯 CSS + 内联 SVG（零依赖）

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **CSS keyframes + 内联 SVG** | 服务端 HTML 自带，JS 还没加载就能播放；只动 transform / opacity，走 GPU；零体积依赖；和现有 `globals.css` 风格一致 | 复杂编排要靠 `animation-delay` 手算 | ✅ 采用 |
| Web Animations API | 可在 JS 里精确编排、可暂停 | 必须等 JS 加载、水合后才能开始，首屏会先空白一下 | 仅用于退场的「完成回调」也不需要，`transitionend` + 定时器兜底即可 |
| framer-motion / motion | 写法舒服 | 增加约 30–50KB JS，且同样要等水合才动 | ❌ 不引入 |
| Lottie | 设计师友好 | 播放器约 60KB+，需要外部设计资源 | ❌ 不引入 |

### 3.2 为什么不直接用 `BlobMascot` 组件

`BlobMascot` 依赖 `useState / useEffect` 做鼠标跟随，水合前不会动、水合时状态还会重置。启动画面需要「HTML 一到就动」，所以单独写一个**无状态**的 SVG：复用 `MASCOT_SHAPES` 里圆形的 `path`、眼睛的位置比例，视觉上和吉祥物是同一只。

### 3.3 首帧主题与版本判断：`<head>` 里一段很小的内联脚本

在 `layout.tsx` 的 `<head>` 中加一段同步执行的内联脚本（Next 16 文档 `02-guides/scripts.md` 里说明的 `dangerouslySetInnerHTML` + 必须带 `id`；实施时再按文档核对是否用 `next/script` 的 `beforeInteractive`）：

```js
// 约 300 字节，包在 try/catch 里，任何异常都静默
var t = localStorage.getItem("personabot-theme");
if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
document.documentElement.dataset.splash =
  sessionStorage.getItem("personabot-splash-seen") ? "short" : "full";
```

- 顺便修掉现有的「暗色用户先闪白」问题。
- `<html>` 加 `suppressHydrationWarning`（只作用于 html 自身属性），避免 React 抱怨属性和服务端不一致。
- CSS 用 `[data-splash="short"] .splash-*` 切换简短版，**服务端不需要知道是哪一版**，也就没有水合不一致。
- 现有 `GrokWorkspace.tsx:106-113` 读主题的逻辑保留（只负责同步 React 里的 `theme` 状态）。

### 3.4 组件与状态

```
GrokWorkspace
 ├─ (原有) LeftSidebar / ChatStage / RightInspector …   ← 工作台照常渲染在下面
 └─ <SplashScreen ready={…} steps={…} onDone={…} />     ← fixed 全屏遮罩，z-index 最高
```

- `ready = Boolean(activePersona)`（首次为真后锁定，切换角色不会再出现启动画面）。
- `steps = { personas, groups, detail }` 三个布尔值，由 `init()` 里三个请求各自完成时置真（只加几行 `setState`，不改请求本身的顺序和逻辑）。
- 退场时机计算放进纯函数 `src/lib/motion/splash.ts`：
  - `getSplashVariant({ seenThisSession, reducedMotion })` → `"full" | "short" | "reduced"`
  - `getExitDelay({ variant, elapsedMs, ready })` → 还要等多少毫秒（实现 900ms 最短、8s 超时规则）
- 退场：组件把自身 `data-state` 设为 `exiting`，CSS 过渡负责动画；`transitionend` 或 500ms 兜底定时器到了就卸载 DOM，并写入 `sessionStorage("personabot-splash-seen")`。
- 标签页在后台时（`document.hidden`）CSS 动画由浏览器自动节流；回到前台时若已 ready 直接退场，不补播。

### 3.5 与现有加载流程的衔接

- 数据请求仍在水合后的 `useEffect` 里发出，**时间点与现在完全相同**，启动画面不阻塞任何请求。
- ChatStage 的 `!persona` 分支：启动画面在场时它被盖住；启动画面被跳过 / 超时后它才会被看到。把这里改成轻量的骨架占位（不再重复画一只大团子），避免「团子消失又出现一只团子」的重复感。
- 退场期间工作台已经可点击。

---

## 4. 视觉细节

### 4.1 亮 / 暗主题

全部颜色走 CSS 变量，不写死：

| 元素 | 亮色 | 暗色 |
|------|------|------|
| 背景 | `--bg-primary` #ffffff | `--bg-primary` #09090c |
| 团子身体 | `--text-primary`（#1d1d1f，与现在加载态的黑团子一致） | `--text-primary`（#f5f5f7，暗底上的白团子） |
| 团子眼睛 | `--bg-primary` | `--bg-primary` |
| 光晕 | `--accent-teal` 8% | `--accent-teal` 14% |
| 4 个色点 | 4 位内置角色的吉祥物颜色（亮暗相同） | 同左 |
| 字 | `--text-primary` / 状态 `--text-muted` | 同左 |

### 4.2 状态文案（与真实进度挂钩）

| 步骤 | 文案 |
|------|------|
| 开始 | 正在唤醒 TA 们… |
| 角色列表已到 | 正在翻开聊天记录… |
| 群聊已到 | 快好了… |
| 超过 3 秒 | 第一次启动会慢一点，马上就好 |

（文案可以改，这里先给初稿。）

---

## 5. 无障碍与降级

- 遮罩 `role="status"` + `aria-live="polite"`，读屏只读「PersonaBot 正在加载」和状态文案；装饰性 SVG `aria-hidden`。
- 不抢焦点、不做焦点陷阱；跳过只需任意键。
- `prefers-reduced-motion: reduce` → 2.3 的静态版。CSS 媒体查询负责首帧（水合前），`useReducedMotion` 负责 JS 侧的退场时长。
- JS 加载失败 / 被禁用：遮罩会一直盖着 → 给遮罩加一个纯 CSS 的 10 秒自动淡出（`animation: splash-failsafe 0.3s 10s forwards`），保证最坏情况也能看到页面。
- `localStorage / sessionStorage` 不可用（隐私模式等）：内联脚本 try/catch，默认亮色 + 完整版。

---

## 6. 性能指标（验收标准）

| 指标 | 目标 | 怎么量 |
|------|------|--------|
| 新增 JS（首屏 chunk） | ≤ 3 KB（gzip） | `npm run build` 输出对比 master |
| 新增 CSS | ≤ 2 KB（gzip） | 同上 |
| 新增依赖 | 0 | `package.json` diff |
| 数据请求开始时间 | 与 master 相同（± 50ms） | 浏览器网络面板 `/api/personas` 的发起时间 |
| 工作台可用时间（完整版） | ≤ max(数据就绪, 900ms) + 360ms | `performance.mark('splash:exit-end')` |
| 工作台可用时间（简短版） | ≤ 数据就绪 + 220ms | 同上 |
| 动画帧率 | 只动 transform / opacity，无布局抖动（CLS = 0） | 性能面板录一次，看有无 Layout / 长任务 |
| 暗色首帧 | 不闪白 | 暗色下刷新截图 / 录屏逐帧看 |

---

## 7. 待确认问题（附推荐）

1. **风格**：推荐「小团子醒来 + 角色色点聚拢」（与现有吉祥物一脉相承）。备选：极简品牌字标（只有 PersonaBot 文字流光）/ 更华丽的粒子汇聚（成本高，不推荐）。
2. **时长**：推荐完整版最短 900ms、退场 360ms，数据慢时不额外拖延。备选：更长的 1.8s 完整叙事（每次都会多等约 1 秒）。
3. **出现时机**：推荐「每个浏览器会话第一次完整版，之后刷新用简短版」。备选：每次都完整版 / 只在第一次安装（永久记住，之后再也不出现）。
4. **可跳过**：推荐「点击或任意键跳过」。
5. **和真实加载挂钩**：推荐「3 个步骤圆点 + 随步骤变化的文案」，不做假百分比。
6. **减少动态效果**：推荐支持（静态版 + 150ms 淡出）。
7. **团子颜色**：推荐黑团子（暗色下白团子），与现在一致；备选用品牌青色 `#18a999`。
8. **4 个色点**：推荐用 4 位内置角色的颜色；备选统一品牌色。

---

## 8. 改动文件清单

| 文件 | 改动 |
|------|------|
| `src/components/workspace/SplashScreen.tsx` | **新增**。无状态 SVG 团子 + 色点 + 字标 + 状态文案；接收 `ready / steps`，负责退场与卸载 |
| `src/lib/motion/splash.ts` | **新增**。`getSplashVariant`、`getExitDelay` 纯函数 + 常量（900 / 360 / 220 / 8000） |
| `src/hooks/useReducedMotion.ts` | **新增**（从 `feat/motion-system` 原样复制，保持同名同路径，以后合并零冲突） |
| `src/app/layout.tsx` | `<head>` 内联脚本（主题 + 版本）；`<html suppressHydrationWarning>` |
| `src/app/globals.css` | 启动画面 keyframes 与 `.splash-*` 类；补 6 个动效变量（与 `feat/motion-system` 同名同值）；`prefers-reduced-motion` 段补上启动画面 |
| `src/components/workspace/GrokWorkspace.tsx` | 挂载 `<SplashScreen>`；`init()` 里记录 3 个步骤完成状态 |
| `src/components/workspace/ChatStage.tsx` | `!persona` 分支改为轻量骨架占位 |
| `tests/splash.test.ts` | **新增**。覆盖版本判断、900ms 最短、数据晚到立即退场、8s 超时、减少动态效果 |
| `docs/DECISIONS.md` | 记一条：启动动画选纯 CSS 而非动效库的理由 |

预计 1 个 PR，分支名 `feat/splash-animation`，从最新 `origin/master` 切出。

---

## 9. 验证方式

1. **自动化**：`npm run lint`、`npm run typecheck`、`npm test`、`npm run build` 全绿，并贴出本轮真实输出。
2. **浏览器实测**（用 `PERSONABOT_DATA_ROOT` 指向临时目录启动沙盒，不碰 `exes/`、`.data/` 真实数据；开发服务器用 `.claude/launch.json` 的 `dev`）：
   - 亮色 / 暗色各截一组关键帧：落下、睁眼、聚灵、字标、退场后工作台。
   - 暗色刷新确认首帧不闪白。
   - 同一会话刷新 → 简短版；新开无痕窗口 → 完整版。
   - 模拟「减少动态效果」→ 静态版。
   - 网络面板限速（Slow 3G）→ 等待态文案按步骤变化；接口断开 → 8 秒后退场。
   - 点击 / 按键跳过。
   - 移动端尺寸（375×812）布局居中、不溢出。
3. **性能**：对比 master 的 build 体积；`/api/personas` 发起时间不变；性能面板无布局抖动。

---

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| 动画反而让人觉得「变慢了」 | 900ms 上限 + 数据晚到立即退场 + 简短版 + 可跳过 |
| 内联脚本出错导致白屏 | try/catch 静默；CSS 10 秒兜底淡出 |
| 以后合并 6 个旧界面分支时冲突 | 复制的 hook 与变量保持同名同值；新代码集中在新文件；`globals.css` 只在文件末尾追加 |
| 群聊 / 切换角色时又弹出启动画面 | `ready` 首次为真后锁定，组件卸载后不再挂载 |

---

## 11. 第二版：「角色风车」（2026-11-26 按用户反馈重做）

用户看过第一版（小团子醒来）后觉得不够有特色。经过三轮小样对比（方向 A 蒸馏 / B 气泡破壳 / C 内心戏 → A 的融合形态 → 标识形态 M1–M3 → M3 的叶片造型），最终选定 **M3-② 四个角色本体围着主 bot 的风车**。

### 时间轴（完整版）

| 时间 | 画面 | 缓动 |
|------|------|------|
| 0–760ms | 鹿汐（云）、夏柚（四叶草）、沈栀（小花）、陈野（六边形）带着眼睛从四角依次弹出，间隔 80ms | `--ease-spring` |
| 560–1240ms | 四个角色顺时针旋进中心（绕中心转 110°、半径 88→16px、自转 200°），末段淡出 | 加速 `cubic-bezier(0.55,0,0.8,0.3)` |
| 600–1650ms | 风车标志从 -300° 带惯性转进来，过冲到 +8°、回到 -2°、归零 | 分段：强 ease-out → ease-in-out → ease-out |
| 680–1400ms | 四个角色依次弹入槽位（间隔 70ms，带回弹） | `cubic-bezier(0.34,1.56,0.64,1)` |
| 1120ms | 中间的主 bot 弹出（1→1.3→0.95→1），外圈一道背景色细环把它和角色隔开 | `--ease-spring` |
| 1240ms | 锁定：整体压扁回弹一下，一圈淡波纹扩散 | ease-out |
| 1300ms 起 | 「PersonaBot」逐字浮现，每个字先带角色颜色再回到正文色 | `--ease-spring` |
| 1400–1820ms | 主 bot 睁眼（带过冲）、眨眼 | `--ease-spring` |
| 1800ms | 数据已就绪时开始退场（最短时长从 900ms 调整为 1800ms） | |
| 3000ms 起（仅数据慢时） | 风车 24 秒一圈缓慢自转，角色反向自转保持正立；眨眼循环；状态文案 | linear |

- **简短版**：没有出场和旋转，拼好的风车 260ms 内依次弹出，主 bot 睁眼。
- **减少动态效果**：静态风车 + 字标。
- 只动 transform / opacity；全部 CSS 关键帧，服务端 HTML 自带，零依赖。
- 角色颜色与形状取自 `mascot-palette.ts` 的 `BUILTIN_MASCOT_PRESETS`，换内置角色时启动动画自动跟着变。

### 沙盒实测（生产构建）

- 完整版：数据约 680ms 就绪，2216ms 完全退场
- 简短版：763ms 完全退场
- 不存在的角色：8263ms 超时退场
- 暗色首帧为暗色；375 宽手机无横向溢出

---

## 12. 流畅度修复（2026-11-26）

**反馈**：「动画不是很流畅」。另一会话实测 e9bf1fe：动画期间帧间隔中位数 33.9ms（约 30fps），最大 117ms。

**原因**
1. 风车、主 bot、眼睛都是 SVG 内部 `<g>` 的 transform 动画——Chrome 不把它们交给合成线程，每帧都要在主线程重算样式并重绘 SVG，和水合、数据加载、工作台首次渲染抢主线程。
2. 字标的 `color` 动画、状态文字的流光（`background-position`）每帧都要重绘。
3. 退场开始时 SplashScreen 回调 GrokWorkspace 改状态，整个工作台重渲染一遍，正好落在退场动画上（实测 51ms 长帧）。

**改法**
- 所有会动的部分改为 HTML 包裹层（`div`），只动 transform / opacity，并 `will-change` 提前分层；SVG 内部全部静止。风车槽位位置改为预先算好的像素坐标，不再靠 SVG 旋转。
- 字标颜色改为两层文字交叉淡入淡出（只动 opacity）；状态文字的流光改为透明度呼吸。
- 工作台浮现改由 `<html data-splash-phase>` + CSS 驱动（启动脚本首帧就写入 `playing`），SplashScreen 不再回传状态，退场不触发工作台重渲染。

**复测**（同样方法：生产构建 + 同源 iframe + 父页面 rAF 记录 3.5 秒；本机）

| 版本 | 中位数 | 最大 | >20ms 帧 | >50ms 帧 |
|------|--------|------|----------|----------|
| e9bf1fe（修复前，4 次） | 16.7ms | 50–67ms | 4–13 | 0–1 |
| 修复后（5 次） | 16.7ms | 17.8ms（首次冷启动 1 次 53ms） | 0（首次 4） | 0 |

首次冷启动那 1 次 53ms 长帧里没有脚本耗时，发生在页面刚加载的约 500ms 处（解析首屏 HTML/CSS），不在动画关键段。本机比反馈方的机器快，修复前也没复现到 30fps 中位数；修复后动画不再依赖主线程逐帧工作，慢机器上的收益应更明显，但需要在反馈方机器上用同样方法再测一次确认。

---

## 13. 节奏放慢 + 「图形显示不正确」排查（2026-11-26）

**放慢**：用户反馈「动画可以慢一些」。在 `.splash-root` 上加节奏倍数 `--splash-tempo: 1.5`，完整版所有关键帧的时长与延迟都乘以它（第 11 节时间轴整体 ×1.5，完整版约 2.7 秒）；TS 侧 `SPLASH_TEMPO = 1.5`、完整版最短时长 2700ms、退场 450ms，测试会校验 CSS 与 TS 的倍数一致。简短版和减少动态效果版不受影响。以后想调快慢，只改这一个倍数（两处同步）。

**「图形显示不正确」不是代码问题**：用户看到角色叠在一起、排成一竖列，是项目文件夹里 3000 端口的开发服务器把 e9bf1fe 的旧 CSS 和 7eb3107 的新 HTML 拼在一起（旧 CSS 里还有 `rotate(var(--a0))`、没有新的 `.splash-slot` 等规则）。用全新启动的开发服务器（独立 worktree、3300 端口）和生产构建分别逐帧截图，7eb3107 的画面与 e9bf1fe 一致。疑似原因：在共享文件夹里跑 `next build` 改动了 `.next`，让正在运行的开发服务器留着旧的样式。之后的生产构建都放到独立 worktree 里做。

**复测**（生产构建 + 同源 iframe + rAF 4.5 秒，本机，5 次）：中位数 16.7ms，最大 17.8ms（首次 1 帧 33.6ms），>34ms 帧 0，退场完成 3192ms（= 2700 + 450 + 40）。
