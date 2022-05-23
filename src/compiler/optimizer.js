/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 * 优化器的目标：遍历生成的模板 AST 树并检测纯静态的子树，即永远不需要更改的 DOM 部分
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 *
 * 一旦我们检测到这些子树，我们就可以：
 * 1. 将它们提升为常量，这样我们就不再需要在每次重新渲染时为它们创建新的节点；
 * 2. 在补丁过程中完全跳过它们。
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')  // options.staticKeys: staticClass,staticStyle
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  // 第一遍：标记所有非静态节点。
  markStatic(root)
  // second pass: mark static roots.
  // 第二遍：标记静态根。
  markStaticRoots(root, false)
}

function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

function markStatic (node: ASTNode) {
  node.static = isStatic(node)
  if (node.type === 1) {
    // 普通元素额外处理
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    // 不要将组件插槽内容设为静态。 这避免了
    // 1. 组件不能改变槽节点
    // 2. 静态槽内容热加载失败
    if (
      !isPlatformReservedTag(node.tag) && // 不是保留标签（input，div)
      node.tag !== 'slot' && // 不是slot
      // 有inline-template属性
      // https://cn.vuejs.org/v2/guide/components-edge-cases.html#%E5%86%85%E8%81%94%E6%A8%A1%E6%9D%BF
      node.attrsMap['inline-template'] == null
    ) {
      return
    }
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      if (!child.static) {
        // 如果有子节点是非静态的，父节点也变为非静态的
        node.static = false
      }
    }
    if (node.ifConditions) {
      // elseif 和 else 节点在ifConditions中
      // 如果有子节点是非静态的，父节点也变为非静态的
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    // 普通元素额外处理
    if (node.static || node.once) {
      // 静态节点, v-once
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    // 1、本身是一个静态节点
    // 2、必须拥有 children，
    // 3、并且 children 不能只是一个文本节点，
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    if (node.children) {
      // 遍历children
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      // 遍历ifConditions
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

function isStatic (node: ASTNode): boolean {
  if (node.type === 2) { // expression
    // 表达式
    return false
  }
  if (node.type === 3) { // text
    // 文本
    return true
  }
  return !!(node.pre || ( // v-pre
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else 没有v-if v-for
    !isBuiltInTag(node.tag) && // not a built-in 不是内建标签（"slot,component"）
    isPlatformReservedTag(node.tag) && // not a component 不是组件，即：保留标签（input，div)
    !isDirectChildOfTemplateFor(node) && // 不是带有 v-for 的 template 标签的直接子节点
    Object.keys(node).every(isStaticKey) // 节点的所有属性的 key 都满足静态 key
  ))
}

function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
