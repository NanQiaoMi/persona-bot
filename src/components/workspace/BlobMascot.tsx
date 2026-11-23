"use client";

export type BlobVariant =
  | "bot"
  | "blue"
  | "mint"
  | "purple"
  | "pink"
  | "slate"
  | "amber";

interface BlobMascotProps {
  variant?: BlobVariant;
  size?: number;
  showOnlineDot?: boolean;
  className?: string;
}

export function getBlobVariantForSlug(slug: string, index = 0): BlobVariant {
  if (slug === "grok-ella") return "mint";
  if (slug === "lin-wan") return "purple";
  if (slug === "su-nian") return "pink";
  if (slug === "zero-arch") return "blue";
  const pool: BlobVariant[] = ["blue", "mint", "purple", "pink", "slate", "amber"];
  let hash = index;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) % pool.length;
  }
  return pool[Math.abs(hash) % pool.length];
}

export default function BlobMascot({
  variant = "blue",
  size = 32,
  showOnlineDot = false,
  className = "",
}: BlobMascotProps) {
  if (variant === "bot") {
    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-md">
          <defs>
            <radialGradient id="botGloss" cx="35%" cy="28%" r="68%">
              <stop offset="0%" stopColor="#3f3f46" />
              <stop offset="45%" stopColor="#18181b" />
              <stop offset="100%" stopColor="#050507" />
            </radialGradient>
          </defs>
          <circle cx="32" cy="32" r="28" fill="url(#botGloss)" />
          {/* Tilted white pill eyes matching Grok Bot mascot */}
          <ellipse
            cx="33"
            cy="25"
            rx="3.2"
            ry="6.8"
            transform="rotate(-12 33 25)"
            fill="#ffffff"
          />
          <ellipse
            cx="44"
            cy="24"
            rx="3.2"
            ry="6.8"
            transform="rotate(-12 44 24)"
            fill="#ffffff"
          />
        </svg>
        {showOnlineDot && (
          <span
            className="absolute bottom-0.5 right-0.5 rounded-full bg-[#3B82F6] ring-2 ring-[var(--bg-secondary)]"
            style={{
              width: Math.max(8, Math.round(size * 0.22)),
              height: Math.max(8, Math.round(size * 0.22)),
            }}
          />
        )}
      </div>
    );
  }

  const palette: Record<
    Exclude<BlobVariant, "bot">,
    { fill: string; highlight: string; shape: string }
  > = {
    blue: {
      fill: "#2684FF",
      highlight: "#60A5FA",
      shape:
        "M32 6C45 6 57 14 58 27C59 41 49 56 34 57C19 58 7 47 7 31C7 16 18 6 32 6Z",
    },
    mint: {
      fill: "#20C997",
      highlight: "#5EEAD4",
      shape:
        "M19 10C30 6 47 10 54 22C60 33 55 51 42 56C28 60 11 52 7 37C4 25 9 14 19 10Z",
    },
    purple: {
      fill: "#7C4DFF",
      highlight: "#A78BFA",
      shape:
        "M34 7C49 8 58 20 56 34C54 48 42 58 27 56C12 54 6 41 9 27C12 14 21 6 34 7Z",
    },
    pink: {
      fill: "#FF3B8B",
      highlight: "#F472B6",
      shape:
        "M32 7C39 7 44 12 49 14C55 17 59 23 57 30C56 36 59 43 54 49C49 55 41 54 34 56C27 59 19 57 14 51C9 45 10 38 7 31C5 24 9 16 16 13C22 11 26 7 32 7Z",
    },
    slate: {
      fill: "#686D76",
      highlight: "#9CA3AF",
      shape:
        "M32 7C41 7 45 14 51 18C57 22 59 31 54 38C49 44 50 53 41 56C33 59 25 54 18 51C10 48 6 39 9 30C12 22 12 14 20 10C25 8 28 7 32 7Z",
    },
    amber: {
      fill: "#F59E0B",
      highlight: "#FCD34D",
      shape:
        "M32 8C47 8 56 18 56 33C56 47 45 57 31 57C16 57 8 46 8 32C8 17 18 8 32 8Z",
    },
  };

  const spec = palette[variant];

  return (
    <svg
      viewBox="0 0 64 64"
      style={{ width: size, height: size }}
      className={`shrink-0 ${className}`}
    >
      <path d={spec.shape} fill={spec.fill} />
      <ellipse
        cx="25"
        cy="17"
        rx="10"
        ry="5"
        transform="rotate(-18 25 17)"
        fill={spec.highlight}
        opacity="0.32"
      />
      <rect x="24.5" y="23" width="5.2" height="12" rx="2.6" fill="#FFFFFF" />
      <rect x="34.5" y="23" width="5.2" height="12" rx="2.6" fill="#FFFFFF" />
    </svg>
  );
}
