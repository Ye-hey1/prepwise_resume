<script setup lang="ts">
import { ref, computed } from 'vue'
import { useInterviewQuizStore, type DifficultyBucket, type QuizSessionConfig } from '@/stores/interviewQuiz'

const emit = defineEmits<{
  'start': [config: QuizSessionConfig]
}>()

const quizStore = useInterviewQuizStore()

const config = ref<QuizSessionConfig>({
  questionCount: 10,
  randomOrder: true,
  showAnswer: true,
})

const selectedCategories = ref<string[]>([])
const selectedTags = ref<string[]>([])
const selectedBuckets = ref<DifficultyBucket[]>([])

const difficultyBuckets: Array<{ id: DifficultyBucket; name: string; color: string }> = [
  { id: 'easy', name: '简单', color: '#10b981' },
  { id: 'medium', name: '中等', color: '#f59e0b' },
  { id: 'hard', name: '困难', color: '#ef4444' },
]

function toggleCategory(category: string) {
  const index = selectedCategories.value.indexOf(category)
  if (index > -1) selectedCategories.value.splice(index, 1)
  else selectedCategories.value.push(category)
  config.value.categories = selectedCategories.value.length > 0 ? [...selectedCategories.value] : undefined
}

function toggleTag(tag: string) {
  const index = selectedTags.value.indexOf(tag)
  if (index > -1) selectedTags.value.splice(index, 1)
  else selectedTags.value.push(tag)
  config.value.tags = selectedTags.value.length > 0 ? [...selectedTags.value] : undefined
}

function toggleBucket(bucket: DifficultyBucket) {
  const index = selectedBuckets.value.indexOf(bucket)
  if (index > -1) selectedBuckets.value.splice(index, 1)
  else selectedBuckets.value.push(bucket)
  config.value.difficultyBuckets = selectedBuckets.value.length > 0 ? [...selectedBuckets.value] : undefined
}

const estimatedQuestions = computed(() => quizStore.filterQuestions(config.value).length)

function startQuiz() {
  emit('start', { ...config.value })
}

function quickSetup(type: 'all' | 'category' | 'tag' | 'hard') {
  selectedCategories.value = []
  selectedTags.value = []
  selectedBuckets.value = []
  config.value = { questionCount: 10, randomOrder: true, showAnswer: true }

  if (type === 'all') {
    config.value.questionCount = 20
  } else if (type === 'category' && quizStore.availableCategories[0]) {
    selectedCategories.value = [quizStore.availableCategories[0]]
    config.value.categories = [...selectedCategories.value]
  } else if (type === 'tag' && quizStore.availableTags[0]) {
    selectedTags.value = [quizStore.availableTags[0]]
    config.value.tags = [...selectedTags.value]
  } else if (type === 'hard') {
    selectedBuckets.value = ['hard']
    config.value.difficultyBuckets = ['hard']
    config.value.questionCount = 5
  }
}

const hasQuestions = computed(() => quizStore.allQuestions.length > 0)
</script>

<template>
  <div class="quiz-setup-panel">
    <div class="panel-header">
      <h3>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>
        自测训练配置
      </h3>
      <p class="header-desc">从我的题库抽题，自评掌握度，结果回写题库弱项</p>
    </div>

    <div v-if="!hasQuestions" class="empty-hint">
      题库还没有题目。先添加题目（AI 生成 / 真实面经 / 手动添加）后，再来进行自测训练。
    </div>

    <template v-else>
      <div class="quick-setup">
        <span class="quick-label">快速开始：</span>
        <button type="button" class="quick-btn" @click="quickSetup('all')">综合测试 (20题)</button>
        <button
          v-if="quizStore.availableCategories.length"
          type="button"
          class="quick-btn"
          @click="quickSetup('category')"
        >首领域 (10题)</button>
        <button
          v-if="quizStore.availableTags.length"
          type="button"
          class="quick-btn"
          @click="quickSetup('tag')"
        >首标签 (10题)</button>
        <button type="button" class="quick-btn danger" @click="quickSetup('hard')">困难挑战 (5题)</button>
      </div>

      <div class="config-sections">
        <!-- 领域筛选 -->
        <div v-if="quizStore.availableCategories.length" class="config-section">
          <label class="section-label">领域</label>
          <div class="option-chips">
            <button
              v-for="category in quizStore.availableCategories"
              :key="category"
              type="button"
              class="option-chip"
              :class="{ active: selectedCategories.includes(category) }"
              @click="toggleCategory(category)"
            >
              {{ category }}
            </button>
          </div>
        </div>

        <!-- 标签筛选 -->
        <div v-if="quizStore.availableTags.length" class="config-section">
          <label class="section-label">标签</label>
          <div class="tag-grid">
            <button
              v-for="tag in quizStore.availableTags"
              :key="tag"
              type="button"
              class="tag-chip"
              :class="{ active: selectedTags.includes(tag) }"
              @click="toggleTag(tag)"
            >
              <span class="tag-dot" aria-hidden="true"></span>
              <span class="tag-name">{{ tag }}</span>
            </button>
          </div>
        </div>

        <!-- 难度筛选 -->
        <div class="config-section">
          <label class="section-label">难度等级</label>
          <div class="difficulty-chips">
            <button
              v-for="diff in difficultyBuckets"
              :key="diff.id"
              type="button"
              class="difficulty-chip"
              :class="{ active: selectedBuckets.includes(diff.id) }"
              :style="{ '--diff-color': diff.color }"
              @click="toggleBucket(diff.id)"
            >
              {{ diff.name }}
            </button>
          </div>
        </div>

        <!-- 数量设置 -->
        <div class="config-section">
          <label class="section-label">题目数量</label>
          <div class="count-slider">
            <input
              v-model.number="config.questionCount"
              type="range"
              min="5"
              max="50"
              step="5"
              class="slider"
            />
            <span class="count-value">{{ config.questionCount }} 题</span>
          </div>
        </div>

        <!-- 其他选项 -->
        <div class="config-section">
          <label class="section-label">其他选项</label>
          <div class="checkbox-group">
            <label class="checkbox-item">
              <input v-model="config.randomOrder" type="checkbox" />
              <span>随机题目顺序</span>
            </label>
            <label class="checkbox-item">
              <input v-model="config.showAnswer" type="checkbox" />
              <span>自评后自动展开参考答案</span>
            </label>
          </div>
        </div>
      </div>

      <div class="panel-footer">
        <div class="estimate-info">
          <span class="estimate-label">符合条件：</span>
          <span class="estimate-count">{{ estimatedQuestions }} 题</span>
        </div>
        <button
          type="button"
          class="btn-start"
          :disabled="estimatedQuestions === 0"
          @click="startQuiz"
        >
          开始自测
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.quiz-setup-panel {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 8px 4px;
  width: 100%;
}

.panel-header h3 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.panel-header h3 svg {
  width: 20px;
  height: 20px;
  color: var(--primary-600);
}

.panel-header h3 line {
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  fill: none;
}

.header-desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.empty-hint {
  padding: 32px 20px;
  border: 1px dashed var(--border-color-strong);
  border-radius: 12px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
  text-align: center;
}

.quick-setup {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 16px;
  background: var(--bg-card-muted);
  border-radius: 12px;
}

.quick-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
}

.quick-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--primary-500);
  background: transparent;
  color: var(--primary-600);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.quick-btn:hover {
  background: var(--primary-600);
  color: #fff;
}

.quick-btn.danger {
  border-color: var(--accent-red);
  color: var(--accent-red);
}

.quick-btn.danger:hover {
  background: var(--accent-red);
  color: #fff;
}

.config-sections {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-label {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-primary);
}

.option-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.option-chip {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.option-chip:hover {
  border-color: var(--primary-500);
  color: var(--primary-600);
}

.option-chip.active {
  background: var(--primary-600);
  color: #fff;
  border-color: var(--primary-600);
}

.tag-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.tag-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.tag-chip:hover {
  border-color: var(--primary-500);
  background: rgba(43, 123, 184, 0.05);
}

.tag-chip.active {
  background: var(--primary-600);
  color: #fff;
  border-color: var(--primary-600);
}

.tag-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--primary-500);
  flex-shrink: 0;
}

.tag-chip.active .tag-dot {
  background: #fff;
}

.tag-name {
  font-size: 13px;
  font-weight: 600;
}

.difficulty-chips {
  display: flex;
  gap: 10px;
}

.difficulty-chip {
  padding: 10px 20px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.difficulty-chip:hover {
  border-color: var(--diff-color);
  background: color-mix(in srgb, var(--diff-color) 10%, var(--bg-card));
}

.difficulty-chip.active {
  background: var(--diff-color);
  color: #fff;
  border-color: var(--diff-color);
}

.count-slider {
  display: flex;
  align-items: center;
  gap: 16px;
}

.slider {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--border-color);
  outline: none;
  -webkit-appearance: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--primary-600);
  cursor: pointer;
}

.count-value {
  min-width: 60px;
  text-align: right;
  font-size: 14px;
  font-weight: 800;
  color: var(--primary-600);
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--text-primary);
  cursor: pointer;
}

.checkbox-item input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--primary-600);
}

.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.estimate-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.estimate-label {
  color: var(--text-secondary);
}

.estimate-count {
  font-weight: 800;
  color: var(--primary-600);
}

.btn-start {
  padding: 12px 32px;
  border-radius: 10px;
  border: none;
  background: var(--primary-600);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.btn-start:hover:not(:disabled) {
  background: var(--primary-700);
}

.btn-start:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .quiz-setup-panel {
    padding: 16px;
  }

  .quick-setup {
    flex-direction: column;
    align-items: stretch;
  }

  .quick-btn {
    width: 100%;
  }

  .tag-grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  }

  .panel-footer {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }

  .btn-start {
    width: 100%;
  }
}
</style>
