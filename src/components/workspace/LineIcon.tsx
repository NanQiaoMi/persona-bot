/**
 * 统一风格的线条小图标（替代界面里的 emoji）：24×24 视框、1.75 描边、跟随文字颜色。
 * 只画需要的几种，不引入图标库。
 */
export type LineIconName =
  | "trend"
  | "thought"
  | "camera"
  | "moon"
  | "team"
  | "split"
  | "search"
  | "pulse"
  | "mask"
  | "bolt"
  | "heart"
  | "compass"
  | "spark"
  | "layers"
  | "book"
  | "shield";

const PATHS: Record<LineIconName, React.ReactNode> = {
  // 折线上扬：热门新鲜事
  trend: (
    <>
      <path d="M3 17l5.5-5.5 4 4L21 7" />
      <path d="M15 7h6v6" />
    </>
  ),
  // 带尾巴的思考气泡
  thought: (
    <>
      <path d="M20 11.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.15-2.9-.43L5 19l1.1-3.1C4.8 14.7 4 13.2 4 11.5 4 7.9 7.6 5 12 5s8 2.9 8 6.5z" />
      <path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.25" />
    </>
  ),
  moon: <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z" />,
  // 三个小圆：协同
  team: (
    <>
      <circle cx="12" cy="7.5" r="2.5" />
      <circle cx="6.5" cy="16" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
      <path d="M10.6 9.6l-2.7 4.2M13.4 9.6l2.7 4.2M9 16h6" />
    </>
  ),
  // 两条线汇合：联合分析
  split: (
    <>
      <path d="M5 5c0 6 7 6 7 11v3" />
      <path d="M19 5c0 6-7 6-7 11" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  // 模式图标
  mask: (
    <>
      <path d="M4 6c2.7 1.2 5.3 1.2 8 0 2.7 1.2 5.3 1.2 8 0v5c0 4.4-3.6 8-8 8s-8-3.6-8-8z" />
      <path d="M8.5 11.5c.6-.6 1.4-.6 2 0M13.5 11.5c.6-.6 1.4-.6 2 0M9.5 15c1.5 1 3.5 1 5 0" />
    </>
  ),
  bolt: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />,
  heart: (
    <path d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6z" />
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z" />
    </>
  ),
  spark: (
    <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" />
  ),
  // 叠起来的三层：五层人格
  layers: (
    <>
      <path d="M12 4l8 4-8 4-8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 16l8 4 8-4" />
    </>
  ),
  // 翻开的书：共同记忆
  book: (
    <>
      <path d="M12 6.5C10.3 5.3 8 5 4.5 5v12.5c3.5 0 5.8.3 7.5 1.5 1.7-1.2 4-1.5 7.5-1.5V5C16 5 13.7 5.3 12 6.5z" />
      <path d="M12 6.5V19" />
    </>
  ),
  // 带勾的盾牌：纠偏 OOC
  shield: (
    <>
      <path d="M12 3.5l7 2.8v5.2c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6.3z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
};

export default function LineIcon({
  name,
  size = 16,
  className = "",
  strokeWidth = 1.65,
}: {
  name: LineIconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`.trim()}
    >
      {PATHS[name]}
    </svg>
  );
}
