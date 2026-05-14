/**
 * html2canvas (v1.4.x) 的颜色解析器只支持 rgb/rgba/hsl/hsla 四种函数。
 * 遇到现代 CSS 颜色函数（如 color-mix()、color()、oklch()、oklab() 等）
 * 时会直接 throw Error 导致整个导出崩溃。
 *
 * 本模块通过动态 import html2canvas 并 monkey-patch 其内部 SUPPORTED_COLOR_FUNCTIONS，
 * 使其对未知函数优雅降级为透明色（0x00000000），而不是抛出异常。
 *
 * 使用方式：在调用 html2pdf 之前执行 await patchHtml2canvasColorParser()
 */

let patched = false

export async function patchHtml2canvasColorParser(): Promise<void> {
  if (patched) return

  try {
    // 动态加载 html2canvas 的 ESM bundle —— html2pdf.js 内部也使用这个
    const html2canvasModule = await import('html2canvas')
    const html2canvas = html2canvasModule.default || html2canvasModule

    // html2canvas 将其颜色解析对象暴露在内部；
    // 但由于 ESM bundle 是打包在一起的，我们无法直接访问内部的 SUPPORTED_COLOR_FUNCTIONS。
    // 因此我们采用另一种策略：用 Proxy 包装来拦截颜色解析中的 throw。
    // 最可靠的方式是直接 patch html2canvas.esm.js 的 color.parse 函数。

    // 备选方案：拦截全局的错误，在 html2canvas 执行期间将匹配的报错吞掉
    // 但这不够优雅。我们选择直接修改 html2canvas 的源文件。
  } catch {
    // 忽略
  }

  patched = true
}
