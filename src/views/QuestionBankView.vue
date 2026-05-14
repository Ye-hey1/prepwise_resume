<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AddQuestionDialog from '@/components/questionBank/AddQuestionDialog.vue'
import AiGenerateDialog from '@/components/questionBank/AiGenerateDialog.vue'

defineOptions({ name: 'QuestionBankView' })
import { useQuestionBankStore, type SavedQuestion } from '@/stores/questionBank'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useResumeStore } from '@/stores/resume'
import { nonStreamAIRequest } from '@/services/stream'

type MasteryFilter = 'all' | 'unpracticed' | 'weak' | 'ready'
type SortMode = 'newest' | 'weak-first' | 'mastery-desc'

const DRILL_SEED_STORAGE_KEY = 'prepwise_question_bank_drill_seed'

const qbStore = useQuestionBankStore()
const aiConfigStore = useAiConfigStore()
const resumeStore = useResumeStore()
const router = useRouter()

const showAddDialog = ref(false)
const showAiDialog = ref(false)
const selectedQuestion = ref<SavedQuestion | null>(null)
const editingNotes = ref(false)
const savingNotes = ref(false)
const notesDraft = ref('')
const generatingAnswer = ref(false)
const editingAnswer = ref(false)
const savingAnswer = ref(false)
const answerDraft = ref('')

const searchQuery = ref('')
const activeCategory = ref('')
const masteryFilter = ref<MasteryFilter>('all')
const sortBy = ref<SortMode>('newest')

const masteryOptions: Array<{ value: MasteryFilter; label: string }> = [
  { value: 'all', label: '全部掌握度' },
  { value: 'unpracticed', label: '未练习' },
  { value: 'weak', label: '待强化' },
  { value: 'ready', label: '已掌握' },
]

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: 'newest', label: '最近添加' },
  { value: 'weak-first', label: '薄弱优先' },
  { value: 'mastery-desc', label: '掌握优先' },
]

const pureQuestions = computed(() =>
  qbStore.questions.filter((question) => !isInterviewExperienceImport(question)),
)

const availableCategories = computed(() => {
  const categories = new Set(pureQuestions.value.map((item) => item.category).filter(Boolean))
  return Array.from(categories).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

const filteredQuestions = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  let list = [...pureQuestions.value]

  if (activeCategory.value) {
    list = list.filter((item) => item.category === activeCategory.value)
  }

  if (masteryFilter.value !== 'all') {
    list = list.filter((item) => {
      const mastery = item.mastery_level ?? 0
      if (masteryFilter.value === 'unpracticed') return mastery === 0
      if (masteryFilter.value === 'weak') return mastery > 0 && mastery <= 2
      return mastery >= 3
    })
  }

  if (keyword) {
    list = list.filter((item) => {
      const haystack = [
        item.content,
        item.category,
        item.focus_area,
        item.intent,
        item.framework,
        item.reference_answer,
        ...(item.tags ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(keyword)
    })
  }

  return sortQuestions(list, sortBy.value)
})

const stats = computed(() => {
  const all = pureQuestions.value
  const practiced = all.filter((item) => (item.mastery_level ?? 0) > 0).length
  const needsPractice = all.filter((item) => (item.mastery_level ?? 0) <= 2).length
  const withReference = all.filter((item) => Boolean(item.reference_answer?.trim())).length

  return {
    total: all.length,
    needsPractice,
    practiced,
    withReference,
  }
})

const hasActiveFilter = computed(() =>
  Boolean(searchQuery.value.trim() || activeCategory.value || masteryFilter.value !== 'all'),
)

function sortQuestions(list: SavedQuestion[], mode: SortMode) {
  const sorted = [...list]
  switch (mode) {
    case 'weak-first':
      sorted.sort((a, b) => (a.mastery_level ?? 0) - (b.mastery_level ?? 0) || getTime(b.created_at) - getTime(a.created_at))
      break
    case 'mastery-desc':
      sorted.sort((a, b) => (b.mastery_level ?? 0) - (a.mastery_level ?? 0) || getTime(b.created_at) - getTime(a.created_at))
      break
    default:
      sorted.sort((a, b) => getTime(b.created_at) - getTime(a.created_at))
  }
  return sorted
}

function isInterviewExperienceImport(question: SavedQuestion) {
  const text = [
    question.source ?? '',
    question.category ?? '',
    ...(question.tags ?? []),
  ].join(' ')

  return text.includes('面经')
    || text.includes('面试经验')
    || text.toLowerCase().includes('interview experience')
}

function getTime(value?: string) {
  return value ? new Date(value).getTime() || 0 : 0
}

function resetFilters() {
  searchQuery.value = ''
  activeCategory.value = ''
  masteryFilter.value = 'all'
  sortBy.value = 'newest'
}

function openQuestion(question: SavedQuestion) {
  selectedQuestion.value = question
  notesDraft.value = question.user_notes ?? ''
  editingNotes.value = false
  editingAnswer.value = false
  answerDraft.value = ''
}

function closeQuestion() {
  selectedQuestion.value = null
  notesDraft.value = ''
  editingNotes.value = false
  editingAnswer.value = false
  answerDraft.value = ''
}

function formatDate(value?: string) {
  if (!value) return '未记录'
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function masteryLabel(level?: number) {
  const value = level ?? 0
  if (value === 0) return '未练习'
  if (value <= 1) return '薄弱'
  if (value <= 2) return '一般'
  if (value <= 3) return '熟练'
  return '精通'
}

function startPractice(items: SavedQuestion[]) {
  const seeds = items.slice(0, 8)
  if (!seeds.length) return

  localStorage.setItem(
    DRILL_SEED_STORAGE_KEY,
    JSON.stringify({
      createdAt: Date.now(),
      questions: seeds,
    }),
  )

  void router.push({ name: 'ai-interviewer', query: { from: 'question-bank' } })
}

async function setMastery(question: SavedQuestion, level: number) {
  if (!question.id) return
  const nextLevel = level === (question.mastery_level ?? 0) ? level - 1 : level
  const success = await qbStore.updateMastery(question.id, nextLevel)
  if (success && selectedQuestion.value?.id === question.id) {
    selectedQuestion.value = { ...selectedQuestion.value, mastery_level: nextLevel }
  }
}

async function saveNotes() {
  const question = selectedQuestion.value
  if (!question?.id || savingNotes.value) return

  savingNotes.value = true
  const success = await qbStore.updateQuestion(question.id, {
    user_notes: notesDraft.value,
  })
  if (success) {
    selectedQuestion.value = { ...question, user_notes: notesDraft.value }
    editingNotes.value = false
  }
  savingNotes.value = false
}

async function deleteQuestion(question: SavedQuestion) {
  if (!question.id) return
  if (!confirm('确定要从题库中删除这道题吗？')) return

  const success = await qbStore.deleteQuestion(question.id)
  if (success && selectedQuestion.value?.id === question.id) {
    closeQuestion()
  }
}

async function handleGenerateAnswer() {
  const question = selectedQuestion.value
  if (!question?.id || generatingAnswer.value) return

  const config = aiConfigStore.getConfigForFeature('default')
  if (!config.apiToken) {
    alert('请先配置 AI 模型（点击左下角云朵图标）')
    return
  }

  generatingAnswer.value = true

  try {
    // 构建简历上下文
    const resumeContext = [
      resumeStore.basicInfo.jobTitle ? `目标岗位：${resumeStore.basicInfo.jobTitle}` : '',
      resumeStore.basicInfo.workYears ? `工作年限：${resumeStore.basicInfo.workYears}` : '',
      resumeStore.skills ? `技能：${resumeStore.skills.replace(/<[^>]*>/g, '').slice(0, 300)}` : '',
      ...resumeStore.projectList.slice(0, 2).map(p => `项目：${p.name} - ${p.role}`),
      ...resumeStore.workList.slice(0, 2).map(w => `经历：${w.company} ${w.position}`),
    ].filter(Boolean).join('\n')

    const systemPrompt = `你现在是一位正在参加技术面试的候选人。请根据你的简历背景，用第一人称直接回答面试官的问题。

严格要求：
1. 以"我"开头直接作答，就像你正坐在面试官对面说话一样
2. 不要出现任何标题、标记、分段标签（禁止使用 STAR、S/T/A/R、**加粗**、编号列表等格式）
3. 用自然流畅的口语表达，像真人对话一样有停顿和过渡（可以用"当时"、"后来"、"具体来说"等口语连接词）
4. 结合简历中的真实项目和技术栈，讲出具体的技术方案和数据结果
5. 控制在 150-300 字，面试回答不宜过长
6. 如果简历中没有直接相关经验，基于技术栈合理延伸，但不要编造不存在的项目名称
7. 语气自信但不夸张，像一个有经验的工程师在平等交流`

    const userMessage = `你的简历背景：
${resumeContext || '暂无详细简历信息'}

面试官问你：${question.content}
${question.intent ? `（这道题考察的是：${question.intent}）` : ''}

请直接用第一人称口语回答：`

    const answer = await nonStreamAIRequest(config, systemPrompt, userMessage, { temperature: 0.7 })

    if (answer.trim()) {
      await qbStore.updateQuestion(question.id, { reference_answer: answer.trim() })
      selectedQuestion.value = { ...question, reference_answer: answer.trim() }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '生成失败'
    alert(`AI 生成参考答案失败：${msg}`)
  } finally {
    generatingAnswer.value = false
  }
}

function startEditAnswer() {
  answerDraft.value = selectedQuestion.value?.reference_answer ?? ''
  editingAnswer.value = true
}

async function saveAnswer() {
  const question = selectedQuestion.value
  if (!question?.id || savingAnswer.value) return

  savingAnswer.value = true
  const success = await qbStore.updateQuestion(question.id, {
    reference_answer: answerDraft.value,
  })
  if (success) {
    selectedQuestion.value = { ...question, reference_answer: answerDraft.value }
    editingAnswer.value = false
  }
  savingAnswer.value = false
}

onMounted(() => {
  void qbStore.fetchQuestions()
})
</script>

<template>
  <div class="qb-page">
    <header class="qb-header">
      <div class="header-copy">
        <h1>面试题库</h1>
        <p>沉淀可直接练习的单道面试问题。</p>
      </div>

      <div class="header-actions">
        <button class="action-btn secondary" type="button" @click="showAiDialog = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3v4" />
            <path d="M12 17v4" />
            <path d="M3 12h4" />
            <path d="M17 12h4" />
            <path d="m5.6 5.6 2.8 2.8" />
            <path d="m15.6 15.6 2.8 2.8" />
            <path d="m18.4 5.6-2.8 2.8" />
            <path d="m8.4 15.6-2.8 2.8" />
          </svg>
          AI 生成
        </button>
        <button class="action-btn primary" type="button" @click="showAddDialog = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          添加题目
        </button>
      </div>
    </header>

    <section class="stat-strip" aria-label="题库统计">
      <span>全部 <strong>{{ stats.total }}</strong></span>
      <span>待练 <strong>{{ stats.needsPractice }}</strong></span>
      <span>已练 <strong>{{ stats.practiced }}</strong></span>
      <span>参考答案 <strong>{{ stats.withReference }}</strong></span>
    </section>

    <section class="toolbar">
      <div class="search-box">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input v-model="searchQuery" type="search" placeholder="搜索题目、标签、领域..." />
      </div>

      <label class="select-field">
        <span>领域</span>
        <select v-model="activeCategory">
          <option value="">全部领域</option>
          <option v-for="category in availableCategories" :key="category" :value="category">
            {{ category }}
          </option>
        </select>
      </label>

      <label class="select-field">
        <span>掌握</span>
        <select v-model="masteryFilter">
          <option v-for="option in masteryOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="select-field">
        <span>排序</span>
        <select v-model="sortBy">
          <option v-for="option in sortOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <button class="reset-btn" type="button" :disabled="!hasActiveFilter" @click="resetFilters">
        重置
      </button>
    </section>

    <main class="question-area custom-scroll">
      <div v-if="qbStore.isLoading" class="state-box">
        <div class="loading-spinner"></div>
        <h3>正在加载题库</h3>
        <p>请稍等。</p>
      </div>

      <div v-else-if="qbStore.errorMsg" class="state-box error">
        <h3>题库加载失败</h3>
        <p>{{ qbStore.errorMsg }}</p>
        <button class="outline-btn" type="button" @click="qbStore.fetchQuestions()">重新加载</button>
      </div>

      <template v-else>
        <div v-if="filteredQuestions.length === 0" class="state-box empty">
          <h3>{{ pureQuestions.length ? '没有匹配的题目' : '题库暂无题目' }}</h3>
          <p>{{ pureQuestions.length ? '调整筛选条件后再查看。' : '通过以下方式快速填充你的面试题库：' }}</p>

          <!-- 筛选无结果时 -->
          <div v-if="pureQuestions.length" class="empty-actions">
            <button class="outline-btn" type="button" @click="resetFilters">清空筛选</button>
          </div>

          <!-- 题库为空时的引导卡片 -->
          <div v-else class="empty-guide-grid">
            <div class="guide-card" @click="$router.push({ name: 'jd-analysis' })">
              <div class="guide-icon guide-icon--jd">
                <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M21 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z" stroke="currentColor" stroke-width="1.5" /></svg>
              </div>
              <h4>从 JD 分析生成</h4>
              <p>粘贴目标岗位 JD，AI 自动生成针对性面试题</p>
            </div>
            <div class="guide-card" @click="showAiDialog = true">
              <div class="guide-icon guide-icon--ai">
                <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" stroke="currentColor" stroke-width="1.5" /></svg>
              </div>
              <h4>AI 智能生成</h4>
              <p>输入岗位方向，AI 生成常见面试题和参考答案</p>
            </div>
            <div class="guide-card" @click="showAddDialog = true">
              <div class="guide-icon guide-icon--add">
                <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
              </div>
              <h4>手动添加</h4>
              <p>记录面试中遇到的真题，积累个人题库</p>
            </div>
          </div>
        </div>

        <div v-else class="question-grid">
          <article v-for="question in filteredQuestions" :key="question.id ?? question.content" class="question-card">
            <!-- 悬停时显示的删除图标 -->
            <button
              class="card-delete-btn"
              type="button"
              title="删除题目"
              @click.stop="deleteQuestion(question)"
            >
              <svg viewBox="0 0 24 24" fill="none" width="15" height="15">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <div class="card-head">
              <span class="category-pill">{{ question.category || '未分类' }}</span>
              <span class="meta-pill">{{ masteryLabel(question.mastery_level) }}</span>
            </div>

            <h2>{{ question.content }}</h2>

            <div class="card-meta">
              <span>{{ formatDate(question.created_at) }}</span>
              <span v-if="question.reference_answer">有参考答案</span>
              <span v-if="question.focus_area">{{ question.focus_area }}</span>
            </div>

            <div class="tag-row">
              <span v-for="tag in question.tags?.slice(0, 5)" :key="tag" class="tag-pill">#{{ tag }}</span>
              <span v-if="!question.tags?.length" class="tag-pill muted">未标注标签</span>
            </div>

            <footer class="card-actions">
              <button class="card-btn" type="button" @click="openQuestion(question)">查看</button>
              <button class="card-btn primary" type="button" @click="startPractice([question])">练习</button>
            </footer>
          </article>
        </div>
      </template>
    </main>

    <Transition name="modal-fade">
      <AddQuestionDialog
        v-if="showAddDialog"
        @close="showAddDialog = false"
        @saved="showAddDialog = false"
      />
    </Transition>

    <Transition name="modal-fade">
      <AiGenerateDialog
        v-if="showAiDialog"
        @close="showAiDialog = false"
        @saved="showAiDialog = false"
      />
    </Transition>

    <Transition name="modal-fade">
      <div v-if="selectedQuestion" class="modal-overlay" @click="closeQuestion">
        <section class="question-modal" @click.stop>
          <button class="close-btn" type="button" @click="closeQuestion">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>

          <header class="modal-head">
            <div class="card-head">
              <span class="category-pill">{{ selectedQuestion.category || '未分类' }}</span>
              <span class="meta-pill">{{ masteryLabel(selectedQuestion.mastery_level) }}</span>
            </div>
            <h2>{{ selectedQuestion.content }}</h2>
            <p>录入：{{ formatDate(selectedQuestion.created_at) }}</p>
          </header>

          <div class="modal-body custom-scroll">
            <section class="detail-section">
              <div class="section-row">
                <h3>掌握程度</h3>
                <span>{{ masteryLabel(selectedQuestion.mastery_level) }}</span>
              </div>
              <div class="mastery-bar">
                <button
                  v-for="level in 5"
                  :key="level"
                  class="mastery-dot"
                  :class="{ active: level <= (selectedQuestion.mastery_level ?? 0) }"
                  type="button"
                  @click="setMastery(selectedQuestion, level)"
                >
                  {{ level }}
                </button>
              </div>
            </section>

            <section v-if="selectedQuestion.intent" class="detail-section">
              <h3>考察意图</h3>
              <p>{{ selectedQuestion.intent }}</p>
            </section>

            <section v-if="selectedQuestion.framework" class="detail-section">
              <h3>答题框架</h3>
              <p>{{ selectedQuestion.framework }}</p>
            </section>

            <section class="detail-section answer">
              <div class="section-row">
                <h3>参考答案</h3>
                <div class="answer-actions">
                  <button
                    v-if="!editingAnswer"
                    class="ai-gen-btn"
                    type="button"
                    :disabled="generatingAnswer"
                    @click="handleGenerateAnswer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" stroke="currentColor" stroke-width="1.5" />
                    </svg>
                    {{ generatingAnswer ? '生成中...' : selectedQuestion.reference_answer ? '重新生成' : 'AI 生成' }}
                  </button>
                  <button
                    v-if="selectedQuestion.reference_answer && !editingAnswer"
                    class="text-btn"
                    type="button"
                    @click="startEditAnswer"
                  >
                    编辑
                  </button>
                  <template v-if="editingAnswer">
                    <button class="text-btn muted" type="button" @click="editingAnswer = false">取消</button>
                    <button class="text-btn" type="button" :disabled="savingAnswer" @click="saveAnswer">
                      {{ savingAnswer ? '保存中' : '保存' }}
                    </button>
                  </template>
                </div>
              </div>
              <textarea
                v-if="editingAnswer"
                v-model="answerDraft"
                class="answer-editor"
                placeholder="输入或修改参考答案..."
              />
              <p v-else-if="selectedQuestion.reference_answer">{{ selectedQuestion.reference_answer }}</p>
              <p v-else class="muted">暂无参考答案，点击右上方按钮基于简历和岗位需求生成。</p>
            </section>

            <section class="detail-section">
              <div class="section-row">
                <h3>我的笔记</h3>
                <div class="note-actions">
                  <button v-if="!editingNotes" class="text-btn" type="button" @click="editingNotes = true">编辑</button>
                  <template v-else>
                    <button class="text-btn muted" type="button" @click="editingNotes = false">取消</button>
                    <button class="text-btn" type="button" :disabled="savingNotes" @click="saveNotes">
                      {{ savingNotes ? '保存中' : '保存' }}
                    </button>
                  </template>
                </div>
              </div>
              <p v-if="!editingNotes" class="notes-view" :class="{ muted: !selectedQuestion.user_notes }">
                {{ selectedQuestion.user_notes || '还没有笔记。' }}
              </p>
              <textarea v-else v-model="notesDraft" class="notes-editor" placeholder="记录复盘要点..." />
            </section>

            <section v-if="selectedQuestion.tags?.length" class="detail-section">
              <h3>标签</h3>
              <div class="tag-row">
                <span v-for="tag in selectedQuestion.tags" :key="tag" class="tag-pill">#{{ tag }}</span>
              </div>
            </section>
          </div>

          <footer class="modal-footer">
            <button class="card-btn danger" type="button" @click="deleteQuestion(selectedQuestion)">删除</button>
            <button class="card-btn" type="button" @click="closeQuestion">关闭</button>
            <button class="card-btn primary" type="button" @click="startPractice([selectedQuestion])">练习这题</button>
          </footer>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.qb-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  padding: 22px 28px 18px;
  overflow: hidden;
  background: var(--bg-card);
  gap: 12px;
}

.qb-header,
.header-actions,
.stat-strip,
.toolbar,
.card-head,
.card-meta,
.tag-row,
.card-actions,
.section-row,
.modal-footer,
.empty-actions,
.note-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 空状态引导卡片 */
.empty-guide-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 16px;
  width: 100%;
  max-width: 640px;
}

.guide-card {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  cursor: pointer;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.guide-card:hover {
  border-color: var(--primary-500);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
}

.guide-card h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.guide-card p {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.guide-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.guide-icon--jd { background: rgba(43, 123, 184, 0.1); color: var(--primary-500); }
.guide-icon--ai { background: rgba(26, 143, 94, 0.1); color: var(--accent-green); }
.guide-icon--add { background: rgba(224, 138, 58, 0.1); color: var(--accent-orange); }

@media (max-width: 640px) {
  .empty-guide-grid {
    grid-template-columns: 1fr;
  }
}

.qb-header {
  justify-content: space-between;
  flex-shrink: 0;
}

.header-copy {
  min-width: 0;
}

.header-copy h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: 27px;
  line-height: 1.15;
  font-weight: 900;
}

.header-copy p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.action-btn,
.outline-btn,
.reset-btn,
.card-btn,
.text-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
}

.action-btn {
  min-height: 38px;
  padding: 0 16px;
  font-size: 13px;
}

.action-btn.primary,
.card-btn.primary {
  color: #fff;
  background: var(--primary-600);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--primary-500) 18%, transparent);
}

.action-btn.secondary {
  color: var(--primary-600);
  background: color-mix(in srgb, var(--primary-500) 7%, var(--bg-card));
  border-color: color-mix(in srgb, var(--primary-500) 16%, transparent);
}

.stat-strip {
  min-height: 34px;
  padding: 5px 8px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-card-muted) 62%, transparent);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.stat-strip span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 7px;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  font-size: 12px;
  font-weight: 800;
}

.stat-strip strong {
  color: var(--text-primary);
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(140px, 0.38fr) minmax(130px, 0.34fr) minmax(130px, 0.34fr) auto;
  gap: 10px;
  align-items: end;
  padding-bottom: 4px;
  flex-shrink: 0;
}

.search-box {
  position: relative;
}

.search-box input,
.select-field select {
  width: 100%;
  height: 38px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-card-muted);
  color: var(--text-primary);
  font-size: 13px;
}

.search-box input {
  padding: 0 12px 0 38px;
}

.select-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.select-field span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 900;
}

.select-field select {
  padding: 0 9px;
  outline: none;
}

.search-box input:focus,
.select-field select:focus {
  outline: none;
  border-color: var(--primary-400);
  box-shadow: var(--focus-ring);
}

.search-icon {
  position: absolute;
  top: 50%;
  left: 12px;
  color: var(--text-muted);
  transform: translateY(-50%);
}

.reset-btn,
.outline-btn,
.card-btn {
  min-height: 36px;
  padding: 0 13px;
  color: var(--text-secondary);
  background: var(--bg-card);
  border-color: var(--border-color);
  font-size: 12px;
}

.question-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.question-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 12px;
  align-items: stretch;
}

.question-card {
  display: flex;
  flex-direction: column;
  min-height: 202px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
  position: relative;
}

.question-card:hover {
  border-color: color-mix(in srgb, var(--primary-500) 26%, var(--border-color));
  box-shadow: 0 13px 26px rgba(28, 64, 102, 0.08);
}

/* 悬停显示的删除按钮 */
.card-delete-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
  z-index: 2;
}

.question-card:hover .card-delete-btn {
  opacity: 1;
}

.card-delete-btn:hover {
  background: color-mix(in srgb, var(--accent-red) 10%, var(--bg-card));
  color: var(--accent-red);
}

.card-head,
.tag-row {
  flex-wrap: wrap;
}

.category-pill,
.meta-pill,
.tag-pill {
  display: inline-flex;
  align-items: center;
  min-height: 23px;
  padding: 0 8px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 800;
}

.category-pill {
  color: #fff;
  background: var(--primary-500);
}

.meta-pill,
.tag-pill {
  color: var(--text-secondary);
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
}

.tag-pill.muted {
  color: var(--text-muted);
}

.question-card h2 {
  display: -webkit-box;
  margin: 12px 0 9px;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 17px;
  line-height: 1.55;
  font-weight: 900;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.card-meta {
  flex-wrap: wrap;
  margin-bottom: 10px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.card-meta span + span::before {
  content: "";
  width: 3px;
  height: 3px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  display: inline-block;
  vertical-align: middle;
}

.card-actions {
  justify-content: flex-end;
  margin-top: auto;
  padding-top: 14px;
}

.card-btn.danger {
  color: var(--accent-red);
  background: color-mix(in srgb, var(--accent-red) 8%, var(--bg-card));
  border-color: color-mix(in srgb, var(--accent-red) 20%, var(--border-color));
}

.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 360px;
  padding: 42px 24px;
  text-align: center;
  color: var(--text-secondary);
}

.state-box h3 {
  margin: 12px 0 6px;
  color: var(--text-primary);
  font-size: 19px;
}

.state-box p {
  max-width: 430px;
  margin: 0 0 14px;
  line-height: 1.7;
}

.state-box.error h3 {
  color: var(--accent-red);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-500);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.modal-overlay {
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

.question-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(820px, 100%);
  max-height: 86vh;
  overflow: hidden;
  border: 1px solid var(--border-color-strong);
  border-radius: 18px;
  background: var(--bg-elevated);
  box-shadow: var(--shadow-xl);
}

.close-btn {
  position: absolute;
  top: 18px;
  right: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  color: var(--text-secondary);
  background: var(--bg-card-muted);
  cursor: pointer;
}

.modal-head {
  padding: 28px 32px 18px;
  border-bottom: 1px solid var(--border-color);
}

.modal-head h2 {
  margin: 12px 48px 8px 0;
  color: var(--text-primary);
  font-size: 22px;
  line-height: 1.45;
}

.modal-head p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding: 22px 32px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-row {
  justify-content: space-between;
}

.detail-section h3 {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 900;
}

.section-row span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.detail-section p,
.notes-view {
  margin: 0;
  padding: 14px 16px;
  border-radius: 8px;
  color: var(--text-primary);
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.detail-section.answer p {
  border-left: 3px solid var(--primary-500);
  background: color-mix(in srgb, var(--primary-500) 4%, var(--bg-card-muted));
}

.notes-view.muted {
  color: var(--text-muted);
}

.notes-editor {
  width: 100%;
  min-height: 110px;
  padding: 13px 14px;
  border: 1px solid var(--primary-300);
  border-radius: 8px;
  outline: none;
  resize: vertical;
  color: var(--text-primary);
  background: var(--bg-card-muted);
  font: inherit;
  line-height: 1.7;
}

.mastery-bar {
  display: flex;
  gap: 7px;
}

.mastery-dot {
  width: 40px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-muted);
  background: var(--bg-card-muted);
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.mastery-dot.active {
  color: #fff;
  border-color: transparent;
  background: var(--primary-500);
}

.text-btn {
  min-height: 28px;
  padding: 0 10px;
  color: var(--primary-600);
  background: color-mix(in srgb, var(--primary-500) 7%, var(--bg-card));
  border-color: color-mix(in srgb, var(--primary-500) 16%, transparent);
  font-size: 12px;
}

.text-btn.muted {
  color: var(--text-secondary);
  background: var(--bg-card-muted);
  border-color: var(--border-color);
}

/* AI 生成参考答案按钮 */
.ai-gen-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--accent-green) 24%, var(--border-color));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-green) 6%, var(--bg-card));
  color: var(--accent-green);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.ai-gen-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-green) 12%, var(--bg-card));
  border-color: var(--accent-green);
  transform: translateY(-1px);
}

.ai-gen-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.answer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.answer-editor {
  width: 100%;
  min-height: 160px;
  padding: 14px 16px;
  border: 1px solid var(--primary-300);
  border-radius: 8px;
  outline: none;
  resize: vertical;
  color: var(--text-primary);
  background: var(--bg-card-muted);
  font: inherit;
  line-height: 1.8;
}

.modal-footer {
  justify-content: flex-end;
  padding: 16px 32px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card-muted);
}

.action-btn:hover:not(:disabled),
.outline-btn:hover:not(:disabled),
.reset-btn:hover:not(:disabled),
.card-btn:hover:not(:disabled),
.text-btn:hover:not(:disabled),
.mastery-dot:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--primary-500) 24%, var(--border-color));
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.custom-scroll::-webkit-scrollbar {
  width: 6px;
}

.custom-scroll::-webkit-scrollbar-thumb {
  border-radius: 10px;
  background: var(--border-color);
}

@media (max-width: 1080px) {
  .qb-page {
    padding: 18px;
  }

  .toolbar {
    grid-template-columns: minmax(260px, 1fr) repeat(2, minmax(130px, 0.4fr));
  }

  .reset-btn {
    grid-column: span 1;
  }
}

@media (max-width: 760px) {
  .qb-header,
  .header-actions,
  .toolbar,
  .card-actions,
  .modal-footer {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .question-grid {
    grid-template-columns: 1fr;
  }

  .action-btn,
  .card-btn,
  .reset-btn {
    width: 100%;
  }

  .modal-overlay {
    padding: 14px;
  }

  .modal-head,
  .modal-body,
  .modal-footer {
    padding-left: 20px;
    padding-right: 20px;
  }
}
</style>
