"use client";

import { useId } from "react";

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
  animated?: boolean;
  state?: "idle" | "thinking" | "happy";
  blinkDelayMs?: number;
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
  animated = true,
  state = "idle",
  blinkDelayMs = 0,
  className = "",
}: BlobMascotProps) {
  const uid = useId().replace(/:/g, "");
  const bodyAnimClass = animated
    ? state === "thinking"
      ? "animate-blob-think"
      : "animate-blob-breathe"
    : "";

  if (variant === "bot") {
    const gradId = `bot3d-${uid}`;
    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 blob-interactive ${className}`}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 64 64" className="w-full h-full overflow-visible">
          <defs>
            <radialGradient id={gradId} cx="34%" cy="26%" r="72%">
              <stop offset="0%" stopColor="#52525b" />
              <stop offset="38%" stopColor="#18181b" />
              <stop offset="85%" stopColor="#09090b" />
              <stop offset="100%" stopColor="#000000" />
            </radialGradient>
          </defs>
          {/* Soft floor shadow */}
          <ellipse
            cx="32"
            cy="59"
            rx="16"
            ry="3.2"
            fill="rgba(0,0,0,0.16)"
          />
          <g className={`blob-body-layer ${bodyAnimClass}`}>
            <circle cx="32" cy="31" r="26.5" fill={`url(#${gradId})`} />
            {/* Crisp Apple-style specular rim */}
            <ellipse
              cx="23"
              cy="16"
              rx="9"
              ry="4.5"
              transform="rotate(-24 23 16)"
              fill="#ffffff"
              opacity="0.16"
            />
            {/* Living glancing + blinking white pill eyes */}
            <g className={animated ? "animate-blob-look" : ""}>
              <g
                className={animated ? "animate-blob-blink" : ""}
                style={{ animationDelay: `${blinkDelayMs}ms` }}
              >
                <ellipse
                  cx="33"
                  cy="24.5"
                  rx="3.1"
                  ry="6.6"
                  transform="rotate(-11 33 24.5)"
                  fill="#ffffff"
                />
                <ellipse
                  cx="43.5"
                  cy="23.5"
                  rx="3.1"
                  ry="6.6"
                  transform="rotate(-11 43.5 23.5)"
                  fill="#ffffff"
                />
              </g>
            </g>
          </g>
        </svg>

        {showOnlineDot && (
          <span
            className="absolute bottom-0.5 right-0.5 flex items-center justify-center"
            style={{
              width: Math.max(9, Math.round(size * 0.22)),
              height: Math.max(9, Math.round(size * 0.22)),
            }}
          >
            <span className="absolute inset-0 rounded-full bg-[#3B82F6] opacity-60 animate-ping" />
            <span className="relative w-full h-full rounded-full bg-[#3B82F6] ring-2 ring-[var(--bg-secondary)]" />
          </span>
        )}
      </div>
    );
  }

  const palette: Record<
    Exclude<BlobVariant, "bot">,
    { light: string; main: string; deep: string; shape: string }
  > = {
    blue: {
      light: "#7CB9FF",
      main: "#2684FF",
      deep: "#0B5ED7",
      shape:
        "M32 7C45 7 56 15 57 27C58 41 48 55 34 56C19 57 8 46 8 31C8 16 18 7 32 7Z",
    },
    mint: {
      light: "#7DF2CF",
      main: "#20C997",
      deep: "#0CA678",
      shape:
        "M19 10C30 6 46 10 53 22C59 33 54 50 41 55C27 59 11 51 8 36C5 24 10 14 19 10Z",
    },
    purple: {
      light: "#BFA7FF",
      main: "#7C4DFF",
      deep: "#5B21B6",
      shape:
        "M34 8C48 9 57 20 55 34C53 47 41 57 27 55C13 53 7 40 10 27C13 14 21 7 34 8Z",
    },
    pink: {
      light: "#FF8EC0",
      main: "#FF3B8B",
      deep: "#DB2777",
      shape:
        "M32 8C39 8 44 12 49 14C55 17 58 23 56 30C55 36 58 43 53 48C48 54 41 53 34 55C27 58 19 56 14 50C9 44 10 37 8 31C6 24 10 16 17 13C22 11 26 8 32 8Z",
    },
    slate: {
      light: "#B0B5BD",
      main: "#686D76",
      deep: "#4B5563",
      shape:
        "M32 8C41 8 45 14 50 18C56 22 58 31 53 37C48 43 49 52 40 55C32 58 25 53 18 50C11 47 7 38 10 30C13 22 13 14 21 10C25 8 28 8 32 8Z",
    },
    amber: {
      light: "#FDE68A",
      main: "#F59E0B",
      deep: "#D97706",
      shape:
        "M32 8C46 8 55 18 55 32C55 46 44 56 31 56C17 56 9 45 9 32C9 17 18 8 32 8Z",
    },
  };

  const spec = palette[variant];
  const blobGradId = `blob3d-${variant}-${uid}`;

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 blob-interactive ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 64 64" className="w-full h-full overflow-visible">
        <defs>
          <radialGradient id={blobGradId} cx="32%" cy="24%" r="74%">
            <stop offset="0%" stopColor={spec.light} />
            <stop offset="48%" stopColor={spec.main} />
            <stop offset="100%" stopColor={spec.deep} />
          </radialGradient>
        </defs>
        <ellipse
          cx="32"
          cy="58"
          rx="15"
          ry="2.8"
          fill="rgba(0,0,0,0.1)"
        />
        <g className={`blob-body-layer ${bodyAnimClass}`}>
          <path d={spec.shape} fill={`url(#${blobGradId})`} />
          <ellipse
            cx="24"
            cy="17"
            rx="9.5"
            ry="4.2"
            transform="rotate(-20 24 17)"
            fill="#ffffff"
            opacity="0.34"
          />
          <g
            className={animated ? "animate-blob-blink" : ""}
            style={{ animationDelay: `${blinkDelayMs}ms` }}
          >
            <rect
              x="24.5"
              y="22.5"
              width="5.2"
              height="11.5"
              rx="2.6"
              fill="#FFFFFF"
            />
            <rect
              x="34.5"
              y="22.5"
              width="5.2"
              height="11.5"
              rx="2.6"
              fill="#FFFFFF"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
