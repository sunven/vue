/* @flow */

import { inBrowser } from 'core/util/index'

// check whether current browser encodes a char inside attribute values
// 检查当前浏览器是否在属性值中编码了一个字符
let div
function getShouldDecode (href: boolean): boolean {
  div = div || document.createElement('div')
  div.innerHTML = href ? `<a href="\n"/>` : `<div a="\n"/>`
  return div.innerHTML.indexOf('&#10;') > 0
}

// #3663: IE encodes newlines inside attribute values while other browsers don't
// IE 对属性值内的换行符进行编码，而其他浏览器则没有
export const shouldDecodeNewlines = inBrowser ? getShouldDecode(false) : false
// #6828: chrome encodes content in a[href]
// chrome 对 a[href] 中的内容进行编码
// eg:<a href="https://www.google.com/&#9;">My link 2</a>
export const shouldDecodeNewlinesForHref = inBrowser ? getShouldDecode(true) : false
