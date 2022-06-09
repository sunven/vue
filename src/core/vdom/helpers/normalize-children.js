/* @flow */

import VNode, { createTextVNode } from 'core/vdom/vnode'
import { isFalse, isTrue, isDef, isUndef, isPrimitive } from 'shared/util'

// 模板编译器试图通过在编译时对模板进行静态分析来尽量减少规范化的需要
//
// 对于普通HTML标记，可以完全跳过规范化，因为生成的渲染函数保证返回Array<VNode>。
// 有两种情况需要额外的规范化

// 1.
// 当子组件包含组件时 - 因为功能组件可能返回一个数组而不是单个根。
// 在这种情况下，只需要一个简单的规范化——如果任何孩子是一个数组，
// 我们用 Array.prototype.concat 将整个东西展平。
// 它保证只有 1 级深度，因为功能组件已经规范化了它们自己的子级
// [[1],2] => [1,2]
export function simpleNormalizeChildren (children: any) {
  for (let i = 0; i < children.length; i++) {
    if (Array.isArray(children[i])) {
      return Array.prototype.concat.apply([], children)
    }
  }
  return children
}

// 2.
// 当孩子包含总是生成嵌套数组的构造时，
// 例如 <template>, <slot>, v-for, 或者当孩子由用户提供手写渲染函数/JSX时。
// 在这种情况下，需要完全规范化以迎合所有可能类型的子值

export function normalizeChildren (children: any): ?Array<VNode> {
  return isPrimitive(children) // 是不是原始类型（不包括 null，undefined）
    ? [createTextVNode(children)] // e.g. 手写render, children 为一个字符串
    : Array.isArray(children)
      ? normalizeArrayChildren(children)
      : undefined
}

function isTextNode (node): boolean {
  return isDef(node) && isDef(node.text) && isFalse(node.isComment)
}
// nested 嵌套的
function normalizeArrayChildren (children: any, nestedIndex?: string): Array<VNode> {
  const res = []
  let i, c, lastIndex, last
  for (i = 0; i < children.length; i++) {
    c = children[i]
    if (isUndef(c) || typeof c === 'boolean') continue
    lastIndex = res.length - 1
    last = res[lastIndex]
    //  nested
    if (Array.isArray(c)) {
      if (c.length > 0) {
        c = normalizeArrayChildren(c, `${nestedIndex || ''}_${i}`)
        // 合并相邻文本节点
        // 第一个和最后一个都是文本节点，则最后一个和第一个拼接到一起，作为最后一个，删除第一个
        if (isTextNode(c[0]) && isTextNode(last)) {
          res[lastIndex] = createTextVNode(last.text + (c[0]: any).text)
          c.shift()
        }
        res.push.apply(res, c)
      }
    } else if (isPrimitive(c)) {
      // string number boolean symbol
      if (isTextNode(last)) {
        // 合并相邻文本节点
        // 这对于 SSR hydration是必要的，因为文本节点在呈现为 HTML 字符串时本质上是合并的
        res[lastIndex] = createTextVNode(last.text + c)
      } else if (c !== '') {
        // convert primitive to vnode
        res.push(createTextVNode(c))
      }
    } else {
      if (isTextNode(c) && isTextNode(last)) {
        // 合并相邻文本节点
        res[lastIndex] = createTextVNode(last.text + c.text)
      } else {
        // 嵌套数组子项的默认键（可能由 v-for 生成）
        if (isTrue(children._isVList) &&
          isDef(c.tag) &&
          isUndef(c.key) &&
          isDef(nestedIndex)) {
          c.key = `__vlist${nestedIndex}_${i}__`
        }
        res.push(c)
      }
    }
  }
  return res
}
