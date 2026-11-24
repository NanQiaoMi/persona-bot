export const DRAFTS_STORAGE_KEY = "personabot:drafts:v1";

/**
 * Parses a persisted JSON draft map safely, retaining only string entries.
 */
export function parseDraftsJson(raw: string | null | undefined): Record<string, string> {
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key === "string" && typeof value === "string" && value.length > 0) {
        clean[key] = value;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

/**
 * Serializes draft messages, stripping empty values so storage stays compact.
 */
export function serializeDrafts(drafts: Record<string, string>): string {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(drafts)) {
    if (typeof value === "string" && value.length > 0) {
      clean[key] = value;
    }
  }
  return JSON.stringify(clean);
}
