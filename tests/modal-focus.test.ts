import { describe, expect, it } from "vitest";
import {
  getNextFocusIndex,
  shouldCloseOnBackdrop,
  shouldCloseOnEscape,
} from "../src/components/primitives/focus-utils";

describe("Modal & Sheet 焦点与关闭工具", () => {
  it("Tab 向前循环移动焦点，到达末尾回到首项", () => {
    expect(getNextFocusIndex(-1, 3, false)).toBe(0);
    expect(getNextFocusIndex(0, 3, false)).toBe(1);
    expect(getNextFocusIndex(1, 3, false)).toBe(2);
    expect(getNextFocusIndex(2, 3, false)).toBe(0);
  });

  it("Shift+Tab 向后循环移动焦点，到达首项或未选中时跳到末项", () => {
    expect(getNextFocusIndex(-1, 3, true)).toBe(2);
    expect(getNextFocusIndex(0, 3, true)).toBe(2);
    expect(getNextFocusIndex(2, 3, true)).toBe(1);
    expect(getNextFocusIndex(1, 3, true)).toBe(0);
  });

  it("单个或零个可聚焦元素时稳定返回边界值", () => {
    expect(getNextFocusIndex(0, 1, false)).toBe(0);
    expect(getNextFocusIndex(0, 1, true)).toBe(0);
    expect(getNextFocusIndex(0, 0, false)).toBe(-1);
    expect(getNextFocusIndex(0, 0, true)).toBe(-1);
  });

  it("Esc 与遮罩点击判断按配置生效", () => {
    expect(shouldCloseOnEscape("Escape", true)).toBe(true);
    expect(shouldCloseOnEscape("Escape", false)).toBe(false);
    expect(shouldCloseOnEscape("Enter", true)).toBe(false);

    expect(shouldCloseOnBackdrop(true, true)).toBe(true);
    expect(shouldCloseOnBackdrop(false, true)).toBe(false);
    expect(shouldCloseOnBackdrop(true, false)).toBe(false);
  });
});
