import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { buildApiUrl } from '@/services/stream'

export interface AiConfig {
  providerId: string
  apiUrl: string
  apiToken: string
  modelName: string
}

export interface AiChannel extends AiConfig {
  id: string
  name: string
  fetchedModels: string[]
  enabled?: boolean
}

export type SearchProviderId = 'tavily' | 'exa' | 'serper' | 'firecrawl'

export interface SearchProviderConfig {
  id: SearchProviderId
  enabled: boolean
}

export interface ResolvedSearchProviderConfig extends SearchProviderConfig {
  apiKey: string
}

export type AiFeature =
  | 'default'
  | 'resumeImport'
  | 'jdAnalysis'
  | 'jdInterview'
  | 'jdCompanyIntel'
  | 'resumeOptimize'
  | 'interview'
  | 'asr'
  | 'tts'
  | 'vision'

export interface AiFeatureOverride {
  channelId: string
  modelId: string
}

export type AiModelOverrides = Partial<Record<AiFeature, AiFeatureOverride>>

export interface ResolvedAiConfig extends AiConfig {
  isFreeTier: boolean
}

interface PersistedAiChannel extends Omit<AiChannel, 'apiToken'> {}

interface SessionSecretsPayload {
  channelTokens: Record<string, string>
  tavilyApiKey: string
  searchApiKeys: Partial<Record<SearchProviderId, string>>
}

interface StoredAiConfigPayload {
  channels?: Array<PersistedAiChannel & { apiToken?: string }>
  modelOverrides?: AiModelOverrides
  lastUsedChannelId?: string
  tavilyApiKey?: string
  searchProviders?: SearchProviderConfig[]
}

interface LegacyAiConfigPayload {
  providerId?: string
  apiUrl?: string
  apiToken?: string
  modelName?: string
  fetchedModels?: string[]
  modelOverrides?: Partial<Record<AiFeature, string>>
  tavilyApiKey?: string
}

export interface AiProvider {
  id: string
  name: string
  baseUrl: string
  keyUrl: string
}

export interface SearchProviderDefinition {
  id: SearchProviderId
  name: string
  keyUrl: string
  keyPlaceholder: string
  description: string
}

export type OllamaMode = 'local' | 'cloud'

export const OLLAMA_LOCAL_BASE_URL = 'http://localhost:11434/api'
export const OLLAMA_CLOUD_BASE_URL = 'https://ollama.com/api'

function stripCompletionPath(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '')
}

function isOllamaHost(raw: string): boolean {
  return /(^https?:\/\/)?(localhost|127\.0\.0\.1):11434(\/|$)/i.test(raw)
    || /(^https?:\/\/)?ollama\.com(\/|$)/i.test(raw)
}

function normalizeOllamaBase(raw: string): string {
  let base = stripCompletionPath(raw)
  base = base.replace(/\/api$/i, '')
  base = base.replace(/\/v1$/i, '')
  return base
}

export function detectOllamaMode(raw: string): OllamaMode {
  const normalized = normalizeOllamaBase(raw)
  if (/(^https?:\/\/)?(localhost|127\.0\.0\.1):11434(\/|$)/i.test(normalized)) return 'local'
  if (/(^https?:\/\/)?ollama\.com(\/|$)/i.test(normalized)) return 'cloud'
  return 'local'
}

export function getOllamaApiUrl(mode: OllamaMode): string {
  switch (mode) {
    case 'local':
      return OLLAMA_LOCAL_BASE_URL
    case 'cloud':
      return OLLAMA_CLOUD_BASE_URL
  }
}

export function requiresOllamaApiKey(mode: OllamaMode): boolean {
  return mode === 'cloud'
}

export const AI_PROVIDERS: AiProvider[] = [
  { id: 'siliconflow', name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'zhipu', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { id: 'dashscope', name: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keyUrl: 'https://bailian.console.aliyun.com/' },
  { id: 'modelscope', name: 'ModelScope', baseUrl: 'https://api-inference.modelscope.cn/v1', keyUrl: 'https://modelscope.cn/my/myaccesstoken' },
  { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', keyUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimaxi.com/v1', keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'huggingface', name: 'Hugging Face', baseUrl: 'https://router.huggingface.co/v1', keyUrl: 'https://huggingface.co/settings/tokens' },
  { id: 'poe', name: 'Poe', baseUrl: 'https://api.poe.com/v1', keyUrl: 'https://poe.com/api_key' },
  { id: 'ollama', name: 'Ollama', baseUrl: OLLAMA_LOCAL_BASE_URL, keyUrl: 'https://ollama.com/settings/keys' },
]

export const SEARCH_PROVIDERS: SearchProviderDefinition[] = [
  {
    id: 'tavily',
    name: 'Tavily',
    keyUrl: 'https://tavily.com',
    keyPlaceholder: 'tvly-...',
    description: '适合快速聚合网页结果，作为公司情报的主检索入口。',
  },
  {
    id: 'exa',
    name: 'Exa',
    keyUrl: 'https://dashboard.exa.ai/api-keys',
    keyPlaceholder: 'exa_...',
    description: '适合补充官网、新闻和技术博客结果，提升事实召回。',
  },
  {
    id: 'serper',
    name: 'Serper',
    keyUrl: 'https://serper.dev',
    keyPlaceholder: 'serper_...',
    description: '适合补充 Google 搜索召回，扩大公开网页覆盖面。',
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    keyUrl: 'https://www.firecrawl.dev/app/api-keys',
    keyPlaceholder: 'fc-...',
    description: '适合抓取官网和正文页的主内容，减少噪音文本。',
  },
]

export const SILICONFLOW_FREE_MODELS = [
  'Qwen/Qwen3-8B',
  'Qwen/Qwen2.5-7B-Instruct',
  'Qwen/Qwen2-7B-Instruct',
  'THUDM/glm-4-9b-chat',
  'THUDM/GLM-Z1-9B-0414',
  'internlm/internlm2_5-7b-chat',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
  'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
  'mistralai/Mistral-7B-Instruct-v0.2',
  'tencent/Hunyuan-MT-7B',
  'THUDM/GLM-4.1V-9B-Thinking',
  'PaddlePaddle/PaddleOCR-VL-1.5',
  'PaddlePaddle/PaddleOCR-VL',
  'deepseek-ai/DeepSeek-OCR',
  'FunAudioLLM/SenseVoiceSmall',
  'TeleAI/TeleSpeechASR',
]

const VISION_MODEL_KEYWORDS = [
  '-vl', 'vl-', 'vision', 'ocr', 'internvl', 'vlm', 'multimodal',
  'gpt-4o', 'gpt-4-turbo', 'gpt-4', 'omni',
  'claude-3', 'claude-2.1', 'sonnet', 'opus', 'haiku', 'claude-3.5',
  'gemini', 'flash', 'pro', 'ultra', '1.5-f', '1.5-p',
  'qwen-vl', 'qwen2-vl', 'qwen2.5-vl', 'qwen-plus', 'qwen-max',
  'yi-vision', 'yi-vl', 'yi-1.5',
  'glm-4v', 'glm-4-9b', 'cogvlm',
  'deepseek-vl', 'deepseek-v3', 'deepseek-v2.5',
  'step-1v', 'step-1.5v',
  'internlm-x2', 'phi-3-vision', 'llama-3.2-11b', 'llama-3.2-90b',
]

export function isVisionModel(modelName: string): boolean {
  if (!modelName) return false
  const lowerName = modelName.toLowerCase()
  return VISION_MODEL_KEYWORDS.some(keyword => lowerName.includes(keyword))
}

export function normalizeApiUrl(raw: string): string {
  return buildApiUrl(raw)
}

export function getBaseUrl(raw: string): string {
  let base = raw.trim().replace(/\/+$/, '')
  if (base.endsWith('/chat/completions')) {
    base = base.replace(/\/chat\/completions$/, '')
  }
  if (isOllamaHost(base)) {
    return `${normalizeOllamaBase(base)}/v1`
  }
  return base
}

const STORAGE_KEY = 'resume-builder-ai-config-v2'
const LEGACY_STORAGE_KEY = 'resume-builder-ai-config'
const SECRETS_STORAGE_KEY = 'resume-builder-ai-secrets-v1'

function createDefaultSearchProviders(): SearchProviderConfig[] {
  return SEARCH_PROVIDERS.map(provider => ({
    id: provider.id,
    enabled: provider.id === 'tavily',
  }))
}

function createDefaultSearchApiKeys(): Partial<Record<SearchProviderId, string>> {
  return SEARCH_PROVIDERS.reduce<Partial<Record<SearchProviderId, string>>>((acc, provider) => {
    acc[provider.id] = ''
    return acc
  }, {})
}

function normalizeSearchProviders(
  providers: SearchProviderConfig[] | undefined,
  hasLegacyTavilyKey = false,
): SearchProviderConfig[] {
  const defaults = createDefaultSearchProviders()
  if (!Array.isArray(providers)) {
    return defaults.map(provider => (
      provider.id === 'tavily' && hasLegacyTavilyKey
        ? { ...provider, enabled: true }
        : provider
    ))
  }

  const byId = new Map<SearchProviderId, SearchProviderConfig>()
  providers.forEach(provider => {
    if (!provider || typeof provider.id !== 'string') return
    const id = provider.id as SearchProviderId
    byId.set(id, { id, enabled: provider.enabled !== false })
  })

  return defaults.map(provider => byId.get(provider.id) ?? provider)
}

function canUseStorage(kind: 'local' | 'session') {
  if (typeof window === 'undefined') return false
  return kind === 'local' ? typeof window.localStorage !== 'undefined' : typeof window.sessionStorage !== 'undefined'
}

function serializeChannelsForStorage(source: AiChannel[]): PersistedAiChannel[] {
  return source.map(({ apiToken: _apiToken, ...channel }) => ({ ...channel }))
}

function collectChannelTokens(source: AiChannel[]): Record<string, string> {
  return source.reduce<Record<string, string>>((acc, channel) => {
    const token = channel.apiToken.trim()
    if (token) acc[channel.id] = token
    return acc
  }, {})
}

function readSessionSecrets(): SessionSecretsPayload {
  if (!canUseStorage('local')) {
    return { channelTokens: {}, tavilyApiKey: '', searchApiKeys: createDefaultSearchApiKeys() }
  }

  const raw = window.localStorage.getItem(SECRETS_STORAGE_KEY)
  if (!raw) {
    return { channelTokens: {}, tavilyApiKey: '', searchApiKeys: createDefaultSearchApiKeys() }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SessionSecretsPayload>
    const searchApiKeys = createDefaultSearchApiKeys()

    if (parsed.searchApiKeys && typeof parsed.searchApiKeys === 'object') {
      SEARCH_PROVIDERS.forEach(provider => {
        const value = parsed.searchApiKeys?.[provider.id]
        searchApiKeys[provider.id] = typeof value === 'string' ? value : ''
      })
    }

    if (!searchApiKeys.tavily && typeof parsed.tavilyApiKey === 'string') {
      searchApiKeys.tavily = parsed.tavilyApiKey
    }

    return {
      channelTokens: parsed.channelTokens && typeof parsed.channelTokens === 'object' ? parsed.channelTokens : {},
      tavilyApiKey: typeof parsed.tavilyApiKey === 'string' ? parsed.tavilyApiKey : '',
      searchApiKeys,
    }
  } catch (error) {
    console.error('Failed to parse persisted AI secrets', error)
    return { channelTokens: {}, tavilyApiKey: '', searchApiKeys: createDefaultSearchApiKeys() }
  }
}

function hydrateChannels(
  storedChannels: Array<PersistedAiChannel & { apiToken?: string }> | undefined,
  channelTokens: Record<string, string>,
): AiChannel[] {
  if (!Array.isArray(storedChannels)) return []

  return storedChannels.map((channel, index) => {
    const id = typeof channel.id === 'string' && channel.id.trim() ? channel.id : `ch-${Date.now()}-${index}`
    return {
      id,
      name: typeof channel.name === 'string' ? channel.name : '新渠道',
      providerId: typeof channel.providerId === 'string' ? channel.providerId : 'custom',
      apiUrl: typeof channel.apiUrl === 'string' ? channel.apiUrl : '',
      apiToken: channelTokens[id] ?? (typeof channel.apiToken === 'string' ? channel.apiToken : ''),
      modelName: typeof channel.modelName === 'string' ? channel.modelName : '',
      fetchedModels: Array.isArray(channel.fetchedModels)
        ? channel.fetchedModels.filter((model): model is string => typeof model === 'string')
        : [],
      enabled: channel.enabled !== false,
    }
  })
}

export const useAiConfigStore = defineStore('aiConfig', () => {
  const channels = ref<AiChannel[]>([])
  const modelOverrides = ref<AiModelOverrides>({})
  const lastUsedChannelId = ref('')
  const searchProviders = ref<SearchProviderConfig[]>(createDefaultSearchProviders())
  const searchApiKeys = ref<Partial<Record<SearchProviderId, string>>>(createDefaultSearchApiKeys())

  const tavilyApiKey = computed({
    get: () => searchApiKeys.value.tavily ?? '',
    set: (value: string) => {
      searchApiKeys.value = {
        ...searchApiKeys.value,
        tavily: value,
      }
    },
  })

  const isConfigured = computed(() => channels.value.length > 0)

  const activeConfig = computed<ResolvedAiConfig>(() => {
    const validChannels = channels.value.filter(channel => channel.enabled !== false)
    const channel = validChannels.find(item => item.id === lastUsedChannelId.value) || validChannels[0]
    if (!channel) {
      return { providerId: '', apiUrl: '', apiToken: '', modelName: '', isFreeTier: false }
    }

    return {
      providerId: channel.providerId,
      apiUrl: channel.apiUrl.trim(),
      apiToken: channel.apiToken.trim(),
      modelName: channel.modelName.trim(),
      isFreeTier: false,
    }
  })

  function saveSessionSecrets() {
    if (!canUseStorage('local')) return

    const payload: SessionSecretsPayload = {
      channelTokens: collectChannelTokens(channels.value),
      tavilyApiKey: tavilyApiKey.value.trim(),
      searchApiKeys: {
        ...createDefaultSearchApiKeys(),
        ...searchApiKeys.value,
      },
    }

    const hasSearchKey = Object.values(payload.searchApiKeys).some(value => value?.trim())
    if (!payload.tavilyApiKey && !hasSearchKey && Object.keys(payload.channelTokens).length === 0) {
      window.localStorage.removeItem(SECRETS_STORAGE_KEY)
      return
    }

    window.localStorage.setItem(SECRETS_STORAGE_KEY, JSON.stringify(payload))
  }

  function saveToStorage() {
    if (canUseStorage('local')) {
      const data: StoredAiConfigPayload = {
        channels: serializeChannelsForStorage(channels.value),
        modelOverrides: modelOverrides.value,
        lastUsedChannelId: lastUsedChannelId.value,
        searchProviders: searchProviders.value,
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    }

    saveSessionSecrets()
  }

  function loadFromStorage() {
    const sessionSecrets = readSessionSecrets()

    const rawV2 = canUseStorage('local') ? window.localStorage.getItem(STORAGE_KEY) : null
    if (rawV2) {
      try {
        const data = JSON.parse(rawV2) as StoredAiConfigPayload
        const legacyChannelTokens = Array.isArray(data.channels)
          ? data.channels.reduce<Record<string, string>>((acc, channel) => {
              if (channel.id && typeof channel.apiToken === 'string' && channel.apiToken.trim()) {
                acc[channel.id] = channel.apiToken.trim()
              }
              return acc
            }, {})
          : {}

        channels.value = hydrateChannels(data.channels, { ...legacyChannelTokens, ...sessionSecrets.channelTokens })
        modelOverrides.value = data.modelOverrides || {}
        lastUsedChannelId.value = data.lastUsedChannelId || ''
        searchProviders.value = normalizeSearchProviders(
          data.searchProviders,
          !!(sessionSecrets.tavilyApiKey || data.tavilyApiKey),
        )
        searchApiKeys.value = {
          ...createDefaultSearchApiKeys(),
          ...sessionSecrets.searchApiKeys,
        }
        if (!searchApiKeys.value.tavily) {
          searchApiKeys.value.tavily = sessionSecrets.tavilyApiKey || data.tavilyApiKey || ''
        }

        let nameFixed = false
        channels.value.forEach(channel => {
          const provider = AI_PROVIDERS.find(item => item.id === channel.providerId)
          if (!provider) return
          const expectedName = provider.name.split(' (')[0]
          if (channel.name !== expectedName) {
            channel.name = expectedName ?? channel.name
            nameFixed = true
          }
        })

        if (nameFixed || Object.keys(legacyChannelTokens).length > 0 || !!data.tavilyApiKey) {
          saveToStorage()
        }
        return
      } catch (error) {
        console.error('Failed to parse V2 config', error)
      }
    }

    const rawLegacy = canUseStorage('local') ? window.localStorage.getItem(LEGACY_STORAGE_KEY) : null
    if (!rawLegacy) return

    try {
      const legacy = JSON.parse(rawLegacy) as LegacyAiConfigPayload
      if (!legacy.apiToken && !legacy.apiUrl) return

      const defaultChannel: AiChannel = {
        id: `default-${Date.now()}`,
        name: '默认渠道',
        providerId: legacy.providerId || 'siliconflow',
        apiUrl: legacy.apiUrl || '',
        apiToken: legacy.apiToken || '',
        modelName: legacy.modelName || '',
        fetchedModels: Array.isArray(legacy.fetchedModels) ? legacy.fetchedModels : [],
      }

      channels.value = [defaultChannel]
      lastUsedChannelId.value = defaultChannel.id
      searchProviders.value = normalizeSearchProviders(undefined, !!(sessionSecrets.tavilyApiKey || legacy.tavilyApiKey))
      searchApiKeys.value = {
        ...createDefaultSearchApiKeys(),
        ...sessionSecrets.searchApiKeys,
        tavily: sessionSecrets.searchApiKeys.tavily || sessionSecrets.tavilyApiKey || legacy.tavilyApiKey || '',
      }

      if (legacy.modelOverrides) {
        const migratedOverrides: AiModelOverrides = {}
        Object.entries(legacy.modelOverrides).forEach(([feature, modelId]) => {
          migratedOverrides[feature as AiFeature] = {
            channelId: defaultChannel.id,
            modelId,
          }
        })
        modelOverrides.value = migratedOverrides
      }

      saveToStorage()
      if (canUseStorage('local')) {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY)
      }
    } catch (error) {
      console.error('Migration failed', error)
    }
  }

  function getConfigForFeature(feature: AiFeature = 'default'): ResolvedAiConfig {
    const validChannels = channels.value.filter(channel => channel.enabled !== false)
    const override = modelOverrides.value[feature]
    const channel = override
      ? validChannels.find(item => item.id === override.channelId)
      : (validChannels.find(item => item.id === lastUsedChannelId.value) || validChannels[0])

    if (!channel) {
      return { providerId: '', apiUrl: '', apiToken: '', modelName: '', isFreeTier: false }
    }

    return {
      providerId: channel.providerId,
      apiUrl: channel.apiUrl.trim(),
      apiToken: channel.apiToken.trim(),
      modelName: override?.modelId || channel.modelName,
      isFreeTier: false,
    }
  }

  function getEnabledSearchProviders(): ResolvedSearchProviderConfig[] {
    return searchProviders.value
      .map(provider => ({
        ...provider,
        apiKey: (searchApiKeys.value[provider.id] || '').trim(),
      }))
      .filter(provider => provider.enabled && provider.apiKey)
  }

  function addChannel(channel: Omit<AiChannel, 'id' | 'fetchedModels' | 'name'>) {
    const provider = AI_PROVIDERS.find(item => item.id === channel.providerId)
    const newChannel: AiChannel = {
      ...channel,
      id: `ch-${Date.now()}`,
      name: (provider ? provider.name.split(' (')[0] : '新渠道') || '新渠道',
      fetchedModels: [],
    }

    channels.value.push(newChannel)
    if (!lastUsedChannelId.value) {
      lastUsedChannelId.value = newChannel.id
    }
    saveToStorage()
    return newChannel.id
  }

  function updateChannel(id: string, updates: Partial<AiChannel>) {
    const index = channels.value.findIndex(channel => channel.id === id)
    if (index === -1) return

    const merged = { ...channels.value[index], ...updates }
    const provider = AI_PROVIDERS.find(item => item.id === merged.providerId)
    if (provider) {
      merged.name = provider.name.split(' (')[0]
    }

    channels.value[index] = merged as AiChannel
    saveToStorage()
  }

  function deleteChannel(id: string) {
    channels.value = channels.value.filter(channel => channel.id !== id)
    if (lastUsedChannelId.value === id) {
      lastUsedChannelId.value = channels.value[0]?.id || ''
    }

    Object.keys(modelOverrides.value).forEach(key => {
      const feature = key as AiFeature
      if (modelOverrides.value[feature]?.channelId === id) {
        delete modelOverrides.value[feature]
      }
    })

    saveToStorage()
  }

  function updateModelOverride(feature: AiFeature, channelId: string, modelId: string) {
    if (!channelId || !modelId) {
      delete modelOverrides.value[feature]
    } else {
      modelOverrides.value[feature] = { channelId, modelId }
    }

    modelOverrides.value = { ...modelOverrides.value }
    saveToStorage()
  }

  function updateSearchProvider(id: SearchProviderId, updates: Partial<SearchProviderConfig>) {
    searchProviders.value = normalizeSearchProviders(
      searchProviders.value.map(provider => (
        provider.id === id
          ? { ...provider, ...updates, id }
          : provider
      )),
    )
    saveToStorage()
  }

  function setSearchProviderApiKey(id: SearchProviderId, apiKey: string) {
    searchApiKeys.value = {
      ...searchApiKeys.value,
      [id]: apiKey,
    }
    saveToStorage()
  }

  loadFromStorage()

  watch([channels, modelOverrides, lastUsedChannelId, searchProviders, searchApiKeys], () => saveToStorage(), { deep: true })

  return {
    channels,
    modelOverrides,
    lastUsedChannelId,
    searchProviders,
    searchApiKeys,
    tavilyApiKey,
    isConfigured,
    activeConfig,
    getConfigForFeature,
    getEnabledSearchProviders,
    addChannel,
    updateChannel,
    deleteChannel,
    updateModelOverride,
    updateSearchProvider,
    setSearchProviderApiKey,
  }
})
