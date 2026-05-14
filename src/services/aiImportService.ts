/**
 * AI 简历导入服务
 * 调用 OpenAI 兼容 API，将简历文本或图片解析为结构化 JSON
 */
import MarkdownIt from 'markdown-it'
import {
  RESUME_IMPORT_SECTION_USER_PROMPT_TEMPLATE,
  RESUME_IMPORT_SECTION_SYSTEM_PROMPTS,
  RESUME_IMPORT_SYSTEM_PROMPT,
  RESUME_IMPORT_USER_PROMPT_TEMPLATE,
  RESUME_IMPORT_VISION_USER_PROMPT,
  RESUME_IMPORT_MIXED_USER_PROMPT,
} from './prompts/resumeImportPrompt'

const md = new MarkdownIt({ breaks: true })

export interface AiConfig {
  apiUrl: string
  apiToken: string
  modelName: string
}

export interface ImportData {
  basicInfo?: Record<string, string>
  educationList?: Array<Record<string, string>>
  skills?: string
  workList?: Array<Record<string, string>>
  projectList?: Array<Record<string, string>>
  awardList?: Array<Record<string, string>>
  selfIntro?: string
}

export interface ImportCallbacks {
  onChunk: (text: string) => void
  onDone: (data: ImportData) => void
  onError: (msg: string) => void
  onWarnings?: (warnings: string[]) => void
}

export interface ImportValidationWarning {
  field: string
  message: string
}

/** 校验解析结果的数据质量，返回警告列表 */
export function validateImportData(data: ImportData): ImportValidationWarning[] {
  const warnings: ImportValidationWarning[] = []
  const bi = data.basicInfo

  // —— 基本信息 ——
  if (bi) {
    if (!bi.name) {
      warnings.push({ field: 'basicInfo.name', message: '未识别到姓名' })
    }
    if (bi.phone && !/^1[3-9]\d{9}$/.test(bi.phone.replace(/[\s-]/g, ''))) {
      warnings.push({ field: 'basicInfo.phone', message: `电话号码格式可能不正确: "${bi.phone}"` })
    }
    if (bi.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bi.email)) {
      warnings.push({ field: 'basicInfo.email', message: `邮箱格式可能不正确: "${bi.email}"` })
    }
  }

  // —— 日期合理性 ——
  const dateRegex = /^\d{4}\.\d{2}/
  const checkDateOrder = (
    items: Array<Record<string, string>> | undefined,
    listName: string,
  ) => {
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item) continue
      const start = item.startDate ?? item.start_date
      const end = item.endDate ?? item.end_date
      if (
        start && end &&
        dateRegex.test(start) && dateRegex.test(end) &&
        start > end
      ) {
        const label = item.company || item.school || item.name || `第${i + 1}条`
        warnings.push({
          field: `${listName}.${i}`,
          message: `「${label}」开始时间(${start})晚于结束时间(${end})`,
        })
      }
    }
  }

  checkDateOrder(data.workList, 'workList')
  checkDateOrder(data.projectList, 'projectList')
  checkDateOrder(data.educationList, 'educationList')

  // —— 模块空值检查 ——
  if (!data.workList?.length) {
    warnings.push({ field: 'workList', message: '未提取到工作经历' })
  }
  if (!data.educationList?.length) {
    warnings.push({ field: 'educationList', message: '未提取到教育经历' })
  }

  return warnings
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >
}

type ImportSectionKey = keyof ImportData

type ImportSectionConfig = {
  key: ImportSectionKey
  label: string
}

type JsonRecord = Record<string, unknown>

type ChatCompletionJsonResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}

const IMPORT_SECTIONS: ImportSectionConfig[] = [
  { key: 'basicInfo', label: '基本信息' },
  { key: 'educationList', label: '教育经历' },
  { key: 'workList', label: '工作经历' },
  { key: 'projectList', label: '项目经历' },
  { key: 'skills', label: '专业技能' },
  { key: 'awardList', label: '荣誉奖项' },
  { key: 'selfIntro', label: '个人简介' },
]

const EMPTY_IMPORT_DATA: ImportData = {
  basicInfo: {},
  educationList: [],
  skills: '',
  workList: [],
  projectList: [],
  awardList: [],
  selfIntro: '',
}

const IMPORT_SECTION_EMPTY_VALUE_FACTORIES: Record<ImportSectionKey, () => ImportData[ImportSectionKey]> = {
  basicInfo: () => ({}),
  educationList: () => [],
  skills: () => '',
  workList: () => [],
  projectList: () => [],
  awardList: () => [],
  selfIntro: () => '',
}

function createEmptyImportData(): ImportData {
  return {
    basicInfo: {},
    educationList: [],
    skills: '',
    workList: [],
    projectList: [],
    awardList: [],
    selfIntro: '',
  }
}

function getEmptySectionValue<K extends ImportSectionKey>(key: K): ImportData[K] {
  return IMPORT_SECTION_EMPTY_VALUE_FACTORIES[key]() as ImportData[K]
}

function cloneSectionValue<K extends ImportSectionKey>(key: K, value: ImportData[K]): ImportData[K] {
  if (Array.isArray(value)) {
    return value.map((item) => ({ ...item })) as ImportData[K]
  }
  if (value && typeof value === 'object') {
    return { ...value } as ImportData[K]
  }
  return (value ?? getEmptySectionValue(key)) as ImportData[K]
}

function mergeImportSection<K extends ImportSectionKey>(target: ImportData, key: K, value: ImportData[K]): void {
  target[key] = cloneSectionValue(key, value)
}

function finalizeImportDataFromObject(data: ImportData, callbacks: ImportCallbacks) {
  const finalData = data // 保持原始 Markdown 文本，不再在此处强转 HTML
  // 触发数据质量校验
  const warnings = validateImportData(finalData)
  if (warnings.length > 0 && callbacks.onWarnings) {
    callbacks.onWarnings(warnings.map(w => w.message))
  }
  callbacks.onDone(finalData)
}

function parseJsonObject(text: string): unknown {
  const cleaned = cleanJsonResponse(text)
  try {
    return JSON.parse(cleaned)
  } catch {
    // 首次解析失败，尝试修复后重试
    const repaired = tryRepairJson(cleaned)
    return JSON.parse(repaired)
  }
}

function buildSectionUserMessage(section: ImportSectionConfig, resumeText: string): string {
  return RESUME_IMPORT_SECTION_USER_PROMPT_TEMPLATE
    .replace(/\{sectionLabel\}/g, section.label)
    .replace('{sectionKey}', section.key)
    .replace('{resumeText}', resumeText)
}

function shouldUseSerialImport(resumeText: string): boolean {
  return resumeText.trim().length >= 3000
}

/** 带重试的 API 请求，最多重试 maxRetries 次 */
async function requestImportTextWithRetry(
  config: AiConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
  stream = true,
  maxRetries = 1,
  onStreamChunk?: (currentText: string) => void,
): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      return await requestImportText(config, messages, signal, stream, onStreamChunk)
    } catch (err: unknown) {
      lastError = err
      // 不重试的错误：用户取消、鉴权失败、模型不支持
      if (isAbortError(err)) throw err
      const msg = normalizeImportRequestError(err).toLowerCase()
      if (msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('authentication')) {
        throw err
      }
      // 指数退避等待
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
      }
    }
  }
  throw lastError
}

async function requestImportText(
  config: AiConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
  stream = true,
  onStreamChunk?: (currentText: string) => void,
): Promise<string> {
  const response = await fetch(resolveChatCompletionsUrl(config.apiUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiToken}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      messages,
      stream,
      response_format: { type: 'json_object' },
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await extractErrorText(response)
    throw new Error(`API 请求失败 (${response.status}): ${errorText || response.statusText}`)
  }

  if (stream) {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('无法读取 API 响应流')

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content
          if (typeof content === 'string' && content) {
            fullText += content
            if (onStreamChunk) {
              onStreamChunk(fullText)
            }
          }
        } catch {
          // 忽略格式异常的 SSE chunk
        }
      }
    }

    return fullText
  }

  let payload: ChatCompletionJsonResponse
  try {
    payload = await response.json()
  } catch {
    throw new Error('AI 返回的数据格式异常，无法读取响应内容。')
  }

  const content = payload.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('')
  }
  throw new Error('AI 未返回可解析的文本内容，请重试。')
}

function parseImportResponseText(text: string, callbacks: ImportCallbacks) {
  let raw: unknown
  try {
    raw = parseJsonObject(text)
  } catch {
    callbacks.onError('AI 返回的数据格式异常，无法解析为 JSON。请重试或检查简历内容。')
    return
  }

  const importData = normalizeImportData(raw)
  finalizeImportDataFromObject(importData, callbacks)
}

function handleImportCallbacksChunk(text: string, callbacks: ImportCallbacks) {
  callbacks.onChunk(text)
}

function shouldUseStreamImport(resumeText: string): boolean {
  return !shouldUseSerialImport(resumeText)
}

function buildFullImportUserMessage(resumeText: string): string {
  return RESUME_IMPORT_USER_PROMPT_TEMPLATE.replace('{resumeText}', resumeText)
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

function normalizeImportRequestError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Markdown 转 HTML（仅用于富文本字段） */
function mdToHtml(markdown: string): string {
  if (!markdown) return ''
  return md.render(markdown).trim()
}

/** 清理 AI 返回中可能存在的 markdown 代码块标记及前后多余文本 */
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim()
  // 移除 markdown 代码块包裹
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  }
  // 提取第一个 { 到最后一个 } 之间的内容（去除前后非 JSON 文本）
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    cleaned = cleaned.substring(start, end + 1)
  }
  return cleaned.trim()
}

/** 尝试修复常见的 JSON 截断问题 */
function tryRepairJson(text: string): string {
  let repaired = text
  // 移除末尾的逗号（数组/对象末尾多余的 ,）
  repaired = repaired.replace(/,(\s*[\]}])/g, '$1')
  // 尝试闭合未关闭的数组和对象
  const openBraces = (repaired.match(/{/g) || []).length
  const closeBraces = (repaired.match(/}/g) || []).length
  const openBrackets = (repaired.match(/\[/g) || []).length
  const closeBrackets = (repaired.match(/]/g) || []).length
  // 补齐缺失的闭合符号
  for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']'
  for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}'
  return repaired
}

/** 将 ImportData 中 Markdown 富文本字段转换为 HTML */
export function convertMarkdownFields(data: ImportData): ImportData {
  if (data.skills) data.skills = mdToHtml(data.skills)
  if (data.selfIntro) data.selfIntro = mdToHtml(data.selfIntro)

  if (data.workList) {
    for (const work of data.workList) {
      if (work.description) work.description = mdToHtml(work.description)
    }
  }

  if (data.projectList) {
    for (const project of data.projectList) {
      if (project.introduction) project.introduction = mdToHtml(project.introduction)
      if (project.mainWork) project.mainWork = mdToHtml(project.mainWork)
    }
  }

  if (data.educationList) {
    for (const edu of data.educationList) {
      if (edu.description) edu.description = mdToHtml(edu.description)
    }
  }

  if (data.awardList) {
    for (const award of data.awardList) {
      if (award.description) award.description = mdToHtml(award.description)
    }
  }

  return data
}

function resolveChatCompletionsUrl(apiUrl: string): string {
  if (/(^https?:\/\/)?(localhost|127\.0\.0\.1):11434(\/|$)/i.test(apiUrl) || /(^https?:\/\/)?ollama\.com(\/|$)/i.test(apiUrl)) {
    const normalized = apiUrl
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/chat\/completions$/i, '')
      .replace(/\/api$/i, '')
      .replace(/\/v1$/i, '')
    return `${normalized}/v1/chat/completions`
  }

  let baseUrl = apiUrl.trim().replace(/\/+$/, '')
  if (!baseUrl.includes('/v1/chat/completions')) {
    if (!baseUrl.endsWith('/v1')) {
      baseUrl += '/v1'
    }
    baseUrl += '/chat/completions'
  }
  return baseUrl
}

async function extractErrorText(response: Response): Promise<string> {
  const rawText = await response.text().catch(() => '')
  if (!rawText) return response.statusText

  try {
    const parsed = JSON.parse(rawText)
    return parsed.error?.message || parsed.message || rawText
  } catch {
    return rawText
  }
}

/** 判定错误是否由于模型不支持视觉/多模态输入导致 */
export function isVisionUnsupportedError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('image_url') ||
    lower.includes('multimodal') ||
    lower.includes('content_type') ||
    lower.includes('vision') ||
    lower.includes('unsupported content') ||
    lower.includes('invalid field: content') ||
    lower.includes('does not support output_format') ||
    lower.includes('invalid value for \'content\'')
  )
}

function getVisionFriendlyError(message: string, status?: number): string {
  const lower = message.toLowerCase()

  // 区分“模型不支持”和“数据过大”
  if (lower.includes('payload too large') || lower.includes('request entity too large') || lower.includes('too large')) {
    return '解析失败：上传的文件内容或图片体积过大。请尝试减少 PDF 页数或使用更小的图片文件。'
  }

  if (isVisionUnsupportedError(message)) {
    return '该模型不支持读取图片，系统将自动尝试切换到本地 OCR 模式...'
  }

  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('quota')
  ) {
    return '服务器目前请求过于频繁或额度已用尽，请稍后再试。'
  }

  if (
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('incorrect api key') ||
    lower.includes('authentication') ||
    lower.includes('permission denied')
  ) {
    return 'AI 接口鉴权失败，请检查 API Token 和模型配置是否正确。'
  }

  if (lower.includes('timeout') || lower.includes('networkerror') || lower.includes('failed to fetch')) {
    return '连接 AI 服务失败，可能是网络问题或接口地址不可达。'
  }

  return status ? `[HTTP ${status}] ${message}` : message
}

/**
 * 将 AI 返回的原始 JSON 规范化为安全的 ImportData 结构。
 * 处理字段缺失、类型不匹配、数组为 null 等常见异常，避免整体解析失败。
 */
function normalizeImportData(raw: unknown): ImportData {
  const source = raw && typeof raw === 'object' ? raw as JsonRecord : {}
  const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v ? [v] : [])

  // basicInfo：逐字段兜底
  const bi = source.basicInfo && typeof source.basicInfo === 'object'
    ? source.basicInfo as JsonRecord
    : null
  const basicInfo: Record<string, string> = bi
    ? {
        name: str(bi.name),
        phone: str(bi.phone),
        email: str(bi.email),
        age: str(bi.age),
        gender: str(bi.gender),
        location: str(bi.location),
        jobTitle: str(bi.jobTitle),
        educationLevel: str(bi.educationLevel ?? bi.education_level ?? bi.education),
        avatar: str(bi.avatar),
        workYears: str(bi.workYears ?? bi.work_years ?? bi.experienceYears),
        currentStatus: str(bi.currentStatus ?? bi.job_status),
        expectedLocation: str(bi.expectedLocation ?? bi.expected_location),
        expectedSalary: str(bi.expectedSalary ?? bi.expected_salary),
        website: str(bi.website),
        wechat: str(bi.wechat),
        currentCity: str(bi.currentCity ?? bi.current_city),
        github: str(bi.github),
        blog: str(bi.blog),
      }
    : {}

  // 列表类型：确保是数组，逐项确保是对象
  const normalizeList = (items: unknown[]): Array<Record<string, string>> =>
    items.map((item) => {
      if (!item || typeof item !== 'object') return {}
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(item)) {
        out[k] = typeof v === 'string' ? v : String(v ?? '')
      }
      return out
    })

  return {
    basicInfo,
    educationList: normalizeList(arr(source.educationList)),
    skills: str(source.skills),
    workList: normalizeList(arr(source.workList)),
    projectList: normalizeList(arr(source.projectList)),
    awardList: normalizeList(arr(source.awardList)),
    selfIntro: str(source.selfIntro ?? source.self_introduction ?? source.summary),
  }
}

function createStreamForwardCallbacks(callbacks: ImportCallbacks): ImportCallbacks {
  return {
    onChunk(text: string) {
      handleImportCallbacksChunk(text, callbacks)
    },
    onDone(data: ImportData) {
      callbacks.onDone(data)
    },
    onError(msg: string) {
      callbacks.onError(msg)
    },
  }
}

function createJsonForwardCallbacks(callbacks: ImportCallbacks): ImportCallbacks {
  return {
    onChunk(text: string) {
      handleImportCallbacksChunk(text, callbacks)
    },
    onDone(data: ImportData) {
      callbacks.onDone(data)
    },
    onError(msg: string) {
      callbacks.onError(msg)
    },
  }
}

async function requestImportAndParse(
  config: AiConfig,
  messages: ChatMessage[],
  callbacks: ImportCallbacks,
  signal: AbortSignal | undefined,
  stream: boolean,
): Promise<void> {
  const text = await requestImportText(config, messages, signal, stream, (currentText) => {
    callbacks.onChunk(currentText)
  })
  if (!text.trim()) {
    callbacks.onError('AI 未返回可解析的文本内容，请重试。')
    return
  }
  callbacks.onChunk(text)
  parseImportResponseText(text, callbacks)
}

function buildFullImportMessages(resumeText: string): ChatMessage[] {
  return [
    { role: 'system', content: RESUME_IMPORT_SYSTEM_PROMPT },
    { role: 'user', content: buildFullImportUserMessage(resumeText) },
  ]
}

function buildVisionImportMessages(userContent: ChatMessage['content']): ChatMessage[] {
  return [
    { role: 'system', content: RESUME_IMPORT_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]
}

function buildSerialSectionMessages(section: ImportSectionConfig, resumeText: string): ChatMessage[] {
  // 使用精简版 section prompt，大幅减少 token 消耗
  const sectionSystemPrompt = RESUME_IMPORT_SECTION_SYSTEM_PROMPTS[section.key]
  return [
    { role: 'system', content: sectionSystemPrompt || RESUME_IMPORT_SYSTEM_PROMPT },
    { role: 'user', content: buildSectionUserMessage(section, resumeText) },
  ]
}

function mergeSectionResult(section: ImportSectionConfig, text: string, aggregated: ImportData): void {
  const raw = parseJsonObject(text)
  const normalized = normalizeImportData({
    ...EMPTY_IMPORT_DATA,
    ...(raw && typeof raw === 'object' ? raw : {}),
  })
  mergeImportSection(aggregated, section.key, normalized[section.key] ?? getEmptySectionValue(section.key))
}

async function parseResumeWithAISectionsParallel(
  config: AiConfig,
  resumeText: string,
  callbacks: ImportCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const aggregated = createEmptyImportData()
  let completedCount = 0
  const totalSections = IMPORT_SECTIONS.length

  // 并行发起所有段落请求
  const tasks = IMPORT_SECTIONS.map((section) =>
    requestImportTextWithRetry(config, buildSerialSectionMessages(section, resumeText), signal, true)
      .then((text) => {
        completedCount++
        const progress = Math.min(30 + Math.floor((completedCount / totalSections) * 64), 94)
        callbacks.onChunk(`[${section.label} ${progress}%] 并行解析中 (${completedCount}/${totalSections})...`)
        mergeSectionResult(section, text, aggregated)
      })
      .catch((err) => {
        completedCount++
        console.warn(`[简历导入] 模块「${section.label}」解析失败:`, err)
        // 单个模块失败不影响整体，使用空值兜底
      }),
  )

  await Promise.all(tasks)

  if (signal?.aborted) return
  finalizeImportDataFromObject(aggregated, callbacks)
}

async function parseResumeWithAIFull(
  config: AiConfig,
  resumeText: string,
  callbacks: ImportCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  await requestImportAndParse(
    config,
    buildFullImportMessages(resumeText),
    createStreamForwardCallbacks(callbacks),
    signal,
    true,
  )
}

async function parseResumeWithAISmart(
  config: AiConfig,
  resumeText: string,
  callbacks: ImportCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  if (shouldUseStreamImport(resumeText)) {
    // 短文本直接走全量提取
    await parseResumeWithAIFull(config, resumeText, callbacks, signal)
    return
  }

  // 长文本：先尝试全量提取（保留跨模块上下文提升精度），失败再降级到并行分段
  callbacks.onChunk('[策略 30%] 正在全量提取简历结构...')

  try {
    await requestImportAndParse(
      config,
      buildFullImportMessages(resumeText),
      createStreamForwardCallbacks(callbacks),
      signal,
      true,
    )
  } catch (firstErr: unknown) {
    // 全量提取可能因 JSON 截断/格式异常失败
    if (signal?.aborted || isAbortError(firstErr)) return

    const errMsg = normalizeImportRequestError(firstErr)
    const isJsonError = errMsg.includes('JSON') || errMsg.includes('格式异常') || errMsg.includes('无法解析')
    if (!isJsonError) {
      // 非格式问题（网络/鉴权等），直接报错
      callbacks.onError(errMsg)
      return
    }

    // JSON 解析失败 → 降级到并行分段
    console.warn('[简历导入] 全量提取 JSON 解析失败，降级到并行分段:', errMsg)
    callbacks.onChunk('[策略 35%] 全量提取结果不完整，正在并行分段补全...')

    await parseResumeWithAISectionsParallel(config, resumeText, callbacks, signal)
  }
}

async function requestImport(
  config: AiConfig,
  messages: ChatMessage[],
  callbacks: ImportCallbacks,
  signal: AbortSignal | undefined,
  stream: boolean,
  visionMode = false,
): Promise<void> {
  try {
    await requestImportAndParse(
      config,
      messages,
      stream ? createStreamForwardCallbacks(callbacks) : createJsonForwardCallbacks(callbacks),
      signal,
      stream,
    )
  } catch (err: unknown) {
    if (isAbortError(err)) return
    const message = normalizeImportRequestError(err)
    callbacks.onError(visionMode ? getVisionFriendlyError(message) : message)
  }
}

/** 使用 AI 将简历文本结构化为 ImportData */
export async function parseResumeWithAI(
  config: AiConfig,
  resumeText: string,
  callbacks: ImportCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await parseResumeWithAISmart(config, resumeText, callbacks, signal)
  } catch (err: unknown) {
    if (signal?.aborted || isAbortError(err)) return
    callbacks.onError(normalizeImportRequestError(err))
  }
}

/** 使用 AI 从图片或扫描版 PDF 中提取纯文本 (OCR 管道) */
export async function extractTextFromVisionAI(
  config: AiConfig,
  imageUrls: string[],
  signal?: AbortSignal,
): Promise<string> {
  if (imageUrls.length === 0) {
    throw new Error('未获取到可用于视觉解析的图片内容。')
  }

  const prompt = `你是一个精确的 OCR 引擎。请将图片中的文字原样转录。
1. 保持原文的换行和段落结构。
2. 包含所有的细节，哪怕是错别字。
3. 如果有表格，请用 Markdown 格式输出。
4. 将转录结果完整包含在 <ocr_text> 与 </ocr_text> 标签内。`

  const userContent: ChatMessage['content'] = [
    { type: 'text', text: prompt },
    ...imageUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
  ]

  try {
    const rawText = await requestImportText(
      config,
      [{ role: 'user', content: userContent }],
      signal,
      false, // 非流式保证格式完整闭合
    )
    
    // 提取 <ocr_text> 包裹的内容
    const match = rawText.match(/<ocr_text>([\s\S]*?)<\/ocr_text>/i)
    if (match && match[1]) {
      return match[1].trim()
    }
    return rawText.trim()
  } catch (err: unknown) {
    if (signal?.aborted || isAbortError(err)) throw err
    const status = (err as any)?.status
    throw new Error(getVisionFriendlyError(normalizeImportRequestError(err), status))
  }
}

/**
 * 单步视觉结构化：直接发送图片 + 结构化 prompt，一次 API 调用返回 JSON
 * 相比两步流程（OCR → 结构化）速度提升约 50%，且保留了布局视觉信息提升精度
 */
export async function parseResumeWithVisionAI(
  config: AiConfig,
  imageUrls: string[],
  callbacks: ImportCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  if (imageUrls.length === 0) {
    callbacks.onError('未获取到可用于视觉解析的图片内容。')
    return
  }

  const userContent: ChatMessage['content'] = [
    { type: 'text', text: RESUME_IMPORT_VISION_USER_PROMPT },
    ...imageUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
  ]

  const messages = buildVisionImportMessages(userContent)

  try {
    // 开启流式以获得前端 UI 反馈
    const text = await requestImportTextWithRetry(config, messages, signal, true, 1, (currentText) => {
      callbacks.onChunk(currentText)
    })
    if (!text.trim()) {
      callbacks.onError('AI 未返回可解析的文本内容，请重试。')
      return
    }
    callbacks.onChunk(text)
    parseImportResponseText(text, callbacks)
  } catch (err: unknown) {
    if (signal?.aborted || isAbortError(err)) return
    const status = (err as any)?.status
    throw new Error(getVisionFriendlyError(normalizeImportRequestError(err), status))
  }
}

/**
 * 混合双打结构化：发送图片 + OCR文本底稿 + 结构化 prompt
 */
export async function parseResumeWithMixedAI(
  config: AiConfig,
  imageUrls: string[],
  ocrText: string,
  callbacks: ImportCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  if (imageUrls.length === 0) {
    callbacks.onError('未获取到可用于视觉解析的图片内容。')
    return
  }

  const promptText = RESUME_IMPORT_MIXED_USER_PROMPT.replace('{ocrText}', ocrText)

  const userContent: ChatMessage['content'] = [
    { type: 'text', text: promptText },
    ...imageUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
  ]

  const messages = buildVisionImportMessages(userContent)

  try {
    // 开启流式以获得前端 UI 反馈
    const text = await requestImportTextWithRetry(config, messages, signal, true, 1, (currentText) => {
      callbacks.onChunk(currentText)
    })
    if (!text.trim()) {
      callbacks.onError('AI 未返回可解析的文本内容，请重试。')
      return
    }
    callbacks.onChunk(text)
    parseImportResponseText(text, callbacks)
  } catch (err: unknown) {
    if (signal?.aborted || isAbortError(err)) return
    const status = (err as any)?.status
    throw new Error(getVisionFriendlyError(normalizeImportRequestError(err), status))
  }
}
