import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * 返回一个引用永远不变、但调用时总是执行最新版本 fn 的函数。
 * 用来把父组件每次渲染都新建的回调传给 memo 子组件，而不让子组件跟着重画。
 * 注意：只能在事件 / 异步回调里调用，不要在渲染期间调用。
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R
): (...args: A) => R {
  const ref = useRef(fn);
  useInsertionEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
