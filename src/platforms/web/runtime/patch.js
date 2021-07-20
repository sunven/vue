/* @flow */

import * as nodeOps from "web/runtime/node-ops";
import { createPatchFunction } from "core/vdom/patch";
import baseModules from "core/vdom/modules/index";
import platformModules from "web/runtime/modules/index";

// the directive module should be applied last, after all
// built-in modules have been applied.
// 指令模块应在所有内置模块应用完毕后最后应用
const modules = platformModules.concat(baseModules);

// 传入web平台特有的节点操作和属性操作
// nodeOps中有创建节点等操作
export const patch: Function = createPatchFunction({ nodeOps, modules });
