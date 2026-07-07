<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuestionBankStore, type SavedQuestion } from '@/stores/questionBank'
import { CorpusCollector, type CollectorConfig, type CollectionProgress } from '@/services/corpus/collector'
import { dedupeAndRank, mergeDuplicates } from '@/services/corpus/dedupeRank'
import { batchAnchor } from '@/services/interview/anchorEngine'
import { useResumeStore } from '@/stores/resume'

const emit = defineEmits<{
  close: []
  saved: [questions: SavedQuestion[]]
}>()

const qbStore = useQuestionBankStore()
const resumeStore = useResumeStore()

const isLoading = ref(false)
const error = ref('')
const step = ref<'config' | 'collect' | 'review'>('config')

// 配置
const targetPosition = ref('')
const config = ref<CollectorConfig>({
  github: {
    repoRawUrls: [
      'https://raw.githubusercontent.com/InterviewBook/InterviewBook/main/README.md',
    ],
    relevanceHints: [],
  },
  nowcoder: {
    postUrls: [],
  },
  web: {
    urls: [],
  },
  ai: {
    enabled: false,
    apiUrl: '',
    apiKey: '',
    model: 'gpt-3.5-turbo',
  },
})

// AI 配置相关
const showAiConfig = ref(false)

// 采集结果
const collectedQuestions = ref<SavedQuestion[]>([])
const stats = ref({
  total: 0,
  bySource: {} as Record<string, number>,
  degraded: [] as string[],
})

// 进度状态
const progress = ref<CollectionProgress>({
  stage: 'connecting',
  progress: 0,
  message: '',
  currentSource: '',
})

// 重试相关
const retryCount = ref(0)
const maxRetries = 3

// 开始采集
async function startCollection() {
  if (!targetPosition.value.trim()) {
    error.value = '请输入目标岗位方向'
    return
  }

  isLoading.value = true
  error.value = ''
  step.value = 'collect'
  retryCount.value = 0

  await doCollection()
}

// 执行采集（支持重试）
async function doCollection() {
  try {
    // 更新 relevanceHints
    if (config.value.github) {
      config.value.github.relevanceHints = [targetPosition.value]
    }

    const collector = new CorpusCollector(config.value, (p) => {
      progress.value = p
    })
    
    const result = await collector.collect([targetPosition.value])

    stats.value = result.stats

    // 提取面试题（支持 AI 增强）
    const extractedQuestions = await collector.extractQuestions(result.posts)
    
    // 去重排序
    const rankedQuestions = dedupeAndRank(mergeDuplicates(extractedQuestions))

    // 转换为 SavedQuestion 格式
    const resumeText = [
      resumeStore.basicInfo.jobTitle,
      resumeStore.skills,
      ...resumeStore.projectList.map(p => `${p.name} ${p.role}`),
      ...resumeStore.workList.map(w => `${w.company} ${w.position}`),
    ].filter(Boolean).join('\n')

    const anchors = batchAnchor(
      rankedQuestions.map(q => ({
        content: q.content,
        category: '真实面经',
        tags: ['real_experience'],
        source_url: q.sourceUrl,
        source_type: 'real_experience' as const,
        posted_at: q.postedAt,
        frequency_score: q.frequencyScore,
        recency_score: q.recencyScore,
        is_grounded: q.isGrounded,
      })),
      resumeText
    )

    collectedQuestions.value = rankedQuestions.map((q, index) => ({
      content: q.content,
      category: '真实面经',
      tags: ['real_experience', targetPosition.value],
      source: 'InterviewRadar',
      source_url: q.sourceUrl,
      source_type: 'real_experience' as const,
      posted_at: q.postedAt,
      frequency_score: q.frequencyScore,
      recency_score: q.recencyScore,
      is_grounded: anchors[index]?.isGrounded || false,
      resume_anchor: anchors[index]?.resumeAnchor || '',
      follow_up_chain: anchors[index]?.followUpChain || [],
    }))

    step.value = 'review'
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '未知错误'
    
    // 自动重试
    if (retryCount.value < maxRetries) {
      retryCount.value++
      progress.value = {
        stage: 'connecting',
        progress: 0,
        message: `采集失败，正在重试 (${retryCount.value}/${maxRetries})...`,
      }
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount.value))
      return doCollection()
    }
    
    error.value = `采集失败：${errorMessage}`
    step.value = 'config'
  } finally {
    isLoading.value = false
  }
}

// 保存选中的题目
async function saveSelected() {
  const selected = collectedQuestions.value.filter(q => q.content)
  if (selected.length === 0) {
    error.value = '请至少选择一道题目'
    return
  }

  isLoading.value = true
  try {
    const count = await qbStore.addQuestionBatch(selected)
    if (count > 0) {
      emit('saved', selected)
      emit('close')
    } else {
      error.value = '保存失败，请重试'
    }
  } catch (err) {
    error.value = `保存失败：${err instanceof Error ? err.message : '未知错误'}`
  } finally {
    isLoading.value = false
  }
}

// 切换题目选中状态
function toggleQuestion(index: number) {
  const question = collectedQuestions.value[index]
  if (question) {
    question.content = question.content ? '' : question.content
  }
}

// GitHub URL 管理
function addGithubUrl() {
  if (!config.value.github) {
    config.value.github = { repoRawUrls: [], relevanceHints: [] }
  }
  config.value.github.repoRawUrls.push('')
}

function removeGithubUrl(index: number) {
  if (config.value.github) {
    config.value.github.repoRawUrls.splice(index, 1)
  }
}

// 牛客 URL 管理
function addNowcoderUrl() {
  if (!config.value.nowcoder) {
    config.value.nowcoder = { postUrls: [] }
  }
  config.value.nowcoder.postUrls.push('')
}

function removeNowcoderUrl(index: number) {
  if (config.value.nowcoder) {
    config.value.nowcoder.postUrls.splice(index, 1)
  }
}

// 网页 URL 管理
function addWebUrl() {
  if (!config.value.web) {
    config.value.web = { urls: [] }
  }
  config.value.web.urls.push('')
}

function removeWebUrl(index: number) {
  if (config.value.web) {
    config.value.web.urls.splice(index, 1)
  }
}

// 预设配置
const presets: Record<string, CollectorConfig> = {
  frontend: {
    github: {
      repoRawUrls: [
        'https://raw.githubusercontent.com/InterviewBook/InterviewBook/main/README.md',
        'https://raw.githubusercontent.com/haizlin/fe-interview/master/README.md',
      ],
      relevanceHints: [],
    },
    nowcoder: { postUrls: [] },
    web: { urls: [] },
  },
  backend: {
    github: {
      repoRawUrls: [
        'https://raw.githubusercontent.com/InterviewBook/InterviewBook/main/README.md',
        'https://raw.githubusercontent.com/Snailclimb/JavaGuide/main/README.md',
      ],
      relevanceHints: [],
    },
    nowcoder: { postUrls: [] },
    web: { urls: [] },
  },
  ai: {
    github: {
      repoRawUrls: [
        'https://raw.githubusercontent.com/InterviewBook/InterviewBook/main/README.md',
        'https://raw.githubusercontent.com/amusi/Deep-Learning-Interview-Awesome/main/README.md',
      ],
      relevanceHints: [],
    },
    nowcoder: { postUrls: [] },
    web: { urls: [] },
  },
  fullstack: {
    github: {
      repoRawUrls: [
        'https://raw.githubusercontent.com/InterviewBook/InterviewBook/main/README.md',
      ],
      relevanceHints: [],
    },
    nowcoder: { postUrls: [] },
    web: { urls: [] },
  },
}

function loadPreset(preset: string) {
  const presetConfig = presets[preset]
  if (presetConfig) {
    config.value = JSON.parse(JSON.stringify(presetConfig))
  }
}

const selectedCount = computed(() => 
  collectedQuestions.value.filter(q => q.content).length
)
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog">
      <header class="dialog-header">
        <h2>导入真实面经</h2>
        <button class="close-btn" @click="emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </header>

      <div class="dialog-body">
        <!-- 配置步骤 -->
        <div v-if="step === 'config'" class="step-config">
          <div class="form-group">
            <label>目标岗位方向</label>
            <input 
              v-model="targetPosition" 
              type="text" 
              placeholder="例如：AI 应用开发、前端开发、Java 后端"
            />
          </div>

          <div class="form-group">
            <label>数据源配置</label>
            <div class="source-config">
              <!-- GitHub 配置 -->
              <div class="source-item">
                <div class="source-header">
                  <span class="source-name">GitHub 面经仓库</span>
                  <span class="source-status" :class="{ active: config.github?.repoRawUrls.length }">
                    {{ config.github?.repoRawUrls.length ? '已配置' : '未配置' }}
                  </span>
                </div>
                <div class="source-urls">
                  <div v-for="(url, index) in config.github?.repoRawUrls" :key="index" class="url-item">
                    <input 
                      v-model="config.github!.repoRawUrls[index]" 
                      type="text" 
                      placeholder="GitHub 面经仓库 raw 文件 URL"
                    />
                    <button class="remove-btn" @click="removeGithubUrl(index)">×</button>
                  </div>
                  <button class="add-url-btn" @click="addGithubUrl">+ 添加仓库</button>
                </div>
                <p class="source-hint">推荐：InterviewBook、interview-q-a 等开源面经仓库</p>
              </div>

              <!-- 牛客配置 -->
              <div class="source-item">
                <div class="source-header">
                  <span class="source-name">牛客网面经</span>
                  <span class="source-status" :class="{ active: config.nowcoder?.postUrls.length }">
                    {{ config.nowcoder?.postUrls.length ? '已配置' : '未配置' }}
                  </span>
                </div>
                <div class="source-urls">
                  <div v-for="(url, index) in config.nowcoder?.postUrls" :key="index" class="url-item">
                    <input 
                      v-model="config.nowcoder!.postUrls[index]" 
                      type="text" 
                      placeholder="牛客帖子 URL"
                    />
                    <button class="remove-btn" @click="removeNowcoderUrl(index)">×</button>
                  </div>
                  <button class="add-url-btn" @click="addNowcoderUrl">+ 添加帖子</button>
                </div>
                <p class="source-hint">支持 discuss 格式的面经帖子 URL</p>
              </div>

              <!-- 网页配置 -->
              <div class="source-item">
                <div class="source-header">
                  <span class="source-name">其他网页</span>
                  <span class="source-status" :class="{ active: config.web?.urls.length }">
                    {{ config.web?.urls.length ? '已配置' : '未配置' }}
                  </span>
                </div>
                <div class="source-urls">
                  <div v-for="(url, index) in config.web?.urls" :key="index" class="url-item">
                    <input 
                      v-model="config.web!.urls[index]" 
                      type="text" 
                      placeholder="知乎、CSDN 等网页 URL"
                    />
                    <button class="remove-btn" @click="removeWebUrl(index)">×</button>
                  </div>
                  <button class="add-url-btn" @click="addWebUrl">+ 添加网页</button>
                </div>
                <p class="source-hint">支持知乎、CSDN、博客等公开网页</p>
              </div>
            </div>
          </div>

          <!-- 快速配置 -->
          <div class="form-group">
            <label>快速配置</label>
            <div class="quick-config">
              <button class="quick-btn" @click="loadPreset('frontend')">前端开发</button>
              <button class="quick-btn" @click="loadPreset('backend')">后端开发</button>
              <button class="quick-btn" @click="loadPreset('ai')">AI/算法</button>
              <button class="quick-btn" @click="loadPreset('fullstack')">全栈开发</button>
            </div>
          </div>

          <!-- AI 增强配置 -->
          <div class="form-group">
            <div class="ai-config-header">
              <label>AI 增强识别</label>
              <button class="toggle-btn" @click="showAiConfig = !showAiConfig">
                {{ showAiConfig ? '收起' : '展开' }}
              </button>
            </div>
            <div v-if="showAiConfig" class="ai-config">
              <div class="ai-toggle">
                <label class="switch">
                  <input v-model="config.ai!.enabled" type="checkbox" />
                  <span class="slider"></span>
                </label>
                <span>启用 AI 辅助识别</span>
              </div>
              
              <div v-if="config.ai!.enabled" class="ai-fields">
                <div class="form-group">
                  <label>API 地址</label>
                  <input 
                    v-model="config.ai!.apiUrl" 
                    type="text" 
                    placeholder="https://api.openai.com/v1/chat/completions"
                  />
                </div>
                <div class="form-group">
                  <label>API Key</label>
                  <input 
                    v-model="config.ai!.apiKey" 
                    type="password" 
                    placeholder="sk-..."
                  />
                </div>
                <div class="form-group">
                  <label>模型</label>
                  <select v-model="config.ai!.model">
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    <option value="gpt-4">GPT-4</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  </select>
                </div>
                <p class="ai-hint">AI 可以更准确地识别面试题并进行分类，但会增加处理时间</p>
              </div>
            </div>
          </div>

          <div class="info-box">
            <p>真实面经数据将从以下来源采集：</p>
            <ul>
              <li>GitHub 开源面经仓库</li>
              <li>牛客网面经帖子（需手动提供 URL）</li>
              <li>其他公开网页</li>
            </ul>
            <p class="note">数据经过时效过滤（2 年内）和频次排序</p>
          </div>
        </div>

        <!-- 采集步骤 -->
        <div v-else-if="step === 'collect'" class="step-collect">
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <h3>正在采集真实面经</h3>
            <p>{{ progress.message || '从多个数据源获取面试题，请稍候...' }}</p>
            
            <!-- 进度条 -->
            <div class="progress-container">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: `${progress.progress}%` }"></div>
              </div>
              <span class="progress-text">{{ progress.progress }}%</span>
            </div>
            
            <!-- 当前数据源 -->
            <p v-if="progress.currentSource" class="current-source">
              正在处理：{{ progress.currentSource }}
            </p>
            
            <!-- 重试提示 -->
            <p v-if="retryCount > 0" class="retry-info">
              重试中 ({{ retryCount }}/{{ maxRetries }})
            </p>
          </div>
        </div>

        <!-- 审核步骤 -->
        <div v-else-if="step === 'review'" class="step-review">
          <div class="stats-bar">
            <span>采集到 <strong>{{ stats.total }}</strong> 道题</span>
            <span v-for="(count, source) in stats.bySource" :key="source">
              {{ source }}: {{ count }}
            </span>
            <span v-if="stats.degraded.length" class="warning">
              降级源：{{ stats.degraded.join(', ') }}
            </span>
          </div>

          <div class="question-list">
            <div 
              v-for="(question, index) in collectedQuestions" 
              :key="index"
              class="question-item"
              :class="{ selected: question.content }"
              @click="toggleQuestion(index)"
            >
              <div class="question-checkbox">
                <input 
                  type="checkbox" 
                  :checked="!!question.content"
                  @click.stop="toggleQuestion(index)"
                />
              </div>
              <div class="question-content">
                <p>{{ question.content }}</p>
                <div class="question-meta">
                  <span v-if="question.source_url" class="source-link">
                    来源：{{ question.source_url.substring(0, 50) }}...
                  </span>
                  <span v-if="question.is_grounded" class="grounded-badge">
                    可追溯
                  </span>
                  <span v-if="question.resume_anchor" class="anchor-badge">
                    锚定：{{ question.resume_anchor }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer class="dialog-footer">
        <div v-if="error" class="error-message">{{ error }}</div>
        <div class="footer-actions">
          <button 
            v-if="step === 'config'" 
            class="btn secondary" 
            @click="emit('close')"
          >
            取消
          </button>
          <button 
            v-if="step === 'config'" 
            class="btn primary" 
            :disabled="isLoading || !targetPosition.trim()"
            @click="startCollection"
          >
            {{ isLoading ? '采集中...' : '开始采集' }}
          </button>
          <button 
            v-if="step === 'review'" 
            class="btn secondary" 
            @click="step = 'config'"
          >
            返回配置
          </button>
          <button 
            v-if="step === 'review'" 
            class="btn primary" 
            :disabled="isLoading || selectedCount === 0"
            @click="saveSelected"
          >
            {{ isLoading ? '保存中...' : `保存选中的 ${selectedCount} 道题` }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: var(--bg-overlay);
  backdrop-filter: blur(8px);
}

.dialog {
  display: flex;
  flex-direction: column;
  width: min(800px, 100%);
  max-height: 85vh;
  border: 1px solid var(--border-color-strong);
  border-radius: 18px;
  background: var(--bg-elevated);
  box-shadow: var(--shadow-xl);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 32px;
  border-bottom: 1px solid var(--border-color);
}

.dialog-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  cursor: pointer;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

.dialog-footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 32px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-group input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
}

.source-config {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.source-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
}

.source-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.source-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.source-status {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-card);
  color: var(--text-muted);
}

.source-status.active {
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
  color: var(--accent-green);
}

.source-urls {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.url-item {
  display: flex;
  gap: 8px;
}

.url-item input {
  flex: 1;
}

.remove-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.remove-btn:hover {
  background: color-mix(in srgb, var(--accent-red) 10%, var(--bg-card));
  color: var(--accent-red);
  border-color: var(--accent-red);
}

.add-url-btn {
  width: 100%;
  padding: 8px;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
}

.add-url-btn:hover {
  border-color: var(--primary-400);
  color: var(--primary-500);
}

.source-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.quick-config {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.quick-btn:hover {
  border-color: var(--primary-400);
  color: var(--primary-500);
  background: color-mix(in srgb, var(--primary-500) 5%, var(--bg-card));
}

.ai-config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.ai-config-header label {
  margin-bottom: 0;
}

.toggle-btn {
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
}

.toggle-btn:hover {
  border-color: var(--primary-400);
  color: var(--primary-500);
}

.ai-config {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
}

.ai-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 22px;
  transition: .3s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: var(--text-muted);
  border-radius: 50%;
  transition: .3s;
}

input:checked + .slider {
  background-color: var(--primary-500);
  border-color: var(--primary-500);
}

input:checked + .slider:before {
  transform: translateX(18px);
  background-color: white;
}

.ai-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-fields .form-group {
  margin-bottom: 0;
}

.ai-fields select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
}

.ai-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

.info-box {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
}

.info-box p {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.info-box ul {
  margin: 0 0 8px;
  padding-left: 20px;
}

.info-box li {
  font-size: 13px;
  color: var(--text-secondary);
}

.info-box .note {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-500);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.progress-container {
  width: 100%;
  max-width: 300px;
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-card-muted);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary-500);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 40px;
  text-align: right;
}

.current-source {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.retry-info {
  margin-top: 8px;
  font-size: 12px;
  color: var(--accent-orange);
  font-weight: 600;
}

.loading-state h3 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.loading-state p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.stats-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
}

.stats-bar span {
  font-size: 13px;
  color: var(--text-secondary);
}

.stats-bar strong {
  color: var(--text-primary);
}

.stats-bar .warning {
  color: var(--accent-orange);
}

.question-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.question-item {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  cursor: pointer;
  transition: all 0.2s ease;
}

.question-item:hover {
  border-color: var(--primary-400);
  background: var(--bg-card-muted);
}

.question-item.selected {
  border-color: var(--primary-500);
  background: color-mix(in srgb, var(--primary-500) 5%, var(--bg-card));
}

.question-checkbox {
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
}

.question-checkbox input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.question-content {
  flex: 1;
}

.question-content p {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
}

.question-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.source-link {
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
}

.grounded-badge,
.anchor-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.grounded-badge {
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
  color: var(--accent-green);
}

.anchor-badge {
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card));
  color: var(--primary-500);
}

.error-message {
  padding: 8px 12px;
  border: 1px solid var(--accent-red);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-red) 5%, var(--bg-card));
  color: var(--accent-red);
  font-size: 13px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 20px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--primary-500);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: var(--primary-600);
}

.btn.secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border-color: var(--border-color);
}

.btn.secondary:hover:not(:disabled) {
  background: var(--bg-card-muted);
}
</style>
