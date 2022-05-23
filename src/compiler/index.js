/* @flow */

import { parse } from "./parser/index";
import { optimize } from "./optimizer";
import { generate } from "./codegen/index";
import { createCompilerCreator } from "./create-compiler";

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
export const createCompiler = createCompilerCreator(function baseCompile(
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 解析：将html字符串解析为ast
  const ast = parse(template.trim(), options);
  if (options.optimize !== false) {
    // 优化：标记静态节点
    optimize(ast, options);
  }

  JSON.stringify(ast, replacer)
  // JSON.stringify(ast.children[0].ifConditions, replacer)

  //将ast转为render的字符串形式
  const code = generate(ast, options);
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns,
  };
});

// 循环引用
function replacer(key, value) {
  if (key === "parent" || key === "ifConditions" || key === 'start' || key === 'end') {
    return undefined;
  }
  return value;
}
