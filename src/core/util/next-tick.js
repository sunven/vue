/* @flow */
/* globals MutationObserver */

import { noop } from "shared/util";
import { handleError } from "./error";
import { isIE, isIOS, isNative } from "./env";

export let isUsingMicroTask = false;

// 回调函数数组
const callbacks = [];
let pending = false;

function flushCallbacks() {
  pending = false;
  const copies = callbacks.slice(0);
  callbacks.length = 0;
  // 遍历执行
  for (let i = 0; i < copies.length; i++) {
    copies[i]();
  }
}

// 这里我们有使用微任务的异步延迟包装器
// 在2.5中，我们使用了（宏）任务（与微任务结合使用）
// 然而，当状态在重绘之前被改变时，它有一些微妙的问题
// (e.g. #6813, out-in transitions).
// 另外，在事件处理程序中使用（宏）任务会导致一些奇怪的行为
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// 所以我们现在到处都在使用微任务。
// 这种权衡的一个主要缺点是存在一些场景
// 如果微任务的优先级太高，应该在两者之间触发
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).
let timerFunc;

// nextTick行为利用了可以访问的微任务队列
// 通过本机Promise.then或MutationObserver。
// MutationObserver拥有更广泛的支持，但是在iOS>=9.3.3的UIWebView中，当触发touch事件处理程序时，它会受到严重的缺陷。它触发几次后就完全停止工作了。。。因此，如果本地Promise可用，我们将使用它：
/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== "undefined" && isNative(Promise)) {
  const p = Promise.resolve();
  timerFunc = () => {
    p.then(flushCallbacks);
    // 在有问题的UIWebViews中，Promise.then并没有完全中断，但它可能会陷入一种奇怪的状态，即回调被推送到微任务队列中，但队列没有被刷新，直到浏览器需要执行其他一些工作，例如处理计时器。因此，我们可以通过添加一个空计时器来“强制”刷新微任务队列。
    if (isIOS) setTimeout(noop);
  };
  isUsingMicroTask = true;
} else if (
  !isIE &&
  typeof MutationObserver !== "undefined" &&
  (isNative(MutationObserver) ||
    // PhantomJS and iOS 7.x
    MutationObserver.toString() === "[object MutationObserverConstructor]")
) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  let counter = 1;
  const observer = new MutationObserver(flushCallbacks);
  const textNode = document.createTextNode(String(counter));
  observer.observe(textNode, {
    characterData: true,
  });
  timerFunc = () => {
    counter = (counter + 1) % 2;
    textNode.data = String(counter);
  };
  isUsingMicroTask = true;
} else if (typeof setImmediate !== "undefined" && isNative(setImmediate)) {
  // 回退到setImmediate。
  // 从技术上讲，它利用了（宏）任务队列，
  // 但它仍然是一个比setTimeout更好的选择。
  timerFunc = () => {
    setImmediate(flushCallbacks);
  };
} else {
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0);
  };
}

// 将cb函数放入回调队列队尾
export function nextTick(cb?: Function, ctx?: Object) {
  let _resolve;
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx);
      } catch (e) {
        handleError(e, ctx, "nextTick");
      }
    } else if (_resolve) {
      _resolve(ctx);
    }
  });
  if (!pending) {
    pending = true;
    // 异步执行
    timerFunc();
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== "undefined") {
    return new Promise((resolve) => {
      _resolve = resolve;
    });
  }
}
