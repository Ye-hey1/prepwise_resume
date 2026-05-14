/**
 * 智能排版算法 — 将简历内容自动压缩到一页 A4 纸内
 *
 * 策略：分阶段贪婪压缩 + 二分查找
 * 优先级：页边距 → 标题间距 → 段落间距 → 行高 → 字号
 */

/** 排版参数（与 TemplateCustomization 中的间距相关字段一一对应） */
export interface SmartLayoutParams {
  pagePaddingY?: number
  pagePaddingX?: number
  titleMarginTop?: number
  titleMarginBottom?: number
  sectionSpacing?: number
  lineHeight?: number
  fontSize?: number
}

export interface SmartLayoutResult {
  /** 是否成功将内容压缩到目标高度内 */
  success: boolean
  /** 优化后的参数 */
  optimized: SmartLayoutParams
  /** 运行前的原始参数（用于撤销） */
  original: SmartLayoutParams
}

/** CSS 变量名映射 */
const CSS_VAR: Record<keyof Required<SmartLayoutParams>, string> = {
  pagePaddingY: '--tpl-page-padding-y',
  pagePaddingX: '--tpl-page-padding-x',
  titleMarginTop: '--tpl-title-gap-top',
  titleMarginBottom: '--tpl-title-gap-bottom',
  sectionSpacing: '--tpl-section-gap',
  lineHeight: '--tpl-line-height',
  fontSize: '--tpl-font-size',
}

/** 各参数的默认值 */
const DEFAULTS: Required<SmartLayoutParams> = {
  pagePaddingY: 28,
  pagePaddingX: 24,
  titleMarginTop: 0,
  titleMarginBottom: 8,
  sectionSpacing: 10,
  lineHeight: 1.75,
  fontSize: 14,
}

/** 各参数的最小可接受值（保守策略：保持可读性） */
const MINS: Required<SmartLayoutParams> = {
  pagePaddingY: 10,
  pagePaddingX: 10,
  titleMarginTop: 0,
  titleMarginBottom: 0,
  sectionSpacing: 2,
  lineHeight: 1.4,
  fontSize: 12,
}

/** 压缩阶段的执行顺序（对可读性影响从小到大） */
const PHASES: Array<{ key: keyof Required<SmartLayoutParams>; step: number }> = [
  { key: 'pagePaddingY', step: 1 },
  { key: 'pagePaddingX', step: 1 },
  { key: 'titleMarginTop', step: 1 },
  { key: 'titleMarginBottom', step: 1 },
  { key: 'sectionSpacing', step: 1 },
  { key: 'lineHeight', step: 0.05 },
  { key: 'fontSize', step: 0.5 },
]

/** 等待下一帧（确保浏览器完成布局计算） */
function waitForFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** 格式化参数值为 CSS 值字符串 */
function formatValue(key: keyof SmartLayoutParams, val: number): string {
  return key === 'lineHeight' ? `${val}` : `${val}px`
}

/** 获取参数的当前值（优先取用户自定义，否则用默认值） */
function getParam(params: SmartLayoutParams, key: keyof Required<SmartLayoutParams>): number {
  return (params[key] as number | undefined) ?? DEFAULTS[key]
}

/** 在 DOM 元素上设置某个 CSS 变量 */
function setCSSVar(el: HTMLElement, key: keyof SmartLayoutParams, val: number): void {
  el.style.setProperty(CSS_VAR[key], formatValue(key, val))
}

/** 在 DOM 元素上批量设置所有 CSS 变量 */
function setAllCSSVars(el: HTMLElement, params: SmartLayoutParams): void {
  for (const key of Object.keys(CSS_VAR) as (keyof typeof CSS_VAR)[]) {
    setCSSVar(el, key, getParam(params, key))
  }
}

/** 测量元素的实际内容高度 */
function measureHeight(el: HTMLElement): number {
  return el.scrollHeight
}

/** 检测某个 CSS 变量是否对当前模板有效（改变后是否影响高度） */
async function isVariableEffective(
  el: HTMLElement,
  key: keyof SmartLayoutParams,
  currentVal: number,
): Promise<boolean> {
  const h1 = measureHeight(el)
  setCSSVar(el, key, 0)
  await waitForFrame()
  const h2 = measureHeight(el)
  setCSSVar(el, key, currentVal)
  await waitForFrame()
  return h1 !== h2
}

/** 对单个参数执行二分查找，找到最大可接受值 */
async function binarySearchParam(
  key: keyof Required<SmartLayoutParams>,
  el: HTMLElement,
  targetHeight: number,
  minVal: number,
  maxVal: number,
  step: number,
): Promise<number> {
  // 先检查最小值是否能装下
  setCSSVar(el, key, minVal)
  await waitForFrame()
  if (measureHeight(el) > targetHeight) {
    return minVal
  }

  // 二分查找最大可用值
  let lo = minVal
  let hi = maxVal
  let best = minVal

  while (hi - lo > step) {
    const mid = Math.round((lo + hi) / 2 / step) * step
    setCSSVar(el, key, mid)
    await waitForFrame()
    if (measureHeight(el) <= targetHeight) {
      best = mid
      lo = mid
    } else {
      hi = mid - step
    }
  }
  return best
}

/**
 * 执行智能排版算法
 *
 * @param resumeElement  简历内容的 DOM 根元素（resumeRef）
 * @param targetHeight   目标高度（A4 页面高度 ≈ 1123px）
 * @param currentParams  当前的排版参数
 * @returns 优化结果，包含成功标志、优化后参数和原始参数
 */
export async function computeSmartLayout(
  resumeElement: HTMLElement,
  targetHeight: number,
  currentParams: SmartLayoutParams,
): Promise<SmartLayoutResult> {
  const original = { ...currentParams }
  const working = { ...currentParams }

  // 阶段 0a：内容已在一页内，无需优化
  setAllCSSVars(resumeElement, working)
  await waitForFrame()
  const initialHeight = measureHeight(resumeElement)
  if (initialHeight <= targetHeight) {
    return { success: true, optimized: { ...working }, original }
  }

  // 阶段 0b：检查即使所有参数都设最小值是否能装下
  const allMins: SmartLayoutParams = { ...MINS }
  setAllCSSVars(resumeElement, allMins)
  await waitForFrame()
  const minHeight = measureHeight(resumeElement)

  // 恢复当前参数，准备分阶段执行
  setAllCSSVars(resumeElement, working)
  await waitForFrame()

  // 如果连最小值都无法装下，直接应用最小值并返回部分成功
  if (minHeight > targetHeight) {
    return { success: false, optimized: { ...allMins }, original }
  }

  // 分阶段压缩
  for (const phase of PHASES) {
    const currentVal = getParam(working, phase.key)
    const minVal = MINS[phase.key]

    // 已经是最小值，跳过
    if (currentVal <= minVal) continue

    // 当前已经能装下，提前结束
    if (measureHeight(resumeElement) <= targetHeight) break

    // 检测该变量是否对当前模板有效
    const effective = await isVariableEffective(resumeElement, phase.key, currentVal)
    if (!effective) continue

    // 二分查找该参数的最优值
    const optimized = await binarySearchParam(
      phase.key,
      resumeElement,
      targetHeight,
      minVal,
      currentVal,
      phase.step,
    )
    working[phase.key] = optimized
  }

  // 最终确认：设置所有工作参数并测量
  setAllCSSVars(resumeElement, working)
  await waitForFrame()
  const finalHeight = measureHeight(resumeElement)

  // 清理：移除直接设置的 style，后续由 Vue 响应式接管
  for (const key of Object.keys(CSS_VAR) as (keyof typeof CSS_VAR)[]) {
    resumeElement.style.removeProperty(CSS_VAR[key])
  }

  return {
    success: finalHeight <= targetHeight,
    optimized: { ...working },
    original,
  }
}
