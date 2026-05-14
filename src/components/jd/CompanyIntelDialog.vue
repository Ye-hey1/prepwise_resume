<script setup lang="ts">
/**
 * 公司情报独立弹窗
 * 手动触发搜集，展示详细的公司画像信息
 */
import { ref, computed } from 'vue'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useAiConfigStore } from '@/stores/aiConfig'
import { generateCompanyIntel } from '@/services/jdService'
import type { CompanyIntelData } from '@/services/types/jd'

const emit = defineEmits<{ close: [] }>()

const jdStore = useJdAnalysisStore()
const aiConfigStore = useAiConfigStore()

const isLoading = ref(false)
const errorMsg = ref('')
const currentStep = ref('')
const completedSteps = ref<string[]>([])

const steps = [
  { key: 'search-business', label: '搜索公司官网与业务信息' },
  { key: 'search-recruit', label: '搜索招聘信息与技术要求' },
  { key: 'search-interview', label: '搜索面试经验与员工评价' },
  { key: 'search-news', label: '搜索新闻动态与竞品信息' },
  { key: 'analyze', label: 'AI 分析整合情报' },
]

const intel = computed(() => jdStore.companyIntel)
const companyName = computed(() =>
  jdStore.targetCompany || jdStore.jdData?.basicInfo.company || '目标公司',
)
const currentStepLabel = computed(() => {
  const step = steps.find(s => s.key === currentStep.value)
  return step?.label || '准备中...'
})
const progressPercent = computed(() => {
  return Math.round((completedSteps.value.length / steps.length) * 100)
})

async function handleFetchIntel() {
  const searchProviders = aiConfigStore.getEnabledSearchProviders()
  if (!searchProviders.length) {
    errorMsg.value = '请先在设置中配置搜索引擎 API Key（如 Tavily）'
    return
  }

  const company = companyName.value.trim()
  if (!company || company === '目标公司') {
    errorMsg.value = '请先在 JD 中填写目标公司名称'
    return
  }

  isLoading.value = true
  errorMsg.value = ''
  currentStep.value = 'search-business'
  completedSteps.value = []

  try {
    const config = aiConfigStore.getConfigForFeature('jdCompanyIntel')
    const result = await generateCompanyIntel(
      config,
      searchProviders,
      company,
      jdStore.targetPosition || '',
      jdStore.jdText,
      {
        onChunk: (text: string) => {
          // 根据搜索进度更新步骤
          if (text.includes('searchBusiness') || text.includes('官网')) {
            if (currentStep.value === 'search-business') {
              completedSteps.value.push('search-business')
              currentStep.value = 'search-recruit'
            }
          }
          if (text.includes('searchRecruitment') || text.includes('招聘')) {
            if (currentStep.value === 'search-recruit') {
              completedSteps.value.push('search-recruit')
              currentStep.value = 'search-interview'
            }
          }
        },
        onDone: () => {
          completedSteps.value = steps.map(s => s.key)
          currentStep.value = ''
        },
        onError: (msg) => { throw new Error(msg) },
      },
    )
    // 模拟步骤完成（因为实际搜索是并行的，用时间模拟进度）
    jdStore.companyIntel = result
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : '搜集失败，请重试'
  } finally {
    isLoading.value = false
    currentStep.value = ''
  }
}

// 模拟搜索进度（因为搜索是并行的，用定时器模拟步骤推进）
function startProgressSimulation() {
  const stepKeys = steps.map(s => s.key)
  let idx = 0
  const interval = setInterval(() => {
    if (!isLoading.value || idx >= stepKeys.length - 1) {
      clearInterval(interval)
      return
    }
    completedSteps.value.push(stepKeys[idx]!)
    idx++
    currentStep.value = stepKeys[idx] || ''
  }, 2500)
  return interval
}

// 覆盖 handleFetchIntel 中的进度逻辑
const originalFetch = handleFetchIntel
async function handleFetchIntelWithProgress() {
  isLoading.value = true
  errorMsg.value = ''
  currentStep.value = steps[0]!.key
  completedSteps.value = []

  const progressInterval = startProgressSimulation()

  const searchProviders = aiConfigStore.getEnabledSearchProviders()
  if (!searchProviders.length) {
    clearInterval(progressInterval)
    isLoading.value = false
    errorMsg.value = '请先在设置中配置搜索引擎 API Key（如 Tavily）'
    return
  }

  const company = companyName.value.trim()
  if (!company || company === '目标公司') {
    clearInterval(progressInterval)
    isLoading.value = false
    errorMsg.value = '请先在 JD 中填写目标公司名称'
    return
  }

  try {
    const config = aiConfigStore.getConfigForFeature('jdCompanyIntel')
    const result = await generateCompanyIntel(
      config,
      searchProviders,
      company,
      jdStore.targetPosition || '',
      jdStore.jdText,
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (msg) => { throw new Error(msg) },
      },
    )
    jdStore.companyIntel = result
    completedSteps.value = steps.map(s => s.key)
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : '搜集失败，请重试'
  } finally {
    clearInterval(progressInterval)
    isLoading.value = false
    currentStep.value = ''
  }
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return dateStr }
}
</script>

<template>
  <Teleport to="body">
    <div class="intel-overlay" @click.self="emit('close')">
      <div class="intel-dialog">
        <!-- 头部 -->
        <header class="intel-header">
          <div class="intel-header-left">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <div>
              <h2>公司情报</h2>
              <p class="intel-company-name">{{ companyName }}</p>
            </div>
          </div>
          <div class="intel-header-right">
            <button
              class="intel-fetch-btn"
              type="button"
              :disabled="isLoading"
              @click="handleFetchIntelWithProgress"
            >
              {{ isLoading ? '搜集中...' : intel ? '重新搜集' : '开始搜集' }}
            </button>
            <button class="intel-close-btn" type="button" @click="emit('close')">
              <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>
        </header>

        <!-- 内容 -->
        <div class="intel-body">
          <!-- 错误提示 -->
          <div v-if="errorMsg" class="intel-error">{{ errorMsg }}</div>

          <!-- 加载中 - 居中状态提示 -->
          <div v-if="isLoading" class="intel-progress">
            <div class="loading-spinner"></div>
            <p class="progress-title">正在搜集情报...</p>
            <p class="progress-current">{{ currentStepLabel }}</p>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
            </div>
            <p class="progress-count">{{ completedSteps.length }} / {{ steps.length }}</p>
          </div>

          <!-- 空状态 -->
          <div v-else-if="!intel" class="intel-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <p>点击"开始搜集"获取目标公司的详细情报</p>
            <p class="intel-empty-hint">需要配置搜索引擎 API（如 Tavily）才能使用</p>
          </div>

          <!-- 情报内容 -->
          <template v-else>
            <div class="intel-meta-bar">
              <span v-if="intel.fetchedAt" class="intel-time">搜集于 {{ formatDate(intel.fetchedAt) }}</span>
              <span v-if="intel.industry" class="intel-tag">{{ intel.industry }}</span>
              <span v-if="intel.companySize" class="intel-tag">{{ intel.companySize }}</span>
              <span v-if="intel.fundingStage" class="intel-tag">{{ intel.fundingStage }}</span>
              <span v-if="intel.foundedYear" class="intel-tag">成立 {{ intel.foundedYear }}</span>
            </div>

            <!-- 公司概况 -->
            <section v-if="intel.businessScope || intel.companyHistory" class="intel-section">
              <h3>公司概况</h3>
              <p v-if="intel.businessScope">{{ intel.businessScope }}</p>
              <p v-if="intel.companyHistory" class="intel-sub-text">{{ intel.companyHistory }}</p>
            </section>

            <!-- 技术栈与工程文化 -->
            <section v-if="intel.techStack.length || intel.cultureNotes" class="intel-section">
              <h3>技术与工程文化</h3>
              <div v-if="intel.techStack.length" class="intel-tags">
                <span v-for="tech in intel.techStack" :key="tech" class="tech-tag">{{ tech }}</span>
              </div>
              <p v-if="intel.cultureNotes">{{ intel.cultureNotes }}</p>
            </section>

            <!-- 产品与业务 -->
            <section v-if="intel.products?.length || intel.recentNews?.length" class="intel-section">
              <h3>产品与业务</h3>
              <ul v-if="intel.products?.length" class="intel-list">
                <li v-for="product in intel.products" :key="product">{{ product }}</li>
              </ul>
              <div v-if="intel.recentNews?.length">
                <h4>近期动态</h4>
                <ul class="intel-list">
                  <li v-for="news in intel.recentNews" :key="news">{{ news }}</li>
                </ul>
              </div>
            </section>

            <!-- 团队与文化 -->
            <section v-if="intel.orgStructure || intel.workPace || intel.employeeReviews" class="intel-section">
              <h3>团队与文化</h3>
              <p v-if="intel.orgStructure">{{ intel.orgStructure }}</p>
              <p v-if="intel.workPace"><strong>工作节奏：</strong>{{ intel.workPace }}</p>
              <p v-if="intel.employeeReviews"><strong>员工评价：</strong>{{ intel.employeeReviews }}</p>
            </section>

            <!-- 面试情报 -->
            <section v-if="intel.howToReference || intel.interviewProcess || intel.frequentTopics?.length" class="intel-section">
              <h3>面试情报</h3>
              <p v-if="intel.interviewProcess"><strong>面试流程：</strong>{{ intel.interviewProcess }}</p>
              <p v-if="intel.interviewStyle"><strong>面试风格：</strong>{{ intel.interviewStyle }}</p>
              <p v-if="intel.howToReference">{{ intel.howToReference }}</p>
              <div v-if="intel.frequentTopics?.length">
                <h4>高频考点</h4>
                <div class="intel-tags">
                  <span v-for="topic in intel.frequentTopics" :key="topic" class="tech-tag">{{ topic }}</span>
                </div>
              </div>
            </section>

            <!-- 竞品与行业 -->
            <section v-if="intel.competitors.length" class="intel-section">
              <h3>竞品与行业</h3>
              <div class="intel-tags">
                <span v-for="comp in intel.competitors" :key="comp" class="tech-tag competitor">{{ comp }}</span>
              </div>
            </section>

            <!-- 推荐反问 -->
            <section v-if="intel.reverseQuestions.length" class="intel-section">
              <h3>面试推荐反问</h3>
              <ul class="intel-list questions">
                <li v-for="q in intel.reverseQuestions" :key="q">{{ q }}</li>
              </ul>
            </section>

            <!-- 信息来源 -->
            <section v-if="intel.sourceDetails?.length || intel.sources?.length" class="intel-section sources">
              <h3>信息来源</h3>
              <div class="source-list">
                <template v-if="intel.sourceDetails?.length">
                  <a v-for="(src, i) in intel.sourceDetails" :key="i" :href="src.url" target="_blank" rel="noopener" class="source-link">
                    [{{ i + 1 }}] {{ src.title || src.url }}
                  </a>
                </template>
                <template v-else>
                  <a v-for="(url, i) in intel.sources" :key="i" :href="url" target="_blank" rel="noopener" class="source-link">
                    [{{ i + 1 }}] {{ url }}
                  </a>
                </template>
              </div>
            </section>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.intel-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: var(--bg-overlay);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.intel-dialog {
  width: min(780px, 100%);
  max-height: 85vh;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color-strong);
  border-radius: 20px;
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.intel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.intel-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--primary-500);
}

.intel-header-left h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
}

.intel-company-name {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.intel-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.intel-fetch-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.intel-fetch-btn:hover:not(:disabled) { opacity: 0.9; }
.intel-fetch-btn:disabled { opacity: 0.5; cursor: wait; }

.intel-close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.intel-close-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.intel-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.intel-error {
  padding: 12px 16px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent-red) 8%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--accent-red) 20%, var(--border-color));
  color: var(--accent-red);
  font-size: 13px;
}

.intel-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 64px 24px;
  min-height: 240px;
}

.progress-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.progress-current {
  margin: 0;
  font-size: 13px;
  color: var(--primary-500);
  font-weight: 600;
  animation: fade-pulse 1.5s ease-in-out infinite;
}

@keyframes fade-pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

.progress-bar-wrap {
  width: 200px;
  height: 4px;
  border-radius: 2px;
  background: var(--border-color);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--primary-500);
  transition: width 0.4s ease;
}

.progress-count {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-500);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.intel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 24px;
  text-align: center;
  color: var(--text-muted);
}

.intel-empty p { margin: 0; font-size: 14px; }
.intel-empty-hint { font-size: 12px; opacity: 0.7; }

.intel-meta-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.intel-time {
  font-size: 11px;
  color: var(--text-muted);
}

.intel-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card-muted));
  color: var(--primary-600);
}

.intel-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.intel-section h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary);
}

.intel-section h4 {
  margin: 8px 0 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.intel-section p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.intel-sub-text {
  font-size: 12px;
  opacity: 0.8;
}

.intel-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tech-tag {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-info) 10%, var(--bg-card-muted));
  color: var(--accent-info);
  border: 1px solid color-mix(in srgb, var(--accent-info) 16%, var(--border-color));
}

.tech-tag.competitor {
  background: color-mix(in srgb, var(--accent-orange) 10%, var(--bg-card-muted));
  color: var(--accent-orange);
  border-color: color-mix(in srgb, var(--accent-orange) 16%, var(--border-color));
}

.intel-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.intel-list li {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.intel-list.questions li {
  color: var(--text-primary);
  font-weight: 500;
}

.intel-section.sources {
  background: var(--bg-card-muted);
  border-color: transparent;
}

.source-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.source-link {
  font-size: 12px;
  color: var(--primary-500);
  text-decoration: none;
  padding: 4px 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--primary-500) 6%, transparent);
}

.source-link:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .intel-overlay { padding: 12px; }
  .intel-dialog { max-height: 92vh; border-radius: 16px; }
  .intel-header { padding: 16px; }
  .intel-body { padding: 16px; }
}
</style>
