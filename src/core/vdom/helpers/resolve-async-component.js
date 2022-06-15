/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'
import { currentRenderingInstance } from 'core/instance/render'

function ensureCtor (comp: any, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}

// 1、高级异步组件
// const AsyncComp = () => ({
//   // 需要加载的组件。应当是一个 Promise
//   component: import('./MyComp.vue'),
//   // 加载中应当渲染的组件
//   loading: LoadingComp,
//   // 出错时渲染的组件
//   error: ErrorComp,
//   // 渲染加载中组件前的等待时间。默认：200ms。
//   delay: 200,
//   // 最长等待时间。超出此时间则渲染错误组件。默认：Infinity
//   timeout: 3000
// })
// Vue.component('async-example', AsyncComp)

// 2、Promise 形式
// Vue.component(
//   'async-webpack-example',
//   // 该 `import` 函数返回一个 `Promise` 对象。
//   () => import('./my-async-component')
// )

// 3.
// Vue.component('async-example', function (resolve, reject) {
//   // 这个特殊的 require 语法告诉 webpack
//   // 自动将编译后的代码分割成不同的块，
//   // 这些块将通过 Ajax 请求自动下载。
//   require(['./my-async-component'], resolve)
// })

// Vue.component('async-example', function (resolve, reject) {
//   setTimeout(function () {
//     // 向 `resolve` 回调传递组件定义
//     resolve({
//       template: '<div>I am async!</div>'
//     })
//   }, 1000)
// })

export function resolveAsyncComponent (
  factory: Function, // factory就是注册异步组件时的函数
  baseCtor: Class<Component>
): Class<Component> | void {
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    // 组件加载失败
    return factory.errorComp
  }

  if (isDef(factory.resolved)) {
    // 组件加载成功
    return factory.resolved
  }

  const owner = currentRenderingInstance
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending
    factory.owners.push(owner)
  }

  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    // 组件加载中
    return factory.loadingComp
  }

  if (owner && !isDef(factory.owners)) {
    const owners = factory.owners = [owner]
    let sync = true
    let timerLoading = null
    let timerTimeout = null

    ;(owner: any).$on('hook:destroyed', () => remove(owners, owner))

    const forceRender = (renderCompleted: boolean) => {
      for (let i = 0, l = owners.length; i < l; i++) {
        (owners[i]: any).$forceUpdate()
      }

      if (renderCompleted) {
        owners.length = 0
        if (timerLoading !== null) {
          clearTimeout(timerLoading)
          timerLoading = null
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout)
          timerTimeout = null
        }
      }
    }

    // 定义resolve 只执行一次
    const resolve = once((res: Object | Class<Component>) => {
      // cache resolved
      // res如果时对象，再 Vue.extend 就变成了组件的构造函数
      factory.resolved = ensureCtor(res, baseCtor)
      // 仅当这不是同步解析时才调用回调
      // (async resolves are shimmed as synchronous during SSR)
      if (!sync) {
        forceRender(true)
      } else {
        owners.length = 0
      }
    })

    // reject 只执行一次
    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true)
      }
    })

    // res可能是个undefined
    // 高级异步组件返回对象  {component: ,loading: ,}
    const res = factory(resolve, reject)

    if (isObject(res)) {
      if (isPromise(res)) {
        // () => Promise Promise 形式的异步组件
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      } else if (isPromise(res.component)) {
        // 高级异步组件形式到这里
        res.component.then(resolve, reject)

        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          if (res.delay === 0) {
            factory.loading = true
          } else {
            timerLoading = setTimeout(() => {
              // 延迟执行
              timerLoading = null
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender(false)
              }
            }, res.delay || 200)
          }
        }

        if (isDef(res.timeout)) {
          timerTimeout = setTimeout(() => {
            // 超出这个时间组件还没加载成功 则报错
            timerTimeout = null
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }

    sync = false
    // return in case resolved synchronously
    // 第一次执行 resolveAsyncComponent，除非使用高级异步组件 0 delay 去创建了一个 loading 组件，
    // 否则返回是 undefiend
    return factory.loading
      ? factory.loadingComp // 有loading组件就返回loading组件 delay为0就直接渲染loading 组件
      : factory.resolved
  }
}
