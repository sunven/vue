/* @flow */

import { ASSET_TYPES } from "shared/constants";
import { isPlainObject, validateComponentName } from "../util/index";

export function initAssetRegisters(Vue: GlobalAPI) {
  /**
   * 创建资产注册方法。
   */
  ASSET_TYPES.forEach((type) => {
    // component
    // directive
    // filter
    // Vue.component('comp',{})
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + "s"][id];
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== "production" && type === "component") {
          validateComponentName(id);
        }
        if (type === "component" && isPlainObject(definition)) {
          definition.name = definition.name || id;
          //_base是Vue的构造函数
          //extend返回组件的构造函数
          definition = this.options._base.extend(definition);
        }
        if (type === "directive" && typeof definition === "function") {
          definition = { bind: definition, update: definition };
        }
        // 放到components中
        // vue全局注册，只是在根vue实例的components存放组件
        // 异步组件直接到这里
        this.options[type + "s"][id] = definition;
        return definition;
      }
    };
  });
}
