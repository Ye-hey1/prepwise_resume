<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useResumeStore } from '@/stores/resume'
import TemplatePickerDialog from '@/components/resume/TemplatePickerDialog.vue'
import SmartLayoutPanel from '@/components/resume/SmartLayoutPanel.vue'
import { defineAsyncComponent } from 'vue'

const TemplateCustomizationPanel = defineAsyncComponent(
  () => import('@/components/resume/TemplateCustomizationPanel.vue'),
)
import {
  RESUME_TEMPLATES,
  getResumeTemplateByKey,
  type ResumeTemplateDefinition,
  type ResumeTemplateKey,
} from '@/templates/resume'
import { generateResumeMarkdown, downloadMarkdown } from '@/services/exportMarkdown'
import { computeSmartLayout, type SmartLayoutParams } from '@/utils/smartLayout'
import { optimizeResumeContent, applyOptimizedFields } from '@/services/smartLayoutService'
import { useAiConfigStore } from '@/stores/aiConfig'

const store = useResumeStore()
const aiConfig = useAiConfigStore()
const emit = defineEmits<{
  (e: 'collapse'): void
}>()
const resumeRef = ref<HTMLElement | null>(null)
const previewViewportRef = ref<HTMLElement | null>(null)
const exporting = ref(false)
type ExportQualityMode = 'compressed' | 'hd'
const exportMenuOpen = ref(false)
const exportMenuRef = ref<HTMLElement | null>(null)
const exportBtnRef = ref<HTMLElement | null>(null)
const exportMenuStyle = ref<Record<string, string>>({})
exportMenuStyle.value = {}
const templatePickerOpen = ref(false)
const customizationOpen = ref(false)
const layoutMenuOpen = ref(false)
const layoutMenuStyle = ref<Record<string, string>>({})
layoutMenuStyle.value = {}
const layoutBtnRef = ref<HTMLElement | null>(null)
let exportMenuCloseTimer: ReturnType<typeof setTimeout> | null = null
let layoutMenuCloseTimer: ReturnType<typeof setTimeout> | null = null
let smartLayoutCloseTimer: ReturnType<typeof setTimeout> | null = null
const smartLayoutRunning = ref(false)
const smartLayoutSuccess = ref(false)
const smartLayoutLabel = ref('智能排版')
const smartLayoutSnapshot = ref<SmartLayoutParams | null>(null)
const smartLayoutContentSnapshot = ref<Record<string, string> | null>(null)
let smartLayoutTimer: ReturnType<typeof setTimeout> | null = null
const smartLayoutPanelOpen = ref(false)
const smartLayoutBtnRef = ref<HTMLElement | null>(null)
const smartLayoutBtnRect = ref<DOMRect | null>(null)

const A4_WIDTH = 794
const A4_RATIO = 297 / 210
const A4_HEIGHT = Math.round(A4_WIDTH * A4_RATIO)
const PDF_PAGE_WIDTH_MM = 210
const PDF_PAGE_HEIGHT_MM = 297
const PDF_PAGE_GUARD = 8
const PDF_MIN_CUT_GAP = 48
const PDF_IDEAL_PAGE_FILL_RATIO = 0.97
const PDF_MIN_PAGE_FILL_RATIO = 0.9
const PDF_MAX_PAGE_COUNT = 30
const PDF_TEXT_CUT_PADDING = 0.2
const PDF_LINE_CUT_OFFSET = 1
const PDF_MIN_SAFE_LINE_GAP = 4
const PDF_LINE_BOTTOM_SAFE_PADDING = 2
const PDF_LINE_MERGE_OVERLAP_RATIO = 0.35
const PDF_LINE_MERGE_TOP_TOLERANCE = 1.5
const PREVIEW_HORIZONTAL_PADDING = 24
const pageBreaks = ref<number[]>([])
const previewScale = ref(1)
const resumeContentHeight = ref(A4_HEIGHT)
const scaledPaperWidth = computed(() => Math.round(A4_WIDTH * previewScale.value))
const scaledPaperHeight = computed(() => Math.round(Math.max(A4_HEIGHT, resumeContentHeight.value) * previewScale.value))
const paperScaleStyle = computed(() => ({
  width: `${A4_WIDTH}px`,
  minHeight: `${A4_HEIGHT}px`,
  transform: `scale(${previewScale.value})`,
  transformOrigin: 'top center',
}))
const paperWrapperStyle = computed(() => ({
  width: `${scaledPaperWidth.value}px`,
  minHeight: `${scaledPaperHeight.value}px`,
}))
const scaledPageBreaks = computed(() => pageBreaks.value.map((pos) => pos * previewScale.value))

function updatePreviewScale() {
  const viewportWidth = previewViewportRef.value?.clientWidth ?? 0
  if (!viewportWidth) {
    previewScale.value = 1
    return
  }

  const availableWidth = Math.max(viewportWidth - PREVIEW_HORIZONTAL_PADDING, 280)
  previewScale.value = Math.min(1, availableWidth / A4_WIDTH)
}

let resizeObserver: ResizeObserver | null = null
let previewViewportObserver: ResizeObserver | null = null
let layoutUpdateRafId: number | null = null

function queuePreviewLayoutUpdate() {
  // 使用 rAF 合并多次布局更新请求，避免同一帧内重复计算
  if (layoutUpdateRafId !== null) return
  layoutUpdateRafId = requestAnimationFrame(() => {
    layoutUpdateRafId = null
    updatePreviewScale()
    updatePageBreaks()
  })
}

function getPageLineStyle(pos: number) {
  return { top: `${pos}px` }
}

function getPreviewContainerStyle() {
  return paperWrapperStyle.value
}

function getPaperStyle() {
  return paperScaleStyle.value
}

function getPageLineText(index: number) {
  return `第${index + 2}页`
}

function getPageLineList() {
  return scaledPageBreaks.value
}

const fallbackTemplate: ResumeTemplateDefinition = getResumeTemplateByKey('default')
const currentTemplate = computed<ResumeTemplateDefinition>(
  () => getResumeTemplateByKey(store.selectedTemplateKey) ?? fallbackTemplate
)
const currentTemplateComponent = computed(() => currentTemplate.value.component)

function updatePageBreaks() {
  if (!resumeRef.value) return
  const contentHeight = Math.ceil(Math.max(resumeRef.value.scrollHeight, resumeRef.value.offsetHeight))
  resumeContentHeight.value = contentHeight
  pageBreaks.value = computeSmartPdfPageCuts(resumeRef.value, A4_HEIGHT)
}

function openTemplatePicker() {
  templatePickerOpen.value = true
  exportMenuOpen.value = false
}

function chooseTemplate(key: ResumeTemplateKey) {
  store.setTemplate(key)
  templatePickerOpen.value = false
}

// 动态计算弹窗位置
function updateExportMenuPosition() {
  if (!exportBtnRef.value) return
  const rect = exportBtnRef.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth

  // 让弹窗右对齐按钮
  let left = rect.right - 140
  let top = rect.bottom + 8

  // 确保不超出左边界
  if (left < 8) left = 8
  // 确保不超出右边界
  if (left + 140 > viewportWidth - 8) {
    left = viewportWidth - 148
  }
  // 确保不超出下边界
  if (top + 180 > viewportHeight - 8) {
    top = rect.top - 188
  }

  exportMenuStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    top: `${top}px`,
    zIndex: '1000'
  }
}

function updateLayoutMenuPosition() {
  if (!layoutBtnRef.value) return
  const rect = layoutBtnRef.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth

  // 让弹窗右对齐按钮
  let left = rect.right - 220
  let top = rect.bottom + 8

  // 确保不超出左边界
  if (left < 8) left = 8
  // 确保不超出右边界
  if (left + 220 > viewportWidth - 8) {
    left = viewportWidth - 228
  }
  // 确保不超出下边界
  if (top + 300 > viewportHeight - 8) {
    top = rect.top - 308
  }

  layoutMenuStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    top: `${top}px`,
    zIndex: '1000'
  }
}

function toggleExportMenu() {
  if (!exportMenuOpen.value) {
    updateExportMenuPosition()
  }
  exportMenuOpen.value = !exportMenuOpen.value
}

function toggleLayoutMenu() {
  if (!layoutMenuOpen.value) {
    updateLayoutMenuPosition()
  }
  layoutMenuOpen.value = !layoutMenuOpen.value
}

// ========================
// 基础布局控制 (仅产品经理模板)
// ========================
const layoutAlign = computed(() => store.getCustomization(store.selectedTemplateKey)?.layoutAlign || 'space-between')
const metaDisplay = computed(() => store.getCustomization(store.selectedTemplateKey)?.metaDisplay || 'icon')
const avatarShape = computed(() => store.getCustomization(store.selectedTemplateKey)?.avatarShape || 'rounded')

function setLayoutAlign(val: string) {
  store.setCustomization(store.selectedTemplateKey, { layoutAlign: val as any })
}
function setMetaDisplay(val: string) {
  store.setCustomization(store.selectedTemplateKey, { metaDisplay: val as any })
}
function setAvatarShape(val: string) {
  store.setCustomization(store.selectedTemplateKey, { avatarShape: val as any })
}

onMounted(() => {
  queuePreviewLayoutUpdate()
  if (resumeRef.value) {
    resizeObserver = new ResizeObserver(() => {
      // ResizeObserver 回调合并到 rAF 中
      if (layoutUpdateRafId === null) {
        layoutUpdateRafId = requestAnimationFrame(() => {
          layoutUpdateRafId = null
          updatePageBreaks()
        })
      }
    })
    resizeObserver.observe(resumeRef.value)
  }
  if (previewViewportRef.value) {
    previewViewportObserver = new ResizeObserver(() => {
      updatePreviewScale()
    })
    previewViewportObserver.observe(previewViewportRef.value)
  }
  window.addEventListener('resize', updatePreviewScale)
  document.addEventListener('mousedown', handleDocumentPointerDown)
})

watch(
  () => [
    JSON.stringify(store.modules),
    JSON.stringify(store.basicInfo),
    JSON.stringify(store.educationList),
    store.skills,
    JSON.stringify(store.workList),
    JSON.stringify(store.projectList),
    JSON.stringify(store.awardList),
    store.selfIntro,
    store.selectedTemplateKey,
    JSON.stringify(store.templateCustomizations),
    store.showProjectSubtitles,
  ],
  () => {
    queuePreviewLayoutUpdate()
  }
)

onUnmounted(() => {
  resizeObserver?.disconnect()
  previewViewportObserver?.disconnect()
  if (layoutUpdateRafId !== null) {
    cancelAnimationFrame(layoutUpdateRafId)
    layoutUpdateRafId = null
  }
  window.removeEventListener('resize', updatePreviewScale)
  document.removeEventListener('mousedown', handleDocumentPointerDown)
})

function handleExportTriggerClick() {
  if (exporting.value) return
  if (!exportMenuOpen.value) {
    updateExportMenuPosition()
  }
  exportMenuOpen.value = !exportMenuOpen.value
}

function handleExportTriggerEnter() {
  if (exporting.value) return
  if (exportMenuCloseTimer) {
    clearTimeout(exportMenuCloseTimer)
    exportMenuCloseTimer = null
  }
  updateExportMenuPosition()
  exportMenuOpen.value = true
}

function handleExportMenuLeave() {
  exportMenuCloseTimer = setTimeout(() => {
    exportMenuOpen.value = false
  }, 300)
}

function handleExportMenuEnter() {
  if (exportMenuCloseTimer) {
    clearTimeout(exportMenuCloseTimer)
    exportMenuCloseTimer = null
  }
}

function handleLayoutMenuEnter() {
  if (layoutMenuCloseTimer) {
    clearTimeout(layoutMenuCloseTimer)
    layoutMenuCloseTimer = null
  }
  updateLayoutMenuPosition()
  layoutMenuOpen.value = true
}

function handleLayoutMenuLeave() {
  layoutMenuCloseTimer = setTimeout(() => {
    layoutMenuOpen.value = false
  }, 300)
}

function handleSmartLayoutEnter() {
  if (smartLayoutCloseTimer) {
    clearTimeout(smartLayoutCloseTimer)
    smartLayoutCloseTimer = null
  }
  if (smartLayoutBtnRef.value) {
    smartLayoutBtnRect.value = smartLayoutBtnRef.value.getBoundingClientRect()
  }
  smartLayoutPanelOpen.value = true
}

function handleSmartLayoutLeave() {
  smartLayoutCloseTimer = setTimeout(() => {
    smartLayoutPanelOpen.value = false
  }, 300)
}

function handleDocumentPointerDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target || !exportMenuRef.value) return
  if (!exportMenuRef.value.contains(target)) {
    exportMenuOpen.value = false
  }
}

function handleExportMarkdown() {
  exportMenuOpen.value = false
  const md = generateResumeMarkdown(store)
  const name = store.basicInfo.name?.trim() || '简历'
  downloadMarkdown(`${name}_简历.md`, md)
}

/**
 * 替换 CSS 文本中的 color-mix(...) 和独立 color(...) 函数调用。
 * 能正确处理嵌套括号，例如 color-mix(in srgb, var(--c), var(--d) 10%)
 */
function replaceCssColorFunctions(css: string): string {
  // 需要替换的函数名
  const targets = ['color-mix', 'color']
  let result = css
  for (const fn of targets) {
    let output = ''
    let i = 0
    while (i < result.length) {
      // 检查当前位置是否匹配目标函数名 + 左括号
      const remaining = result.substring(i)
      const fnPattern = fn + '('
      if (remaining.startsWith(fnPattern)) {
        // 跳过函数名，从左括号开始数
        let depth = 1
        let j = i + fnPattern.length
        while (j < result.length && depth > 0) {
          if (result[j] === '(') depth++
          else if (result[j] === ')') depth--
          j++
        }
        // 用安全的 rgba 值替代整个函数调用（包括匹配的右括号）
        output += 'rgba(0,0,0,0)'
        i = j
      } else {
        output += result[i]
        i++
      }
    }
    result = output
  }
  return result
}

function waitForExportLayout(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function isVisibleForPagination(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const style = window.getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function getTextClientRects(el: Element): DOMRect[] {
  const ownerDocument = el.ownerDocument
  const walker = ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })
  const rects: DOMRect[] = []
  const range = ownerDocument.createRange()
  let node = walker.nextNode()

  while (node) {
    range.selectNodeContents(node)
    rects.push(...Array.from(range.getClientRects()))
    node = walker.nextNode()
  }

  range.detach()
  return rects
}

function addPdfCutCandidate(candidates: Set<number>, y: number, contentHeight: number) {
  if (!Number.isFinite(y)) return
  const rounded = Math.round(y * 100) / 100
  if (rounded > PDF_MIN_CUT_GAP && rounded < contentHeight - PDF_MIN_CUT_GAP) {
    candidates.add(rounded)
  }
}

function addPdfForbiddenRange(
  ranges: Array<[number, number]>,
  start: number,
  end: number,
  contentHeight: number,
) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return
  const rangeStart = Math.max(0, Math.round(start * 100) / 100)
  const rangeEnd = Math.min(contentHeight, Math.round(end * 100) / 100)
  if (rangeEnd > rangeStart) ranges.push([rangeStart, rangeEnd])
}

function isAllowedPdfCut(y: number, forbiddenRanges: Array<[number, number]>): boolean {
  return !forbiddenRanges.some(([start, end]) => y >= start && y <= end)
}

function adjustPdfCutBeforeForbiddenRange(
  y: number,
  minY: number,
  forbiddenRanges: Array<[number, number]>,
): number | undefined {
  let cut = y
  let adjusted = true
  while (adjusted) {
    adjusted = false
    for (const [start, end] of forbiddenRanges) {
      if (cut >= start && cut <= end) {
        cut = start - 1
        adjusted = true
        break
      }
    }
  }

  return cut >= minY ? cut : undefined
}

function adjustPdfCutBeforeLineBox(
  y: number,
  minY: number,
  lineBoxes: PdfLineBox[],
): number | undefined {
  let cut = y
  let adjusted = true
  while (adjusted) {
    adjusted = false
    for (const line of lineBoxes) {
      if (
        cut >= line.top - PDF_TEXT_CUT_PADDING &&
        cut <= line.bottom + PDF_LINE_BOTTOM_SAFE_PADDING
      ) {
        cut = line.top - PDF_LINE_CUT_OFFSET
        adjusted = true
        break
      }
    }
  }

  return cut >= minY ? cut : undefined
}

type PdfLineBox = {
  top: number
  bottom: number
}

function addTextLineBoxes(
  lineBoxes: PdfLineBox[],
  rects: DOMRect[],
  rootTop: number,
  contentHeight: number,
  layoutScale: number,
) {
  rects.forEach((rect) => {
    if (rect.width <= 0 || rect.height <= 0) return
    const top = (rect.top - rootTop) / layoutScale
    const bottom = (rect.bottom - rootTop) / layoutScale
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return
    if (bottom <= 0 || top >= contentHeight) return
    lineBoxes.push({
      top: Math.max(0, Math.round(top * 100) / 100),
      bottom: Math.min(contentHeight, Math.round(bottom * 100) / 100),
    })
  })
}

function getMergedPdfLineBoxes(lineBoxes: PdfLineBox[]): PdfLineBox[] {
  return lineBoxes
    .filter((line) => line.bottom > line.top)
    .sort((a, b) => a.top - b.top || a.bottom - b.bottom)
    .reduce<PdfLineBox[]>((lines, line) => {
      const last = lines[lines.length - 1]
      const overlap = last
        ? Math.min(last.bottom, line.bottom) - Math.max(last.top, line.top)
        : 0
      const minHeight = last
        ? Math.max(1, Math.min(last.bottom - last.top, line.bottom - line.top))
        : 1
      const sameVisualLine =
        last &&
        (Math.abs(line.top - last.top) <= PDF_LINE_MERGE_TOP_TOLERANCE ||
          overlap / minHeight >= PDF_LINE_MERGE_OVERLAP_RATIO)

      if (last && sameVisualLine) {
        last.top = Math.min(last.top, line.top)
        last.bottom = Math.max(last.bottom, line.bottom)
      } else {
        lines.push({ ...line })
      }
      return lines
    }, [])
}

function addTextLineCutCandidates(
  candidates: Set<number>,
  lineBoxes: PdfLineBox[],
  contentHeight: number,
) {
  const mergedLineBoxes = getMergedPdfLineBoxes(lineBoxes)

  mergedLineBoxes.forEach((line, index) => {
    const lineBottom = line.bottom

    const prevLine = mergedLineBoxes[index - 1]
    if (prevLine) {
      const prevBottom = prevLine.bottom
      const gap = line.top - prevBottom
      if (gap >= PDF_MIN_SAFE_LINE_GAP) {
        addPdfCutCandidate(candidates, prevBottom + gap / 2, contentHeight)
      }
    }

    if (index === mergedLineBoxes.length - 1) {
      addPdfCutCandidate(candidates, lineBottom + PDF_LINE_CUT_OFFSET, contentHeight)
    }
  })
}

function collectPdfPaginationData(root: HTMLElement, contentHeight: number) {
  const blockCandidates = new Set<number>()
  const lineCandidates = new Set<number>()
  const textLineBoxes: PdfLineBox[] = []
  const forbiddenRanges: Array<[number, number]> = []
  const rootRect = root.getBoundingClientRect()
  const rootTop = rootRect.top
  const layoutScale = root.clientWidth > 0 ? rootRect.width / root.clientWidth : 1
  const safeLayoutScale = Number.isFinite(layoutScale) && layoutScale > 0 ? layoutScale : 1
  const blockSelector = [
    '.resume-section',
    '.entry',
    '.side-block',
    '.section-title',
    '.entry-head',
    '.entry-header',
    '.entry-title',
    '.entry-main',
    '.entry-company',
    '.entry-link-row',
    '.project-block-title',
    '.block-title',
    '.entry-rich p',
    '.entry-rich li',
    '.entry-rich h1',
    '.entry-rich h2',
    '.entry-rich h3',
    '.entry-rich h4',
    '.entry-rich h5',
    '.entry-rich h6',
    '.contact-line',
    '.meta-item',
  ].join(',')

  root.querySelectorAll(blockSelector).forEach((el) => {
    if (!isVisibleForPagination(el)) return
    const rect = el.getBoundingClientRect()
    addPdfCutCandidate(blockCandidates, (rect.top - rootTop) / safeLayoutScale, contentHeight)
    addPdfCutCandidate(blockCandidates, (rect.bottom - rootTop) / safeLayoutScale + 2, contentHeight)
  })

  const textRects = getTextClientRects(root)
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => a.top - b.top)
  addTextLineBoxes(textLineBoxes, textRects, rootTop, contentHeight, safeLayoutScale)
  const mergedLineBoxes = getMergedPdfLineBoxes(textLineBoxes)

  mergedLineBoxes.forEach((line) => {
    addPdfForbiddenRange(
      forbiddenRanges,
      line.top - PDF_TEXT_CUT_PADDING,
      line.bottom + PDF_TEXT_CUT_PADDING,
      contentHeight,
    )
  })

  addTextLineCutCandidates(lineCandidates, mergedLineBoxes, contentHeight)

  const sortedForbiddenRanges = forbiddenRanges.sort((a, b) => a[0] - b[0])
  const sortedBlockCandidates = Array.from(blockCandidates)
    .filter((candidate) => isAllowedPdfCut(candidate, sortedForbiddenRanges))
    .sort((a, b) => a - b)
  const sortedLineCandidates = Array.from(lineCandidates)
    .filter((candidate) => isAllowedPdfCut(candidate, sortedForbiddenRanges))
    .sort((a, b) => a - b)

  return {
    blockCandidates: sortedBlockCandidates,
    lineCandidates: sortedLineCandidates,
    forbiddenRanges: sortedForbiddenRanges,
    lineBoxes: mergedLineBoxes,
  }
}

function findLastPdfCutCandidate(candidates: number[], minY: number, maxY: number): number | undefined {
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i]
    if (candidate === undefined) continue
    if (candidate <= maxY && candidate >= minY) return candidate
    if (candidate < minY) break
  }
  return undefined
}

function findBestPdfLineGapCut(
  lineBoxes: PdfLineBox[],
  minUsefulY: number,
  maxY: number,
  minAllowedY: number,
): number | undefined {
  let usefulCut: number | undefined

  for (let i = 1; i < lineBoxes.length; i += 1) {
    const prevLine = lineBoxes[i - 1]
    const nextLine = lineBoxes[i]
    if (!prevLine || !nextLine) continue
    const gap = nextLine.top - prevLine.bottom
    if (gap < PDF_MIN_SAFE_LINE_GAP) continue

    const candidate = prevLine.bottom + gap / 2
    if (candidate < minAllowedY) continue
    if (candidate > maxY) break

    if (candidate >= minUsefulY) {
      usefulCut = candidate
    }
  }

  return usefulCut
}

function normalizePdfCut(cut: number, pageStart: number, contentHeight: number): number {
  const normalized = Math.floor(cut)
  return Math.max(pageStart + PDF_MIN_CUT_GAP, Math.min(normalized, contentHeight))
}

function computeSmartPdfPageCuts(root: HTMLElement, pageHeight: number): number[] {
  const contentHeight = Math.ceil(Math.max(root.scrollHeight, root.getBoundingClientRect().height))
  if (contentHeight <= pageHeight + PDF_PAGE_GUARD) return []

  const { blockCandidates, lineCandidates, forbiddenRanges, lineBoxes } = collectPdfPaginationData(root, contentHeight)
  const cuts: number[] = []
  let pageStart = 0

  while (pageStart + pageHeight < contentHeight - PDF_PAGE_GUARD && cuts.length < PDF_MAX_PAGE_COUNT) {
    const safeEnd = pageStart + pageHeight - PDF_PAGE_GUARD
    const idealStart = pageStart + pageHeight * PDF_IDEAL_PAGE_FILL_RATIO
    const minUsefulCut = pageStart + pageHeight * PDF_MIN_PAGE_FILL_RATIO
    const minAllowedCut = pageStart + PDF_MIN_CUT_GAP
    const idealLineCut = findLastPdfCutCandidate(lineCandidates, idealStart, safeEnd)
    const usefulLineCut = findLastPdfCutCandidate(lineCandidates, minUsefulCut, safeEnd)
    const relaxedLineCut = findLastPdfCutCandidate(lineCandidates, minAllowedCut, safeEnd)
    const lineGapCut = findBestPdfLineGapCut(lineBoxes, minUsefulCut, safeEnd, minAllowedCut)
    const safeEndCut = adjustPdfCutBeforeForbiddenRange(
      safeEnd,
      minAllowedCut,
      forbiddenRanges,
    )
    const blockCut = findLastPdfCutCandidate(blockCandidates, minUsefulCut, safeEnd)
    const usefulSafeEndCut = safeEndCut !== undefined && safeEndCut >= minUsefulCut ? safeEndCut : undefined
    let cut: number
    let isLineCut = false
    if (lineGapCut !== undefined) {
      cut = lineGapCut
      isLineCut = true
    } else if (idealLineCut !== undefined) {
      cut = idealLineCut
      isLineCut = true
    } else if (usefulLineCut !== undefined) {
      cut = usefulLineCut
      isLineCut = true
    } else if (usefulSafeEndCut !== undefined) {
      cut = usefulSafeEndCut
    } else if (blockCut !== undefined) {
      cut = blockCut
    } else if (relaxedLineCut !== undefined) {
      cut = relaxedLineCut
      isLineCut = true
    } else {
      cut = safeEndCut ?? safeEnd
    }

    if (!isLineCut) {
      const lineSafeCut = adjustPdfCutBeforeLineBox(cut, minAllowedCut, lineBoxes)
      if (lineSafeCut !== undefined && lineSafeCut < cut) {
        const previousLineCut = findLastPdfCutCandidate(lineCandidates, minAllowedCut, lineSafeCut)
        cut = previousLineCut ?? lineSafeCut
        isLineCut = previousLineCut !== undefined
      }

      const forbiddenSafeCut = adjustPdfCutBeforeForbiddenRange(cut, minAllowedCut, forbiddenRanges)
      if (forbiddenSafeCut !== undefined && forbiddenSafeCut < cut) {
        const previousLineCut = findLastPdfCutCandidate(lineCandidates, minAllowedCut, forbiddenSafeCut)
        cut = previousLineCut ?? forbiddenSafeCut
        isLineCut = previousLineCut !== undefined
      }

      const finalLineSafeCut = adjustPdfCutBeforeLineBox(cut, minAllowedCut, lineBoxes)
      if (finalLineSafeCut !== undefined && finalLineSafeCut < cut) {
        const previousLineCut = findLastPdfCutCandidate(lineCandidates, minAllowedCut, finalLineSafeCut)
        cut = previousLineCut ?? finalLineSafeCut
      }
    }

    const roundedCut = normalizePdfCut(cut, pageStart, contentHeight)
    if (roundedCut <= pageStart + 1) break
    cuts.push(roundedCut)
    pageStart = roundedCut
  }

  return cuts
}

function canvasToDataUrl(canvas: HTMLCanvasElement, isHdMode: boolean): string {
  if (isHdMode) return canvas.toDataURL('image/png')
  return canvas.toDataURL('image/jpeg', 0.92)
}

/**
 * 导出 PNG 高清图片
 */
async function exportPNG() {
  if (!resumeRef.value) return
  exporting.value = true
  exportMenuOpen.value = false
  const sourceNode = resumeRef.value

  // 临时替换不兼容的 CSS 颜色函数
  const originalStyles: { el: HTMLStyleElement; text: string }[] = []
  document.querySelectorAll('style').forEach((st) => {
    const text = st.textContent || ''
    if (text.includes('color-mix(') || text.includes('color(')) {
      originalStyles.push({ el: st, text })
      st.textContent = replaceCssColorFunctions(text)
    }
  })

  const exportHost = document.createElement('div')
  exportHost.style.position = 'fixed'
  exportHost.style.left = '-10000px'
  exportHost.style.top = '0'
  exportHost.style.width = `${A4_WIDTH}px`
  exportHost.style.pointerEvents = 'none'
  exportHost.style.zIndex = '-1'

  const exportNode = sourceNode.cloneNode(true) as HTMLElement
  exportNode.classList.add('pdf-exporting')
  exportNode.style.width = `${A4_WIDTH}px`
  exportNode.style.minHeight = '0'
  exportNode.style.height = 'auto'
  exportNode.style.margin = '0'
  exportNode.style.padding = '0'
  exportNode.style.position = 'static'
  exportNode.style.transform = 'none'
  exportNode.style.overflow = 'visible'

  exportNode.querySelectorAll('*').forEach((el) => {
    const inlineStyle = el.getAttribute('style')
    if (inlineStyle && (inlineStyle.includes('color-mix(') || inlineStyle.includes('color('))) {
      el.setAttribute('style', replaceCssColorFunctions(inlineStyle))
    }
  })

  exportHost.appendChild(exportNode)
  document.body.appendChild(exportHost)

  try {
    await document.fonts?.ready
    await waitForExportLayout()
    const html2canvasModule = await import('html2canvas')
    const html2canvas = html2canvasModule.default || html2canvasModule

    const canvas = await html2canvas(exportNode, {
      scale: Math.min(4, Math.max(3, window.devicePixelRatio || 1)),
      useCORS: true,
      backgroundColor: '#ffffff',
      width: A4_WIDTH,
      windowWidth: A4_WIDTH,
      scrollX: 0,
      scrollY: 0,
      logging: false,
    })

    // 通过 Blob 下载 PNG
    canvas.toBlob((blob: Blob | null) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${store.basicInfo.name || '简历'}_resume.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  } catch (err) {
    console.error('PNG export failed:', err)
    alert('导出异常: ' + (err instanceof Error ? err.message : String(err)))
  } finally {
    exportHost.remove()
    exporting.value = false
    originalStyles.forEach((item) => {
      item.el.textContent = item.text
    })
  }
}

async function exportPDF(mode: ExportQualityMode) {
  if (!resumeRef.value) return
  exporting.value = true
  exportMenuOpen.value = false
  const isHdMode = mode === 'hd'
  const sourceNode = resumeRef.value

  // html2canvas 不支持现代 CSS 颜色函数（color-mix / color），需要临时替换
  const originalStyles: { el: HTMLStyleElement; text: string }[] = []
  document.querySelectorAll('style').forEach((st) => {
    const text = st.textContent || ''
    if (text.includes('color-mix(') || text.includes('color(')) {
      originalStyles.push({ el: st, text })
      st.textContent = replaceCssColorFunctions(text)
    }
  })

  const exportHost = document.createElement('div')
  exportHost.style.position = 'fixed'
  exportHost.style.left = '-10000px'
  exportHost.style.top = '0'
  exportHost.style.width = `${A4_WIDTH}px`
  exportHost.style.pointerEvents = 'none'
  exportHost.style.zIndex = '-1'

  const exportNode = sourceNode.cloneNode(true) as HTMLElement
  exportNode.classList.add('pdf-exporting')
  exportNode.style.width = `${A4_WIDTH}px`
  exportNode.style.minHeight = '0'
  exportNode.style.height = 'auto'
  exportNode.style.margin = '0'
  exportNode.style.padding = '0'
  exportNode.style.position = 'static'
  exportNode.style.transform = 'none'
  exportNode.style.overflow = 'visible'

  // 清理克隆节点中的内联样式
  exportNode.querySelectorAll('*').forEach((el) => {
    const inlineStyle = el.getAttribute('style')
    if (inlineStyle && (inlineStyle.includes('color-mix(') || inlineStyle.includes('color('))) {
      el.setAttribute('style', replaceCssColorFunctions(inlineStyle))
    }
  })

  exportHost.appendChild(exportNode)
  document.body.appendChild(exportHost)

  try {
    await document.fonts?.ready
    await waitForExportLayout()
    const pageCuts = computeSmartPdfPageCuts(exportNode, A4_HEIGHT)
    const html2canvasModule = await import('html2canvas')
    const html2canvas = html2canvasModule.default || html2canvasModule
    const jsPdfModule = await import('jspdf')
    
    const filename = `${store.basicInfo.name || '简历'}_resume.pdf`
    const exportScale = isHdMode ? Math.min(4, Math.max(3, window.devicePixelRatio || 1)) : 2

    const fullCanvas = await html2canvas(exportNode, {
      scale: exportScale,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: A4_WIDTH,
      windowWidth: A4_WIDTH,
      scrollX: 0,
      scrollY: 0,
      logging: false,
    })

    const pdf = new jsPdfModule.jsPDF({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
      compress: !isHdMode,
    })
    const canvasScale = fullCanvas.width / A4_WIDTH
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = fullCanvas.width
    pageCanvas.height = Math.round(A4_HEIGHT * canvasScale)
    const pageCtx = pageCanvas.getContext('2d')
    if (!pageCtx) throw new Error('无法创建 PDF 分页画布')

    const contentHeight = Math.ceil(Math.max(exportNode.scrollHeight, exportNode.getBoundingClientRect().height))
    const pageEdges = [0, ...pageCuts, contentHeight]
    const imageType = isHdMode ? 'PNG' : 'JPEG'

    for (let i = 0; i < pageEdges.length - 1; i += 1) {
      const start = pageEdges[i]
      const end = pageEdges[i + 1]
      if (start === undefined || end === undefined) continue
      const sliceHeight = Math.max(1, end - start)
      const sourceY = Math.round(start * canvasScale)
      const sourceHeight = Math.min(
        fullCanvas.height - sourceY,
        Math.round(sliceHeight * canvasScale),
      )
      if (sourceHeight <= 0) continue

      if (i > 0) pdf.addPage()
      pageCtx.save()
      pageCtx.fillStyle = '#ffffff'
      pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      pageCtx.drawImage(
        fullCanvas,
        0,
        sourceY,
        fullCanvas.width,
        sourceHeight,
        0,
        0,
        pageCanvas.width,
        sourceHeight,
      )
      pageCtx.restore()

      pdf.addImage(
        canvasToDataUrl(pageCanvas, isHdMode),
        imageType,
        0,
        0,
        PDF_PAGE_WIDTH_MM,
        PDF_PAGE_HEIGHT_MM,
      )
    }

    pdf.save(filename)
  } catch (err) {
    console.error('PDF export failed:', err)
    alert('导出异常: ' + (err instanceof Error ? err.message : String(err)))
  } finally {
    exportHost.remove()
    exporting.value = false
    
    // 还原样式表
    originalStyles.forEach((item) => {
      item.el.textContent = item.text
    })
  }
}

/* ═══ 智能排版弹窗 ═══ */
function handleSmartLayout() {
  smartLayoutPanelOpen.value = true
}

async function handleSmartLayoutApply(action: string, options?: any) {
  if (!resumeRef.value || smartLayoutRunning.value) return
  smartLayoutRunning.value = true
  smartLayoutSuccess.value = false

  if (smartLayoutTimer) { clearTimeout(smartLayoutTimer); smartLayoutTimer = null }

  // 保存 CSS 快照用于撤销（仅首次）
  const custom = store.getCustomization(store.selectedTemplateKey)
  const currentParams: SmartLayoutParams = {
    pagePaddingY: custom.pagePaddingY ?? 28,
    pagePaddingX: custom.pagePaddingX ?? 24,
    titleMarginTop: custom.titleMarginTop ?? 0,
    titleMarginBottom: custom.titleMarginBottom ?? 8,
    sectionSpacing: custom.sectionSpacing ?? 10,
    lineHeight: custom.lineHeight ?? 1.75,
    fontSize: custom.fontSize ?? 14,
  }
  if (!smartLayoutSnapshot.value) {
    smartLayoutSnapshot.value = { ...currentParams }
  }

  try {
    switch (action) {
      case 'oneclick':
        await handleOneClickLayout()
        break
      
      case 'ai-reduce':
        await handleAIReduce(options?.level)
        break
      
      case 'preset':
        if (options?.params) {
          store.setCustomization(store.selectedTemplateKey, options.params)
        }
        break
    }

    // 最终检查
    await nextTick()
    const finalHeight = resumeRef.value?.scrollHeight ?? 0
    smartLayoutSuccess.value = finalHeight <= A4_HEIGHT
    smartLayoutLabel.value = finalHeight <= A4_HEIGHT ? '已完成' : '内容过多'
  } catch {
    smartLayoutSuccess.value = false
    smartLayoutLabel.value = '操作失败'
  } finally {
    smartLayoutRunning.value = false
    queuePreviewLayoutUpdate()

    smartLayoutTimer = setTimeout(() => {
      smartLayoutLabel.value = '智能排版'
      smartLayoutSuccess.value = false
      smartLayoutTimer = null
    }, 3000)
  }
}

async function handleOneClickLayout() {
  smartLayoutLabel.value = '智能排版中...'
  
  // 阶段一：AI 内容精简
  const config = aiConfig.getConfigForFeature('resumeOptimize')
  if (config.apiToken) {
    const aiResult = await optimizeResumeContent(
      {
        workList: store.workList,
        projectList: store.projectList,
        skills: store.skills,
        selfIntro: store.selfIntro,
      },
      config,
      store.basicInfo.jobTitle || undefined,
    )

    if (aiResult.success && Object.keys(aiResult.optimizedFields).length > 0) {
      if (!smartLayoutContentSnapshot.value) {
        smartLayoutContentSnapshot.value = { ...aiResult.originalFields }
      }
      applyOptimizedFields(store, aiResult.optimizedFields)
      await nextTick()
    }
  }

  // 阶段二：CSS 调整
  await nextTick()
  if (resumeRef.value && resumeRef.value.scrollHeight > A4_HEIGHT) {
    smartLayoutLabel.value = '调整排版...'
    const afterCustom = store.getCustomization(store.selectedTemplateKey)
    const afterParams: SmartLayoutParams = {
      pagePaddingY: afterCustom.pagePaddingY ?? 28,
      pagePaddingX: afterCustom.pagePaddingX ?? 24,
      titleMarginTop: afterCustom.titleMarginTop ?? 0,
      titleMarginBottom: afterCustom.titleMarginBottom ?? 8,
      sectionSpacing: afterCustom.sectionSpacing ?? 10,
      lineHeight: afterCustom.lineHeight ?? 1.75,
      fontSize: afterCustom.fontSize ?? 14,
    }
    const cssResult = await computeSmartLayout(resumeRef.value, A4_HEIGHT, afterParams)
    store.setCustomization(store.selectedTemplateKey, cssResult.optimized)
  }
}

async function handleAIReduce(level: string = 'moderate') {
  smartLayoutLabel.value = 'AI 精简中...'
  
  const config = aiConfig.getConfigForFeature('resumeOptimize')
  if (!config.apiToken) {
    throw new Error('未配置 AI 服务')
  }

  const aiResult = await optimizeResumeContent(
    {
      workList: store.workList,
      projectList: store.projectList,
      skills: store.skills,
      selfIntro: store.selfIntro,
    },
    config,
    store.basicInfo.jobTitle || undefined,
  )

  if (aiResult.success && Object.keys(aiResult.optimizedFields).length > 0) {
    if (!smartLayoutContentSnapshot.value) {
      smartLayoutContentSnapshot.value = { ...aiResult.originalFields }
    }
    applyOptimizedFields(store, aiResult.optimizedFields)
  }
}

function undoSmartLayout() {
  // 恢复 CSS 参数
  if (smartLayoutSnapshot.value) {
    store.setCustomization(store.selectedTemplateKey, smartLayoutSnapshot.value)
    smartLayoutSnapshot.value = null
  }
  // 恢复 AI 修改的内容
  if (smartLayoutContentSnapshot.value) {
    applyOptimizedFields(store, smartLayoutContentSnapshot.value)
    smartLayoutContentSnapshot.value = null
  }
  smartLayoutSuccess.value = false
  smartLayoutLabel.value = '智能排版'
  if (smartLayoutTimer) { clearTimeout(smartLayoutTimer); smartLayoutTimer = null }
  queuePreviewLayoutUpdate()
}
</script>

<template>
  <aside class="preview-panel">
    <section class="preview-top panel-surface">
      <div class="preview-top-main">
        <div class="preview-heading">
          <button class="preview-header-btn" @click="emit('collapse')" title="收起简历预览">
            <h2 class="preview-title">简历预览</h2>
            <div class="collapse-icon">
              <!-- 向右推的箭头动效图标 -->
              <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                <path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </button>
        </div>

        <div class="preview-actions-row">
          <div
            class="export-dropdown"
            @mouseenter="handleLayoutMenuEnter"
            @mouseleave="handleLayoutMenuLeave"
          >
            <button ref="layoutBtnRef" class="customize-trigger" type="button" @click="toggleLayoutMenu">
              <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/>
                <path d="M3 9h18M9 21V9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              <span>基础布局</span>
            </button>
            <Teleport to="body">
              <div 
                v-show="layoutMenuOpen" 
                class="layout-menu" 
                :style="layoutMenuStyle" 
                @click.stop
                @mouseenter="handleLayoutMenuEnter"
                @mouseleave="handleLayoutMenuLeave"
              >
                <div class="layout-group">
                  <span class="group-label">头部排版</span>
                  <div class="segment-control">
                    <div class="segment-btn" :class="{ active: layoutAlign === 'left' }" @click="setLayoutAlign('left')"><span>居左</span></div>
                    <div class="segment-btn" :class="{ active: layoutAlign === 'center' }" @click="setLayoutAlign('center')"><span>居中</span></div>
                    <div class="segment-btn" :class="{ active: layoutAlign === 'right' }" @click="setLayoutAlign('right')"><span>居右</span></div>
                    <div class="segment-btn" :class="{ active: layoutAlign === 'space-between' }" @click="setLayoutAlign('space-between')"><span>平铺</span></div>
                  </div>
                </div>
                <div class="layout-group">
                  <span class="group-label">信息展示</span>
                  <div class="segment-control">
                    <div class="segment-btn" :class="{ active: metaDisplay === 'text' }" @click="setMetaDisplay('text')"><span>文字</span></div>
                    <div class="segment-btn" :class="{ active: metaDisplay === 'icon' }" @click="setMetaDisplay('icon')"><span>图标</span></div>
                    <div class="segment-btn" :class="{ active: metaDisplay === 'pure' }" @click="setMetaDisplay('pure')"><span>纯数据</span></div>
                  </div>
                </div>
                <div class="layout-group">
                  <span class="group-label">头像裁切</span>
                  <div class="segment-control">
                    <div class="segment-btn" :class="{ active: avatarShape === 'rounded' }" @click="setAvatarShape('rounded')"><span>连角</span></div>
                    <div class="segment-btn" :class="{ active: avatarShape === 'circle' }" @click="setAvatarShape('circle')"><span>正圆</span></div>
                    <div class="segment-btn" :class="{ active: avatarShape === 'hidden' }" @click="setAvatarShape('hidden')"><span>隐藏</span></div>
                  </div>
                </div>
                <div class="layout-group">
                  <span class="group-label">项目小标题</span>
                  <div class="segment-control">
                    <div class="segment-btn" :class="{ active: store.showProjectSubtitles }" @click="store.showProjectSubtitles = true"><span>显示</span></div>
                    <div class="segment-btn" :class="{ active: !store.showProjectSubtitles }" @click="store.showProjectSubtitles = false"><span>隐藏</span></div>
                  </div>
                </div>
              </div>
            </Teleport>
          </div>

          <button class="template-trigger" @click="openTemplatePicker">
            <svg class="template-trigger-icon" viewBox="0 0 24 24" fill="none" width="14" height="14">
              <rect x="3" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <rect x="14" y="3" width="7" height="7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <rect x="3" y="14" width="7" height="7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <rect x="14" y="14" width="7" height="7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="template-trigger-label">当前模板</span>
            <span class="template-trigger-name">{{ currentTemplate.name }}</span>
            <span class="template-trigger-arrow">▾</span>
          </button>
          <button class="customize-trigger" type="button" title="自定义模板样式" @click="customizationOpen = true">
            <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>自定义</span>
          </button>
          <div class="smart-layout-group" @mouseenter="handleSmartLayoutEnter" @mouseleave="handleSmartLayoutLeave">
            <button
              ref="smartLayoutBtnRef"
              class="customize-trigger"
              :class="{ 'smart-ok': smartLayoutSuccess }"
              type="button"
              title="自动调整排版，将内容压缩到一页"
              :disabled="smartLayoutRunning"
              @click="smartLayoutPanelOpen = !smartLayoutPanelOpen"
            >
              <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M19 15l3 3-3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>{{ smartLayoutLabel }}</span>
            </button>
            <button v-if="smartLayoutSnapshot" class="smart-undo-btn" type="button" @click="undoSmartLayout">撤销</button>
            <SmartLayoutPanel
              :visible="smartLayoutPanelOpen"
              :btn-rect="smartLayoutBtnRect"
              @close="smartLayoutPanelOpen = false"
              @apply="handleSmartLayoutApply"
              @mouseenter="handleSmartLayoutEnter"
              @mouseleave="handleSmartLayoutLeave"
            />
          </div>

          <div
            ref="exportMenuRef"
            class="export-actions export-dropdown"
            @mouseenter="handleExportTriggerEnter"
            @mouseleave="handleExportMenuLeave"
          >
            <button ref="exportBtnRef" class="btn-export" :disabled="exporting" @click="handleExportTriggerClick">
              <svg class="btn-export-icon" viewBox="0 0 24 24" fill="none" width="14" height="14">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>{{ exporting ? '导出中...' : '导出简历' }}</span>
            </button>
            <Teleport to="body">
              <div 
                v-if="exportMenuOpen && !exporting" 
                class="export-menu" 
                :style="exportMenuStyle"
                @mouseenter="handleExportMenuEnter"
                @mouseleave="handleExportMenuLeave"
              >
                <button class="export-menu-item" @click="exportPDF('hd')">导出高清 PDF</button>
                <button class="export-menu-item" @click="exportPDF('compressed')">导出压缩 PDF</button>
                <button class="export-menu-item" @click="exportPNG">导出 PNG 图片</button>
                <button class="export-menu-item" @click="handleExportMarkdown">导出 Markdown</button>
              </div>
            </Teleport>
          </div>
        </div>
      </div>

    </section>

    <TemplatePickerDialog
      v-model="templatePickerOpen"
      :templates="RESUME_TEMPLATES"
      :selected-key="store.selectedTemplateKey"
      @select="chooseTemplate"
    />

    <TemplateCustomizationPanel
      :visible="customizationOpen"
      @close="customizationOpen = false"
    />

    <div ref="previewViewportRef" class="preview-scroll">
      <div class="paper-wrapper" :style="getPreviewContainerStyle()">
        <div ref="resumeRef" class="paper" :style="getPaperStyle()">
          <component :is="currentTemplateComponent" />
        </div>

        <div v-for="(pos, idx) in getPageLineList()" :key="idx" class="page-line" :style="getPageLineStyle(pos)">
          <span>{{ getPageLineText(idx) }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.preview-panel {
  box-sizing: border-box;
  min-width: 0;
  flex: 1 1 520px;
  height: 100%;
  container-type: inline-size;
  border-left: 1px solid var(--border-color);
  background: transparent;
  padding: 16px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: visible;
}

.preview-top {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-color: var(--border-color);
  background: var(--bg-card);
  box-shadow: none;
  position: relative;
  z-index: 10;
}

.preview-top-main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px 8px;
}

.preview-heading {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
  max-width: 100%;
}

.preview-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}

.preview-header-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  background: transparent;
  border: none;
  padding: 3px 6px 3px 3px;
  margin: -4px 0 0 -4px;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-primary);
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.preview-header-btn:hover {
  background: rgba(43, 123, 184, 0.05);
}

.preview-title {
  display: flex;
  align-items: center;
  margin: 0;
  color: inherit;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
}

.collapse-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(43, 123, 184, 0.08);
  color: var(--accent-blue-600);
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.preview-header-btn:hover .collapse-icon {
  background: var(--accent-blue-500);
  color: #fff;
}

.preview-header-btn:active .collapse-icon {
  background: var(--accent-blue-600);
}

.preview-actions-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  justify-content: flex-end;
  min-width: 0;
  overflow: visible;
  position: relative;
  z-index: 1;
}

.preview-actions-row > .export-dropdown {
  flex: 0 0 auto;
}

.template-trigger,
.customize-trigger,
.btn-export {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.template-trigger {
  flex: 1 1 clamp(132px, 22cqi, 178px);
  min-width: 132px;
  max-width: 178px;
  min-height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-color-strong);
  background: var(--glass-mid);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.template-trigger:hover {
  border-color: var(--accent-blue-500);
  background: var(--bg-card);
}

.template-trigger-icon {
  flex-shrink: 0;
  display: none;
}

.template-trigger-label {
  display: none;
}

.template-trigger-name {
  min-width: 0;
  flex: 1 1 auto;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  max-width: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.template-trigger-arrow {
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1;
}

.customize-trigger {
  flex: 0 0 auto;
  min-width: 0;
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background: var(--glass-low);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.customize-trigger span {
  white-space: nowrap;
}

.customize-trigger:hover {
  border-color: var(--accent-blue-500);
  color: var(--accent-blue-600);
  background: var(--glass-mid);
}

.customize-trigger svg {
  color: inherit;
}

/* ═══ 智能排版 ═══ */
.smart-layout-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  min-width: 0;
  position: relative;
}

.smart-layout-group .customize-trigger.smart-ok {
  border-color: rgba(34, 197, 94, 0.3);
  color: #16a34a;
  background: rgba(34, 197, 94, 0.06);
}

.smart-layout-group .customize-trigger:disabled {
  opacity: 0.6;
  cursor: wait;
}

.smart-undo-btn {
  border: none;
  background: transparent;
  color: var(--accent-red);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  padding: 0 4px;
  white-space: nowrap;
}

.smart-undo-btn:hover {
  text-decoration: underline;
}



.btn-export {
  flex: 0 0 auto;
  border: 1px solid var(--accent-blue-500);
  min-width: 82px;
  min-height: 32px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background: var(--accent-blue-500);
  color: var(--text-inverse);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-export-icon {
  flex-shrink: 0;
  display: none;
}

.btn-export:hover:not(:disabled) {
  border-color: var(--accent-blue-600);
  background: var(--accent-blue-600);
}

.btn-export:disabled {
  opacity: 0.7;
  cursor: wait;
}

.export-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 0;
  margin-left: auto;
  white-space: nowrap;
}

.export-dropdown {
  position: relative;
}

.export-menu {
  position: fixed;
  min-width: 120px;
  width: max-content;
  padding: 6px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

:root[data-theme="dark"] .export-menu {
  background: #1e293b;
}

.export-menu-item {
  width: 100%;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  padding: 10px 10px;
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.export-menu-item:hover {
  background: rgba(43, 123, 184, 0.08);
  color: var(--accent-blue-600);
}

.layout-menu {
  position: fixed;
  width: 220px;
  padding: 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

:root[data-theme="dark"] .layout-menu {
  background: #1e293b;
}

.layout-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

/* 分段选择器 CSS 借用 */
.segment-control {
  display: flex;
  background: var(--gray-100);
  border-radius: 8px;
  padding: 4px;
  gap: 4px;
}
.segment-btn {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  margin: 0;
}
.segment-btn span {
  width: 100%;
  text-align: center;
  padding: 6px 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--gray-600);
  border-radius: 6px;
  transition: all var(--transition-fast);
  white-space: nowrap;
}
.segment-btn:hover span {
  background: rgba(0, 0, 0, 0.03);
}
.segment-btn.active span {
  background: var(--bg-card);
  color: var(--primary-color);
  font-weight: 600;
}

.preview-scroll {
  flex: 1;
  min-width: 0;
  overflow: auto;
  overflow-x: hidden;
  padding: 6px 6px 0;
  border-radius: calc(var(--radius-lg) + 2px);
  border: 1px solid rgba(100, 120, 150, 0.12);
  background: var(--bg-preview);
  box-shadow: none;
  /* 启用硬件加速滚动 */
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.paper-wrapper {
  position: relative;
  margin: 0 auto;
  padding: 4px 0 10px;
  /* 提升为合成层，避免滚动时重绘 */
  will-change: transform;
  transform: translateZ(0);
}

.paper {
  box-sizing: border-box;
  position: absolute;
  top: 0;
  left: 50%;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  box-shadow: none;
  margin-left: calc(-1 * 794px / 2);
  /* GPU 加速缩放渲染 */
  will-change: transform;
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
}

.paper.pdf-exporting {
  box-shadow: none;
  border: 1px solid transparent;
  border-radius: 0;
  min-height: 0 !important;
}

:deep(.paper.pdf-exporting .resume-section),
:deep(.paper.pdf-exporting .entry) {
  page-break-inside: avoid;
  break-inside: avoid;
}

.page-line {
  position: absolute;
  left: 16px;
  right: 16px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  z-index: 2;
  opacity: 0.28;
  transition: opacity var(--transition-fast);
}

.preview-scroll:hover .page-line {
  opacity: 0.72;
}

.page-line::before,
.page-line::after {
  content: '';
  flex: 1;
  height: 1px;
  border-top: 1px dashed rgba(43, 123, 184, 0.48);
}

.page-line span {
  color: var(--accent-blue-600);
  font-size: 10px;
  font-weight: 700;
  background: var(--glass-high);
  padding: 0 6px;
  border-radius: var(--radius-full);
}

@container (max-width: 760px) {
  .preview-actions-row {
    justify-content: flex-start;
  }
}

@container (max-width: 720px) {
  .preview-top {
    padding: 12px;
  }

  .template-trigger {
    flex-basis: 132px;
    min-width: 126px;
    max-width: 150px;
    justify-content: flex-start;
  }

  .template-trigger-name {
    max-width: none;
  }
}

/* 空间变窄时隐藏按钮文字，只显示图标 */
@container (max-width: 680px) {
  /* 隐藏自定义按钮的文字 */
  .customize-trigger span {
    display: none;
  }

  /* 隐藏模板触发器的名称和箭头，显示图标 */
  .template-trigger-name,
  .template-trigger-arrow {
    display: none;
  }

  .template-trigger-icon {
    display: block;
  }

  /* 调整模板触发器样式 */
  .template-trigger {
    flex: 0 0 auto;
    min-width: auto;
    max-width: auto;
    padding: 0 8px;
  }

  /* 调整智能排版组 */
  .smart-layout-group .customize-trigger span {
    display: none;
  }
}

@container (max-width: 580px) {
  /* 隐藏导出按钮的文字，只显示图标 */
  .btn-export span {
    display: none;
  }

  .btn-export-icon {
    display: block;
  }

  .btn-export {
    min-width: auto;
    padding: 0 8px;
  }

  /* 进一步压缩间距 */
  .preview-actions-row {
    gap: 2px;
  }

  .customize-trigger,
  .template-trigger {
    padding: 0 6px;
    min-height: 28px;
  }
}

@container (max-width: 520px) {
  .preview-panel {
    padding: 10px;
  }

  .preview-top {
    gap: 8px;
    padding: 10px;
  }

  .preview-header-btn {
    padding-right: 8px;
  }

  .preview-title {
    font-size: 17px;
  }

  .smart-undo-btn {
    padding: 0 2px;
  }
}
</style>
