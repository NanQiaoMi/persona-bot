import { describe, expect, it } from "vitest";
import {
  resolveBottomSheetSnap,
  shouldCloseLeftDrawerBySwipe,
  shouldOpenLeftDrawerBySwipe,
} from "../src/lib/responsive/gestures";

describe("移动端触控手势与底部弹层停靠计算", () => {
  it("仅从屏幕左边缘右滑触发打开左侧抽屉", () => {
    expect(shouldOpenLeftDrawerBySwipe(12, 68, 10)).toBe(true);
    expect(shouldOpenLeftDrawerBySwipe(80, 90, 5)).toBe(false);
    expect(shouldOpenLeftDrawerBySwipe(10, 30, 5)).toBe(false);
    expect(shouldOpenLeftDrawerBySwipe(10, 70, 60)).toBe(false);
  });

  it("在抽屉内横向左滑触发关闭左侧抽屉", () => {
    expect(shouldCloseLeftDrawerBySwipe(-70, 12)).toBe(true);
    expect(shouldCloseLeftDrawerBySwipe(-30, 0)).toBe(false);
    expect(shouldCloseLeftDrawerBySwipe(-80, 60)).toBe(false);
  });

  it("底部弹层半屏/全屏/下拉关闭切换逻辑正确", () => {
    expect(resolveBottomSheetSnap("half", -80)).toBe("full");
    expect(resolveBottomSheetSnap("half", 95)).toBe("closed");
    expect(resolveBottomSheetSnap("half", 20)).toBe("half");

    expect(resolveBottomSheetSnap("full", 85)).toBe("half");
    expect(resolveBottomSheetSnap("full", 170)).toBe("closed");
    expect(resolveBottomSheetSnap("full", -20)).toBe("full");
  });
});
