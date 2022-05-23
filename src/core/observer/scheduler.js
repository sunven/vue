/* @flow */

import type Watcher from "./watcher";
import config from "../config";
import { callHook, activateChildComponent } from "../instance/lifecycle";

import { warn, nextTick, devtools, inBrowser, isIE } from "../util/index";

export const MAX_UPDATE_COUNT = 100;

const queue: Array<Watcher> = [];
const activatedChildren: Array<Component> = [];
let has: { [key: number]: ?true } = {};
let circular: { [key: number]: number } = {};
let waiting = false;
let flushing = false;
let index = 0;

/**
 * Reset the scheduler's state.
 * 重置调度程序的状态。
 */
function resetSchedulerState() {
  index = queue.length = activatedChildren.length = 0;
  has = {};
  if (process.env.NODE_ENV !== "production") {
    circular = {};
  }
  waiting = flushing = false;
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
// 异步边缘案例 #6566 需要在附加事件侦听器时保存时间戳。
// 但是，调用 performance.now() 会产生性能开销，尤其是在页面有数千个事件侦听器的情况下。
// 相反，我们在每次调度程序刷新时获取一个时间戳，并将其用于在该刷新期间附加的所有事件侦听器
export let currentFlushTimestamp = 0;

// Async edge case fix requires storing an event listener's attach timestamp.
// 异步边缘情况修复需要存储事件侦听器的附加时间戳。
let getNow: () => number = Date.now;

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
// 确定浏览器正在使用的事件时间戳。 令人讨厌的是，时间戳可以是高分辨率（相对于页面加载）或低分辨率（相对于 UNIX 纪元），
// 因此为了比较时间，我们必须在保存刷新时间戳时使用相同的时间戳类型。
// 所有 IE 版本都使用低分辨率事件时间戳，并且有问题的时钟实现 (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance;
  if (
    performance &&
    typeof performance.now === "function" &&
    getNow() > document.createEvent("Event").timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now();
  }
}

/**
 * 遍历执行所有watcher
 */
function flushSchedulerQueue() {
  currentFlushTimestamp = getNow();
  flushing = true;
  let watcher, id;

  // 在刷新之前对队列进行排序。这可确保：
  // 1. 组件从父级更新到子级。 （因为父母总是在孩子之前创建）
  // 2. 组件的用户观察者在其渲染观察者之前运行（因为用户观察者在render watcher之前创建）
  // 3. 如果一个组件在父组件的 watcher 运行期间被destroyed，可以跳过它的watcher
  queue.sort((a, b) => a.id - b.id);

  // 不要缓存长度，queue在不断变化
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index];
    if (watcher.before) {
      // 例如beforeUpdated hook
      watcher.before();
    }
    id = watcher.id;
    has[id] = null;
    // 真的的操作是run方法
    watcher.run();
    // in dev build, check and stop circular updates.
    // 在开发版本中，检查并停止循环更新。
    if (process.env.NODE_ENV !== "production" && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1;
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          "You may have an infinite update loop " +
            (watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`),
          watcher.vm
        );
        break;
      }
    }
  }

  // 在重置状态之前保留发布队列的副本
  const activatedQueue = activatedChildren.slice();
  const updatedQueue = queue.slice();

  // 重置调度状态
  resetSchedulerState();

  // activated和updated hook
  callActivatedHooks(activatedQueue);
  callUpdatedHooks(updatedQueue);

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit("flush");
  }
}

function callUpdatedHooks(queue) {
  let i = queue.length;
  while (i--) {
    const watcher = queue[i];
    const vm = watcher.vm;
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, "updated");
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent(vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false;
  activatedChildren.push(vm);
}

function callActivatedHooks(queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true;
    activateChildComponent(queue[i], true /* true */);
  }
}

/**
 * 将观察者推入观察者队列。
 * 具有重复ID的作业将被跳过，除非在刷新队列时将其推入。
 */
export function queueWatcher(watcher: Watcher) {
  const id = watcher.id;
  if (has[id] == null) {
    // 不存在才入队，判断是否第一次进入，即queue中已经有这个watcher了，就不用再进了
    has[id] = true;
    if (!flushing) {
      // 如果队列还未执行，则直接附加到队列尾部
      queue.push(watcher);
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      // watch放到合适位置，e.g. queue: [1,3,5,7],4得放到3和5之间
      let i = queue.length - 1;
      while (i > index && queue[i].id > watcher.id) {
        i--;
      }
      queue.splice(i + 1, 0, watcher);
    }
    // queue the flush
    if (!waiting) {
      // 如果未排队，则开始排队，nextick将执行调度队列。
      waiting = true;

      if (process.env.NODE_ENV !== "production" && !config.async) {
        flushSchedulerQueue();
        return;
      }
      // 异步执行flushSchedulerQueue
      nextTick(flushSchedulerQueue);
    }
  }
}
