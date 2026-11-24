import { describe, expect, it } from "vitest";
import { buildStarterSuggestions } from "@/lib/persona/starters";
import {
  DRAFTS_STORAGE_KEY,
  parseDraftsJson,
  serializeDrafts,
} from "@/lib/storage/drafts";
import type { PersonaRecord } from "@/lib/storage/types";

function makePersona(overrides: Partial<PersonaRecord> = {}): PersonaRecord {
  const baseProfile = {
    bio: "喜欢深夜喝冰美式聊八卦的插画师",
    mbti: "ENFP",
    personalityTags: ["脑洞大", "嘴硬心软"],
    ...overrides.profile,
  };
  return {
    slug: "test-bot",
    name: "测试角色",
    version: "2.0.0",
    defaultMode: "authentic",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    intimacy: 40,
    isMaster: false,
    profile: baseProfile,
    personaMd: "# persona",
    memoriesMd: "",
    aiProfileMd: "",
    emotionState: {
      primary: "neutral",
      pleasure: 0.2,
      arousal: 0.4,
      dominance: 0.5,
      intensity: 0.5,
      moodLabel: "平静",
      lastUpdated: "2026-01-01T00:00:00.000Z",
      decayRate: 0.1,
    },
    corrections: [],
    ...overrides,
  };
}

describe("buildStarterSuggestions", () => {
  it("always returns exactly 3 non-empty starter suggestions", () => {
    const emptyRes = buildStarterSuggestions(null);
    expect(emptyRes).toHaveLength(3);
    expect(emptyRes.every((s) => s.label.trim().length > 0 && s.prompt.trim().length > 0)).toBe(true);

    const masterRes = buildStarterSuggestions(makePersona({ isMaster: true, name: "Grok" }));
    expect(masterRes).toHaveLength(3);
    expect(masterRes[0]?.label).toContain("实时");
  });

  it("incorporates persona personalityTags and MBTI fallback when tags are missing", () => {
    const tagged = buildStarterSuggestions(makePersona());
    expect(tagged).toHaveLength(3);
    expect(tagged[0]?.label).toContain("脑洞大");
    expect(tagged[1]?.label).toContain("嘴硬心软");

    const mbtiOnly = buildStarterSuggestions(
      makePersona({
        profile: {
          bio: "",
          mbti: "INTJ",
          personalityTags: [],
        },
      })
    );
    expect(mbtiOnly).toHaveLength(3);
    expect(mbtiOnly[0]?.label).toContain("INTJ");
  });
});

describe("drafts persistence helpers", () => {
  it("serializes and parses non-empty drafts safely across invalid inputs", () => {
    expect(DRAFTS_STORAGE_KEY).toBe("personabot:drafts:v1");
    expect(parseDraftsJson(null)).toEqual({});
    expect(parseDraftsJson("not-json")).toEqual({});
    expect(parseDraftsJson("[]")).toEqual({});

    const encoded = serializeDrafts({
      "bot-a": "还没发出去的半句话",
      "bot-empty": "",
    });
    expect(parseDraftsJson(encoded)).toEqual({
      "bot-a": "还没发出去的半句话",
    });

    const sanitized = parseDraftsJson(JSON.stringify({ ok: "hello", bad: 123, empty: "" }));
    expect(sanitized).toEqual({ ok: "hello" });
  });
});
