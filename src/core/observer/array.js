/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from "../util/index";

//拿出原型
const arrayProto = Array.prototype;
//复制一份
export const arrayMethods = Object.create(arrayProto);

const methodsToPatch = [
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
];

/**
 * 截获变异方法并发出事件
 */
methodsToPatch.forEach(function (method) {
  // 缓存原始方法
  const original = arrayProto[method];
  def(arrayMethods, method, function mutator(...args) {
    //执行原方法
    const result = original.apply(this, args);
    //找到这个数据的observer
    const ob = this.__ob__;
    //push,unshift,splice会有新元素进入，需要做响应式处理
    let inserted;
    switch (method) {
      case "push":
      case "unshift":
        inserted = args;
        break;
      case "splice":
        inserted = args.slice(2);
        break;
    }
    //新元素需要做响应式处理
    if (inserted) ob.observeArray(inserted);
    // 通知变更
    ob.dep.notify();
    return result;
  });
});
