/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import { hasOwn, isObject, toRawType, hyphenate, capitalize, isPlainObject } from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function,
}

export function validateProp(key: string, propOptions: Object, propsData: Object, vm?: Component): any {
  const prop = propOptions[key]
  // 缺席的
  const absent = !hasOwn(propsData, key)
  let value = propsData[key]
  // boolean casting
  const booleanIndex = getTypeIndex(Boolean, prop.type)
  if (booleanIndex > -1) {
    if (absent && !hasOwn(prop, 'default')) {
      // 没传，没有default 默认为false
      value = false
      // hyphenate: ABC变为A-B-C
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      // 仅将空字符串/同名转换为布尔值 boolean 具有更高的优先级
      const stringIndex = getTypeIndex(String, prop.type)
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        // [Boolean] || [Boolean, String]
        value = true
      }
    }
  }
  // check default value
  if (value === undefined) {
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.
    // 由于默认值是新副本，请务必遵守
    const prevShouldObserve = shouldObserve
    toggleObserving(true)
    observe(value)
    toggleObserving(prevShouldObserve)
  }
  if (
    process.env.NODE_ENV !== 'production') {
      // 验证值与类型是否匹配
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue(vm: ?Component, prop: PropOptions, key: string): any {
  // no default, return undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  const def = prop.default
  // warn against non-factory defaults for Object & Array
  // 警告对象和数组必须是个工厂函数
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn('Invalid default value for prop "' + key + '": ' + 'Props with type Object/Array must use a factory function ' + 'to return the default value.', vm)
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  // 原始道具值也未从之前的渲染中定义，返回之前的默认值以避免不必要的观察者触发
  if (vm && vm.$options.propsData && vm.$options.propsData[key] === undefined && vm._props[key] !== undefined) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  // 为非函数类型调用工厂函数，如果它的原型是函数，即使在不同的执行上下文中，值也是函数
  return typeof def === 'function' && getType(prop.type) !== 'Function' ? def.call(vm) : def
}

/**
 * Assert whether a prop is valid.
 */
function assertProp(prop: PropOptions, name: string, value: any, vm: ?Component, absent: boolean) {
  if (prop.required && absent) {
    warn('Missing required prop: "' + name + '"', vm)
    return
  }
  if (value == null && !prop.required) {
    return
  }
  let type = prop.type
  let valid = !type || type === true
  const expectedTypes = []
  if (type) {
    if (!Array.isArray(type)) {
      type = [type]
    }
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i], vm)
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }

  const haveExpectedTypes = expectedTypes.some(t => t)
  if (!valid && haveExpectedTypes) {
    warn(getInvalidTypeMessage(name, value, expectedTypes), vm)
    return
  }
  const validator = prop.validator
  if (validator) {
    if (!validator(value)) {
      warn('Invalid prop: custom validator check failed for prop "' + name + '".', vm)
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol|BigInt)$/

function assertType(
  value: any,
  type: Function,
  vm: ?Component
): {
  valid: boolean,
  expectedType: string,
} {
  let valid
  const expectedType = getType(type)
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)
  } else {
    try {
      valid = value instanceof type
    } catch (e) {
      warn('Invalid prop type: "' + String(type) + '" is not a constructor', vm)
      valid = false
    }
  }
  return {
    valid,
    expectedType,
  }
}

const functionTypeCheckRE = /^\s*function (\w+)/

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 * 使用函数字符串名称检查内置类型，
 * 因为简单的相等性检查在运行时会失败
 * 跨不同的 vms / iframes
 */
function getType(fn) {
  const match = fn && fn.toString().match(functionTypeCheckRE)
  return match ? match[1] : ''
}

function isSameType(a, b) {
  return getType(a) === getType(b)
}

function getTypeIndex(type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      // 有一个符合就return了
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage(name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}".` + ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  // check if we need to specify expected value
  if (expectedTypes.length === 1 && isExplicable(expectedType) && isExplicable(typeof value) && !isBoolean(expectedType, receivedType)) {
    message += ` with value ${styleValue(value, expectedType)}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${styleValue(value, receivedType)}.`
  }
  return message
}

function styleValue(value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

const EXPLICABLE_TYPES = ['string', 'number', 'boolean']
function isExplicable(value) {
  return EXPLICABLE_TYPES.some(elem => value.toLowerCase() === elem)
}

function isBoolean(...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
