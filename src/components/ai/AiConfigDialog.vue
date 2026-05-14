<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import {
  AI_PROVIDERS,
  SEARCH_PROVIDERS,
  useAiConfigStore,
  normalizeApiUrl,
  getBaseUrl,
  detectOllamaMode,
  getOllamaApiUrl,
  requiresOllamaApiKey,
  SILICONFLOW_FREE_MODELS,
  isVisionModel,
  type OllamaMode,
  type AiChannel,
  type AiFeature,
  type AiFeatureOverride,
  type SearchProviderConfig,
  type SearchProviderId,
} from '@/stores/aiConfig'

const store = useAiConfigStore()

const props = withDefaults(defineProps<{
  visible?: boolean
}>(), {
  visible: true,
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:visible', value: boolean): void
}>()

// ═══════ 导航 ═══════
type TabKey = 'providers' | 'defaultModel' | 'voice' | 'vision' | 'search'

const activeTab = ref<TabKey>('providers')

const navItems: { key: TabKey; svgPath: string; label: string; desc: string }[] = [
  { key: 'providers', svgPath: 'M13 2L3 14h9l-1 8 10-12h-9l1-8', label: '模型服务', desc: '管理 AI 服务商' },
  { key: 'defaultModel', svgPath: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z', label: '默认模型', desc: '各功能模型指定' },
  { key: 'voice', svgPath: 'M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07', label: '语音服务', desc: 'TTS / ASR' },
  { key: 'vision', svgPath: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', label: '视觉 OCR', desc: '图片解析' },
  { key: 'search', svgPath: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z', label: '网络搜索', desc: 'Tavily / Exa / Serper / ...' },
]

// ═══════ 模型服务 ═══════
interface SidebarItem {
  key: string
  channelId?: string
  providerId: string
  name: string
  avatar: string
  isConfigured: boolean
  isReady: boolean
  enabled: boolean
  isCustom: boolean
}

const sidebarProviders = computed<SidebarItem[]>(() => {
  let items: SidebarItem[] = []
  
  // 1. Built-in providers
  AI_PROVIDERS.forEach(p => {
    const channel = store.channels.find(c => c.providerId === p.id)
    const hasApiUrl = !!channel?.apiUrl?.trim()
    const hasApiToken = !!channel?.apiToken?.trim()
    const isReady = p.id === 'ollama'
      ? hasApiUrl
      : (hasApiUrl && hasApiToken)
    items.push({
      key: channel ? channel.id : `proto-${p.id}`,
      channelId: channel?.id,
      providerId: p.id,
      name: channel ? channel.name : (p.name.split(' (')[0] || p.name),
      avatar: p.name.charAt(0) || '?',
      isConfigured: !!channel,
      isReady,
      enabled: channel ? channel.enabled !== false : true,
      isCustom: false
    })
  })

  // 2. Custom channels
  const customChannels = store.channels.filter(c => c.providerId === 'custom' || !AI_PROVIDERS.find(p => p.id === c.providerId))
  customChannels.forEach(c => {
    const isReady = !!c.apiUrl?.trim() && !!c.apiToken?.trim()
    items.push({
      key: c.id,
      channelId: c.id,
      providerId: c.providerId || 'custom',
      name: c.name,
      avatar: c.name.charAt(0).toUpperCase(),
      isConfigured: true,
      isReady,
      enabled: c.enabled !== false,
      isCustom: true
    })
  })

  // 3. Search Filter
  const q = providerSearch.value.trim().toLowerCase()
  if (q) {
    items = items.filter(i => i.name.toLowerCase().includes(q) || i.providerId.toLowerCase().includes(q))
  }

  return items
})

const selectedSidebarKey = ref<string>(
  store.lastUsedChannelId || store.channels[0]?.id || `proto-${AI_PROVIDERS[0]?.id}`
)
const showToken = ref(false)
const testing = ref(false)
const fetchingModels = ref(false)
const testResult = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const availableModels = ref<string[]>([])
const showAvailableModels = ref(false)

// 模型选择增强
const showModelList = ref(false)
const modelSelectRef = ref<HTMLElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})

const showTestModelPicker = ref(false)
const testBtnRef = ref<HTMLElement | null>(null)
const testPickerStyle = ref<Record<string, string>>({})

// ═══ Toast 通知系统 ═══
const toast = ref<{ text: string, type: 'success' | 'error', show: boolean }>({
  text: '',
  type: 'success',
  show: false
})
let toastTimer: any = null

function showToast(text: string, type: 'success' | 'error' = 'success') {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { text, type, show: true }
  toastTimer = setTimeout(() => {
    toast.value.show = false
  }, 3500)
}

// ═══ 确认弹窗逻辑 ═══
const confirmState = ref<{
  show: boolean
  title: string
  message: string
  onConfirm: (() => void) | null
}>({
  show: false,
  title: '',
  message: '',
  onConfirm: null
})

function requestConfirm(title: string, message: string, onConfirm: () => void) {
  confirmState.value = {
    show: true,
    title,
    message,
    onConfirm
  }
}

// 内部可见性，用于触发 transition
const internalVisible = ref(false)
onMounted(() => {
  internalVisible.value = props.visible
})

watch(
  () => props.visible,
  (visible) => {
    internalVisible.value = visible
  },
  { immediate: true }
)

function handleConfirm() {
  if (confirmState.value.onConfirm) confirmState.value.onConfirm()
  confirmState.value.show = false
}

function handleCancelConfirm() {
  confirmState.value.show = false
}

// 内部变更标记，防止 watch 递归死循环
let isInternalKeyChange = false

function updateTestPickerPosition() {
  if (!testBtnRef.value) return
  const rect = testBtnRef.value.getBoundingClientRect()
  testPickerStyle.value = {
    top: `${rect.bottom + 6}px`,
    right: `${window.innerWidth - rect.right}px`,
    minWidth: '200px'
  }
}

watch(showTestModelPicker, (v) => {
  if (v) updateTestPickerPosition()
})

function updateDropdownPosition() {
  if (!modelSelectRef.value) return
  const rect = modelSelectRef.value.getBoundingClientRect()
  dropdownStyle.value = {
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
  }
}

watch(showModelList, (v) => {
  if (v) {
    updateDropdownPosition()
  }
})

// ══════ 增强下拉组件 (Selector) 逻辑 ══════
const openSelectorKey = ref<string | null>(null)
const selectorSearchText = ref('')

function toggleSelector(key: string) {
  if (openSelectorKey.value === key) {
    openSelectorKey.value = null
  } else {
    openSelectorKey.value = key
    selectorSearchText.value = ''
  }
}

function closeSelectors() {
  openSelectorKey.value = null
}

const filteredSelectorModels = (models: string[]) => {
  const q = selectorSearchText.value.trim().toLowerCase()
  if (!q) return models
  return models.filter(m => m.toLowerCase().includes(q))
}

// 模型类型检测
function getModelType(name: string): string {
  const lower = name.toLowerCase()
  if (isVisionModel(name)) return '视觉'
  if (lower.includes('embed') || lower.includes('bge-')) return '嵌入'
  if (lower.includes('rerank')) return '重排'
  if (lower.includes('tts') || lower.includes('speech') || lower.includes('cosyvoice') || lower.includes('indextts')) return '语音'
  if (lower.includes('asr') || lower.includes('sensevoice') || lower.includes('telespeech')) return '语音'
  if (lower.includes('ocr')) return '视觉'
  return '推理'
}

function checkIsFree(modelId: string, providerId: string): boolean {
  if (providerId === 'siliconflow') {
    return SILICONFLOW_FREE_MODELS.includes(modelId) || modelId.toLowerCase().includes('free')
  }
  if (providerId === 'openrouter') {
    return modelId.toLowerCase().endsWith(':free') || modelId.toLowerCase().includes('/free')
  }
  return false
}

function buildModelOptions(list: string[]) {
  const result = list.map(m => {
    const isFree = checkIsFree(m, editingChannel.providerId)
    return { id: m, isFree, isVision: isVisionModel(m), type: getModelType(m) }
  })

  return result.sort((a, b) => {
    if (a.isFree && !b.isFree) return -1
    if (!a.isFree && b.isFree) return 1
    return a.id.localeCompare(b.id)
  })
}

// 模型选择器搜索
const modelSearch = ref('')

const filteredModels = computed(() => {
  let opts = buildModelOptions(editingChannel.fetchedModels || [])
  const q = modelSearch.value.trim().toLowerCase()
  if (q) {
    opts = opts.filter(m => m.id.toLowerCase().includes(q))
  }
  return opts
})

// 候选模型弹窗搜索
const candidateSearch = ref('')
const candidateCategory = ref('全部')

// 候选模型分类
const MODEL_CATEGORIES = ['全部', '免费', '推理', '语音', '视觉', '嵌入', '重排'] as const

const candidateCategories = computed(() => {
  const models = buildModelOptions(availableModels.value)
  const types = new Set(models.map(m => m.type))
  const hasFree = models.some(m => m.isFree)
  return (MODEL_CATEGORIES as readonly string[]).filter(c => {
    if (c === '全部') return true
    if (c === '免费') return hasFree
    return types.has(c)
  })
})

const availableModelOptions = computed(() => {
  const addedModels = new Set(editingChannel.fetchedModels)
  let list = buildModelOptions(availableModels.value).map(model => ({
    ...model,
    added: addedModels.has(model.id),
  }))
  // 分类过滤
  if (candidateCategory.value === '免费') {
    list = list.filter(m => m.isFree)
  } else if (candidateCategory.value !== '全部') {
    list = list.filter(m => m.type === candidateCategory.value)
  }
  // 搜索过滤
  const q = candidateSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(m => m.id.toLowerCase().includes(q))
  }
  return list
})

function selectModel(m: string) {
  editingChannel.modelName = m
  showModelList.value = false
}

function clearAvailableModels() {
  availableModels.value = []
  showAvailableModels.value = false
  candidateCategory.value = '全部'
  candidateSearch.value = ''
}

// 侧边栏搜索
const providerSearch = ref('')

function addModel(m: string) {
  if (editingChannel.fetchedModels.includes(m)) return
  const isFirstAddedModel = editingChannel.fetchedModels.length === 0
  editingChannel.fetchedModels = [...editingChannel.fetchedModels, m]
  if (isFirstAddedModel) {
    editingChannel.modelName = m
  }
}

// 删除已添加的模型
function removeModel(m: string) {
  editingChannel.fetchedModels = editingChannel.fetchedModels.filter(id => id !== m)
  // 若删除的是当前默认模型，自动切换
  if (editingChannel.modelName === m) {
    editingChannel.modelName = editingChannel.fetchedModels[0] || ''
  }
}

// ═══════ 自定义添加模型 ═══════
const showCustomModelInput = ref(false)
const customModelId = ref('')
const customModelInputRef = ref<HTMLInputElement | null>(null)

function toggleCustomModelInput() {
  showCustomModelInput.value = !showCustomModelInput.value
  if (showCustomModelInput.value) {
    nextTick(() => customModelInputRef.value?.focus())
  }
}

function confirmCustomModel() {
  const id = customModelId.value.trim()
  if (!id) return
  addModel(id)
  customModelId.value = ''
  showCustomModelInput.value = false
}

// 批量添加（换行或逗号分隔）
const batchModelText = ref('')

function batchAddModels() {
  const ids = batchModelText.value
    .split(/[,\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
  ids.forEach(id => addModel(id))
  batchModelText.value = ''
}

// 全选当前筛选结果
function addAllFilteredCandidates() {
  availableModelOptions.value.forEach(m => {
    if (!m.added) addModel(m.id)
  })
}

// 取消全选当前筛选结果
function removeAllFilteredCandidates() {
  const idsToRemove = new Set(availableModelOptions.value.map(m => m.id))
  editingChannel.fetchedModels = editingChannel.fetchedModels.filter(id => !idsToRemove.has(id))
  if (editingChannel.modelName && idsToRemove.has(editingChannel.modelName)) {
    editingChannel.modelName = editingChannel.fetchedModels[0] || ''
  }
}

// ═══════ isDirty 脏检测 ═══════
const formSnapshot = ref('')

function buildSearchSnapshot() {
  return SEARCH_PROVIDERS.map(provider => ({
    id: provider.id,
    enabled: searchProviderForm[provider.id].enabled,
    apiKey: searchProviderForm[provider.id].apiKey,
  }))
}

function takeSnapshot() {
  formSnapshot.value = JSON.stringify({
    apiUrl: editingChannel.apiUrl,
    apiToken: editingChannel.apiToken,
    modelName: editingChannel.modelName,
    fetchedModels: editingChannel.fetchedModels,
    enabled: editingChannel.enabled !== false,
    searchProviders: buildSearchSnapshot(),
  })
}

const isDirty = computed(() => {
  if (!formSnapshot.value) return false
  return JSON.stringify({
    apiUrl: editingChannel.apiUrl,
    apiToken: editingChannel.apiToken,
    modelName: editingChannel.modelName,
    fetchedModels: editingChannel.fetchedModels,
    enabled: editingChannel.enabled !== false,
    searchProviders: buildSearchSnapshot(),
  }) !== formSnapshot.value
})

function handleClose() {
  if (isDirty.value) {
    requestConfirm('未保存配置', '当前配置有未保存的更改，确定放弃并退出吗？', () => {
      actuallyClose()
    })
    return
  }
  actuallyClose()
}

function actuallyClose() {
  internalVisible.value = false
  clearAvailableModels()
  showModelList.value = false
  emit('update:visible', false)
  emit('close')
}

function handleClickOutsideModel(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (modelSelectRef.value && !modelSelectRef.value.contains(target)) {
    showModelList.value = false
  }
  // 点击外部关闭测试选择器
  if (showTestModelPicker.value && testBtnRef.value && !testBtnRef.value.contains(target) && !target.closest('.test-model-picker')) {
    showTestModelPicker.value = false
  }
  // 点击外部关闭所有 Selector
  if (!target.closest('.custom-selector')) {
    closeSelectors()
  }
}

onMounted(() => {
  window.addEventListener('mousedown', handleClickOutsideModel)
})

onUnmounted(() => {
  window.removeEventListener('mousedown', handleClickOutsideModel)
})

const editingChannel = reactive<Omit<AiChannel, 'id'>>({
  name: AI_PROVIDERS[0]?.name.split(' (')[0] || '默认渠道',
  providerId: AI_PROVIDERS[0]?.id || 'siliconflow',
  apiUrl: AI_PROVIDERS[0]?.baseUrl || '',
  apiToken: '',
  modelName: '',
  fetchedModels: [],
  enabled: true
})

const OLLAMA_MODE_OPTIONS: Array<{ id: OllamaMode; label: string }> = [
  { id: 'local', label: '本地' },
  { id: 'cloud', label: '云端' },
]

const isOllamaProvider = computed(() => editingChannel.providerId === 'ollama')
const ollamaMode = computed<OllamaMode>(() => (
  isOllamaProvider.value
    ? detectOllamaMode(editingChannel.apiUrl)
    : 'local'
))
const ollamaRequiresApiKey = computed(() => (
  isOllamaProvider.value && requiresOllamaApiKey(ollamaMode.value)
))

function setOllamaMode(mode: OllamaMode) {
  if (!isOllamaProvider.value) return
  const nextApiUrl = getOllamaApiUrl(mode)
  if (nextApiUrl) {
    editingChannel.apiUrl = nextApiUrl
  }
}

function shouldRequireApiToken() {
  if (editingChannel.providerId !== 'ollama') return true
  return requiresOllamaApiKey(ollamaMode.value)
}

function buildRequestHeaders(contentType?: string) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (contentType) {
    headers['Content-Type'] = contentType
  }

  const token = editingChannel.apiToken.trim()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  if (editingChannel.providerId === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = 'PrepWise Resume Builder'
  }

  return headers
}

function syncChannelToForm(id: string) {
  if (!id) return
  const channel = store.channels.find(c => c.id === id)
  if (channel) {
    editingChannel.name = channel.name
    editingChannel.providerId = channel.providerId
    editingChannel.apiUrl = channel.apiUrl
    editingChannel.apiToken = channel.apiToken
    editingChannel.modelName = channel.modelName
    editingChannel.fetchedModels = [...channel.fetchedModels]
    editingChannel.enabled = channel.enabled !== false
    testResult.value = null
    clearAvailableModels()
  }
}

function resetFormForProvider(providerId: string) {
  const provider = AI_PROVIDERS.find(p => p.id === providerId)
  editingChannel.name = provider?.name.split(' (')[0] || '新渠道'
  editingChannel.providerId = providerId
  editingChannel.apiUrl = providerId === 'custom'
    ? ''
    : providerId === 'ollama'
      ? getOllamaApiUrl('local')
      : (provider?.baseUrl || '')
  editingChannel.apiToken = ''
  editingChannel.modelName = ''
  editingChannel.fetchedModels = []
  editingChannel.enabled = true
  testResult.value = null
  clearAvailableModels()
  nextTick(() => takeSnapshot())
}

function loadSidebarConfig(key: string) {
  const item = sidebarProviders.value.find(i => i.key === key)
  if (!item) return

  if (item.channelId) {
    syncChannelToForm(item.channelId)
  } else {
    resetFormForProvider(item.providerId)
  }
  nextTick(() => takeSnapshot())
}

onMounted(() => {
  loadSidebarConfig(selectedSidebarKey.value)
})

// 切换服务商时进行脏检测
watch(selectedSidebarKey, (newKey, oldKey) => {
  if (isInternalKeyChange) {
    isInternalKeyChange = false
    return
  }
  
  if (newKey && newKey !== oldKey) {
    if (isDirty.value) {
      requestConfirm('切换服务商', '当前配置有未保存的更改，切换将丢失修改。继续吗？', () => {
        isInternalKeyChange = true
        selectedSidebarKey.value = newKey
        loadSidebarConfig(newKey)
      })
      // 暂时回滚选择，并标记为内部变更
      isInternalKeyChange = true
      nextTick(() => { selectedSidebarKey.value = oldKey })
      return
    }
    loadSidebarConfig(newKey)
  }
})

const isCustomProvider = computed(() => editingChannel.providerId === 'custom' || !AI_PROVIDERS.find(p => p.id === editingChannel.providerId))

// 启用/禁用切换
function toggleEnable(item: SidebarItem) {
  if (item.channelId) {
    store.updateChannel(item.channelId, { enabled: !item.enabled })
    if (selectedSidebarKey.value === item.key) {
      editingChannel.enabled = !item.enabled
      nextTick(() => takeSnapshot())
    }
  } else {
    // 若未配置，则新建一个空渠道并设定为关闭
    const newId = store.addChannel({
      providerId: item.providerId,
      apiUrl: '',
      apiToken: '',
      modelName: ''
    })
    store.updateChannel(newId, { enabled: false })
  }
}

// 底部固定新建自定义渠道
function handleAddCustomChannel() {
  const action = () => {
    const newId = store.addChannel({
      providerId: 'custom',
      apiUrl: '',
      apiToken: '',
      modelName: ''
    })
    nextTick(() => {
      selectedSidebarKey.value = newId
    })
  }

  if (isDirty.value) {
    requestConfirm('新建配置', '当前配置有未保存的更改，确定新建自定义配置吗？', action)
    return
  }
  action()
}

// 删除当前自定义渠道
function handleDeleteCurrentChannel() {
  const item = sidebarProviders.value.find(i => i.key === selectedSidebarKey.value)
  if (!item || !item.channelId) return
  
  requestConfirm('彻底删除', `确定要彻底删除 [${item.name}] 吗？此操作不可撤销。`, () => {
    store.deleteChannel(item.channelId!)
    const nextItem = sidebarProviders.value[0]
    if (nextItem) selectedSidebarKey.value = nextItem.key
  })
}

// 判断某个服务商是否已配置（有 token 就算已配置）
const providerConfigured = computed(() => {
  return (providerId: string) => {
    const ch = store.channels.find(c => c.providerId === providerId)
    return !!(ch && ch.apiToken)
  }
})

function extractErrorText(text: string): string {
  const cleaned = text.trim()
  if (!cleaned) return ''
  try {
    const parsed = JSON.parse(cleaned)
    return parsed.error?.message?.trim() || parsed.message?.trim() || cleaned
  } catch {
    return cleaned
  }
}

async function handleFetchModels() {
  if (fetchingModels.value) return
  if (!editingChannel.apiUrl || (shouldRequireApiToken() && !editingChannel.apiToken.trim())) {
    showToast('请完整填写 API 地址和 API Key。', 'error')
    return
  }
  fetchingModels.value = true
  testResult.value = null
  clearAvailableModels()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)


  // MiniMax 不支持标准 GET /v1/models 接口，直接注入已知模型列表
  const isMiniMax = editingChannel.providerId === 'minimax' || (editingChannel.apiUrl || '').includes('minimax')
  if (isMiniMax) {
    const knownModels = [
      'MiniMax-M2.7', 'MiniMax-M2.7-highspeed',
      'MiniMax-M2.5', 'MiniMax-M2.5-highspeed',
      'speech-2.8-hd', 'speech-2.8-turbo',
      'speech-2.6-hd', 'speech-2.6-turbo',
      'speech-02-hd', 'speech-02-turbo',
      'speech-01-hd', 'speech-01-turbo',
    ]
    availableModels.value = knownModels
    showAvailableModels.value = true
    showToast(`MiniMax 不支持自动获取，已加载 ${knownModels.length} 个预置模型`, 'success')
    clearTimeout(timeout)
    fetchingModels.value = false
    return
  }

  try {
    const baseUrl = getBaseUrl(editingChannel.apiUrl || '')
    let response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: buildRequestHeaders(),
      signal: controller.signal,
    })

    if (!response.ok && editingChannel.providerId === 'ollama') {
      const rawBase = (editingChannel.apiUrl || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
      const ollamaBase = rawBase.replace(/\/v1$/i, '').replace(/\/api$/i, '')
      response = await fetch(`${ollamaBase}/api/tags`, {
        method: 'GET',
        headers: buildRequestHeaders(),
        signal: controller.signal,
      })
    }

    if (!response.ok) {
      const errorText = extractErrorText(await response.text().catch(() => ''))
      throw new Error(`获取失败（${response.status}）：${errorText}`)
    }

    const data = await response.json()
    const modelList = Array.isArray(data?.data)
      ? data.data.map((m: any) => m.id).filter(Boolean)
      : Array.isArray(data?.models)
        ? data.models.map((m: any) => m.name || m.model).filter(Boolean)
        : []

    if (modelList.length) {
      const ids = [...new Set(modelList)] as string[]
      availableModels.value = ids
      showAvailableModels.value = true
      showToast(`成功获取到 ${ids.length} 个候选模型`, 'success')
    } else {
      showToast('未返回可用模型列表，请检查当前 Ollama 服务端配置。', 'error')
    }
  } catch (error: any) {
    showToast(`获取模型失败：${error.message}`, 'error')
  } finally {
    clearTimeout(timeout)
    fetchingModels.value = false
  }
}

async function handleTestConnection(specificModel?: string) {
  if (testing.value) return

  const targetModel = specificModel || (editingChannel.modelName || '').trim()

  if (!editingChannel.apiUrl || (shouldRequireApiToken() && !editingChannel.apiToken.trim()) || !targetModel) {
    if (!targetModel && editingChannel.fetchedModels.length > 0 && !specificModel) {
      showTestModelPicker.value = true
      return
    }
    showToast('请先完整填写 API 设置并选择一个测试模型', 'error')
    return
  }

  if (!specificModel && !editingChannel.modelName && editingChannel.fetchedModels.length > 1 && !showTestModelPicker.value) {
    showTestModelPicker.value = true
    return
  }

  showTestModelPicker.value = false
  testing.value = true
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const isMiniMax = editingChannel.providerId === 'minimax' || (editingChannel.apiUrl || '').includes('minimax')
    const isSpeechModel = targetModel.includes('speech-') || targetModel.includes('tts-')

    let testUrl = normalizeApiUrl(editingChannel.apiUrl)
    let testBody: any = {
      model: targetModel,
      messages: [{ role: 'user', content: 'Connection Test' }],
      stream: false,
      temperature: 0,
      max_tokens: 2,
    }

    // MiniMax 语音模型专用测试逻辑
    if (isMiniMax && isSpeechModel) {
      const baseUrl = getBaseUrl(editingChannel.apiUrl || '')
      // 判定是否使用 v2 接口 (speech-02 或 speech-2.x)
      const isV2 = targetModel.includes('speech-02') || targetModel.includes('speech-2.')
      testUrl = isV2 ? `${baseUrl}/t2a_v2` : `${baseUrl}/audio/speech`
      
      testBody = isV2 ? {
        model: targetModel,
        text: '测试',
        stream: false,
        voice_setting: { voice_id: 'male-qn-qingse' },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' }
      } : {
        model: targetModel,
        text: '测试',
        voice_id: 'male-qn-qingse'
      }
    }

    const response = await fetch(testUrl, {
      method: 'POST',
      headers: buildRequestHeaders('application/json'),
      body: JSON.stringify(testBody),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      const cleanError = extractErrorText(errorText)
      showToast(`[${targetModel}] 测试失败: ${cleanError}`, 'error')
      return
    }
    showToast(`测试通过：[${targetModel}] 响应正常`, 'success')
  } catch (error: any) {
    if (error.name === 'AbortError') {
      showToast('测试超时，请检查网络或服务状态', 'error')
    } else {
      showToast(`测试失败: ${error.message}`, 'error')
    }
  } finally {
    clearTimeout(timeout)
    testing.value = false
  }
}

// ═══════ 语音服务配置 ═══════
const ttsChannelId = ref('')
const ttsModelId = ref('')
const asrChannelId = ref('')
const asrModelId = ref('')
const ttsTesting = ref(false)
const ttsTestResult = ref<{ type: 'success' | 'error'; text: string } | null>(null)

// ═══════ 视觉识别 ═══════
const visionChannelId = ref('')
const visionModelId = ref('')

// ═══════ 搜索服务 ═══════
type SearchProviderFormState = SearchProviderConfig & { apiKey: string }
const searchProviderForm = reactive<Record<SearchProviderId, SearchProviderFormState>>({
  tavily: { id: 'tavily', enabled: true, apiKey: '' },
  exa: { id: 'exa', enabled: false, apiKey: '' },
  serper: { id: 'serper', enabled: false, apiKey: '' },
  firecrawl: { id: 'firecrawl', enabled: false, apiKey: '' },
})
const searchKeyVisibility = reactive<Record<SearchProviderId, boolean>>({
  tavily: false,
  exa: false,
  serper: false,
  firecrawl: false,
})
const searchTesting = reactive<Record<SearchProviderId, boolean>>({
  tavily: false,
  exa: false,
  serper: false,
  firecrawl: false,
})
const searchTestResult = reactive<Record<SearchProviderId, { type: 'success' | 'error'; text: string } | null>>({
  tavily: null,
  exa: null,
  serper: null,
  firecrawl: null,
})

function syncSearchProviderForm() {
  SEARCH_PROVIDERS.forEach(provider => {
    const stored = store.searchProviders.find(item => item.id === provider.id)
    searchProviderForm[provider.id].enabled = stored?.enabled !== false
    searchProviderForm[provider.id].apiKey = store.searchApiKeys[provider.id] || ''
  })
}



// 从 store 初始化各配置
function initOverrideConfig(feature: 'tts' | 'asr' | 'vision', channelIdRef: typeof ttsChannelId, modelIdRef: typeof ttsModelId) {
  const override = store.modelOverrides[feature]
  if (override?.channelId && override?.modelId) {
    channelIdRef.value = override.channelId
    modelIdRef.value = override.modelId
  } else {
    channelIdRef.value = store.channels[0]?.id || ''
    modelIdRef.value = ''
  }
}
initOverrideConfig('tts', ttsChannelId, ttsModelId)
initOverrideConfig('asr', asrChannelId, asrModelId)
initOverrideConfig('vision', visionChannelId, visionModelId)
syncSearchProviderForm()

// 视觉模型配置：严格从所选渠道获取模型列表
const visionModelOptions = computed(() => getModelsForChannel(visionChannelId.value))

// 语音服务模型：严格从所选渠道获取模型列表
const ttsModels = computed(() => getModelsForChannel(ttsChannelId.value))
const asrModels = computed(() => getModelsForChannel(asrChannelId.value))

// 主模型配置：拆分为渠道 + 模型
const mainModels = computed(() => getModelsForChannel(store.lastUsedChannelId))
const mainModelId = computed({
  get: () => {
    const ch = store.channels.find(c => c.id === store.lastUsedChannelId)
    return ch?.modelName || ''
  },
  set: (val: string) => {
    if (store.lastUsedChannelId) {
      store.updateChannel(store.lastUsedChannelId, { modelName: val })
    }
  }
})

const voiceConfigured = computed(() => !!(ttsChannelId.value && ttsModelId.value))
const visionConfigured = computed(() => !!(visionChannelId.value && visionModelId.value))
const searchConfigured = computed(() => SEARCH_PROVIDERS.some(provider => searchProviderForm[provider.id].enabled && !!searchProviderForm[provider.id].apiKey.trim()))

// ═══════ 功能级模型覆盖（默认模型 Tab 扩展） ═══════
interface FeatureOverrideRow {
  feature: AiFeature
  label: string
  desc: string
  channelId: string
  modelId: string
}

const FEATURE_ROWS: { feature: AiFeature; label: string; desc: string }[] = [
  { feature: 'resumeOptimize', label: '简历优化', desc: '简历 AI 改写、优化建议' },
  { feature: 'jdAnalysis', label: 'JD 分析', desc: 'JD 解析、匹配、优化' },
  { feature: 'interview', label: '面试对话', desc: 'AI 模拟面试、专项训练' },
  { feature: 'jdCompanyIntel', label: '公司情报', desc: '公司背景、竞品调研' },
  { feature: 'resumeImport', label: '简历导入', desc: '智能解析简历文件' },
  { feature: 'jdInterview', label: '面试题库', desc: '面试题生成、追问' },
]

const featureOverrides = ref<FeatureOverrideRow[]>(
  FEATURE_ROWS.map(row => {
    const override = store.modelOverrides[row.feature]
    return {
      ...row,
      channelId: override?.channelId || '',
      modelId: override?.modelId || '',
    }
  })
)

// 根据渠道 ID 获取该渠道的已添加模型列表
function getModelsForChannel(channelId: string): string[] {
  if (!channelId) return []
  const ch = store.channels.find(c => c.id === channelId)
  return ch?.fetchedModels?.length ? ch.fetchedModels : (ch?.modelName ? [ch.modelName] : [])
}

function clearFeatureOverride(index: number) {
  const row = featureOverrides.value[index]
  if (!row) return
  row.channelId = ''
  row.modelId = ''
}

function getTtsConfig() {
  const ch = store.channels.find(c => c.id === ttsChannelId.value)
  if (!ch) return null
  return {
    providerId: ch.providerId,
    apiUrl: ch.apiUrl,
    apiToken: ch.apiToken,
    modelName: ttsModelId.value || ch.modelName,
  }
}

async function handleTestTts() {
  if (ttsTesting.value) return
  const config = getTtsConfig()
  if (!config || !config.apiToken) {
    ttsTestResult.value = { type: 'error', text: '请先选择渠道并确保已填写 API Key。' }
    return
  }
  ttsTesting.value = true
  ttsTestResult.value = null
  try {
    const { generateSpeechUrl } = await import('@/services/audioService')
    const url = await generateSpeechUrl(config, '你好，我是AI面试官，很高兴认识你。', undefined, 'claire')
    const audio = new Audio(url)
    await audio.play()
    ttsTestResult.value = { type: 'success', text: '测试通过！语音播放正常。' }
    audio.onended = () => URL.revokeObjectURL(url)
  } catch (e: any) {
    ttsTestResult.value = { type: 'error', text: `测试失败：${e.message}` }
  } finally {
    ttsTesting.value = false
  }
}

async function handleTestSearchProvider(providerId: SearchProviderId) {
  const provider = searchProviderForm[providerId]
  if (searchTesting[providerId]) return
  if (!provider.apiKey.trim()) {
    searchTestResult[providerId] = { type: 'error', text: '请先填写 API Key。' }
    return
  }

  searchTesting[providerId] = true
  searchTestResult[providerId] = null
  try {
    const { testSearchProviderConnection } = await import('@/services/searchService')
    await testSearchProviderConnection({
      id: provider.id,
      enabled: provider.enabled,
      apiKey: provider.apiKey.trim(),
    })
    searchTestResult[providerId] = { type: 'success', text: '测试通过，搜索服务连接正常。' }
  } catch (e: any) {
    searchTestResult[providerId] = { type: 'error', text: `测试失败：${e.message}` }
  } finally {
    searchTesting[providerId] = false
  }
}

// ═══════ 导航徽标状态 ═══════
function getNavBadge(key: TabKey): { text: string; on: boolean } | null {
  if (key === 'providers') {
    const count = store.channels.filter(c => c.apiToken).length
    return count > 0 ? { text: `${count}`, on: true } : null
  }
  if (key === 'voice') return { text: voiceConfigured.value ? 'ON' : 'OFF', on: voiceConfigured.value }
  if (key === 'vision') return { text: visionConfigured.value ? 'ON' : 'OFF', on: visionConfigured.value }
  if (key === 'search') return { text: searchConfigured.value ? 'ON' : 'OFF', on: searchConfigured.value }
  return null
}

// ═══════ 统一保存 ═══════
function handleSaveAndApply() {
  const item = sidebarProviders.value.find(i => i.key === selectedSidebarKey.value)
  if (!item) return

  // 保存当前编辑中的模型服务渠道
  if (editingChannel.apiToken && editingChannel.modelName) {
    if (item.channelId) {
      // 更新现有渠道
      store.updateChannel(item.channelId, {
        ...editingChannel,
        // 如果是自定义，还要保存可能变更的名字
        name: isCustomProvider.value ? editingChannel.name : item.name
      })
      store.lastUsedChannelId = item.channelId
    } else {
      // 为内置服务商新建渠道
      const newId = store.addChannel({
        providerId: item.providerId,
        apiUrl: editingChannel.apiUrl,
        apiToken: editingChannel.apiToken,
        modelName: editingChannel.modelName,
      })
      if (editingChannel.fetchedModels.length > 0) {
        store.updateChannel(newId, { fetchedModels: editingChannel.fetchedModels })
      }
      store.lastUsedChannelId = newId
      // 更新当前选中的 Key 为新生成的 ID，防止下次点击保存变成新建
      nextTick(() => { selectedSidebarKey.value = newId })
    }
  }


  // 保存扩展服务配置
  const save = (f: 'tts' | 'asr' | 'vision', cid: string, mid: string) => {
    store.updateModelOverride(f, cid, mid)
  }
  save('tts', ttsChannelId.value, ttsModelId.value)
  save('asr', asrChannelId.value, asrModelId.value)
  save('vision', visionChannelId.value, visionModelId.value)
  SEARCH_PROVIDERS.forEach(provider => {
    store.updateSearchProvider(provider.id, { enabled: searchProviderForm[provider.id].enabled })
    store.setSearchProviderApiKey(provider.id, searchProviderForm[provider.id].apiKey.trim())
  })

  // 保存功能级模型覆盖
  for (const row of featureOverrides.value) {
    store.updateModelOverride(row.feature, row.channelId, row.modelId)
  }

  // 重置快照，标记为已保存
  takeSnapshot()
  clearAvailableModels()
  showModelList.value = false
  showToast('配置已保存', 'success')
}
</script>

<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="internalVisible" class="cfg-overlay" @click.self="handleClose">
        <div class="cfg-dialog">

        <!-- ═══ 头部 ═══ -->
        <div class="cfg-header">
          <div>
            <h2 class="cfg-title">模型配置</h2>
            <p class="cfg-subtitle">配置模型与扩展服务，开启 AI 功能</p>
          </div>
          <button class="cfg-close" @click="handleClose" title="关闭">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M13.5 4.5L4.5 13.5M4.5 4.5l9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>

        <!-- ═══ 主体：左导航 + 右内容 ═══ -->
        <div class="cfg-main">

          <!-- 左侧导航 -->
          <nav class="cfg-nav">
            <button
              v-for="item in navItems" :key="item.key"
              class="cfg-nav-item"
              :class="{ active: activeTab === item.key }"
              @click="activeTab = item.key"
            >
              <span class="cfg-nav-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path :d="item.svgPath" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
              <div class="cfg-nav-text">
                <span class="cfg-nav-label">{{ item.label }}</span>
                <span class="cfg-nav-desc">{{ item.desc }}</span>
              </div>
              <span v-if="getNavBadge(item.key)" class="cfg-nav-badge" :class="{ on: getNavBadge(item.key)!.on }">
                {{ getNavBadge(item.key)!.text }}
              </span>
            </button>
          </nav>

          <!-- 右侧内容区 -->
          <div class="cfg-content custom-scrollbar">

            <!-- ═══ 模型服务 ═══ -->
            <div v-if="activeTab === 'providers'" class="cfg-panel">


              <!-- 模型服务双栏布局：左列服务商列表 + 右列详情 -->
              <div class="provider-layout">
                <!-- 左列：服务商列表 -->
                <div class="provider-list-col">
                  <!-- 顶部固定：搜索 + 添加 -->
                  <div class="provider-list-header">
                    <div class="provider-search-wrap">
                      <svg class="ps-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                      <input v-model="providerSearch" class="ps-input" placeholder="搜索模型平台..." />
                    </div>
                    <button class="add-top-btn" @click="handleAddCustomChannel">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>
                      添加自定义配置
                    </button>
                  </div>

                  <div class="provider-list custom-scrollbar">
                    <div
                      v-for="item in sidebarProviders" :key="item.key"
                      class="provider-list-item"
                      :class="{ active: selectedSidebarKey === item.key }"
                      @click="selectedSidebarKey = item.key"
                    >
                      <span class="provider-avatar">{{ item.avatar }}</span>
                      <span class="provider-list-name">{{ item.name }}</span>
                      <span v-if="item.isReady" class="provider-ready-badge">ON</span>
                    </div>
                  </div>
                </div>

                <!-- 右列：选中服务商详情 -->
                <div class="provider-detail-col custom-scrollbar">
                  <div class="detail-head">
                    <div class="dh-left">
                      <template v-if="isCustomProvider">
                        <input v-model="editingChannel.name" class="custom-name-input" placeholder="输入自定义名称" />
                        <button class="cfg-action-icon delete" title="彻底删除此渠道" @click="handleDeleteCurrentChannel">
                           <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                        </button>
                      </template>
                      <template v-else>
                        <span class="detail-provider-name">{{ editingChannel.name }}</span>
                      </template>
                    </div>

                    <div class="provider-switch" @click="toggleEnable(sidebarProviders.find(i => i.key === selectedSidebarKey)!)">
                      <div class="switch-track" :class="{ on: editingChannel.enabled }">
                        <div class="switch-thumb"></div>
                      </div>
                    </div>
                  </div>
                <!-- API 地址 -->
                <div class="cfg-field">
                  <div v-if="isOllamaProvider" class="cfg-label-row ollama-mode-row">
                    <label class="cfg-label">服务模式</label>
                    <div class="ollama-mode-switch" role="tablist" aria-label="Ollama service mode">
                      <button
                        v-for="option in OLLAMA_MODE_OPTIONS"
                        :key="option.id"
                        type="button"
                        class="ollama-mode-btn"
                        :class="{ active: ollamaMode === option.id }"
                        @click="setOllamaMode(option.id)"
                      >{{ option.label }}</button>
                    </div>
                  </div>

                  <label class="cfg-label">API 地址</label>
                  <input 
                    v-model="editingChannel.apiUrl" 
                    id="ai-api-endpoint"
                    name="ai-api-endpoint"
                    class="cfg-input ignore-pass-manager" 
                    :placeholder="isOllamaProvider ? 'http://localhost:11434/api 或 https://ollama.com/api' : 'https://your-api.com/v1'"
                    autocomplete="one-time-code"
                    data-1p-ignore
                    spellcheck="false"
                  />
                  <p v-if="!isOllamaProvider && !isCustomProvider" class="cfg-hint">预设：{{ AI_PROVIDERS.find(p => p.id === editingChannel.providerId)?.baseUrl }}/chat/completions</p>
                </div>

                <!-- API 密钥 -->
                <div class="cfg-field">
                  <div class="cfg-label-row">
                    <label class="cfg-label">API 密钥</label>
                    <a
                      v-if="!isCustomProvider && AI_PROVIDERS.find(p => p.id === editingChannel.providerId)?.keyUrl"
                      class="cfg-key-link"
                      :href="AI_PROVIDERS.find(p => p.id === editingChannel.providerId)!.keyUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                    >获取密钥<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg></a>
                  </div>
                  <div class="cfg-input-wrap">
                    <input
                      v-model="editingChannel.apiToken"
                      id="ai-auth-token"
                      name="ai-auth-token"
                      type="text"
                      class="cfg-input ignore-pass-manager"
                      :class="{ 'masked-token': !showToken }"
                      :placeholder="isOllamaProvider ? (ollamaRequiresApiKey ? 'ollama_...' : '本地模式可留空') : 'sk-...'"
                      autocomplete="one-time-code"
                      data-1p-ignore
                      spellcheck="false"
                    />
                    <button class="cfg-eye" @click="showToken = !showToken" :title="showToken ? '隐藏' : '显示'">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path v-if="!showToken" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" stroke-width="2"/><circle v-if="!showToken" cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path v-if="showToken" d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>
                    <button ref="testBtnRef" class="cfg-test-key" @click="handleTestConnection()" :disabled="testing" title="测试连接">
                      {{ testing ? '...' : '测试' }}
                    </button>

                    <transition name="pop">
                      <div v-if="showTestModelPicker" class="test-model-picker" :style="testPickerStyle" @click.stop>
                        <div class="tmp-head">
                          <span>选择测试模型</span>
                          <button class="tmp-close" @click="showTestModelPicker = false">×</button>
                        </div>
                        <div class="tmp-list custom-scrollbar">
                          <div 
                            v-for="m in editingChannel.fetchedModels" :key="m" 
                            class="tmp-item"
                            @click="handleTestConnection(m)"
                          >
                            <span class="tmp-name">{{ m }}</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>
                          </div>
                        </div>
                      </div>
                    </transition>
                  </div>
                  <p v-if="isOllamaProvider && !ollamaRequiresApiKey" class="cfg-hint">本地 Ollama 不要求认证，密钥可以留空；如需接入带鉴权的代理服务，也可以手动填写。</p>
                  <p v-else-if="isOllamaProvider" class="cfg-hint">云端 Ollama 需要 API Key，密钥仅保存在当前浏览器会话中。</p>
                  <p v-else class="cfg-hint">密钥仅保存在当前浏览器会话中，关闭当前标签页后需要重新填写。</p>
                </div>

                <div class="cfg-field">
                  <div class="cfg-label-row">
                    <label class="cfg-label">模型 <span class="cfg-count" v-if="editingChannel.fetchedModels.length">{{ editingChannel.fetchedModels.length }}</span></label>
                    <div class="cfg-label-actions">
                      <button class="cfg-link-btn" @click="handleFetchModels" :disabled="fetchingModels">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        {{ fetchingModels ? '获取中...' : '获取模型列表' }}
                      </button>
                      <button class="cfg-link-btn cfg-add-btn" @click="toggleCustomModelInput" title="手动添加模型">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
                      </button>
                    </div>
                  </div>

                  <!-- 自定义添加模型弹窗 -->
                  <teleport to="body">
                    <transition name="pop">
                      <div v-if="showCustomModelInput" class="cfg-overlay modal-light-overlay" @click.self="showCustomModelInput = false">
                        <div class="custom-model-modal">
                          <h3 class="cmm-title">添加自定义模型</h3>
                          <input
                            ref="customModelInputRef"
                            v-model="customModelId"
                            class="cfg-input cmm-input"
                            placeholder="如 gpt-4o、deepseek-r1，按回车添加"
                            @keydown.enter="confirmCustomModel"
                            @keydown.esc="showCustomModelInput = false"
                          />
                          <div class="cmm-actions">
                            <button class="cfg-link-btn" @click="showCustomModelInput = false">取消</button>
                            <button class="cfg-link-btn primary" @click="confirmCustomModel" :disabled="!customModelId.trim()">确认添加</button>
                          </div>
                        </div>
                      </div>
                    </transition>
                  </teleport>

                  <!-- 模型选择器（选中默认模型） -->
                  <div class="model-select" ref="modelSelectRef">
                    <div
                      class="model-trigger"
                      :class="{ active: showModelList, empty: !editingChannel.modelName }"
                      @click="showModelList = !showModelList"
                    >
                      <span class="model-current">{{ editingChannel.modelName || '请先获取并添加模型' }}</span>
                      <svg class="model-arrow" :class="{ open: showModelList }" width="12" height="12" viewBox="0 0 12 12"><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    </div>
                    <transition name="pop">
                      <div v-if="showModelList" class="model-dropdown" :style="dropdownStyle">
                        <!-- 下拉搜索框 -->
                        <div class="model-search-wrap">
                          <svg class="model-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                          <input v-model="modelSearch" class="model-search-input" placeholder="搜索模型..." @click.stop />
                        </div>
                        <div class="model-list custom-scrollbar">
                          <div v-if="filteredModels.length === 0" class="model-empty">
                            {{ modelSearch ? '未找到匹配的模型' : '暂无已添加模型，请点击「获取模型列表」' }}
                          </div>
                          <div
                            v-for="m in filteredModels" :key="m.id"
                            class="model-row"
                            :class="{ selected: editingChannel.modelName === m.id }"
                            @click="selectModel(m.id)"
                          >
                            <div class="model-row-info">
                              <span class="model-row-name">{{ m.id }}</span>
                              <div class="model-row-badges">
                                <span v-if="m.isFree" class="model-badge badge-free">FREE</span>
                                <span class="model-badge badge-type">{{ m.type }}</span>
                              </div>
                            </div>
                            <svg v-if="editingChannel.modelName === m.id" class="model-check" width="16" height="16" viewBox="0 0 16 16"><path d="M4 8l3 3 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                          </div>
                        </div>
                      </div>
                    </transition>
                  </div>

                  <!-- 已添加模型整齐列表展示 -->
                  <div v-if="editingChannel.fetchedModels.length" class="model-block-section">
                    <span class="model-block-title">已添加模型</span>
                    <div class="model-block-list">
                      <div
                        v-for="m in buildModelOptions(editingChannel.fetchedModels)"
                        :key="m.id"
                        class="model-block-item"
                        :class="{ 'is-default': editingChannel.modelName === m.id }"
                        @click="editingChannel.modelName = m.id"
                        :title="editingChannel.modelName === m.id ? '当前默认模型' : '点击设为默认'"
                      >
                        <div class="mb-left">
                          <svg v-if="editingChannel.modelName === m.id" width="16" height="16" viewBox="0 0 16 16" style="color:var(--accent-blue-500)"><path d="M4 8l3 3 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                          <svg v-else width="16" height="16" viewBox="0 0 24 24" style="color:var(--text-muted)"><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
                          <span class="mb-name">{{ m.id }}</span>
                        </div>
                          <div class="mb-right">
                            <span v-if="m.isFree" class="model-badge badge-free">FREE</span>
                            <span class="model-badge badge-type">{{ m.type }}</span>
                            <div class="mb-divider"></div>
                            <button class="mb-action-btn test" @click.stop="handleTestConnection(m.id)" :disabled="testing" title="测试此模型">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>
                            </button>
                            <button class="mb-action-btn delete" @click.stop="removeModel(m.id)" title="从列表中移除">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                            </button>
                          </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Toast 浮动通知 -->
                <transition name="toast">
                  <div v-if="toast.show" class="cfg-toast" :class="toast.type">
                    <svg v-if="toast.type === 'success'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                    <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                    <span>{{ toast.text }}</span>
                  </div>
                </transition>

                </div> <!-- /provider-detail-col -->
              </div> <!-- /provider-layout -->



              <!-- ═══ 候选模型弹窗 ═══ -->
              <teleport to="body">
                <div v-if="showAvailableModels" class="candidate-overlay" @click.self="clearAvailableModels">
                  <div class="candidate-modal">
                    <div class="candidate-modal-header">
                      <h3 class="candidate-modal-title">
                        {{ (AI_PROVIDERS.find(p => p.id === editingChannel.providerId)?.name || editingChannel.name || '未知').split(' (')[0] }} 模型
                        <span class="cfg-count">{{ availableModels.length }}</span>
                      </h3>
                      <button class="cfg-close" @click="clearAvailableModels" title="关闭">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M13.5 4.5L4.5 13.5M4.5 4.5l9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                      </button>
                    </div>
                    <!-- 搜索框 + 全选/取消全选 -->
                    <div class="candidate-toolbar">
                      <div class="candidate-search-wrap">
                        <svg class="candidate-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                        <input v-model="candidateSearch" class="candidate-search-input" placeholder="搜索模型 ID 或名称..." />
                      </div>
                      <div class="candidate-actions">
                        <button class="cfg-link-btn" @click="addAllFilteredCandidates">全选</button>
                        <button class="cfg-link-btn" style="color:var(--text-muted);" @click="removeAllFilteredCandidates">取消全选</button>
                      </div>
                    </div>
                    <!-- 分类筛选 -->
                    <div class="candidate-categories" v-if="candidateCategories.length > 2">
                      <button
                        v-for="cat in candidateCategories" :key="cat"
                        class="candidate-cat-btn"
                        :class="{ active: candidateCategory === cat }"
                        :data-cat="cat"
                        @click="candidateCategory = cat"
                      >{{ cat }}</button>
                    </div>
                    <!-- 批量添加区 -->
                    <div class="candidate-batch-wrap">
                      <input
                        v-model="batchModelText"
                        class="candidate-batch-input"
                        placeholder="批量粘贴模型 ID（逗号或换行分隔）"
                        @keydown.enter="batchAddModels"
                      />
                      <button class="cfg-link-btn" :disabled="!batchModelText.trim()" @click="batchAddModels">导入</button>
                    </div>
                    <!-- 模型列表 -->
                    <div class="candidate-modal-body custom-scrollbar">
                      <div v-if="availableModelOptions.length === 0" class="candidate-empty-full">
                        {{ candidateSearch ? '未找到匹配的模型' : '暂无候选模型' }}
                      </div>
                      <div
                        v-for="m in availableModelOptions" :key="m.id"
                        class="candidate-modal-row"
                        :class="{ added: m.added }"
                      >
                        <div class="candidate-modal-row-left">
                          <span class="candidate-modal-name">{{ m.id }}</span>
                          <div class="model-row-badges">
                            <span v-if="m.isFree" class="model-badge badge-free">FREE</span>
                            <span class="model-badge badge-type">{{ m.type }}</span>
                          </div>
                        </div>
                        <button class="candidate-modal-add" :class="{ added: m.added }" :disabled="m.added" @click="addModel(m.id)">
                          <svg v-if="m.added" width="14" height="14" viewBox="0 0 16 16"><path d="M4 8l3 3 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </teleport>
            </div>

            <!-- ═══ 默认模型 ═══ -->
            <div v-if="activeTab === 'defaultModel'" class="cfg-panel">


              <div class="default-model-info" v-if="store.channels.length === 0">
                <div class="info-card">
                  <span class="info-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                  <p>您还未配置任何模型服务，请先前往「模型服务」添加至少一个服务商。</p>
                </div>
              </div>
              <div v-else class="default-model-list">
                <div class="dm-item">
                  <div class="dm-info">
                    <span class="dm-label">主模型</span>
                  </div>
                  <div class="cfg-stack-fields main-model-stack">
                    <div class="cfg-field">
                      <label class="cfg-label">推理渠道</label>
                      <div class="custom-selector" :class="{ open: openSelectorKey === 'main-ch' }">
                        <div class="cs-trigger" @click.stop="toggleSelector('main-ch')">
                          <span v-if="store.lastUsedChannelId">{{ store.channels.find(c => c.id === store.lastUsedChannelId)?.name }}</span>
                          <span v-else class="cs-placeholder">选择渠道</span>
                          <svg class="cs-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        <div v-if="openSelectorKey === 'main-ch'" class="cs-dropdown">
                          <div class="cs-options custom-scrollbar">
                            <div 
                              v-for="ch in store.channels" :key="ch.id" 
                              class="cs-option" :class="{ active: store.lastUsedChannelId === ch.id }"
                              @click="store.lastUsedChannelId = ch.id; closeSelectors()"
                            >
                              {{ ch.name }}
                              <svg v-if="store.lastUsedChannelId === ch.id" class="cs-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="cfg-field">
                      <label class="cfg-label">指定模型</label>
                      <div class="custom-selector" :class="{ open: openSelectorKey === 'main-model' }">
                        <div class="cs-trigger" @click.stop="toggleSelector('main-model')">
                          <span v-if="mainModelId">{{ mainModelId.split('/').pop() }}</span>
                          <span v-else class="cs-placeholder">选择模型</span>
                          <svg class="cs-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        <div v-if="openSelectorKey === 'main-model'" class="cs-dropdown">
                          <div class="cs-search-wrap">
                            <input v-model="selectorSearchText" class="cs-search-input" placeholder="搜索模型..." @click.stop />
                          </div>
                          <div class="cs-options custom-scrollbar">
                            <div v-if="filteredSelectorModels(mainModels).length === 0" class="cs-empty">无可选项</div>
                            <div 
                              v-for="m in filteredSelectorModels(mainModels)" :key="m" 
                              class="cs-option" :class="{ active: mainModelId === m }"
                              @click="mainModelId = m; closeSelectors()"
                            >
                              {{ m.split('/').pop() }}
                              <svg v-if="mainModelId === m" class="cs-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 自定义板块模型 -->
                <div class="dm-divider">
                  <span>自定义板块模型</span>
                </div>

                <div v-for="(row, idx) in featureOverrides" :key="row.feature" class="dm-item dm-item-feature">
                  <div class="dm-feature-header">
                    <div class="dm-info">
                      <span class="dm-label">{{ row.label }}</span>
                      <span class="dm-desc">{{ row.desc }}</span>
                    </div>
                    <button v-if="row.channelId || row.modelId" class="dm-clear-link" @click="clearFeatureOverride(idx)">
                      重置
                    </button>
                  </div>
                  
                  <div class="dm-override-controls">
                    <div class="oc-group">
                      <label class="oc-label">推理渠道</label>
                      <div class="custom-selector" :class="{ open: openSelectorKey === `feat-ch-${idx}` }">
                        <div class="cs-trigger" @click.stop="toggleSelector(`feat-ch-${idx}`)">
                          <span>{{ store.channels.find(c => c.id === row.channelId)?.name || '默认渠道' }}</span>
                          <svg class="cs-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        <div v-if="openSelectorKey === `feat-ch-${idx}`" class="cs-dropdown">
                          <div class="cs-options custom-scrollbar">
                            <div class="cs-option" :class="{ active: !row.channelId }" @click="row.channelId = ''; row.modelId = ''; closeSelectors()">默认渠道</div>
                            <div 
                              v-for="ch in store.channels" :key="ch.id" 
                              class="cs-option" :class="{ active: row.channelId === ch.id }"
                              @click="row.channelId = ch.id; row.modelId = ''; closeSelectors()"
                            >
                              {{ ch.name }}
                              <svg v-if="row.channelId === ch.id" class="cs-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="oc-group">
                      <label class="oc-label">指定模型</label>
                      <div class="custom-selector" :class="{ open: openSelectorKey === `feat-m-${idx}` }">
                        <div class="cs-trigger" @click.stop="toggleSelector(`feat-m-${idx}`)">
                          <span>{{ row.modelId.split('/').pop() || '默认模型' }}</span>
                          <svg class="cs-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        <div v-if="openSelectorKey === `feat-m-${idx}`" class="cs-dropdown">
                          <div class="cs-search-wrap">
                            <input v-model="selectorSearchText" class="cs-search-input" placeholder="搜索模型..." @click.stop />
                          </div>
                          <div class="cs-options custom-scrollbar">
                            <div class="cs-option" :class="{ active: !row.modelId }" @click="row.modelId = ''; closeSelectors()">默认模型</div>
                            <div 
                              v-for="m in filteredSelectorModels(getModelsForChannel(row.channelId || store.lastUsedChannelId))" :key="m" 
                              class="cs-option" :class="{ active: row.modelId === m }"
                              @click="row.modelId = m; closeSelectors()"
                            >
                              {{ m.split('/').pop() }}
                              <svg v-if="row.modelId === m" class="cs-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ═══ 语音服务 ═══ -->
            <div v-if="activeTab === 'voice'" class="cfg-panel">


              <div class="ext-notice" v-if="store.channels.length === 0">
                <span class="info-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                <p>请先在「模型服务」中添加至少一个服务商后再配置语音服务。</p>
              </div>

              <template v-else>
                <!-- TTS -->
                <div class="ext-section">
                  <div class="ext-section-head">
                    <span class="ext-section-title">
                      <svg class="title-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                      语音合成 (TTS)
                    </span>
                  </div>
                  <div class="cfg-stack-fields">
                    <div class="cfg-field">
                      <label class="cfg-label">渠道</label>
                      <div class="custom-selector" :class="{ open: openSelectorKey === 'tts-ch' }">
                        <div class="cs-trigger" @click.stop="toggleSelector('tts-ch')">
                          <span>{{ store.channels.find(c => c.id === ttsChannelId)?.name || '请选择' }}</span>
                          <svg class="cs-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        <div v-if="openSelectorKey === 'tts-ch'" class="cs-dropdown">
                          <div class="cs-options custom-scrollbar">
                            <div class="cs-option" @click="ttsChannelId = ''; closeSelectors()">请选择</div>
                            <div 
                              v-for="ch in store.channels" :key="ch.id" 
                              class="cs-option" :class="{ active: ttsChannelId === ch.id }"
                              @click="ttsChannelId = ch.id; closeSelectors()"
                            >
                              {{ ch.name }}
                              <svg v-if="ttsChannelId === ch.id" class="cs-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="cfg-field">
                      <label class="cfg-label">模型</label>
                      <div class="custom-selector" :class="{ open: openSelectorKey === 'tts-model' }">
                        <div class="cs-trigger" @click.stop="toggleSelector('tts-model')">
                          <span>{{ ttsModelId.split('/').pop() || '请选择' }}</span>
                          <svg class="cs-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        <div v-if="openSelectorKey === 'tts-model'" class="cs-dropdown">
                          <div class="cs-search-wrap">
                            <input v-model="selectorSearchText" class="cs-search-input" placeholder="搜索模型..." @click.stop />
                          </div>
                          <div class="cs-options custom-scrollbar">
                            <div v-if="filteredSelectorModels(ttsModels).length === 0" class="cs-empty">无可选项</div>
                            <div 
                              v-for="m in filteredSelectorModels(ttsModels)" :key="m" 
                              class="cs-option" :class="{ active: ttsModelId === m }"
                              @click="ttsModelId = m; closeSelectors()"
                            >
                              {{ m.split('/').pop() }}
                              <svg v-if="ttsModelId === m" class="cs-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ASR -->
                <div class="ext-section">
                  <div class="ext-section-head">
                    <span class="ext-section-title">
                      <svg class="title-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h2c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H2"/><path d="M22 18h-2c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h2"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>
                      语音识别 (ASR)
                    </span>
                  </div>
                  <div class="cfg-stack-fields">
                    <div class="cfg-field">
                      <label class="cfg-label">渠道</label>
                      <div class="custom-selector" :class="{ open: openSelectorKey === 'asr-ch' }">
                        <div class="cs-trigger" @click.stop="toggleSelector('asr-ch')">
                          <span>{{ store.channels.find(c => c.id === asrChannelId)?.name || '请选择' }}</span>
                          <svg class="cs-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        <div v-if="openSelectorKey === 'asr-ch'" class="cs-dropdown">
                          <div class="cs-options custom-scrollbar">
                            <div class="cs-option" @click="asrChannelId = ''; closeSelectors()">请选择</div>
                            <div 
                              v-for="ch in store.channels" :key="ch.id" 
                              class="cs-option" :class="{ active: asrChannelId === ch.id }"
                              @click="asrChannelId = ch.id; closeSelectors()"
                            >
                              {{ ch.name }}
                              <svg v-if="asrChannelId === ch.id" class="cs-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="cfg-field">
                      <label class="cfg-label">模型</label>
                      <div class="custom-selector" :class="{ open: openSelectorKey === 'asr-model' }">
                        <div class="cs-trigger" @click.stop="toggleSelector('asr-model')">
                          <span>{{ asrModelId.split('/').pop() || '请选择' }}</span>
                          <svg class="cs-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        <div v-if="openSelectorKey === 'asr-model'" class="cs-dropdown">
                          <div class="cs-search-wrap">
                            <input v-model="selectorSearchText" class="cs-search-input" placeholder="搜索模型..." @click.stop />
                          </div>
                          <div class="cs-options custom-scrollbar">
                            <div v-if="filteredSelectorModels(asrModels).length === 0" class="cs-empty">无可选项</div>
                            <div 
                              v-for="m in filteredSelectorModels(asrModels)" :key="m" 
                              class="cs-option" :class="{ active: asrModelId === m }"
                              @click="asrModelId = m; closeSelectors()"
                            >
                              {{ m.split('/').pop() }}
                              <svg v-if="asrModelId === m" class="cs-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 测试按钮 -->
                <div class="ext-actions">
                  <button class="cfg-btn-outline" type="button" :disabled="ttsTesting || !ttsChannelId || !ttsModelId" @click="handleTestTts">
                    {{ ttsTesting ? '合成中...' : '测试语音合成' }}
                  </button>
                </div>
                <div v-if="ttsTestResult" class="cfg-alert" :class="ttsTestResult.type">{{ ttsTestResult.text }}</div>
              </template>
            </div>

            <!-- ═══ 视觉 OCR ═══ -->
            <div v-if="activeTab === 'vision'" class="cfg-panel">


              <div class="ext-notice" v-if="store.channels.length === 0">
                <span class="info-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                <p>请先在「模型服务」中添加至少一个服务商后再配置视觉服务。</p>
              </div>

              <template v-else>
                <div class="cfg-stack-fields">
                  <div class="cfg-field">
                    <label class="cfg-label">视觉渠道</label>
                    <div class="custom-selector" :class="{ open: openSelectorKey === 'vis-ch' }">
                      <div class="cs-trigger" @click.stop="toggleSelector('vis-ch')">
                        <span>{{ store.channels.find(c => c.id === visionChannelId)?.name || '请选择' }}</span>
                        <svg class="cs-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                      </div>
                      <div v-if="openSelectorKey === 'vis-ch'" class="cs-dropdown">
                        <div class="cs-options custom-scrollbar">
                          <div class="cs-option" @click="visionChannelId = ''; closeSelectors()">请选择</div>
                          <div 
                            v-for="ch in store.channels" :key="ch.id" 
                            class="cs-option" :class="{ active: visionChannelId === ch.id }"
                            @click="visionChannelId = ch.id; closeSelectors()"
                          >
                            {{ ch.name }}
                            <svg v-if="visionChannelId === ch.id" class="cs-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="cfg-field">
                    <label class="cfg-label">视觉模型</label>
                    <div class="custom-selector" :class="{ open: openSelectorKey === 'vis-model' }">
                      <div class="cs-trigger" @click.stop="toggleSelector('vis-model')">
                        <span>{{ visionModelId.split('/').pop() || '请选择' }}</span>
                        <svg class="cs-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                      </div>
                      <div v-if="openSelectorKey === 'vis-model'" class="cs-dropdown">
                        <div class="cs-search-wrap">
                          <input v-model="selectorSearchText" class="cs-search-input" placeholder="搜索模型..." @click.stop />
                        </div>
                        <div class="cs-options custom-scrollbar">
                          <div v-if="filteredSelectorModels(visionModelOptions).length === 0" class="cs-empty">无可选项</div>
                          <div 
                            v-for="m in filteredSelectorModels(visionModelOptions)" :key="m" 
                            class="cs-option" :class="{ active: visionModelId === m }"
                            @click="visionModelId = m; closeSelectors()"
                          >
                            {{ m.split('/').pop() }}
                            <svg v-if="visionModelId === m" class="cs-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                          </div>
                        </div>
                      </div>
                    </div>
                    <input v-if="visionModelId && !visionModelOptions.includes(visionModelId)" v-model="visionModelId" class="cfg-input cfg-input-mt" placeholder="自定义模型名称" />
                  </div>
                </div>
              </template>
            </div>

            <!-- ═══ 网络搜索 ═══ -->
            <div v-if="activeTab === 'search'" class="cfg-panel">


              <div class="search-provider-list">
                <section v-for="provider in SEARCH_PROVIDERS" :key="provider.id" class="search-provider-card">
                  <div class="search-provider-header">
                    <div class="search-provider-meta">
                      <h3 class="search-provider-title">{{ provider.name }}</h3>
                      <p class="search-provider-desc">{{ provider.description }}</p>
                    </div>
                    <div class="provider-switch" @click="searchProviderForm[provider.id].enabled = !searchProviderForm[provider.id].enabled">
                      <div class="switch-track" :class="{ on: searchProviderForm[provider.id].enabled }">
                        <div class="switch-thumb"></div>
                      </div>
                    </div>
                  </div>

                  <div class="cfg-field search-provider-field">
                    <div class="cfg-label-row search-key-row">
                      <label class="cfg-label">{{ provider.name }} API Key</label>
                      <a
                        class="cfg-key-link"
                        :href="provider.keyUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                      >获取密钥<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg></a>
                    </div>
                    <div class="cfg-input-wrap">
                      <input
                        v-model="searchProviderForm[provider.id].apiKey"
                        type="text"
                        class="cfg-input ignore-pass-manager search-key-input"
                        :class="{ 'masked-token': !searchKeyVisibility[provider.id] }"
                        :placeholder="provider.keyPlaceholder"
                        autocomplete="one-time-code"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                        spellcheck="false"
                      />
                      <button class="cfg-eye" @click="searchKeyVisibility[provider.id] = !searchKeyVisibility[provider.id]" :title="searchKeyVisibility[provider.id] ? '隐藏' : '显示'">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path v-if="!searchKeyVisibility[provider.id]" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" stroke-width="2"/><circle v-if="!searchKeyVisibility[provider.id]" cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path v-if="searchKeyVisibility[provider.id]" d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                      </button>
                      <button
                        class="cfg-test-key"
                        type="button"
                        :disabled="searchTesting[provider.id] || !searchProviderForm[provider.id].apiKey.trim()"
                        @click="handleTestSearchProvider(provider.id)"
                      >
                        {{ searchTesting[provider.id] ? '测试中...' : '测试' }}
                      </button>
                    </div>
                  </div>

                  <div v-if="searchTestResult[provider.id]" class="cfg-alert" :class="searchTestResult[provider.id]!.type">
                    {{ searchTestResult[provider.id]!.text }}
                  </div>
                </section>
              </div>
            </div> <!-- Close cfg-panel (search) -->
          </div> <!-- Close cfg-content -->
        </div> <!-- Close cfg-main -->

        <!-- ═══ 底部 ═══ -->
        <div class="cfg-footer">
          <button class="cfg-btn-ghost" @click="handleClose">取消</button>
          <button class="cfg-btn-primary" @click="handleSaveAndApply">保存配置</button>
        </div>
      </div> <!-- Close cfg-dialog -->
    </div> <!-- Close cfg-overlay -->
  </transition>
  </teleport>

  <!-- 确认弹窗 (Custom Confirm Modal) - 提升到顶层 Teleport 以确保不被 v-if 销毁 -->
  <teleport to="body">
    <transition name="pop">
      <div v-if="confirmState.show" class="confirm-overlay" @click.self="handleCancelConfirm">
        <div class="confirm-card">
          <div class="confirm-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
          </div>
          <div class="confirm-body">
            <h3 class="confirm-title">{{ confirmState.title }}</h3>
            <p class="confirm-msg">{{ confirmState.message }}</p>
          </div>
          <div class="confirm-footer">
            <button class="conf-btn conf-btn-ghost" @click="handleCancelConfirm">取 消</button>
            <button class="conf-btn conf-btn-primary" @click="handleConfirm">确 定</button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
/* ═══ 遮罩层 ═══ */
.cfg-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.25s ease;
}

/* ═══ 对话框 ═══ */
.cfg-dialog {
  width: 860px;
  max-width: 92vw;
  height: 600px;
  max-height: 85vh;
  background: var(--bg-card);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  animation: dialogIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* ═══ 头部 ═══ */
.cfg-header {
  padding: 18px 24px 14px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.cfg-title {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: var(--text-primary);
}

.cfg-subtitle {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.cfg-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.cfg-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* ═══ 主体区域 ═══ */
.cfg-main {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ═══ 左侧导航 ═══ */
.cfg-nav {
  width: 180px;
  flex-shrink: 0;
  background: var(--bg-shell);
  border-right: 1px solid var(--border-color);
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.cfg-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all 0.18s ease;
  color: var(--text-secondary);
  position: relative;
}

.cfg-nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.cfg-nav-item.active {
  background: var(--glass-high);
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.cfg-nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 0 3px 3px 0;
  background: var(--accent-blue-500);
}

.cfg-nav-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(43, 123, 184, 0.08);
  color: var(--accent-blue-600);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cfg-nav-item.active .cfg-nav-icon {
  background: linear-gradient(135deg, var(--accent-blue-500), var(--accent-blue-600));
  color: #fff;
}

.cfg-nav-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.cfg-nav-label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.cfg-nav-desc {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.cfg-nav-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
  flex-shrink: 0;
}

.cfg-nav-badge.on {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

/* ═══ 右侧内容 ═══ */
.cfg-content {
  flex: 1;
  min-width: 0;
  padding: 20px 24px;
  overflow-y: auto;
}

.custom-scrollbar::-webkit-scrollbar { width: 5px; }
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color-strong);
  border-radius: 10px;
}

.cfg-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: panelFadeIn 0.2s ease;
}

.cfg-panel-header {
  margin-bottom: 4px;
}

.cfg-panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}

.cfg-panel-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

/* ═══ 模型服务双栏布局 ═══ */
.provider-layout {
  display: flex;
  gap: 0;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  height: 660px; /* 增加固定高度，确保在大多数屏幕上能触发内部滚动 */
  background: var(--bg-shell);
}

/* 左列：服务商列表 */
.provider-list-col {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  background: var(--bg-card-muted);
  display: flex;
  flex-direction: column;
}

.provider-list-header {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
}

.provider-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.ps-icon {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  pointer-events: none;
}

.ps-input {
  width: 100%;
  height: 32px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color-strong);
  border-radius: 8px;
  padding: 0 10px 0 32px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  transition: all 0.15s;
}
.ps-input:focus {
  border-color: var(--accent-blue-400);
  background: var(--bg-card);
  box-shadow: 0 0 0 3px rgba(43, 123, 184, 0.08);
}

.add-top-btn {
  width: 100%;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--border-color-strong);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.add-top-btn:hover {
  border-color: var(--accent-blue-400);
  color: var(--accent-blue-500);
  background: rgba(43, 123, 184, 0.04);
}

.provider-list {
  flex: 1;
  overflow-y: auto;
}

.provider-list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  cursor: pointer;
  transition: all 0.15s ease;
  border-bottom: 1px solid var(--border-color);
  position: relative;
}

.provider-list-item:last-child {
  border-bottom: none;
}

.provider-list-item:hover {
  background: var(--bg-hover);
}

.provider-list-item.active {
  background: var(--bg-card);
}

.provider-list-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent-blue-500);
}

.provider-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-blue-500), var(--accent-blue-600));
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.provider-list-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 开关样式 */
.provider-switch {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 2px;
}
.switch-track {
  width: 32px;
  height: 18px;
  border-radius: 10px;
  background: var(--border-color-strong);
  position: relative;
  transition: all 0.2s;
}
.switch-track.on {
  background: var(--accent-blue-500);
}
.switch-thumb {
  width: 14px;
  height: 14px;
  background: #ffffff;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.switch-track.on .switch-thumb {
  left: 16px;
}

/* 右列：详情 */
.provider-detail-col {
  flex: 1;
  min-width: 0;
  padding: 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 4px;
}

.dh-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-provider-name {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}

.custom-name-input {
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
  width: 200px;
  outline: none;
  transition: border-color 0.15s;
}
.custom-name-input:focus {
  border-bottom-color: var(--accent-blue-400);
}

.cfg-action-icon {
  background: transparent;
  border: none;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.cfg-action-icon.delete:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.cfg-url-preview {
  padding: 8px 12px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
  border-radius: 7px;
  font-size: 12px;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  line-height: 1.5;
}

.cfg-url-hint {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  font-family: inherit;
}

/* ═══ 表单字段 ═══ */
.cfg-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cfg-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}
.cfg-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.ollama-mode-row {
  margin-bottom: 2px;
}

.ollama-mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-card) 82%, var(--primary-500) 2%);
}

.ollama-mode-btn {
  min-width: 58px;
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.ollama-mode-btn.active {
  background: color-mix(in srgb, var(--primary-500) 14%, white);
  color: var(--primary-600);
  box-shadow: 0 4px 10px color-mix(in srgb, var(--primary-500) 10%, transparent);
}

.ollama-mode-btn:hover {
  color: var(--text-primary);
}
.cfg-key-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-blue-500);
  text-decoration: none;
  transition: opacity 0.15s;
}
.cfg-key-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}
.cfg-key-link svg {
  flex-shrink: 0;
}

.cfg-count {
  font-size: 10px;
  font-weight: 700;
  background: rgba(43, 123, 184, 0.1);
  color: var(--accent-blue-600);
  padding: 1px 6px;
  border-radius: 8px;
}

.cfg-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cfg-label-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cfg-link-btn {
  background: none;
  border: none;
  color: var(--accent-blue-500);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s;
}

.cfg-link-btn:hover { background: rgba(43, 123, 184, 0.06); }
.cfg-link-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.cfg-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}

.cfg-ext-link {
  color: var(--accent-blue-500);
  text-decoration: none;
}

.cfg-ext-link:hover { text-decoration: underline; }

.cfg-input {
  width: 100%;
  height: 38px;
  border: 1px solid var(--border-color-strong);
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  background: var(--bg-card-muted);
  box-sizing: border-box;
  color: var(--text-primary);
  transition: all 0.15s;
  font-family: inherit;
}

.cfg-input:focus {
  border-color: var(--accent-blue-500);
  outline: none;
  background: var(--bg-elevated);
  box-shadow: 0 0 0 3px rgba(43, 123, 184, 0.08);
}

.cfg-input-mt { margin-top: 6px; }
.cfg-select { appearance: auto; }

.cfg-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.cfg-input-wrap .cfg-input {
  padding-right: 100px;
}

.cfg-eye {
  position: absolute;
  right: 56px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}

.cfg-eye:hover { color: var(--text-primary); }

.cfg-test-key {
  position: absolute;
  right: 4px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--accent-blue-500);
  background: transparent;
  color: var(--accent-blue-500);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.cfg-test-key:hover:not(:disabled) {
  background: var(--accent-blue-500);
  color: #fff;
}

.cfg-test-key:disabled { opacity: 0.5; cursor: not-allowed; }

/* ═══ 横排布局 ═══ */
.cfg-row {
  display: flex;
  gap: 12px;
}

.cfg-field-half {
  flex: 1;
  min-width: 0;
}

/* ═══ 模型选择器 ═══ */
.model-select {
  position: relative;
}

.model-trigger {
  width: 100%;
  height: 38px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color-strong);
  border-radius: 8px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.15s;
  box-sizing: border-box;
  color: var(--text-primary);
}

.model-trigger:hover { border-color: var(--accent-blue-400); }

.model-trigger.active {
  border-color: var(--accent-blue-500);
  box-shadow: 0 0 0 3px rgba(43, 123, 184, 0.08);
}

.model-trigger.empty { color: var(--text-muted); }

.model-current {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-arrow {
  flex-shrink: 0;
  transition: transform 0.2s;
  color: var(--text-muted);
}

.model-arrow.open { transform: rotate(180deg); }

.model-dropdown {
  position: fixed;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  z-index: 2100;
  overflow: hidden;
  animation: popIn 0.15s ease-out;
}

.model-list {
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
}

.model-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

.model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.1s;
}

.model-row:hover { background: var(--bg-hover); }

.model-row.selected {
  background: rgba(43, 123, 184, 0.08);
}

.model-row-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.model-row-name {
  font-size: 13px;
  font-weight: 500;
}

.model-row-badges { display: flex; gap: 4px; }

.model-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
}

.badge-free {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.badge-type {
  background: rgba(100, 116, 139, 0.1);
  color: #64748b;
}

.model-check { color: var(--accent-blue-500); flex-shrink: 0; }

/* ═══ 自定义添加模型输入行 ═══ */
.cfg-add-btn {
  padding: 4px 6px !important;
  border-radius: 6px;
}
.custom-model-row {
  display: flex;
  gap: 8px;
  align-items: center;
  animation: panelFadeIn 0.15s ease;
}
.custom-model-input {
  flex: 1;
  min-width: 0;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px !important;
}

/* ═══ 模型下拉搜索框 ═══ */
.model-search-wrap {
  padding: 8px 8px 4px;
  position: relative;
  border-bottom: 1px solid var(--border-color);
}
.model-search-icon {
  position: absolute;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
  margin-top: -2px;
}
.model-search-input {
  width: 100%;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0 10px 0 30px;
  font-size: 12px;
  background: var(--bg-card-muted);
  color: var(--text-primary);
  box-sizing: border-box;
  font-family: inherit;
  transition: all 0.15s;
}
.model-search-input:focus {
  outline: none;
  border-color: var(--accent-blue-500);
}

/* ═══ 已添加模型列表（类手风琴样式） ═══ */
.model-block-section {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.model-block-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
}
.model-block-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.model-block-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  cursor: pointer;
  transition: all 0.15s;
}
.model-block-item:hover {
  background: var(--bg-hover);
  border-color: var(--accent-blue-300);
}
.model-block-item.is-default {
  border-color: var(--accent-blue-500);
  background: rgba(43, 123, 184, 0.04);
  box-shadow: 0 2px 8px rgba(43, 123, 184, 0.08);
}
.mb-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.mb-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}
.mb-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.mb-divider {
  width: 1px;
  height: 14px;
  background: var(--border-color);
  margin: 0 4px;
}
.mb-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.1s;
}
.mb-action-btn:hover {
  color: var(--text-primary);
  background: var(--border-color);
}
.mb-action-btn.test:hover {
  color: var(--accent-blue-500);
  background: rgba(43, 123, 184, 0.1);
}
.mb-action-btn.delete:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

/* ═══ 候选弹窗顶部工具栏 ═══ */
.candidate-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}
.candidate-toolbar .candidate-search-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}
.candidate-search-wrap .candidate-search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-muted);
  pointer-events: none;
}
.candidate-search-wrap .candidate-search-input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 36px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  font-size: 13px;
  transition: border-color 0.15s;
}
.candidate-search-wrap .candidate-search-input:focus {
  outline: none;
  border-color: var(--accent-blue-500);
}
.candidate-actions {
  display: flex;
  gap: 8px;
}

/* ═══ 候选模型分类筛选 ═══ */
.candidate-categories {
  display: flex;
  gap: 6px;
  padding: 6px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}
.candidate-cat-btn {
  height: 28px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.candidate-cat-btn:hover {
  color: var(--text-primary);
  border-color: var(--accent-blue-500);
}
.candidate-cat-btn.active {
  background: var(--accent-blue-500);
  color: #fff;
  border-color: var(--accent-blue-500);
}
.candidate-cat-btn.active[data-cat="免费"] {
  background: #22c55e;
  border-color: #22c55e;
}

/* ═══ 自定义添加模型弹窗 ═══ */
.modal-light-overlay {
  z-index: 2500;
  display: flex;
  align-items: center;
  justify-content: center;
}
.custom-model-modal {
  background: var(--bg-card);
  width: 380px;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cmm-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}
.cmm-input {
  width: 100%;
  box-sizing: border-box;
}
.cmm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 4px;
}

/* ═══ 候选弹窗批量添加区 ═══ */
.candidate-batch-wrap {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 6px 20px 10px;
  border-bottom: 1px solid var(--border-color);
}
.candidate-batch-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border-color-strong);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  background: var(--bg-card-muted);
  color: var(--text-primary);
  resize: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.candidate-batch-input:focus {
  outline: none;
  border-color: var(--accent-blue-500);
}

/* ═══ 默认模型 — 功能覆盖矩阵 ═══ */
.dm-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}
.dm-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-color);
}
.dm-item-feature {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dm-feature-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.dm-feature-header .dm-info {
  margin-bottom: 0;
}
.dm-clear-link {
  background: none;
  border: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s;
}
.dm-clear-link:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

.dm-override-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-card);
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

/* ══════ 测试模型选择器 (Test Model Picker) ══════ */
.test-model-picker {
  position: absolute;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: csDropIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.tmp-head {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card-muted);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tmp-head span {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tmp-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  line-height: 1;
}

.tmp-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 6px;
}

.tmp-item {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  transition: all 0.15s;
}

.tmp-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tmp-item svg {
  opacity: 0;
  transform: translateX(4px);
  transition: all 0.2s;
}

.tmp-item:hover svg {
  opacity: 1;
  transform: translateX(0);
  color: var(--accent-blue-500);
}

.tmp-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.oc-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.oc-label {
  width: 64px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-align: right;
  flex-shrink: 0;
}
.oc-select {
  flex: 1;
  height: 32px !important;
  font-size: 12px !important;
}

.cfg-stack-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dm-select-sm {
  flex: 1;
  min-width: 0;
  height: 34px !important;
  font-size: 12px !important;
}
.dm-clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  background: transparent;
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}

/* ═══ 隐私增强：屏蔽密码管理器图标 ═══ */
.ignore-pass-manager {
  /* 强制不显示密码控制按钮 */
  &::-ms-reveal,
  &::-ms-clear,
  &::-webkit-contacts-auto-fill-button,
  &::-webkit-credentials-auto-fill-button {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
    position: absolute !important;
    right: 0;
  }
}

.masked-token {
  -webkit-text-security: disc !important;
}

/* ═══ 确认弹窗样式 (Confirm Modal) ═══ */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}

.confirm-card {
  width: 320px;
  background: var(--bg-card);
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
  animation: dialogIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.confirm-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.confirm-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}

.confirm-msg {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.confirm-footer {
  display: flex;
  width: 100%;
  gap: 12px;
  margin-top: 8px;
}

.conf-btn {
  flex: 1;
  height: 38px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.conf-btn-ghost {
  background: transparent;
  border: 1px solid var(--border-color-strong);
  color: var(--text-secondary);
}

.conf-btn-ghost:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.conf-btn-primary {
  background: var(--accent-blue-500);
  border: none;
  color: #ffffff;
}

.conf-btn-primary:hover {
  background: var(--accent-blue-600);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(43, 123, 184, 0.3);
}

/* ═══ Toast 通知样式 ═══ */
.cfg-toast {
  position: absolute;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 40px;
  background: var(--bg-card);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 4000;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid var(--border-color);
  backdrop-filter: blur(8px);
}

.cfg-toast.success {
  color: #10b981;
  background: rgba(16, 185, 129, 0.05);
  border-color: rgba(16, 185, 129, 0.2);
}

.cfg-toast.error {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.2);
}

.toast-enter-active, .toast-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translate(-50%, -20px) scale(0.9);
}
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px) scale(0.95);
}

/* ══════ 自定义下拉组件 (Custom Selector) ══════ */
.custom-selector {
  position: relative;
  width: 100%;
}

.cs-trigger {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color-strong);
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
  font-size: 13px;
  color: var(--text-primary);
}

.cs-trigger:hover {
  border-color: var(--accent-blue-500);
  background: var(--bg-card-muted);
}

.custom-selector.open .cs-trigger {
  border-color: var(--accent-blue-500);
  box-shadow: 0 0 0 3px rgba(43, 123, 184, 0.1);
}

.cs-placeholder {
  color: var(--text-muted);
}

.cs-arrow {
  color: var(--text-muted);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.custom-selector.open .cs-arrow {
  transform: rotate(180deg);
  color: var(--accent-blue-500);
}

.cs-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
  animation: csDropIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes csDropIn {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.cs-search-wrap {
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.cs-search-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-color-strong);
  border-radius: 6px;
  font-size: 12px;
  background: var(--bg-card);
  color: var(--text-primary);
  box-sizing: border-box;
  outline: none;
}

.cs-search-input:focus {
  border-color: var(--accent-blue-500);
}

.cs-options {
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
}

.cs-option {
  padding: 9px 12px;
  border-radius: 7px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cs-option:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.cs-option.active {
  background: rgba(43, 123, 184, 0.08);
  color: var(--accent-blue-500);
  font-weight: 600;
}

.cs-option-check {
  color: var(--accent-blue-500);
}

.cs-empty {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

/* 语音服务标题美化 */
.ext-section-head {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(to right, var(--bg-card-muted), transparent);
  display: flex;
  align-items: center;
  gap: 8px;
}

.ext-section-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 0.3px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.title-icon {
  color: var(--accent-blue-500);
  opacity: 0.9;
}
.dm-clear-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.06);
}

/* ═══ 候选模型弹窗 ═══ */
.candidate-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 2200;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.15s ease;
}

.candidate-modal {
  width: 580px;
  max-width: 90vw;
  max-height: 75vh;
  background: var(--bg-card);
  border-radius: 14px;
  border: 1px solid var(--border-color);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: dialogIn 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.candidate-modal-header {
  padding: 16px 20px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.candidate-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.candidate-search-wrap {
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-color);
  position: relative;
  flex-shrink: 0;
}

.candidate-search-icon {
  position: absolute;
  left: 32px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.candidate-search-input {
  width: 100%;
  height: 38px;
  border: 1px solid var(--border-color-strong);
  border-radius: 8px;
  padding: 0 12px 0 36px;
  font-size: 13px;
  background: var(--bg-card-muted);
  color: var(--text-primary);
  box-sizing: border-box;
  font-family: inherit;
  transition: all 0.15s;
}

.candidate-search-input:focus {
  outline: none;
  border-color: var(--accent-blue-500);
  box-shadow: 0 0 0 3px rgba(43, 123, 184, 0.08);
}

.candidate-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.candidate-empty-full {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.candidate-modal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  transition: background 0.12s;
}

.candidate-modal-row:hover {
  background: var(--bg-hover);
}

.candidate-modal-row.added {
  opacity: 0.55;
}

.candidate-modal-row-left {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.candidate-modal-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
  line-height: 1.3;
}

.candidate-modal-add {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1.5px solid var(--accent-blue-500);
  background: transparent;
  color: var(--accent-blue-500);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.candidate-modal-add:hover:not(:disabled) {
  background: var(--accent-blue-500);
  color: #fff;
}

.candidate-modal-add.added {
  border-color: #22c55e;
  color: #22c55e;
  cursor: default;
}

/* ═══ 默认模型 ═══ */
.default-model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dm-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card-muted);
}

.dm-item.dm-item-feature {
  padding: 10px 12px;
  background: var(--bg-shell);
}

.main-model-stack {
  gap: 10px !important;
}

.dm-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dm-label {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.2;
}

.dm-desc {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.8;
}

.dm-select {
  width: 100%;
}

/* ═══ 提示引导卡片 ═══ */
.info-card, .ext-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 16px;
  background: rgba(43, 123, 184, 0.06);
  border: 1px solid rgba(43, 123, 184, 0.12);
  border-radius: 10px;
}

.info-card p, .ext-notice p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.info-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-blue-500);
}

/* ═══ 扩展服务区段 ═══ */
.ext-section {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-shell);
  overflow: visible;
}

.ext-section-head {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.ext-section-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.ext-section .cfg-row {
  padding: 14px;
}

.ext-actions {
  display: flex;
  justify-content: flex-start;
}

/* ═══ 按钮 ═══ */
.cfg-btn-ghost {
  padding: 9px 20px;
  border: 1px solid var(--border-color-strong);
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s;
  font-family: inherit;
}

.cfg-btn-ghost:hover { background: var(--bg-hover); }

.cfg-btn-outline {
  padding: 8px 16px;
  border: 1px solid var(--accent-blue-500);
  background: transparent;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-blue-500);
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.cfg-btn-outline:hover:not(:disabled) {
  background: var(--accent-blue-500);
  color: #fff;
}

.cfg-btn-outline:disabled { opacity: 0.4; cursor: not-allowed; }

.cfg-btn-primary {
  padding: 9px 28px;
  background: linear-gradient(135deg, var(--accent-blue-500), var(--accent-blue-600));
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  box-shadow: 0 2px 8px rgba(43, 123, 184, 0.2);
}

.cfg-btn-primary:hover {
  box-shadow: 0 4px 16px rgba(43, 123, 184, 0.35);
  transform: translateY(-1px);
}

/* ═══ 底部 ═══ */
.cfg-footer {
  padding: 14px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

/* ═══ 提示 ═══ */

.search-provider-list {
  display: grid;
  gap: 16px;
}

.search-provider-card {
  padding: 18px 20px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-card) 88%, white);
  display: grid;
  gap: 10px;
}

.search-provider-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.search-provider-meta {
  min-width: 0;
  flex: 1;
}

.search-provider-title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
}

.search-provider-desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.provider-ready-badge {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
}

.search-provider-field {
  gap: 4px;
}

.search-key-row {
  margin-bottom: 4px;
}

.search-key-input {
  padding-right: 134px !important;
}

.search-provider-hint {
  line-height: 1.35;
}

.cfg-alert {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.cfg-alert.success {
  background: rgba(34, 197, 94, 0.08);
  color: #16a34a;
  border: 1px solid rgba(34, 197, 94, 0.15);
}

.cfg-alert.error {
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.15);
}

/* ═══ 动画 ═══ */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes dialogIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes panelFadeIn {
  from { opacity: 0; transform: translateX(6px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes popIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

.pop-enter-active, .pop-leave-active { transition: all 0.15s ease; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-6px); }

/* ═══ 暗色主题适配 ═══ */
:global(html[data-theme='dark']) .cfg-dialog {
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
}

:global(html[data-theme='dark']) .cfg-overlay {
  background: rgba(0, 0, 0, 0.6);
}

:global(html[data-theme='dark']) .cfg-nav-badge {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}

:global(html[data-theme='dark']) .cfg-nav-badge.on {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.12);
}

:global(html[data-theme='dark']) .provider-on-tag {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.12);
}

:global(html[data-theme='dark']) .badge-free {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.12);
}

:global(html[data-theme='dark']) .badge-type {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.12);
}

:global(html[data-theme='dark']) .model-check {
  color: var(--accent-blue-400);
}

:global(html[data-theme='dark']) .model-dropdown {
  background: var(--bg-card);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

:global(html[data-theme='dark']) .candidate-modal {
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
}

:global(html[data-theme='dark']) .candidate-search-input {
  color-scheme: dark;
}

:global(html[data-theme='dark']) .candidate-modal-add.added {
  border-color: #4ade80;
  color: #4ade80;
}

:global(html[data-theme='dark']) .cfg-alert.success {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.1);
  border-color: rgba(74, 222, 128, 0.2);
}

:global(html[data-theme='dark']) .cfg-alert.error {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.2);
}

:global(html[data-theme='dark']) .cfg-input {
  color-scheme: dark;
}

:global(html[data-theme='dark']) .provider-list-item.active {
  background: var(--bg-card);
}
</style>
