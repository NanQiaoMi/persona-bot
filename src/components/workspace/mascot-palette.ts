import { PersonaProfile } from "@/lib/storage/types";

export type MascotShapeId =
  | "circle"
  | "cloud"
  | "square"
  | "star4"
  | "clover"
  | "heart"
  | "scallop"
  | "droplet"
  | "pill"
  | "triangle"
  | "pentagon"
  | "splat"
  | "hexagon";

export const MASCOT_SHAPES: Array<{
  id: MascotShapeId;
  label: string;
  path: string;
}> = [
  {
    id: "circle",
    label: "圆球",
    path: "M32 6C46.36 6 58 17.64 58 32C58 46.36 46.36 58 32 58C17.64 58 6 46.36 6 32C6 17.64 17.64 6 32 6Z",
  },
  {
    id: "cloud",
    label: "云朵",
    path: "M22 14C26.5 14 30.3 16.4 32.5 19.9C34.5 18.7 36.8 18 39.3 18C46.6 18 52.5 23.7 52.8 30.9C56.4 32.9 58.8 36.7 58.8 41.1C58.8 47.6 53.5 52.8 47 52.8H19C11.8 52.8 6 47 6 39.8C6 34.4 9.3 29.8 14 27.8C13.7 26.6 13.5 25.3 13.5 24C13.5 18.5 17.3 14 22 14Z",
  },
  {
    id: "square",
    label: "方糖",
    path: "M26.5 8.5L51.5 17.5C55.4 18.9 57.5 23.2 56.1 27.1L47.1 52.1C45.7 56 41.4 58.1 37.5 56.7L12.5 47.7C8.6 46.3 6.5 42 7.9 38.1L16.9 13.1C18.3 9.2 22.6 7.1 26.5 8.5Z",
  },
  {
    id: "star4",
    label: "四芒星",
    path: "M32 6C37.5 6 40.5 17.5 44.5 21.5C48.5 25.5 58 26.5 58 32C58 37.5 48.5 39.5 44.5 43.5C40.5 47.5 37.5 58 32 58C26.5 58 23.5 47.5 19.5 43.5C15.5 39.5 6 37.5 6 32C6 26.5 15.5 25.5 19.5 21.5C23.5 17.5 26.5 6 32 6Z",
  },
  {
    id: "clover",
    label: "四叶草",
    path: "M23 9C28.5 9 32.5 12.6 34 17.2C38.6 14.3 45 14.8 49.1 19C53.2 23.1 53.7 29.5 50.8 34.1C55.4 35.6 58.5 40 58.5 45.2C58.5 51.7 53.2 57 46.7 57C41.5 57 37.1 53.9 35.6 49.3C31 52.2 24.6 51.7 20.5 47.5C16.4 43.4 15.9 37 18.8 32.4C14.2 30.9 11 26.5 11 21.3C11 14.5 16.4 9 23 9Z",
  },
  {
    id: "heart",
    label: "爱心",
    path: "M32 54.5C30.2 54.5 10 41.8 7.5 26.8C5.6 15.4 15.5 7.5 24.8 11.2C28.1 12.5 30.5 14.9 32 17.6C33.5 14.9 35.9 12.5 39.2 11.2C48.5 7.5 58.4 15.4 56.5 26.8C54 41.8 33.8 54.5 32 54.5Z",
  },
  {
    id: "scallop",
    label: "小花",
    path: "M32 7C36.1 7 39.6 9.8 40.7 13.6C44.5 12.2 48.9 13.7 51 17.2C53.1 20.7 52.4 25.2 49.4 27.9C53.2 29.8 55.2 34.1 54.1 38.2C53 42.3 49 45 44.8 44.6C45.3 48.7 42.9 52.7 38.9 54.1C34.9 55.4 30.5 53.8 28.4 50.3C25.3 53.2 20.7 53.5 17.3 51C13.9 48.5 12.8 43.9 14.5 40.1C10.5 39.5 7.5 36.1 7.5 32C7.5 27.9 10.5 24.5 14.5 23.9C12.8 20.1 13.9 15.5 17.3 13C20.7 10.5 25.3 10.8 28.4 13.7C29.5 9.8 33 7 32 7Z",
  },
  {
    id: "droplet",
    label: "水滴",
    path: "M32 6C35.2 6 54 24.6 54 38C54 50.2 44.1 58 32 58C19.9 58 10 50.2 10 38C10 24.6 28.8 6 32 6Z",
  },
  {
    id: "pill",
    label: "胶囊",
    path: "M24 14L43 11C51.3 9.7 58.7 15.9 58.7 24.3C58.7 30.8 54.2 36.5 47.8 38L27.5 42.8C18.9 44.8 10.7 38.3 10.7 29.5C10.7 21.8 16.4 15.2 24 14Z",
  },
  {
    id: "triangle",
    label: "饭团",
    path: "M22 10.5C26 7.8 31.3 8.1 35 11.2L53.5 26.8C58.2 30.8 57.9 38.1 52.9 41.7L28.5 55.2C22.4 58.6 14.8 54.4 14.5 47.4L13.5 21.2C13.3 16.8 15.7 12.8 22 10.5Z",
  },
  {
    id: "pentagon",
    label: "小屋",
    path: "M29 8.5C31.3 7 34.3 7.2 36.4 9L52.6 22.8C55.2 25 56.2 28.5 55.1 31.8L48.7 50.5C47.5 54 44.2 56.3 40.5 56.3H21.2C17.3 56.3 13.9 53.8 12.8 50L7.5 31.4C6.5 28 7.8 24.3 10.7 22.3L29 8.5Z",
  },
  {
    id: "splat",
    label: "海星",
    path: "M32 6C36.8 6 39.2 13.8 43.2 15.6C47.2 17.4 53.6 13.2 56.2 16.8C58.8 20.4 53.4 26.2 54.6 30.4C55.8 34.6 60 39 58 43C56 47 48.6 46.2 45.4 49.4C42.2 52.6 42.6 59 38 59C33.4 59 31.4 52.4 27 51.8C22.6 51.2 17.8 56.8 14 54C10.2 51.2 13.8 44.2 11.6 40.2C9.4 36.2 4 34 5.4 29.4C6.8 24.8 13.8 24.6 15.8 20.6C17.8 16.6 14.4 10.2 18.4 8C22.4 5.8 27.2 6 32 6Z",
  },
  {
    id: "hexagon",
    label: "六边形",
    path: "M28.2 8.2C30.6 6.8 33.4 6.8 35.8 8.2L51.2 17.1C53.6 18.5 55 21 55 23.7V41.3C55 44 53.6 46.5 51.2 47.9L35.8 56.8C33.4 58.2 30.6 58.2 28.2 56.8L12.8 47.9C10.4 46.5 9 44 9 41.3V23.7C9 21 10.4 18.5 12.8 17.1L28.2 8.2Z",
  },
];

export const MASCOT_COLORS = [
  "#0A0A0C",
  "#9C6A3E",
  "#FA2D48",
  "#FF6B00",
  "#F59E0B",
  "#12B76A",
  "#12B59C",
  "#1683FF",
  "#8B5CF6",
  "#F43F9E",
  "#8E8E93",
];

function hashSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i += 1) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function getMascotConfigForPersona(
  slug: string,
  profile?: Partial<PersonaProfile>,
  _index = 0
): { shape: MascotShapeId; color: string; image?: string } {
  void _index;
  if (profile?.avatarImage) {
    return {
      shape: (profile.avatarShape as MascotShapeId) || "circle",
      color: profile.avatarColor || "#1683FF",
      image: profile.avatarImage,
    };
  }

  const presetMap: Record<string, { shape: MascotShapeId; color: string }> = {
    "master-bot": { shape: "circle", color: "#0A0A0C" },
    "grok-ella": { shape: "cloud", color: "#12B59C" },
    "lin-wan": { shape: "clover", color: "#8B5CF6" },
    "su-nian": { shape: "scallop", color: "#F43F9E" },
    "zero-arch": { shape: "hexagon", color: "#1683FF" },
  };

  const preset = presetMap[slug];
  const h = hashSlug(slug || "bot");
  const fallbackShape = MASCOT_SHAPES[h % MASCOT_SHAPES.length].id;
  const fallbackColor =
    MASCOT_COLORS[((h >> 4) % MASCOT_COLORS.length + MASCOT_COLORS.length) % MASCOT_COLORS.length];

  return {
    shape: (profile?.avatarShape as MascotShapeId) || preset?.shape || fallbackShape,
    color: profile?.avatarColor || preset?.color || fallbackColor,
  };
}
