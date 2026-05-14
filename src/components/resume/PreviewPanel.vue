<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useResumeStore } from '@/stores/resume'
import TemplatePickerDialog from '@/components/resume/TemplatePickerDialog.vue'
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
const templatePickerOpen = ref(false)
const customizationOpen = ref(false)
const layoutMenuOpen = ref(false)
const smartLayoutRunning = ref(false)
const smartLayoutSuccess = ref(false)
const smartLayoutLabel = ref('智能排版')
const smartLayoutSnapshot = ref<SmartLayoutParams | null>(null)
const smartLayoutContentSnapshot = ref<Record<string, string> | null>(null)
let smartLayoutTimer: ReturnType<typeof setTimeout> | null = null

const A4_WIDTH = 794
const A4_RATIO = 297 / 210
const A4_HEIGHT = Math.round(A4_WIDTH * A4_RATIO)
const PREVIEW_HORIZONTAL_PADDING = 24
const pageBreaks = ref<number[]>([])
const previewScale = ref(1)
const scaledPaperWidth = computed(() => Math.round(A4_WIDTH * previewScale.value))
const scaledPaperHeight = computed(() => Math.round(A4_HEIGHT * previewScale.value))
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
const scaledPageBreaks = computed(() => pageBreaks.value.map((pos) => Math.round(pos * previewScale.value)))

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

function getPreviewBadgeText() {
  return `${pageBreaks.value.length + 1} 页 / ${Math.round(previewScale.value * 100)}%`
}

const fallbackTemplate: ResumeTemplateDefinition = getResumeTemplateByKey('default')
const currentTemplate = computed<ResumeTemplateDefinition>(
  () => getResumeTemplateByKey(store.selectedTemplateKey) ?? fallbackTemplate
)
const currentTemplateComponent = computed(() => currentTemplate.value.component)
const a4TemplateLabel = computed(() => `A4 / ${currentTemplate.value.name}`)

function updatePageBreaks() {
  if (!resumeRef.value) return
  const contentHeight = resumeRef.value.scrollHeight
  const pageHeight = Math.round((resumeRef.value.clientWidth || A4_WIDTH) * A4_RATIO)
  const breaks: number[] = []
  const totalPages = Math.max(1, Math.ceil((contentHeight - 1) / pageHeight))
  for (let i = 1; i < totalPages; i += 1) {
    breaks.push(Math.round(i * pageHeight))
  }
  pageBreaks.value = breaks
}

function openTemplatePicker() {
  templatePickerOpen.value = true
  exportMenuOpen.value = false
}

function chooseTemplate(key: ResumeTemplateKey) {
  store.setTemplate(key)
  templatePickerOpen.value = false
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
  exportPDF('hd')
}

function handleExportTriggerEnter() {
  if (exporting.value) return
  exportMenuOpen.value = true
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
    const html2pdfModule = await import('html2pdf.js')
    const html2pdf = html2pdfModule.default || html2pdfModule
    
    const filename = `${store.basicInfo.name || '简历'}_resume.pdf`
    const exportScale = isHdMode ? Math.min(4, Math.max(3, window.devicePixelRatio || 1)) : 2

    const options = {
      margin: 0,
      filename,
      image: {
        type: isHdMode ? 'png' : 'jpeg',
        quality: isHdMode ? 1 : 0.92,
      },
      html2canvas: {
        scale: exportScale,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: A4_WIDTH,
        windowWidth: A4_WIDTH,
        scrollX: 0,
        scrollY: 0,
        logging: false,
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      },
      pagebreak: {
        mode: ['css', 'legacy'],
      },
    }

    await html2pdf().set(options as any).from(exportNode).save()
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

/* ═══ 智能排版（AI 内容精简 + CSS 保守微调） ═══ */
async function handleSmartLayout() {
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
    // ═══ 阶段一：AI 内容精简（如果有 AI 配置） ═══
    const config = aiConfig.getConfigForFeature('resumeOptimize')
    if (config.apiToken) {
      smartLayoutLabel.value = '智能排版中...'

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
        // 保存原始内容快照（仅首次）
        if (!smartLayoutContentSnapshot.value) {
          smartLayoutContentSnapshot.value = { ...aiResult.originalFields }
        }
        applyOptimizedFields(store, aiResult.optimizedFields)

        // 等待 Vue 重渲染
        await nextTick()
      }
    }

    // ═══ 阶段二：CSS 保守微调 ═══
    // 检查 AI 优化后是否仍溢出
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

    // 最终检查
    await nextTick()
    const finalHeight = resumeRef.value?.scrollHeight ?? 0
    smartLayoutSuccess.value = finalHeight <= A4_HEIGHT
    smartLayoutLabel.value = finalHeight <= A4_HEIGHT ? '已优化为一页' : '内容过多'
  } catch {
    smartLayoutSuccess.value = false
    smartLayoutLabel.value = '排版失败'
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
          <div class="preview-meta-row">
            <span class="a4-badge">{{ a4TemplateLabel }}</span>
            <span class="preview-scale-badge">{{ getPreviewBadgeText() }}</span>
          </div>
        </div>

        <div class="preview-actions-row">
          <div
            class="export-dropdown"
            @mouseenter="layoutMenuOpen = true"
            @mouseleave="layoutMenuOpen = false"
          >
            <button class="customize-trigger" type="button" @click="layoutMenuOpen = !layoutMenuOpen">
              <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/>
                <path d="M3 9h18M9 21V9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              <span>基础布局</span>
            </button>
            <div v-show="layoutMenuOpen" class="layout-menu" @click.stop>
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
          </div>

          <button class="template-trigger" @click="openTemplatePicker">
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
          <div class="smart-layout-group">
            <button
              class="customize-trigger"
              :class="{ 'smart-ok': smartLayoutSuccess }"
              type="button"
              title="自动调整排版，将内容压缩到一页"
              :disabled="smartLayoutRunning"
              @click="handleSmartLayout"
            >
              <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M19 15l3 3-3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>{{ smartLayoutLabel }}</span>
            </button>
            <button v-if="smartLayoutSnapshot" class="smart-undo-btn" type="button" @click="undoSmartLayout">撤销</button>
          </div>

          <div
            ref="exportMenuRef"
            class="export-actions export-dropdown"
            @mouseenter="handleExportTriggerEnter"
            @mouseleave="exportMenuOpen = false"
          >
            <button class="btn-export" :disabled="exporting" @click="handleExportTriggerClick">
              {{ exporting ? '导出中...' : '导出简历' }}
            </button>
            <div v-if="exportMenuOpen && !exporting" class="export-menu">
              <button class="export-menu-item" @click="exportPDF('hd')">导出高清 PDF</button>
              <button class="export-menu-item" @click="exportPDF('compressed')">导出压缩 PDF</button>
              <button class="export-menu-item" @click="exportPNG">导出 PNG 图片</button>
              <button class="export-menu-item" @click="handleExportMarkdown">导出 Markdown</button>
            </div>
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
  border-left: 1px solid var(--border-color);
  background: transparent;
  padding: 16px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.preview-top {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.preview-top-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.preview-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.preview-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}

.preview-scale-badge {
  min-height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background: rgba(43, 123, 184, 0.1);
  border: 1px solid rgba(43, 123, 184, 0.18);
  color: var(--accent-blue-600);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.preview-header-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  padding: 4px 12px 4px 4px;
  margin: -4px 0 0 -4px;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-primary);
  transition: all 0.2s ease;
}

.preview-header-btn:hover {
  background: rgba(43, 123, 184, 0.05);
}

.preview-title {
  display: flex;
  align-items: center;
  margin: 0;
  color: inherit;
  font-size: 20px;
  font-weight: 700;
}

.collapse-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(43, 123, 184, 0.08);
  color: var(--accent-blue-600);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease, box-shadow 0.2s ease;
}

.preview-header-btn:hover .collapse-icon {
  background: var(--accent-blue-500);
  color: #fff;
  transform: translateX(4px);
  box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);
}

.preview-header-btn:active .collapse-icon {
  transform: translateX(2px) scale(0.95);
}

.preview-meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}


.preview-actions-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.template-trigger,
.customize-trigger,
.btn-export {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease;
}

.template-trigger {
  min-height: 40px;
  padding: 0 14px 0 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-color-strong);
  background: var(--glass-mid);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}

.template-trigger:hover,
.customize-trigger:hover {
  transform: translateY(-1px);
}

.template-trigger:hover {
  border-color: var(--accent-blue-500);
  background: var(--bg-card);
  box-shadow: 0 8px 18px rgba(36, 29, 24, 0.08);
}

.template-trigger-label {
  height: 22px;
  padding: 0 8px;
  border-radius: var(--radius-full);
  background: rgba(43, 123, 184, 0.12);
  color: var(--accent-blue-600);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
}

.template-trigger-name {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.template-trigger-arrow {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1;
}

.customize-trigger {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background: var(--glass-low);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
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



.a4-badge {
  min-height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background: var(--glass-low);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.btn-export {
  border: none;
  min-height: 40px;
  padding: 0 16px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--accent-blue-500), var(--accent-blue-600));
  color: var(--text-inverse);
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 12px 22px rgba(54, 80, 111, 0.22);
}

.btn-export:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn-export:disabled {
  opacity: 0.7;
  cursor: wait;
}

.export-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.export-dropdown {
  position: relative;
}

.export-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 156px;
  padding: 6px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
  z-index: 12;
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
  transition: background-color 0.12s ease, color 0.12s ease;
}

.export-menu-item:hover {
  background: rgba(43, 123, 184, 0.08);
  color: var(--accent-blue-600);
}

.layout-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 260px;
  padding: 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-xl);
  z-index: 12;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  transition: all 0.2s;
  white-space: nowrap;
}
.segment-btn:hover span {
  background: rgba(0, 0, 0, 0.03);
}
.segment-btn.active span {
  background: var(--bg-card);
  color: var(--primary-color);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
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
  background:
    linear-gradient(180deg, var(--glass-minimal), var(--glass-minimal)),
    linear-gradient(180deg, rgba(234, 239, 246, 0.56), rgba(228, 234, 244, 0.24));
  box-shadow: inset 0 1px 0 var(--glass-border);
  /* 启用硬件加速滚动 */
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  contain: strict;
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
  box-shadow: 0 22px 42px rgba(30, 42, 60, 0.14);
  margin-left: calc(-1 * 794px / 2);
  /* GPU 加速缩放渲染 */
  will-change: transform;
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
}

.paper.pdf-exporting {
  box-shadow: none;
  border: none;
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
  transform: translateY(-6px);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  z-index: 2;
  opacity: 0.28;
  transition: opacity 0.2s ease;
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

@container (max-width: 980px) {
  .preview-top-main {
    flex-direction: column;
  }

  .preview-actions-row {
    justify-content: flex-start;
  }
}
</style>
