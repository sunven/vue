import { initMixin } from "./init";
import { stateMixin } from "./state";
import { renderMixin } from "./render";
import { eventsMixin } from "./events";
import { lifecycleMixin } from "./lifecycle";
import { warn } from "../util/index";

//Vue构造函数
function Vue(options) {
  if (process.env.NODE_ENV !== "production" && !(this instanceof Vue)) {
    warn("Vue is a constructor and should be called with the `new` keyword");
  }
  //初始化
  this._init(options);
}

//1.初始化混入,定义_init()方法
initMixin(Vue);
//2.状态混入，定义$data/$props/$set/$delete/$watch
stateMixin(Vue);
//3.事件混入,$on()/$off()/$once()/$emit()
eventsMixin(Vue);
//4.生命周期混入，_update()/$forceUpdate()
lifecycleMixin(Vue);
//5.渲染函数混入 $nextTick()/_render()
renderMixin(Vue);

export default Vue;
