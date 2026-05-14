<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useAiConfigStore, isVisionModel } from '@/stores/aiConfig'
import { useResumeStore } from '@/stores/resume'
import {
  extractTextFromFile,
  extractTextFromPdf,
  extractVisionImagesFromFile,
  isImageFile,
  isPdfFile,
  supportsResumeParseFile,
} from '@/services/fileParser'
import {
  parseResumeWithVisionAI,
  parseResumeWithMixedAI,
  parseResumeWithAI,
  isVisionUnsupportedError,
  convertMarkdownFields,
  type ImportData
} from '@/services/aiImportService'
import { extractTextFromImagesWithOCR } from '@/services/fileParser'

type Step = 'select' | 'parsing' | 'preview' | 'error'

interface ResumeImportPayload {
  basicInfo?: Partial<typeof store.basicInfo>
  educationList?: typeof store.educationList
  skills?: string
  workList?: typeof store.workList
  projectList?: typeof store.projectList
  awardList?: typeof store.awardList
  selfIntro?: string
}

const aiConfig = useAiConfigStore()
const store = useResumeStore()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const step = ref<Step>('select')
const selectedFile = ref<File | null>(null)
const isDragging = ref(false)
const statusText = ref('')
const progressPercent = ref(0)
const errorMessage = ref('')
const parsedData = shallowRef<ImportData | null>(null)
const rawStreamText = ref('')
const parseModeLabel = ref('')

let abortController: AbortController | null = null

const hasExistingData = computed(() => {
  return !!(
    store.basicInfo.name ||
    store.basicInfo.phone ||
    store.workList.some((w) => w.company) ||
    store.educationList.some((e) => e.school) ||
    store.projectList.some((p) => p.name)
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
    skills: 1,
    awards: data.awardList?.length ?? 0,
    selfIntro: 1,
  }
})

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

function validateAndSelect(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!supportsResumeParseFile(file)) {
    errorMessage.value = `不支持的文件格式: .${ext}，请上传 PDF、DOCX、DOC、TXT、MD 或图片文件`
    return
  }

  errorMessage.value = ''
  selectedFile.value = file
}

function getImportCallbacks(aiPhasePercent: number) {
  return {
    onChunk(text: string) {
      rawStreamText.value = text
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
      parsedData.value = data
      progressPercent.value = 100
      statusText.value = '解析完成，请确认后填充到编辑区'
      setTimeout(() => {
        step.value = 'preview'
      }, 300)
    },
    onError(msg: string) {
      step.value = 'error'
      errorMessage.value = msg
    },
  }
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
    {
      ...aiConfig.getConfigForFeature('resumeImport'),
    },
    text,
    getImportCallbacks(30),
    abortController?.signal,
  )
}

async function parseWithVision(file: File, reason?: string) {
  parseModeLabel.value = '视觉解析'
  statusText.value = reason ? `正在切换为视觉解析：${reason}` : '正在准备图片内容...'
  progressPercent.value = 18

  const imageUrls = await extractVisionImagesFromFile(file)

  // 1. 获取当前简历导入配置
  const importConfig = aiConfig.getConfigForFeature('resumeImport')

  // 第一决策：直接尝试视觉解析
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
    return // 成功直接返回
  } catch (err: unknown) {
    const errStr = String(err).toLowerCase()
    // 用户主动取消
    if (errStr.includes('abort') || abortController?.signal.aborted) {
      throw err
    }

    // 关键检测：如果报错是因为不支持视觉
    if (isVisionUnsupportedError(errStr)) {
      console.warn('捕获到模型不支持视觉输入，正在执行静默降级到 OCR...')
      parseModeLabel.value = '自适应降级'
      statusText.value = '正在切换到本地 OCR 托底识别模式...'
      await new Promise(resolve => setTimeout(resolve, 1200))
    } else {
      // 其他错误直接上抛
      throw err
    }
  }

  if (abortController?.signal.aborted) return

  // 2. 本地 OCR 托底逻辑
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
    throw new Error('当前图片无法识别出任何文字，解析终止喵。')
  }

  // 3. 将 OCR 获取到的文本喂给纯文本逻辑
  parseModeLabel.value = '文本大模型解析'
  progressPercent.value = 70
  statusText.value = '正在对 OCR 识别出的文字进行最后结构化处理...'

  await parseResumeWithAI(
    { ...aiConfig.getConfigForFeature('default') },
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

async function startImport() {
  if (!selectedFile.value) return

  if (!aiConfig.isConfigured) {
    // 始终已配置（免费模型兜底），此处仅作安全检查
  }

  step.value = 'parsing'
  rawStreamText.value = ''
  parsedData.value = null
  errorMessage.value = ''
  abortController = new AbortController()

  try {
    if (isImageFile(selectedFile.value)) {
      await parseWithVision(selectedFile.value)
      return
    }

    if (isPdfFile(selectedFile.value)) {
      parseModeLabel.value = 'PDF 检测'
      statusText.value = '正在检测 PDF 中的可提取文本...'
      progressPercent.value = 8
      const pdfResult = await extractTextFromPdf(selectedFile.value)

      if (pdfResult.hasText && pdfResult.text.trim()) {
        parseModeLabel.value = '文本解析'
        progressPercent.value = 28
        statusText.value = `检测到 ${pdfResult.pageCount} 页 PDF 文本，AI 正在分析...`
        await parseResumeWithAI(
          {
            ...aiConfig.getConfigForFeature('resumeImport'),
          },
          pdfResult.text,
          getImportCallbacks(28),
          abortController.signal,
        )
        return
      }

      await parseWithVision(selectedFile.value, '检测到扫描版 PDF，自动改用图片识别')
      return
    }

    await parseWithText(selectedFile.value)
  } catch (err: unknown) {
    if (abortController?.signal.aborted) return
    step.value = 'error'
    errorMessage.value = normalizeImportError(err)
  }
}

function cancelParsing() {
  abortController?.abort()
  abortController = null
  step.value = 'select'
  statusText.value = ''
  progressPercent.value = 0
  rawStreamText.value = ''
  parseModeLabel.value = ''
}

function confirmImport() {
  if (!parsedData.value) return

  if (hasExistingData.value) {
    if (!window.confirm('解析结果将覆盖当前已有的简历数据，是否继续？')) return
  }

  store.clearAllData()
  
  // 最后一步应用到简历前，将 Markdown 转换为 HTML (此时才是简历渲染需要的格式喵)
  const convertedData = convertMarkdownFields(JSON.parse(JSON.stringify(parsedData.value)))
  store.importData(convertedData as ResumeImportPayload)

  const importedSummary = [
    parsedData.value.basicInfo?.name ? `已识别 ${parsedData.value.basicInfo.name}` : '已完成简历解析',
    parsedData.value.workList?.length ? `工作 ${parsedData.value.workList.length} 段` : '',
    parsedData.value.projectList?.length ? `项目 ${parsedData.value.projectList.length} 个` : '',
    parsedData.value.educationList?.length ? `教育 ${parsedData.value.educationList.length} 段` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  store.showImportFeedback(`${importedSummary}，内容已回填到编辑区，可继续修改。`)
  emit('close')
}

function resetToSelect() {
  step.value = 'select'
  errorMessage.value = ''
  parsedData.value = null
  rawStreamText.value = ''
  progressPercent.value = 0
  statusText.value = ''
  parseModeLabel.value = ''
  abortController = null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>

<template>
  <teleport to="body">
    <div class="dialog-overlay">
      <div class="dialog-card" :class="'dialog-card--' + step">
        <!-- 头部 -->
        <div class="dialog-header">
          <h3 class="dialog-title">
            <svg class="dialog-title-icon" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            简历解析
          </h3>
          <button class="dialog-close" @click="emit('close')">
            <svg class="icon-sm" viewBox="0 0 24 24"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
          </button>
        </div>

        <!-- 步骤指示器 -->
        <div class="step-indicator">
          <span class="step-dot" :class="{ active: step === 'select' }">1</span>
          <span class="step-line" :class="{ done: step !== 'select' }"></span>
          <span class="step-dot" :class="{ active: step === 'parsing' }">2</span>
          <span class="step-line" :class="{ done: step === 'preview' }"></span>
          <span class="step-dot" :class="{ active: step === 'preview' }">3</span>
        </div>

        <!-- Step 1: 选择文件 -->
        <div v-if="step === 'select'" class="dialog-body">
          <div
            class="drop-zone"
            :class="{ dragging: isDragging, 'has-file': selectedFile }"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
          >
            <div v-if="!selectedFile" class="drop-zone-content">
              <svg class="drop-zone-icon" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p class="drop-zone-text">拖拽文件到此处，或点击选择</p>
              <p class="drop-zone-hint">支持 PDF、DOCX、TXT、MD、JPG、PNG、WEBP</p>
            </div>
            <div v-else class="file-selected">
              <svg class="file-icon" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div class="file-info">
                <p class="file-name">{{ selectedFile.name }}</p>
                <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
              </div>
              <button class="file-remove" @click="selectedFile = null">
                <svg class="icon-sm" viewBox="0 0 24 24"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
              </button>
            </div>
            <input
              type="file"
              accept=".pdf,.docx,.doc,.txt,.md,.jpg,.jpeg,.png,.webp"
              class="drop-zone-input"
              @change="handleFileInput"
            />
          </div>

          <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

          <p v-if="!aiConfig.isConfigured" class="warning-text">
            请先在侧边栏配置 AI 服务，简历解析功能需要 AI 来提取并结构化内容。
          </p>
        </div>

        <!-- Step 2: 解析中 -->
        <div v-if="step === 'parsing'" class="dialog-body">
          <div class="parsing-status">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
            </div>
            <p v-if="parseModeLabel" class="parse-mode-chip">{{ parseModeLabel }}</p>
            <p class="status-text">{{ statusText }}</p>
            <div v-if="rawStreamText" class="stream-preview">
              <pre>{{ rawStreamText.slice(-200) }}</pre>
            </div>
          </div>
        </div>

        <!-- Step 3: 预览确认 -->
        <div v-if="step === 'preview' && parsedData && moduleStats" class="dialog-body preview-body">
          <div class="preview-stats">
            <div v-if="parsedData.basicInfo?.name" class="stat-card stat-card--name">
              <span class="stat-label">姓名</span>
              <span class="stat-value">{{ parsedData.basicInfo.name }}</span>
            </div>
            <div v-if="parsedData.basicInfo?.phone" class="stat-card">
              <span class="stat-label">电话</span>
              <span class="stat-value">{{ parsedData.basicInfo.phone }}</span>
            </div>
            <div v-if="parsedData.basicInfo?.email" class="stat-card">
              <span class="stat-label">邮箱</span>
              <span class="stat-value">{{ parsedData.basicInfo.email }}</span>
            </div>
            <div v-if="parsedData.basicInfo?.jobTitle" class="stat-card">
              <span class="stat-label">岗位</span>
              <span class="stat-value">{{ parsedData.basicInfo.jobTitle }}</span>
            </div>
          </div>

          <div class="module-stats-grid">
            <div v-if="moduleStats.work" class="module-stat">
              <span class="module-stat-num">{{ moduleStats.work }}</span>
              <span class="module-stat-label">工作经历</span>
            </div>
            <div v-if="moduleStats.project" class="module-stat">
              <span class="module-stat-num">{{ moduleStats.project }}</span>
              <span class="module-stat-label">项目经历</span>
            </div>
            <div v-if="moduleStats.education" class="module-stat">
              <span class="module-stat-num">{{ moduleStats.education }}</span>
              <span class="module-stat-label">教育经历</span>
            </div>
            <div v-if="moduleStats.skills" class="module-stat">
              <span class="module-stat-num"><svg class="icon-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg></span>
              <span class="module-stat-label">专业技能</span>
            </div>
            <div v-if="moduleStats.awards" class="module-stat">
              <span class="module-stat-num">{{ moduleStats.awards }}</span>
              <span class="module-stat-label">荣誉奖项</span>
            </div>
            <div v-if="moduleStats.selfIntro" class="module-stat">
              <span class="module-stat-num"><svg class="icon-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg></span>
              <span class="module-stat-label">个人简介</span>
            </div>
          </div>
        </div>

        <!-- Error 状态 -->
        <div v-if="step === 'error'" class="dialog-body">
          <div class="error-block">
            <svg class="error-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <p class="error-text">{{ errorMessage }}</p>
            <p class="error-tip">可尝试检查 AI 配置、切换支持视觉的模型，或压缩文件后重新解析。</p>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="dialog-footer">
          <template v-if="step === 'select'">
            <button class="btn-cancel" @click="emit('close')">取消</button>
            <button class="btn-primary" :disabled="!selectedFile || !aiConfig.isConfigured" @click="startImport">
              开始解析
            </button>
          </template>

          <template v-if="step === 'parsing'">
            <button class="btn-cancel" @click="cancelParsing">取消</button>
          </template>

          <template v-if="step === 'preview'">
            <button class="btn-cancel" @click="resetToSelect">重新选择</button>
            <button class="btn-primary" @click="confirmImport">确认填充</button>
          </template>

          <template v-if="step === 'error'">
            <button class="btn-cancel" @click="emit('close')">关闭</button>
            <button class="btn-secondary" @click="resetToSelect">重试</button>
          </template>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(30, 20, 14, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dialog-card {
  background: var(--bg-card);
  border-radius: 16px;
  width: 520px;
  max-width: 92vw;
  box-shadow: 0 20px 60px rgba(30, 20, 14, 0.18);
  animation: slideUp 0.25s ease;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}

.dialog-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.dialog-title-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: var(--primary-500);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.icon-sm {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dialog-close {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-close:hover {
  background: var(--gray-100);
  color: var(--primary-500);
}

/* 步骤指示器 */
.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 16px 24px 0;
}

.step-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  background: var(--gray-100);
  color: var(--text-muted);
  transition: all 0.25s;
}

.step-dot.active {
  background: var(--primary-500);
  color: var(--text-inverse);
}

.step-line {
  width: 60px;
  height: 2px;
  background: var(--gray-100);
  transition: background 0.25s;
}

.step-line.done {
  background: var(--primary-500);
}

/* 内容区 */
.dialog-body {
  padding: 16px 24px;
}

.preview-body {
  max-height: 400px;
  overflow-y: auto;
}

/* 拖拽区 */
.drop-zone {
  position: relative;
  border: 2px dashed var(--gray-300);
  border-radius: 12px;
  padding: 32px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--gray-50);
}

.drop-zone:hover {
  border-color: var(--primary-500);
  background: var(--primary-50);
}

.drop-zone.dragging {
  border-color: var(--primary-500);
  background: var(--primary-50);
  transform: scale(1.01);
}

.drop-zone.has-file {
  border-style: solid;
  border-color: #c8e6cf;
  background: #f5fbf7;
  padding: 16px 20px;
}

.drop-zone-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.drop-zone-content {
  pointer-events: none;
}

.drop-zone-icon {
  width: 36px;
  height: 36px;
  fill: none;
  stroke: var(--gray-400);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  margin: 0 auto 10px;
}

.drop-zone-text {
  margin: 0 0 4px;
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.drop-zone-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

/* 文件选中 */
.file-selected {
  display: flex;
  align-items: center;
  gap: 12px;
  pointer-events: none;
}

.file-icon {
  width: 32px;
  height: 32px;
  fill: none;
  stroke: #5a9e6f;
  stroke-width: 1.5;
  flex-shrink: 0;
}

.file-info {
  flex: 1;
  text-align: left;
  min-width: 0;
}

.file-name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.file-remove {
  pointer-events: auto;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: var(--gray-100);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.file-remove:hover {
  background: #f0d2c8;
  color: #b74a30;
}

/* 错误/警告 */
.error-text {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--accent-red);
  line-height: 1.45;
}

.warning-text {
  margin: 10px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, #f59e0b 6%, var(--bg-card));
  border: 1px solid rgba(224, 168, 80, 0.25);
  font-size: 12px;
  color: #a06a30;
  line-height: 1.5;
}

/* 解析中 */
.parsing-status {
  text-align: center;
  padding: 24px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.progress-bar {
  height: 6px;
  background: var(--gray-100);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 16px;
  width: 100%;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary-400), var(--primary-600));
  border-radius: 3px;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.progress-fill::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 100%);
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.parse-mode-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  margin: 0 0 10px;
  padding: 0 14px;
  border-radius: 999px;
  background: linear-gradient(120deg, var(--primary-100), var(--primary-50));
  color: var(--primary-700);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.status-text {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.stream-preview {
  width: 100%;
  margin-top: 4px;
  background: rgba(24, 25, 28, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  text-align: left;
  box-shadow: 0 12px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.05);
  position: relative;
  overflow: hidden;
}

.stream-preview::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 1.5px;
  background: linear-gradient(90deg, transparent, var(--primary-500), transparent);
  animation: scanlight 3s ease-in-out infinite;
}

@keyframes scanlight {
  0% { left: -100%; }
  100% { left: 200%; }
}

.stream-preview pre {
  margin: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #a9dc76;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
  max-height: 100px;
  overflow: hidden;
  animation: fade-in-up 0.3s ease-out;
}

@keyframes fade-in-up {
  0% { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* 预览确认 */
.preview-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.stat-card {
  flex: 1;
  min-width: 120px;
  padding: 8px 12px;
  background: var(--gray-50);
  border-radius: 8px;
  border: 1px solid var(--gray-100);
}

.stat-card--name {
  background: var(--primary-50);
  border-color: #f0d8c0;
}

.stat-label {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.stat-value {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.module-stats-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.module-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #f5fbf7;
  border: 1px solid #d4edda;
  border-radius: 20px;
  font-size: 13px;
  color: #3a6b4a;
}

.module-stat-num {
  font-weight: 700;
  color: var(--accent-green);
}

.module-stat-label {
  font-size: 12px;
}

.icon-check {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--accent-green);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 错误状态 */
.error-block {
  text-align: center;
  padding: 20px 0;
}

.error-icon {
  width: 36px;
  height: 36px;
  fill: none;
  stroke: var(--accent-red);
  stroke-width: 1.5;
  margin-bottom: 10px;
}

.error-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}

/* 底部按钮 */
.dialog-footer {
  padding: 0 24px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel {
  height: 38px;
  padding: 0 18px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel:hover {
  border-color: var(--gray-300);
}

.btn-secondary {
  height: 38px;
  padding: 0 18px;
  border-radius: 8px;
  border: 1px solid var(--primary-500);
  background: var(--bg-card);
  color: var(--primary-500);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-secondary:hover {
  background: var(--primary-50);
}

.btn-primary {
  height: 38px;
  padding: 0 20px;
  border-radius: 8px;
  border: none;
  background: var(--primary-500);
  color: var(--text-inverse);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-600);
}

.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
