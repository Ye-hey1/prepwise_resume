<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { useAiConfigStore, isVisionModel, SILICONFLOW_FREE_MODELS } from '@/stores/aiConfig'
import { useResumeStore } from '@/stores/resume'
import {
  extractTextFromFile,
  extractTextFromPdf,
  extractVisionImagesFromFile,
  extractTextWithLocalOCR,
  extractTextFromImagesWithOCR,
  renderPdfPagesToImages,
  isImageFile,
  isPdfFile,
  supportsResumeParseFile,
} from '@/services/fileParser'
import {
  parseResumeWithVisionAI,
  parseResumeWithAI,
  parseResumeWithMixedAI,
  isVisionUnsupportedError,
  convertMarkdownFields,
  type ImportData
} from '@/services/aiImportService'
import AiConfigDialog from '@/components/ai/AiConfigDialog.vue'

// -------- 类型定义 --------
type Phase = 'upload' | 'parsing' | 'done' | 'error'

interface ResumeImportPayload {
  basicInfo?: Partial<typeof store.basicInfo>
  educationList?: typeof store.educationList
  skills?: string
  workList?: typeof store.workList
  projectList?: typeof store.projectList
  awardList?: typeof store.awardList
  selfIntro?: string
}

// -------- Store & Router --------
const router = useRouter()
const aiConfig = useAiConfigStore()
const store = useResumeStore()

// -------- 响应式状态 --------
const showConfig = ref(false)
const phase = ref<Phase>('upload')
const selectedFile = ref<File | null>(null)
const isDragging = ref(false)
const statusText = ref('')
const progressPercent = ref(0)
const errorMessage = ref('')
const parsedData = shallowRef<ImportData | null>(null)
const rawStreamText = ref('')
const parseModeLabel = ref('')
const validationWarnings = ref<string[]>([])
const consoleBodyRef = ref<HTMLElement | null>(null)

// 左栏预览相关
const filePreviewUrls = ref<string[]>([])
const filePreviewText = ref('')
const filePreviewType = ref<'image' | 'pdf' | 'text' | null>(null)

// 右栏编辑状态
const editingField = ref<string | null>(null)
const editingValue = ref('')

// -------- 局部模型选择增强状态 --------
const showLocalModelSelector = ref(false)
const localSearchText = ref('')
const localSelectorRef = ref<HTMLElement | null>(null)

// -------- 局部模型选择（多渠道适配） --------
const localOverrideVisible = computed({
  get: () => {
    const over = aiConfig.modelOverrides.resumeImport
    return over ? `${over.channelId}|${over.modelId}` : ''
  },
  set: (val: string) => {
    if (!val) {
      aiConfig.updateModelOverride('resumeImport', '', '')
    } else {
      const parts = val.split('|')
      if (parts.length === 2) {
        aiConfig.updateModelOverride('resumeImport', parts[0] as string, parts[1] as string)
      }
    }
  }
})

// 获取所有可选模型并平铺
const allModelsList = computed(() => {
  const result: Array<{ chId: string, chName: string, modelId: string, isFree: boolean, isVision: boolean }> = []
  
  const channels = (aiConfig.channels || []).filter(c => c.enabled !== false)
  channels.forEach(ch => {
    const models = ch.fetchedModels || []
    models.forEach(m => {
      const isFree = ch.providerId === 'siliconflow' 
        ? (SILICONFLOW_FREE_MODELS?.includes(m) || m.toLowerCase().includes('free'))
        : m.toLowerCase().endsWith(':free')
        
      result.push({
        chId: ch.id,
        chName: ch.name,
        modelId: m || 'unknown',
        isFree: !!isFree,
        isVision: isVisionModel(m)
      })
    })
  })
  
  return result
})

const filteredLocalModels = computed(() => {
  const search = localSearchText.value.toLowerCase().trim()
  const list = allModelsList.value
  
  const filtered = search 
    ? list.filter(m => m.modelId.toLowerCase().includes(search) || m.chName.toLowerCase().includes(search))
    : list

  // 按渠道分组
  const groups: Record<string, typeof list> = {}
  filtered.forEach(m => {
    const name = m.chName
    if (!groups[name]) {
      groups[name] = []
    }
    groups[name]!.push(m)
  })
  
  return groups
})

const currentSelectedModelName = computed(() => {
  const over = aiConfig.modelOverrides.resumeImport
  return over ? over.modelId : '跟随默认'
})

function selectLocalModel(chId: string, modelId: string) {
  if (!chId || !modelId) {
    aiConfig.updateModelOverride('resumeImport', '', '')
  } else {
    aiConfig.updateModelOverride('resumeImport', chId, modelId)
  }
  showLocalModelSelector.value = false
  localSearchText.value = ''
}

// 视觉渠道过滤（非 UI 相关，仅逻辑使用）
const visionChannels = computed(() => {
  return aiConfig.channels
    .map(ch => ({
      ...ch,
      fetchedModels: ch.fetchedModels.filter(isVisionModel),
    }))
    .filter(ch => ch.fetchedModels.length > 0)
})

// 点击外部关闭
onMounted(() => {
  const handleClickOutside = (e: MouseEvent) => {
    if (localSelectorRef.value && !localSelectorRef.value.contains(e.target as Node)) {
      showLocalModelSelector.value = false
    }
  }
  window.addEventListener('mousedown', handleClickOutside)
  onUnmounted(() => window.removeEventListener('mousedown', handleClickOutside))
})

// 选择性应用状态
const selectedApplyModules = ref<string[]>([
  'basicInfo', 'educationList', 'workList', 'projectList', 'skills', 'awardList', 'selfIntro'
])

let abortController: AbortController | null = null
let parseGeneration = 0 // 用于检测取消后的过期回调

// -------- 计算属性 --------
const hasExistingData = computed(() => {
  return !!(
    store.basicInfo?.name ||
    store.basicInfo?.phone ||
    (store.workList?.length || 0) > 0 ||
    (store.educationList?.length || 0) > 0 ||
    (store.projectList?.length || 0) > 0
  )
})

const moduleStats = computed(() => {
  const data = parsedData.value
  if (!data) return null
  return {
    basicInfo: data.basicInfo?.name ? 1 : 0,
    education: data.educationList?.length ?? 0,
    work: data.workList?.length ?? 0,
    project: data.projectList?.length ?? 0,
    skills: 1, // 始终显示专业技能框，方便 AI 总结展示喵
    awards: data.awardList?.length ?? 0,
    selfIntro: 1, // 始终显示个人简介框喵
  }
})

// -------- 文件处理 --------
function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) validateAndSelect(file)
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) validateAndSelect(file)
  input.value = ''
}

async function validateAndSelect(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!supportsResumeParseFile(file)) {
    errorMessage.value = `不支持的文件格式: .${ext}，请上传 PDF、DOCX、DOC、TXT、MD 或图片文件`
    return
  }

  errorMessage.value = ''
  selectedFile.value = file

  // 生成左栏预览
  await generatePreview(file)
}

async function generatePreview(file: File) {
  filePreviewUrls.value = []
  filePreviewText.value = ''
  filePreviewType.value = null

  try {
    if (isImageFile(file)) {
      filePreviewType.value = 'image'
      const url = await readFileAsDataUrl(file)
      filePreviewUrls.value = [url]
    } else if (isPdfFile(file)) {
      filePreviewType.value = 'pdf'
      // 渲染 PDF 页面为图片用于预览
      const images = await renderPdfPagesToImages(file, 3)
      filePreviewUrls.value = images
    } else {
      // TXT / DOCX / MD → 显示纯文本
      filePreviewType.value = 'text'
      const text = await extractTextFromFile(file)
      filePreviewText.value = text
    }
  } catch {
    // 预览失败不阻塞流程
    filePreviewType.value = 'text'
    filePreviewText.value = '（预览加载失败，不影响解析）'
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

function handleReselect() {
  selectedFile.value = null
  filePreviewUrls.value = []
  filePreviewText.value = ''
  filePreviewType.value = null
  errorMessage.value = ''
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// -------- AI 解析 --------
function getImportCallbacks(aiPhasePercent: number) {
  const gen = parseGeneration
  const isStale = () => gen !== parseGeneration

  return {
    onChunk(text: string) {
      if (isStale()) return
      rawStreamText.value = text
      
      if (consoleBodyRef.value) {
        nextTick(() => {
          if (consoleBodyRef.value) {
            consoleBodyRef.value.scrollTop = consoleBodyRef.value.scrollHeight
          }
        })
      }
      
      const progressMatch = text.match(/\((\d+)%\)|\s(\d+)%\]/)
      if (progressMatch) {
        const progress = Number(progressMatch[1] || progressMatch[2] || aiPhasePercent)
        progressPercent.value = Math.min(progress, 96)
        const labelMatch = text.match(/^\[([^\]\n]+?)(?:\s\d+%)?\]/)
        if (labelMatch?.[1]) {
          statusText.value = `AI 正在提取${labelMatch[1]}...`
        }
        return
      }
      progressPercent.value = Math.min(aiPhasePercent + Math.floor(text.length / 100), 92)
    },
    onDone(data: ImportData) {
      if (isStale()) return
      parsedData.value = data
      progressPercent.value = 100
      statusText.value = '解析完成'
      setTimeout(() => {
        if (!isStale()) phase.value = 'done'
      }, 300)
    },
    onError(msg: string) {
      if (isStale()) return
      phase.value = 'error'
      errorMessage.value = msg
    },
    onWarnings(warnings: string[]) {
      if (isStale()) return
      validationWarnings.value = warnings
    },
  }
}

/** 解析文本路径使用的模型配置：优先使用 resumeImport override（非视觉模型时），否则用 default */
function resolveTextModelConfig() {
  const override = aiConfig.modelOverrides.resumeImport
  if (override?.modelId && !isVisionModel(override.modelId)) {
    return { ...aiConfig.getConfigForFeature('resumeImport') }
  }
  return { ...aiConfig.getConfigForFeature('default') }
}

async function parseWithText(file: File) {
  parseModeLabel.value = '文本解析'
  statusText.value = '正在提取文本内容...'
  progressPercent.value = 10

  const text = await extractTextFromFile(file)
  if (!text.trim()) {
    throw new Error('文件中未检测到可解析文本，请确认文件内容是否完整，或改用图片 / 扫描版 PDF 重新解析。')
  }

  progressPercent.value = 30
  statusText.value = 'AI 正在分析简历文本...'
  await parseResumeWithAI(
    resolveTextModelConfig(),
    text,
    getImportCallbacks(30),
    abortController?.signal,
  )
}

async function parseWithVision(file: File, reason?: string) {
  parseModeLabel.value = '视觉解析'
  statusText.value = reason ? `正在准备内容（${reason}）...` : '正在准备图片内容...'
  progressPercent.value = 18

  const imageUrls = await extractVisionImagesFromFile(file)

  // 1. 获取当前简历导入配置
  const importConfig = aiConfig.getConfigForFeature('resumeImport')
  
  // 第一决策：直接冲视觉解析 (不再判断 isVisionModel，大模型万一升级了呢喵~)
  try {
    progressPercent.value = 30
    statusText.value = '正在解析中...'
    
    // 执行单步视觉结构化
    await parseResumeWithVisionAI(
      importConfig,
      imageUrls,
      getImportCallbacks(30),
      abortController?.signal,
    )
    return // 成功起飞，直接结束
  } catch (err: unknown) {
    const errStr = String(err).toLowerCase()
    // 用户主动取消，乖乖停下
    if (errStr.includes('abort') || abortController?.signal.aborted) {
      throw err
    }

    // 关键检测：如果报错是因为“此模型不支持视觉能力”
    if (isVisionUnsupportedError(errStr)) {
      console.warn('捕获到模型不支持视觉输入，正在执行静默降级到 OCR...')
      // 提示稍微变一下，但千万不要报红错喵！
      parseModeLabel.value = '自适应降级'
      statusText.value = '正在切换到本地 OCR 托底识别模式...'
      await new Promise(resolve => setTimeout(resolve, 1200)) // 稍微停一下让用户看清状态切换
    } else {
      // 真正的其他错误（网络、Token 等），该报错还是要报的
      throw err
    }
  }

  if (abortController?.signal.aborted) return

  // 2. 本地 OCR 托底逻辑 (只有当模型不支持视觉或没配置时才会走到这喵)
  parseModeLabel.value = '本地 OCR 提取'
  statusText.value = '正在使用本地 OCR 提取文字 (首次可能需要下载语言包)...'
  progressPercent.value = 40

  let extractedText = ''
  try {
    extractedText = await extractTextFromImagesWithOCR(imageUrls, (progress, status) => {
      if (abortController?.signal.aborted) return
      statusText.value = status || '正在本地 OCR 识别文字...'
      progressPercent.value = 40 + Math.floor(progress * 0.25)
    })
  } catch (err) {
    if (abortController?.signal.aborted) return
    throw new Error(`本地 OCR 提取文字失败喵: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (abortController?.signal.aborted) return

  if (!extractedText.trim()) {
    throw new Error('当前图片无法识别出任何文字，解析终止。请更换更清晰的图片预览喵~')
  }

  // 3. 将 OCR 获取到的文本喂给纯文本逻辑
  parseModeLabel.value = '文本大模型解析'
  progressPercent.value = 70
  statusText.value = '正在对 OCR 识别出的文字进行最后结构化处理...'

  await parseResumeWithAI(
    resolveTextModelConfig(),
    extractedText,
    getImportCallbacks(70),
    abortController?.signal,
  )
}

function normalizeImportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return '网络连接失败，无法访问 AI 服务。请检查接口地址、网络状态或跨域配置后重试。'
  }
  if (lower.includes('timeout')) {
    return '解析超时，可能是文件较大或 AI 服务响应较慢，请稍后重试。'
  }
  if (lower.includes('invalid api key') || lower.includes('unauthorized') || lower.includes('authentication')) {
    return 'AI 配置校验失败，请检查 API Token、接口地址和模型名称是否正确。'
  }
  return message
}

async function startParsing() {
  if (!selectedFile.value) return

  parseGeneration++ // 使之前未完成的回调失效
  phase.value = 'parsing'
  rawStreamText.value = ''
  parsedData.value = null
  errorMessage.value = ''
  abortController = new AbortController()

  try {
    if (isImageFile(selectedFile.value)) {
      // 图片文件：默认尝试视觉模型解析，失败则自动降级到 OCR
      await parseWithVision(selectedFile.value)
      return
    }

    if (isPdfFile(selectedFile.value)) {
      parseModeLabel.value = 'PDF 检测'
      statusText.value = '正在提取 PDF 文本内容...'
      progressPercent.value = 8
      const pdfResult = await extractTextFromPdf(selectedFile.value)

      // 策略：有多少文本就用多少，不做"扫描版/文本版"二分判断
      if (pdfResult.text.trim()) {
        parseModeLabel.value = '文本解析'
        progressPercent.value = 28
        statusText.value = `提取到 ${pdfResult.pageCount} 页 PDF 内容，AI 正在结构化...`
        await parseResumeWithAI(
          resolveTextModelConfig(),
          pdfResult.text,
          getImportCallbacks(28),
          abortController.signal,
        )
        return
      }

      // 完全提取不到任何文本 → 直接使用视觉或 OCR 流程处理图片内容
      await parseWithVision(selectedFile.value, 'PDF 中未提取到文本，自动改用图片识别')
      return
    }

    await parseWithText(selectedFile.value)
  } catch (err: unknown) {
    if (abortController?.signal.aborted) return
    phase.value = 'error'
    errorMessage.value = normalizeImportError(err)
  }
}

function cancelParsing() {
  parseGeneration++ // 使正在进行的回调全部失效
  abortController?.abort()
  abortController = null
  phase.value = 'upload'
  statusText.value = ''
  progressPercent.value = 0
  rawStreamText.value = ''
  parseModeLabel.value = ''
}

function resetAll() {
  phase.value = 'upload'
  selectedFile.value = null
  filePreviewUrls.value = []
  filePreviewText.value = ''
  filePreviewType.value = null
  errorMessage.value = ''
  parsedData.value = null
  rawStreamText.value = ''
  progressPercent.value = 0
  statusText.value = ''
  parseModeLabel.value = ''
  validationWarnings.value = []
  editingField.value = null
  abortController = null
}

function reParse() {
  parsedData.value = null
  rawStreamText.value = ''
  progressPercent.value = 0
  statusText.value = ''
  parseModeLabel.value = ''
  validationWarnings.value = []
  editingField.value = null
  startParsing()
}

// -------- 字段编辑 --------
function startEditing(fieldPath: string, currentValue: string) {
  editingField.value = fieldPath
  editingValue.value = currentValue
}

function saveEditing(fieldPath: string) {
  if (!parsedData.value) return
  // 深度克隆以保证可以直接修改嵌套的内容并触发响应式
  const data = JSON.parse(JSON.stringify(parsedData.value))

  const parts = fieldPath.split('.')
  let current: any = data
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (p) current = current[p]
  }
  const lastPart = parts[parts.length - 1]
  if (current && lastPart) {
    current[lastPart] = editingValue.value
  }

  parsedData.value = data as ImportData
  editingField.value = null
}

function cancelEditing() {
  editingField.value = null
  editingValue.value = ''
}

// -------- 应用到简历 --------
function applyToResume() {
  if (!parsedData.value) return

  if (hasExistingData.value) {
    if (!window.confirm('解析结果将被合并到当前已有的简历数据中，相同模块将被覆盖，是否继续？')) return
  }

  // 构造被选中的部分作为 Payload
  const payload: Partial<ImportData> = {}
  for (const mod of selectedApplyModules.value) {
    if (parsedData.value[mod as keyof ImportData] !== undefined) {
      payload[mod as keyof ImportData] = parsedData.value[mod as keyof ImportData] as any
    }
  }

  // 在最后一步应用到简历前，将 Markdown 转换为 HTML (此时才是简历渲染需要的格式喵)
  const convertedPayload = convertMarkdownFields(JSON.parse(JSON.stringify(payload)))

  // 直接调用 importData 进行局部注入
  store.importData(convertedPayload as ResumeImportPayload)

  const importedSummary = [
    payload.basicInfo?.name ? `已识别 ${payload.basicInfo.name}` : (selectedApplyModules.value.length > 0 ? '已应用部分解析' : '未应用任何解析'),
    payload.workList?.length ? `工作 ${payload.workList.length} 段` : '',
    payload.projectList?.length ? `项目 ${payload.projectList.length} 个` : '',
    payload.educationList?.length ? `教育 ${payload.educationList.length} 段` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  store.showImportFeedback(`${importedSummary}，内容已回填到编辑区。`)
  router.push('/')
}

// -------- 清理 --------
onUnmounted(() => {
  abortController?.abort()
})
</script>

<template>
  <div class="import-panel">
    <AiConfigDialog v-if="showConfig" @close="showConfig = false" />

    <!-- ====== 左栏：原始简历 ====== -->
    <div class="panel-left">
      <div class="panel-header">
        <div class="panel-header-left">
          <div class="panel-header-icon">
            <svg viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          </div>
          <h2 class="panel-title">原始简历</h2>
        </div>
        <div class="header-actions" v-if="selectedFile">
          <button class="btn-outline btn-sm" @click="handleReselect">重新选择</button>
          <button
            class="btn-primary btn-sm"
            :disabled="phase === 'parsing'"
            @click="startParsing"
          >
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>
            开始解析
          </button>
        </div>
      </div>

      <div class="panel-body">
        <!-- 未上传：拖拽区 -->
        <div
          v-if="!selectedFile"
          class="drop-zone"
          :class="{ dragging: isDragging }"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
        >
          <div class="drop-zone-content">
            <div class="drop-icon-wrapper">
              <svg class="drop-icon" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p class="drop-text">拖拽简历文件到此处</p>
            <p class="drop-subtext">或点击下方按钮选择文件</p>
            <div class="format-tags">
              <span class="format-tag">PDF</span>
              <span class="format-tag">DOCX</span>
              <span class="format-tag">TXT</span>
              <span class="format-tag">MD</span>
              <span class="format-tag">JPG</span>
              <span class="format-tag">PNG</span>
              <span class="format-tag">WEBP</span>
            </div>
            <label class="upload-btn">
              选择文件
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt,.md,.jpg,.jpeg,.png,.webp"
                class="hidden-input"
                @change="handleFileInput"
              />
            </label>
          </div>
          <input
            type="file"
            accept=".pdf,.docx,.doc,.txt,.md,.jpg,.jpeg,.png,.webp"
            class="drop-zone-input"
            @change="handleFileInput"
          />
        </div>

        <!-- 已上传：预览 -->
        <div v-else class="preview-area">
          <!-- 图片 / PDF 渲染 预览 -->
          <div v-if="filePreviewType === 'image' || filePreviewType === 'pdf'" class="image-preview-scroll">
            <img
              v-for="(url, idx) in filePreviewUrls"
              :key="idx"
              :src="url"
              :alt="`预览第 ${idx + 1} 页`"
              class="preview-image"
            />
          </div>

          <!-- 文本预览 -->
          <div v-else-if="filePreviewType === 'text'" class="text-preview-scroll">
            <pre class="text-preview-content">{{ filePreviewText }}</pre>
          </div>

          <!-- 加载中 -->
          <div v-else class="preview-loading">
            <div class="loading-spinner"></div>
            <p>正在加载预览...</p>
          </div>
        </div>

        <p v-if="errorMessage && phase === 'upload'" class="error-text">{{ errorMessage }}</p>
      </div>

      <!-- 左栏底部操作 -->
      <div v-if="selectedFile" class="panel-footer panel-footer-left">
        <div class="file-info-bar">
          <svg class="file-icon-sm" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span class="file-name-text">{{ selectedFile.name }}</span>
          <span class="file-size-text">{{ formatFileSize(selectedFile.size) }}</span>
        </div>
      </div>
    </div>

    <!-- ====== 右栏：结构化数据 ====== -->
    <div class="panel-right">
      <div class="panel-header">
        <div class="panel-header-left">
          <div class="panel-header-icon panel-header-icon--result">
            <svg viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /></svg>
          </div>
          <h2 class="panel-title">结构化数据</h2>
        </div>
        <div class="header-actions">
          <span v-if="phase === 'done'" class="done-badge">✓ 解析完成</span>
          
          <div class="local-model-selector" v-if="aiConfig.isConfigured" ref="localSelectorRef">
            <span class="local-model-label">模型选择:</span>
            
            <div 
              class="local-model-trigger" 
              :class="{ 'is-active': showLocalModelSelector }"
              @click="showLocalModelSelector = !showLocalModelSelector"
            >
              <span class="trigger-text">{{ currentSelectedModelName }}</span>
              <span class="trigger-icon-sm">▼</span>
            </div>

            <!-- 弹出层 -->
            <transition name="pop-fast">
              <div v-if="showLocalModelSelector" class="local-model-popover">
                <div class="local-popover-search">
                  <input 
                    v-model="localSearchText" 
                    placeholder="搜索模型..." 
                    class="local-search-input"
                    @click.stop
                    autofocus
                  />
                </div>
                <div class="local-popover-items custom-scrollbar">
                  <div 
                    class="local-popover-item" 
                    :class="{ active: !aiConfig.modelOverrides.resumeImport }"
                    @click="selectLocalModel('', '')"
                  >
                    <div class="local-item-content">
                      <span class="local-item-name">跟随默认</span>
                      <span class="local-item-ch">使用全局设置中的主模型</span>
                    </div>
                  </div>
                  
                  <template v-for="(models, chName) in filteredLocalModels" :key="chName">
                    <div class="local-group-header">{{ chName }}</div>
                    <div 
                      v-for="m in models" 
                      :key="`${m.chId}|${m.modelId}`"
                      class="local-popover-item"
                      :class="{ active: aiConfig.modelOverrides.resumeImport?.modelId === m.modelId && aiConfig.modelOverrides.resumeImport?.channelId === m.chId }"
                      @click="selectLocalModel(m.chId, m.modelId)"
                    >
                      <div class="local-item-content">
                        <span class="local-item-name">{{ m.modelId.split('/').pop() }}</span>
                        <div class="local-item-badges">
                          <span v-if="m.isFree" class="badge-tiny free">FREE</span>
                          <span v-if="m.isVision" class="badge-tiny vision">VIS</span>
                          <span class="model-full-id">{{ m.modelId }}</span>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </transition>
          </div>

          <button class="btn-icon-only" title="全局 API 设置" @click="showConfig = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </div>

      <div class="panel-body">
        <!-- 空状态 -->
        <div v-if="phase === 'upload' && !parsedData" class="empty-state">
          <div class="empty-icon-wrapper">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <p class="empty-text">请在左侧上传简历文件</p>
          <p class="empty-subtext">上传并解析后，结构化数据将在此展示</p>
        </div>

        <!-- 解析中 -->
        <div v-else-if="phase === 'parsing'" class="parsing-state">
          <!-- 发光 & 涟漪效果的进度圆环 -->
          <div class="parsing-progress-ring">
            <div class="ring-ripple" style="animation-delay: 0s"></div>
            <div class="ring-ripple" style="animation-delay: 1s"></div>
            <svg viewBox="0 0 100 100" class="progress-ring-svg">
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="var(--primary-300)" />
                  <stop offset="50%" stop-color="var(--primary-500)" />
                  <stop offset="100%" stop-color="var(--primary-600)" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="42" class="ring-bg" />
              <circle
                cx="50" cy="50" r="42"
                class="ring-fill"
                filter="url(#glow)"
                :style="{ strokeDashoffset: 263.89 - (263.89 * progressPercent) / 100 }"
              />
            </svg>
            <div class="progress-info">
              <span class="progress-number">{{ progressPercent }}<small>%</small></span>
              <p v-if="parseModeLabel" class="parse-mode-chip">{{ parseModeLabel }}</p>
            </div>
          </div>
          
          <div class="status-container">
            <h3 class="status-title">
              <span class="status-dot"></span>
              {{ statusText || 'AI 正在全力解析...' }}
            </h3>
            <p class="status-subtitle">根据内容复杂度和网络情况可能需要一点时间，请耐心等待</p>
          </div>

          <div v-if="rawStreamText" class="stream-console">
            <div class="console-header">
              <div class="console-traffic-lights">
                <span></span><span></span><span></span>
              </div>
              <span class="console-title">AI Log Stream</span>
            </div>
            <div class="console-body custom-scrollbar" ref="consoleBodyRef">
              <pre class="console-text">{{ rawStreamText.slice(-1000) }}<span class="console-cursor"></span></pre>
            </div>
          </div>
          <div v-else class="stream-console stream-console-placeholder">
             <div class="console-header">
              <div class="console-traffic-lights">
                <span></span><span></span><span></span>
              </div>
              <span class="console-title">AI Log Stream Waiting...</span>
            </div>
            <div class="console-body">
              <div class="skeleton-line pulse-loading" style="width: 80%"></div>
              <div class="skeleton-line pulse-loading" style="width: 60%"></div>
              <div class="skeleton-line pulse-loading" style="width: 70%"></div>
            </div>
          </div>

          <button class="btn-outline btn-cancel-parse" @click="cancelParsing">取消解析</button>
        </div>

        <!-- 错误状态 -->
        <div v-else-if="phase === 'error'" class="error-state">
          <div class="error-icon-wrapper">
            <svg class="error-icon-lg" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p class="error-title">解析失败</p>
          <p class="error-detail">{{ errorMessage }}</p>
          <p class="error-hint">可尝试检查 AI 配置、切换支持视觉的模型，或压缩文件后重新解析。</p>
          <div class="error-actions">
            <button class="btn-outline" @click="resetAll">重新上传</button>
            <button class="btn-primary" @click="reParse">重试解析</button>
          </div>
        </div>

        <!-- 解析完成：卡片展示 -->
        <div v-else-if="phase === 'done' && parsedData && moduleStats" class="result-cards">
          <!-- 校验警告 -->
          <div v-if="validationWarnings.length > 0" class="validation-warnings">
            <div class="warnings-header">
              <svg class="warnings-icon" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              <span>解析质量提示（{{ validationWarnings.length }} 项）</span>
            </div>
            <ul class="warnings-list">
              <li v-for="(w, i) in validationWarnings" :key="i">{{ w }}</li>
            </ul>
          </div>
          <!-- 基本信息 -->
          <div v-if="parsedData.basicInfo" class="result-card card-basic">
            <h3 class="card-title card-title-checkbox">
              <label class="card-checkbox-label">
                <input type="checkbox" v-model="selectedApplyModules" value="basicInfo" />
                <svg class="card-title-icon" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                基本信息
              </label>
            </h3>
            <div class="card-fields">
              <div v-for="(value, key) in parsedData.basicInfo" :key="key" class="field-row">
                <span class="field-label">{{ fieldLabel(key as string) }}</span>
                <template v-if="editingField === `basicInfo.${key}`">
                  <input
                    v-model="editingValue"
                    class="field-input"
                    @keyup.enter="saveEditing(`basicInfo.${key}`)"
                    @keyup.escape="cancelEditing"
                  />
                  <button class="field-action-btn save" @click="saveEditing(`basicInfo.${key}`)">✓</button>
                  <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                </template>
                <template v-else>
                  <span class="field-value" @click="startEditing(`basicInfo.${key}`, String(value ?? ''))">
                    {{ value || '—' }}
                    <svg class="edit-hint-icon" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </span>
                </template>
              </div>
            </div>
          </div>

          <!-- 教育经历 -->
          <div v-if="moduleStats.education" class="result-card">
            <h3 class="card-title card-title-checkbox">
              <label class="card-checkbox-label">
                <input type="checkbox" v-model="selectedApplyModules" value="educationList" />
                <svg class="card-title-icon" viewBox="0 0 24 24" fill="none"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>
                教育经历
              </label>
              <span class="card-count">{{ moduleStats.education }}</span>
            </h3>
            <div v-for="(edu, idx) in parsedData.educationList" :key="idx" class="sub-card">
              <div class="sub-card-header-row">
                <div class="sub-card-header-left">
                  <span class="sub-card-title">
                    <span v-if="editingField === `educationList.${idx}.school`" class="inline-edit">
                      <input v-model="editingValue" class="field-input" @keyup.enter="saveEditing(`educationList.${idx}.school`)" @keyup.esc="cancelEditing" />
                      <button class="field-action-btn save" @click="saveEditing(`educationList.${idx}.school`)">✓</button>
                      <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                    </span>
                    <span v-else class="hover-editable" @click="startEditing(`educationList.${idx}.school`, edu.school || '')">{{ edu.school || '未知学校' }}</span>
                  </span>
                  <span class="sub-card-meta">
                    <span v-if="editingField === `educationList.${idx}.major`" class="inline-edit">
                      <input v-model="editingValue" class="field-input" @keyup.enter="saveEditing(`educationList.${idx}.major`)" @keyup.esc="cancelEditing" />
                      <button class="field-action-btn save" @click="saveEditing(`educationList.${idx}.major`)">✓</button>
                      <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                    </span>
                    <span v-else class="hover-editable" @click="startEditing(`educationList.${idx}.major`, edu.major || '')">{{ edu.major || '添加专业' }}</span>
                    <span style="margin: 0 4px">·</span>
                    <span v-if="editingField === `educationList.${idx}.degree`" class="inline-edit">
                      <input v-model="editingValue" class="field-input" @keyup.enter="saveEditing(`educationList.${idx}.degree`)" @keyup.esc="cancelEditing" />
                      <button class="field-action-btn save" @click="saveEditing(`educationList.${idx}.degree`)">✓</button>
                      <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                    </span>
                    <span v-else class="hover-editable" @click="startEditing(`educationList.${idx}.degree`, edu.degree || '')">{{ edu.degree || '添加学历' }}</span>
                  </span>
                </div>
                <div class="sub-card-time">
                  <span v-if="editingField === `educationList.${idx}.startDate`" class="inline-edit">
                    <input v-model="editingValue" class="field-input" placeholder="开始" @keyup.enter="saveEditing(`educationList.${idx}.startDate`)" @keyup.esc="cancelEditing" />
                    <button class="field-action-btn save" @click="saveEditing(`educationList.${idx}.startDate`)">✓</button>
                    <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                  </span>
                  <span v-else class="hover-editable" @click="startEditing(`educationList.${idx}.startDate`, edu.startDate || '')">{{ edu.startDate || '开始时间' }}</span>
                  <span style="margin: 0 4px">-</span>
                  <span v-if="editingField === `educationList.${idx}.endDate`" class="inline-edit">
                    <input v-model="editingValue" class="field-input" placeholder="结束" @keyup.enter="saveEditing(`educationList.${idx}.endDate`)" @keyup.esc="cancelEditing" />
                    <button class="field-action-btn save" @click="saveEditing(`educationList.${idx}.endDate`)">✓</button>
                    <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                  </span>
                  <span v-else class="hover-editable" @click="startEditing(`educationList.${idx}.endDate`, edu.endDate || '')">{{ edu.endDate || '至今' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 工作经历 -->
          <div v-if="moduleStats.work" class="result-card">
            <h3 class="card-title card-title-checkbox">
              <label class="card-checkbox-label">
                <input type="checkbox" v-model="selectedApplyModules" value="workList" />
                <svg class="card-title-icon" viewBox="0 0 24 24" fill="none"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>
                工作经历
              </label>
              <span class="card-count">{{ moduleStats.work }}</span>
            </h3>
            <div v-for="(work, idx) in parsedData.workList" :key="idx" class="sub-card">
              <div class="sub-card-header-row">
                <div class="sub-card-header-left">
                  <span class="sub-card-title">
                    <span v-if="editingField === `workList.${idx}.company`" class="inline-edit">
                      <input v-model="editingValue" class="field-input" @keyup.enter="saveEditing(`workList.${idx}.company`)" @keyup.esc="cancelEditing" />
                      <button class="field-action-btn save" @click="saveEditing(`workList.${idx}.company`)">✓</button>
                      <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                    </span>
                    <span v-else class="hover-editable" @click="startEditing(`workList.${idx}.company`, work.company || '')">{{ work.company || '未知公司' }}</span>
                  </span>
                  <span class="sub-card-meta">
                    <span v-if="editingField === `workList.${idx}.position`" class="inline-edit">
                      <input v-model="editingValue" class="field-input" @keyup.enter="saveEditing(`workList.${idx}.position`)" @keyup.esc="cancelEditing" />
                      <button class="field-action-btn save" @click="saveEditing(`workList.${idx}.position`)">✓</button>
                      <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                    </span>
                    <span v-else class="hover-editable" @click="startEditing(`workList.${idx}.position`, work.position || '')">{{ work.position || '添加职位' }}</span>
                  </span>
                </div>
                <div class="sub-card-time">
                  <span v-if="editingField === `workList.${idx}.startDate`" class="inline-edit">
                    <input v-model="editingValue" class="field-input" @keyup.enter="saveEditing(`workList.${idx}.startDate`)" @keyup.esc="cancelEditing" />
                    <button class="field-action-btn save" @click="saveEditing(`workList.${idx}.startDate`)">✓</button>
                    <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                  </span>
                  <span v-else class="hover-editable" @click="startEditing(`workList.${idx}.startDate`, work.startDate || '')">{{ work.startDate || '开始时间' }}</span>
                  <span style="margin: 0 4px">-</span>
                  <span v-if="editingField === `workList.${idx}.endDate`" class="inline-edit">
                    <input v-model="editingValue" class="field-input" @keyup.enter="saveEditing(`workList.${idx}.endDate`)" @keyup.esc="cancelEditing" />
                    <button class="field-action-btn save" @click="saveEditing(`workList.${idx}.endDate`)">✓</button>
                    <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                  </span>
                  <span v-else class="hover-editable" @click="startEditing(`workList.${idx}.endDate`, work.endDate || '')">{{ work.endDate || '至今' }}</span>
                </div>
              </div>
              
              <template v-if="editingField === `workList.${idx}.description`">
                <textarea v-model="editingValue" class="field-textarea mt-2" rows="4" @keyup.esc="cancelEditing"></textarea>
                <div class="field-action-row mt-1">
                  <button class="btn-primary btn-sm" @click="saveEditing(`workList.${idx}.description`)">保存</button>
                  <button class="btn-outline btn-sm" @click="cancelEditing">取消</button>
                </div>
              </template>
              <template v-else>
                <div v-if="work.description" class="sub-card-desc rich-text hover-editable" @click="startEditing(`workList.${idx}.description`, work.description)" v-html="work.description"></div>
                <div v-else class="sub-card-desc text-muted hover-editable" @click="startEditing(`workList.${idx}.description`, '')">点击添加工作描述...</div>
              </template>
            </div>
          </div>

          <!-- 项目经历 -->
          <div v-if="moduleStats.project" class="result-card">
            <h3 class="card-title card-title-checkbox">
              <label class="card-checkbox-label">
                <input type="checkbox" v-model="selectedApplyModules" value="projectList" />
                <svg class="card-title-icon" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                项目经历
              </label>
              <span class="card-count">{{ moduleStats.project }}</span>
            </h3>
            <div v-for="(proj, idx) in parsedData.projectList" :key="idx" class="sub-card">
              <div class="sub-card-header-row">
                <div class="sub-card-header-left">
                  <span class="sub-card-title">
                    <span v-if="editingField === `projectList.${idx}.name`" class="inline-edit">
                      <input v-model="editingValue" class="field-input" @keyup.enter="saveEditing(`projectList.${idx}.name`)" @keyup.esc="cancelEditing" />
                      <button class="field-action-btn save" @click="saveEditing(`projectList.${idx}.name`)">✓</button>
                      <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                    </span>
                    <span v-else class="hover-editable" @click="startEditing(`projectList.${idx}.name`, proj.name || '')">{{ proj.name || '未知项目' }}</span>
                  </span>
                  
                  <span v-if="proj.link" class="hover-editable text-muted" style="font-size: 11px; margin-left: 8px" @click="startEditing(`projectList.${idx}.link`, proj.link || '')">🔗 {{ proj.link }}</span>
                  <span v-else class="hover-editable text-muted" style="font-size: 11px; margin-left: 8px" @click="startEditing(`projectList.${idx}.link`, '')">+ 链接</span>

                  <span class="sub-card-meta">
                    <span v-if="editingField === `projectList.${idx}.role`" class="inline-edit">
                      <input v-model="editingValue" class="field-input" @keyup.enter="saveEditing(`projectList.${idx}.role`)" @keyup.esc="cancelEditing" />
                      <button class="field-action-btn save" @click="saveEditing(`projectList.${idx}.role`)">✓</button>
                      <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                    </span>
                    <span v-else class="hover-editable" @click="startEditing(`projectList.${idx}.role`, proj.role || '')">{{ proj.role || '添加角色' }}</span>
                  </span>
                </div>
                <div class="sub-card-time">
                  <span v-if="editingField === `projectList.${idx}.startDate`" class="inline-edit">
                    <input v-model="editingValue" class="field-input" @keyup.enter="saveEditing(`projectList.${idx}.startDate`)" @keyup.esc="cancelEditing" />
                    <button class="field-action-btn save" @click="saveEditing(`projectList.${idx}.startDate`)">✓</button>
                    <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                  </span>
                  <span v-else class="hover-editable" @click="startEditing(`projectList.${idx}.startDate`, proj.startDate || '')">{{ proj.startDate || '开始时间' }}</span>
                  <span style="margin: 0 4px">-</span>
                  <span v-if="editingField === `projectList.${idx}.endDate`" class="inline-edit">
                    <input v-model="editingValue" class="field-input" @keyup.enter="saveEditing(`projectList.${idx}.endDate`)" @keyup.esc="cancelEditing" />
                    <button class="field-action-btn save" @click="saveEditing(`projectList.${idx}.endDate`)">✓</button>
                    <button class="field-action-btn cancel" @click="cancelEditing">✕</button>
                  </span>
                  <span v-else class="hover-editable" @click="startEditing(`projectList.${idx}.endDate`, proj.endDate || '')">{{ proj.endDate || '至今' }}</span>
                </div>
              </div>
              
              <template v-if="editingField === `projectList.${idx}.mainWork`">
                <textarea v-model="editingValue" class="field-textarea mt-2" rows="4" @keyup.esc="cancelEditing"></textarea>
                <div class="field-action-row mt-1">
                  <button class="btn-primary btn-sm" @click="saveEditing(`projectList.${idx}.mainWork`)">保存</button>
                  <button class="btn-outline btn-sm" @click="cancelEditing">取消</button>
                </div>
              </template>
              <template v-else>
                <div v-if="proj.mainWork || proj.description" class="sub-card-desc rich-text hover-editable" @click="startEditing(`projectList.${idx}.mainWork`, proj.mainWork || proj.description || '')" v-html="proj.mainWork || proj.description"></div>
                <div v-else class="sub-card-desc text-muted hover-editable" @click="startEditing(`projectList.${idx}.mainWork`, '')">点击添加项目描述...</div>
              </template>
            </div>
          </div>

          <!-- 专业技能 -->
          <div v-if="moduleStats.skills" class="result-card">
            <h3 class="card-title card-title-checkbox">
              <label class="card-checkbox-label">
                <input type="checkbox" v-model="selectedApplyModules" value="skills" />
                <svg class="card-title-icon" viewBox="0 0 24 24" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                专业技能
              </label>
            </h3>
            
            <template v-if="editingField === 'skills'">
              <textarea v-model="editingValue" class="field-textarea" rows="4" @keyup.esc="cancelEditing"></textarea>
              <div class="field-action-row mt-1">
                <button class="btn-primary btn-sm" @click="saveEditing('skills')">保存</button>
                <button class="btn-outline btn-sm" @click="cancelEditing">取消</button>
              </div>
            </template>
            <template v-else>
              <div class="skills-text rich-text hover-editable" @click="startEditing('skills', parsedData.skills || '')" v-html="parsedData.skills || '点击添加技能'"></div>
            </template>
          </div>

          <!-- 荣誉奖项 -->
          <div v-if="moduleStats.awards" class="result-card">
            <h3 class="card-title card-title-checkbox">
              <label class="card-checkbox-label">
                <input type="checkbox" v-model="selectedApplyModules" value="awardList" />
                <svg class="card-title-icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>
                荣誉奖项
              </label>
              <span class="card-count">{{ moduleStats.awards }}</span>
            </h3>
            <div v-for="(award, idx) in parsedData.awardList" :key="idx" class="sub-card sub-card-inline">
              <p class="sub-card-title">{{ award.name || '未知奖项' }}</p>
              <p v-if="award.time" class="sub-card-time">{{ award.time }}</p>
            </div>
          </div>

          <!-- 个人简介 -->
          <div v-if="moduleStats.selfIntro" class="result-card">
            <h3 class="card-title card-title-checkbox">
              <label class="card-checkbox-label">
                <input type="checkbox" v-model="selectedApplyModules" value="selfIntro" />
                <svg class="card-title-icon" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                个人简介
              </label>
            </h3>
            
            <template v-if="editingField === 'selfIntro'">
              <textarea v-model="editingValue" class="field-textarea" rows="4" @keyup.esc="cancelEditing"></textarea>
              <div class="field-action-row mt-1">
                <button class="btn-primary btn-sm" @click="saveEditing('selfIntro')">保存</button>
                <button class="btn-outline btn-sm" @click="cancelEditing">取消</button>
              </div>
            </template>
            <template v-else>
              <div class="skills-text rich-text hover-editable" @click="startEditing('selfIntro', parsedData.selfIntro || '')" v-html="parsedData.selfIntro || '点击添加简介'"></div>
            </template>
          </div>
        </div>
      </div>

      <!-- 右栏底部操作 -->
      <div v-if="phase === 'done' && parsedData" class="panel-footer panel-footer-right">
        <div class="footer-btns">
          <button class="btn-outline" @click="reParse">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
            重新解析
          </button>
          <button class="btn-primary btn-apply" @click="applyToResume">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12" /></svg>
            应用到简历
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
// 字段名映射
const FIELD_LABELS: Record<string, string> = {
  name: '姓名',
  phone: '电话',
  email: '邮箱',
  age: '年龄',
  gender: '性别',
  location: '所在城市',
  jobTitle: '求职岗位',
  educationLevel: '最高学历',
  avatar: '头像链接',
  workYears: '工作年限',
  currentStatus: '求职状态',
  expectedLocation: '找工作城市',
  expectedSalary: '要求薪资',
  website: '个人网站',
  wechat: '微信账号',
  currentCity: '目前所在地',
  github: 'GitHub主页',
  blog: '技术博客',
  birthDate: '出生日期',
  city: '所在城市',
  yearsOfExperience: '工作经验年限',
  status: '目前状态',
}

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key
}
</script>

<style scoped>
.local-model-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  padding: 4px 12px;
  border-radius: 99px;
  border: 1px solid var(--border-color-strong);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
}
.local-model-selector:hover {
  border-color: var(--primary-400);
  background: var(--bg-card);
}
.local-model-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.local-model-select {
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--primary-600);
  font-weight: 600;
  min-width: 120px;
  max-width: 200px;
  cursor: pointer;
  padding-right: 4px;
}
.local-model-select:focus {
  outline: none;
}

/* ========== 整体布局 ========== */
.import-panel {
  display: flex;
  gap: 16px;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.panel-left,
.panel-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-color);
  overflow: hidden;
  min-width: 0;
}

/* ========== 面板头部 ========== */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.panel-header-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--primary-50);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.panel-header-icon svg {
  width: 17px;
  height: 17px;
  stroke: var(--primary-500);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.panel-header-icon--result {
  background: color-mix(in srgb, var(--accent-green) 8%, var(--bg-card));
}

.panel-header-icon--result svg {
  stroke: var(--accent-green);
}

.panel-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-icon-only {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--gray-500);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon-only:hover {
  background: var(--bg-hover);
  color: var(--primary-500);
}

.btn-icon-only svg {
  width: 18px;
  height: 18px;
}

.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.done-badge {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-green);
  background: color-mix(in srgb, var(--accent-green) 8%, var(--bg-card));
  padding: 3px 10px;
  border-radius: 20px;
}

/* ========== 面板主体 ========== */
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px;
  min-height: 0;
}

/* ========== 拖拽上传区 ========== */
.drop-zone {
  position: relative;
  border: 2px dashed var(--gray-300);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 340px;
  height: 100%;
  transition: all 0.25s ease;
  background: var(--gray-50);
  cursor: pointer;
}

.drop-zone:hover {
  border-color: var(--primary-400);
  background: var(--primary-50);
}

.drop-zone.dragging {
  border-color: var(--primary-500);
  background: var(--primary-50);
  transform: scale(1.005);
  box-shadow: 0 0 0 4px rgba(var(--primary-500-rgb, 200, 120, 60), 0.12);
}

.drop-zone-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  z-index: 1;
}

.drop-zone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
  z-index: 2;
}

.drop-icon-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--primary-50), #ffffff5e);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.drop-icon {
  width: 30px;
  height: 30px;
  stroke: var(--primary-500);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.drop-text {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.drop-subtext {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.format-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-top: 10px;
}

.format-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  letter-spacing: 0.3px;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  margin-top: 14px;
  height: 36px;
  padding: 0 20px;
  background: var(--primary-500);
  color: var(--text-inverse);
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  pointer-events: auto;
  position: relative;
  z-index: 3;
  transition: background 0.2s;
}

.upload-btn:hover {
  background: var(--primary-600);
}

.hidden-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

/* ========== 文件预览区 ========== */
.preview-area {
  height: 100%;
  min-height: 200px;
}

.image-preview-scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.preview-image {
  width: 100%;
  max-width: 100%;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.text-preview-scroll {
  height: 100%;
  min-height: 200px;
}

.text-preview-content {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--gray-50);
  border-radius: 10px;
  padding: 16px;
  border: 1px solid var(--border-color);
}

.preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-muted);
  font-size: 13px;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--gray-200);
  border-top-color: var(--primary-500);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ========== 取左和右底部的共享样式 ========== */
.panel-footer {
  padding: 14px 22px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-footer-right {
  justify-content: flex-end;
}

.footer-btns {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.file-info-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.file-icon-sm {
  width: 16px;
  height: 16px;
  stroke: var(--primary-500);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  flex-shrink: 0;
}

.file-name-text {
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.file-size-text {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--text-muted);
}

/* ========== 按钮通用 ========== */
.btn-primary {
  height: 36px;
  padding: 0 18px;
  border-radius: 10px;
  border: none;
  background: var(--primary-500);
  color: var(--text-inverse);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-600);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-outline {
  height: 36px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.btn-outline:hover {
  border-color: var(--primary-400);
  color: var(--primary-500);
  background: var(--primary-50);
}

.btn-sm {
  height: 32px;
  padding: 0 14px;
  font-size: 12.5px;
  border-radius: 8px;
}

.btn-icon {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  flex-shrink: 0;
}

.btn-apply {
  background: var(--accent-green);
}

.btn-apply:hover:not(:disabled) {
  background: #3a9e5a;
}

/* ========== 空状态 ========== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 280px;
  gap: 6px;
}

.empty-icon-wrapper {
  width: 72px;
  height: 72px;
  border-radius: 22px;
  background: var(--gray-50);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.empty-icon {
  width: 32px;
  height: 32px;
  stroke: var(--gray-400);
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.empty-text {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
}

.empty-subtext {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

/* ========== 解析中动画增强 ========== */
.parsing-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 480px;
  gap: 16px;
}

/* 进度圆环重构 */
.parsing-progress-ring {
  position: relative;
  width: 130px;
  height: 130px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring-ripple {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  background: radial-gradient(circle, var(--primary-400), transparent 70%);
  border-radius: 50%;
  opacity: 0;
  animation: ripple 2.5s cubic-bezier(0.1, 0.2, 0.8, 1) infinite;
  z-index: 0;
}

@keyframes ripple {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 0.3; }
  100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; border-width: 0px; }
}

.progress-ring-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  z-index: 2;
  filter: drop-shadow(0 4px 6px rgba(0,0,0,0.05));
}

.ring-bg {
  fill: var(--bg-card); /* 使中心有实体背景，遮挡ripple */
  stroke: var(--gray-100);
  stroke-width: 6;
}

.ring-fill {
  fill: none;
  stroke: url(#ringGradient);
  stroke-width: 7;
  stroke-linecap: round;
  stroke-dasharray: 263.89; /* 2 * PI * r(42) */
  transition: stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.progress-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 3;
}

.progress-number {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}

.progress-number small {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-left: 2px;
}

.parse-mode-chip {
  margin-top: 4px;
  margin-bottom: 0px;
  padding: 2px 10px;
  border-radius: 12px;
  background: linear-gradient(120deg, var(--primary-100), var(--primary-50));
  color: var(--primary-700);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}

/* 状态文字区 */
.status-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 4px;
}

.status-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--primary-500);
  animation: pulse-dot 1.5s infinite alternate;
}

@keyframes pulse-dot {
  0% { transform: scale(0.8); opacity: 0.6; box-shadow: 0 0 0 0 rgba(var(--primary-500-rgb, 46, 164, 79), 0.4); }
  100% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 0 5px rgba(var(--primary-500-rgb, 46, 164, 79), 0); }
}

.status-subtitle {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

/* 模拟控制台日志面板 - 毛玻璃流光净化版 */
.stream-console {
  width: 100%;
  max-width: 520px;
  background: rgba(24, 25, 28, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 16px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05);
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
  position: relative;
}

/* 顶部流光扫过效果 */
.stream-console::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 1.5px;
  background: linear-gradient(90deg, transparent, var(--primary-500), transparent);
  animation: scanlight 3s ease-in-out infinite;
  z-index: 10;
}

@keyframes scanlight {
  0% { left: -100%; }
  100% { left: 200%; }
}

.stream-console-placeholder .console-body {
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.console-header {
  height: 32px;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  padding: 0 14px;
  position: relative;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  z-index: 2;
}

.console-traffic-lights {
  display: flex;
  gap: 7px;
}

.console-traffic-lights span {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}
.console-traffic-lights span:nth-child(1) { background: #ff5f56; }
.console-traffic-lights span:nth-child(2) { background: #ffbd2e; }
.console-traffic-lights span:nth-child(3) { background: #27c93f; }

.console-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11.5px;
  color: #999;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.console-body {
  padding: 14px 16px;
  height: 160px;
  overflow-y: auto;
  scrollbar-color: #555 #1e1e1e;
  scroll-behavior: smooth;
}
.console-body::-webkit-scrollbar {
  width: 6px;
}
.console-body::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 3px;
}

.console-text {
  margin: 0;
  font-size: 12.5px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  color: #a9dc76; /* 代码荧光绿 */
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  animation: fade-in-up 0.3s ease-out;
}

@keyframes fade-in-up {
  0% { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* 打字光标 */
.console-cursor {
  display: inline-block;
  width: 7px;
  height: 15px;
  background: #a9dc76;
  margin-left: 3px;
  vertical-align: text-bottom;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.skeleton-line {
  height: 12px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
}

.pulse-loading {
  animation: skel-pulse 1.5s ease-in-out infinite;
}

@keyframes skel-pulse {
  0% { opacity: 0.5; }
  50% { opacity: 1; }
  100% { opacity: 0.5; }
}

.btn-cancel-parse {
  margin-top: 10px;
}

/* ========== 错误状态 ========== */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 280px;
  gap: 8px;
  text-align: center;
}

.error-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--accent-red) 6%, var(--bg-card));
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.error-icon-lg {
  width: 28px;
  height: 28px;
  stroke: var(--accent-red);
  stroke-width: 1.5;
  fill: none;
}

.error-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-red);
}

.error-detail {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  max-width: 360px;
}

.error-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.error-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.error-text {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--accent-red);
  line-height: 1.45;
}

/* ========== 细粒度编辑与局部引用 ========== */
.card-title-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin: 0;
  color: var(--text-primary);
}

.card-checkbox-label input[type="checkbox"] {
  width: 15px;
  height: 15px;
  cursor: pointer;
  accent-color: var(--primary-500);
}

.hover-editable {
  padding: 4px 6px;
  margin: -4px -6px;
  border-radius: 6px;
  transition: all 0.2s;
  cursor: pointer;
}

.hover-editable:hover {
  background: var(--primary-50);
  box-shadow: inset 0 0 0 1px var(--primary-200);
}

.field-textarea {
  width: 100%;
  font-size: 13.5px;
  font-family: inherit;
  color: var(--text-primary);
  border: 1px solid var(--primary-300);
  background: var(--bg-card);
  border-radius: 8px;
  padding: 10px;
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--primary-500-rgb, 200, 120, 60), 0.1);
  resize: vertical;
}

.field-action-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.inline-edit {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.inline-edit .field-input {
  width: 130px;
  flex: none;
}

.mt-2 {
  margin-top: 8px;
}

.mt-1 {
  margin-top: 4px;
}

/* ========== 校验警告 ========== */
.validation-warnings {
  border: 1px solid #f5d89a;
  border-radius: 12px;
  background: color-mix(in srgb, #f59e0b 6%, var(--bg-card));
  padding: 14px 18px;
}
.warnings-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #a16207;
  margin-bottom: 8px;
}
.warnings-icon {
  width: 16px;
  height: 16px;
  stroke: #d97706;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  flex-shrink: 0;
}
.warnings-list {
  margin: 0;
  padding-left: 20px;
  font-size: 12.5px;
  line-height: 1.6;
  color: #92400e;
}
.warnings-list li {
  margin-bottom: 2px;
}

/* ========== 结果卡片 ========== */
.result-cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.result-card {
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
  overflow: hidden;
}

.card-basic {
  border-color: #f0d8c0;
  background: linear-gradient(135deg, #ffffffa6, var(--bg-card));
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  padding: 14px 18px 10px;
  margin: 0;
  border-bottom: 1px solid var(--border-color);
}

.card-title-icon {
  width: 16px;
  height: 16px;
  stroke: var(--primary-500);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  flex-shrink: 0;
}

.card-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 700;
  background: var(--primary-50);
  color: var(--primary-600);
  padding: 2px 8px;
  border-radius: 10px;
}

/* ========== 字段行 ========== */
.card-fields {
  padding: 10px 18px 14px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 16px;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--gray-50);
}

.field-label {
  font-size: 12px;
  color: var(--text-muted);
  width: 72px;
  flex-shrink: 0;
}

.field-value {
  flex: 1;
  font-size: 13.5px;
  color: var(--text-primary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 6px;
  transition: background 0.15s;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-value:hover {
  background: var(--primary-50);
}

.edit-hint-icon {
  width: 12px;
  height: 12px;
  stroke: var(--text-muted);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.field-value:hover .edit-hint-icon {
  opacity: 1;
}

.field-input {
  flex: 1;
  height: 28px;
  padding: 0 8px;
  font-size: 13px;
  border: 1.5px solid var(--primary-400);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  outline: none;
}

.field-input:focus {
  border-color: var(--primary-500);
  box-shadow: 0 0 0 3px rgba(var(--primary-500-rgb, 200, 120, 60), 0.1);
}

.field-action-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.field-action-btn.save {
  background: var(--accent-green);
  color: white;
}

.field-action-btn.cancel {
  background: var(--gray-100);
  color: var(--text-secondary);
}

/* ========== 子卡片 ========== */
.sub-card {
  padding: 12px 18px;
  border-bottom: 1px solid var(--gray-50);
}

.sub-card:last-child {
  border-bottom: none;
}

.sub-card-inline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub-card-title {
  display: inline-block;
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.sub-card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.sub-card-header-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1;
}

.sub-card-meta {
  display: inline-block;
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.sub-card-time {
  display: inline-block;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  flex-shrink: 0;
}

.sub-card-desc {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.skills-text {
  padding: 12px 18px;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

/* 富文本基础样式 */
.rich-text {
  word-wrap: break-word;
  white-space: pre-wrap;
}
.rich-text p {
  margin-block-start: 0.3em;
  margin-block-end: 0.3em;
}
.rich-text ul, .rich-text ol {
  padding-inline-start: 20px;
  margin-block-start: 0.3em;
  margin-block-end: 0.3em;
}
.rich-text strong {
  color: var(--text-primary);
  font-weight: 600;
}

/* ========== 响应式 ========== */
/* ========== 局部模型选择增强样式 ========== */
.local-model-selector {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.local-model-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}

.local-model-trigger {
  min-width: 140px;
  max-width: 240px;
  height: 32px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: 8px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.local-model-trigger:hover {
  border-color: var(--primary-400);
  background: var(--bg-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.local-model-trigger.is-active {
  border-color: var(--primary-500);
  background: var(--bg-card);
  box-shadow: 0 0 0 3px rgba(var(--primary-500-rgb, 99, 102, 241), 0.1);
}

.trigger-text {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-icon-sm {
  font-size: 9px;
  color: var(--text-muted);
  transition: transform 0.2s;
  margin-left: 6px;
}

.local-model-trigger.is-active .trigger-icon-sm {
  transform: rotate(180deg);
}

.local-model-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 280px;
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.local-popover-search {
  padding: 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  background: var(--bg-card-muted);
}

.local-search-input {
  width: 100%;
  height: 32px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color-strong);
  border-radius: 6px;
  padding: 0 10px;
  font-size: 12px;
  outline: none;
}

.local-search-input:focus {
  border-color: var(--primary-500);
  background: var(--bg-card);
}

.local-popover-items {
  max-height: 320px;
  overflow-y: auto;
  padding: 5px;
}

.local-popover-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  transition: all 0.15s;
  color: var(--text-secondary);
}

.local-popover-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.local-popover-item.active {
  background: rgba(var(--primary-500-rgb, 99, 102, 241), 0.08);
  color: var(--primary-600);
  font-weight: 600;
}

.local-group-header {
  font-size: 11px;
  font-weight: 800;
  color: var(--primary-500);
  padding: 10px 10px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-top: 1px solid rgba(0, 0, 0, 0.03);
}
.local-group-header:first-of-type {
  border-top: none;
}

.local-item-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.local-item-name {
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.local-item-ch {
  font-size: 11px;
  color: var(--text-muted);
}

.model-full-id {
  font-size: 10px;
  color: var(--text-muted);
  opacity: 0.6;
  margin-left: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-item-badges {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 1px;
}

.badge-tiny {
  font-size: 8px;
  font-weight: 800;
  padding: 0px 4px;
  border-radius: 3px;
}

.badge-tiny.free {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.badge-tiny.vision {
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
}

/* 动画效果 */
.pop-fast-enter-active, .pop-fast-leave-active {
  transition: all 0.15s ease-out;
}
.pop-fast-enter-from, .pop-fast-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}

@media (max-width: 768px) {
  .import-panel {
    flex-direction: column;
  }
}
</style>
