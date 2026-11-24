import { describe, expect, it } from "vitest";
import { computeFlipDelta, shouldAnimateFlip } from "../src/lib/motion/flip";

describe("Motion FLIP 工具函数", () => {
  it("计算旧位置到新位置的反向偏移 delta", () => {
    expect(computeFlipDelta({ left: 10, top: 120 }, { left: 10, top: 40 })).toEqual({
      dx: 0,
      dy: 80,
    });
    expect(computeFlipDelta({ left: 50, top: 20 }, { left: 120, top: 90 })).toEqual({
      dx: -70,
      dy: -70,
    });
    expect(computeFlipDelta({ left: 10, top: 10 }, { left: 10, top: 10 })).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it("在开启减少动态效果或列表超过上限时关闭 FLIP 动画", () => {
    expect(shouldAnimateFlip(10, false)).toBe(true);
    expect(shouldAnimateFlip(50, false)).toBe(true);
    expect(shouldAnimateFlip(51, false)).toBe(false);
    expect(shouldAnimateFlip(10, true)).toBe(false);
    expect(shouldAnimateFlip(1, false)).toBe(false);
    expect(shouldAnimateFlip(0, false)).toBe(false);
  });
});
