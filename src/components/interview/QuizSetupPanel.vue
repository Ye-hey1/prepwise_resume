<script setup lang="ts">
import { ref, computed } from 'vue'
import { useInterviewQuizStore, QUESTION_TAG_INFO, type QuestionTag, type QuestionDifficulty, type QuizSessionConfig } from '@/stores/interviewQuiz'

const emit = defineEmits<{
  'start': [config: QuizSessionConfig]
}>()

const quizStore = useInterviewQuizStore()

const config = ref<QuizSessionConfig>({
  questionCount: 10,
  randomOrder: true,
  showAnswer: true,
})

// 阶段选项
const phaseOptions = [
  { id: undefined, name: '全部阶段' },
  { id: 'project', name: '项目与简历' },
  { id: 'core', name: '核心基础' },
  { id: 'framework', name: '框架应用' },
  { id: 'system', name: '系统设计' },
  { id: 'basic', name: '计算机基础' },
  { id: 'distributed', name: '分布式' },
  { id: 'jvm', name: 'JVM' },
]

// 难度选项
const difficultyOptions: Array<{ id: QuestionDifficulty; name: string; color: string }> = [
  { id: 'easy', name: '简单', color: '#10b981' },
  { id: 'medium', name: '中等', color: '#f59e0b' },
  { id: 'hard', name: '困难', color: '#ef4444' },
]

// 标签选项
const tagOptions = computed(() => {
  return Object.entries(QUESTION_TAG_INFO).map(([id, info]) => ({
    id: id as QuestionTag,
    ...info,
  }))
})

// 选中的标签
const selectedTags = ref<QuestionTag[]>([])

function toggleTag(tagId: QuestionTag) {
  const index = selectedTags.value.indexOf(tagId)
  if (index > -1) {
    selectedTags.value.splice(index, 1)
  } else {
    selectedTags.value.push(tagId)
  }
  config.value.tags = selectedTags.value.length > 0 ? selectedTags.value : undefined
}

// 选中的难度
const selectedDifficulties = ref<QuestionDifficulty[]>([])
function toggleDifficulty(difficulty: QuestionDifficulty) {
  const index = selectedDifficulties.value.indexOf(difficulty)
  if (index > -1) {
    selectedDifficulties.value.splice(index, 1)
  } else {
    selectedDifficulties.value.push(difficulty)
  }
  config.value.difficulty = selectedDifficulties.value.length > 0 ? selectedDifficulties.value : undefined
}

// 预计题目数量
const estimatedQuestions = computed(() => {
  return quizStore.filterQuestions(config.value).length
})

// 开始自测
function startQuiz() {
  emit('start', { ...config.value })
}

// 快速配置
function quickSetup(type: 'all' | 'phase' | 'tag' | 'difficulty') {
  switch (type) {
    case 'all':
      config.value = { questionCount: 20, randomOrder: true, showAnswer: true }
      selectedTags.value = []
      selectedDifficulties.value = []
      break
    case 'phase':
      config.value = { phaseId: 'core', questionCount: 10, randomOrder: true, showAnswer: true }
      selectedTags.value = []
      selectedDifficulties.value = []
      break
    case 'tag':
      config.value = { tags: ['java-core', 'mysql'], questionCount: 10, randomOrder: true, showAnswer: true }
      selectedTags.value = ['java-core', 'mysql']
      selectedDifficulties.value = []
      break
    case 'difficulty':
      config.value = { difficulty: ['hard'], questionCount: 5, randomOrder: true, showAnswer: true }
      selectedTags.value = []
      selectedDifficulties.value = ['hard']
      break
  }
}
</script>

<template>
  <div class="quiz-setup-panel">
    <div class="panel-header">
      <h3>📝 技术自测配置</h3>
      <p class="header-desc">选择知识点范围和难度，开始模拟面试自测</p>
    </div>

    <div class="quick-setup">
      <span class="quick-label">快速开始：</span>
      <button type="button" class="quick-btn" @click="quickSetup('all')">综合测试 (20题)</button>
      <button type="button" class="quick-btn" @click="quickSetup('phase')">核心基础 (10题)</button>
      <button type="button" class="quick-btn" @click="quickSetup('tag')">Java+MySQL (10题)</button>
      <button type="button" class="quick-btn danger" @click="quickSetup('difficulty')">困难挑战 (5题)</button>
    </div>

    <div class="config-sections">
      <!-- 阶段筛选 -->
      <div class="config-section">
        <label class="section-label">准备阶段</label>
        <div class="option-chips">
          <button
            v-for="phase in phaseOptions"
            :key="phase.id || 'all'"
            type="button"
            class="option-chip"
            :class="{ active: config.phaseId === phase.id }"
            @click="config.phaseId = phase.id"
          >
            {{ phase.name }}
          </button>
        </div>
      </div>

      <!-- 标签筛选 -->
      <div class="config-section">
        <label class="section-label">知识标签</label>
        <div class="tag-grid">
          <button
            v-for="tag in tagOptions"
            :key="tag.id"
            type="button"
            class="tag-chip"
            :class="{ active: selectedTags.includes(tag.id) }"
            :style="{ '--tag-color': tag.color }"
            @click="toggleTag(tag.id)"
          >
            <span class="tag-icon">{{ tag.icon }}</span>
            <span class="tag-name">{{ tag.name }}</span>
          </button>
        </div>
      </div>

      <!-- 难度筛选 -->
      <div class="config-section">
        <label class="section-label">难度等级</label>
        <div class="difficulty-chips">
          <button
            v-for="diff in difficultyOptions"
            :key="diff.id"
            type="button"
            class="difficulty-chip"
            :class="{ active: selectedDifficulties.includes(diff.id) }"
            :style="{ '--diff-color': diff.color }"
            @click="toggleDifficulty(diff.id)"
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
            <span>答题后显示解析</span>
          </label>
        </div>
      </div>
    </div>

    <div class="panel-footer">
      <div class="estimate-info">
        <span class="estimate-label">预计题目：</span>
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
  </div>
</template>

<style scoped>
.quiz-setup-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  max-width: 700px;
  margin: 0 auto;
}

.panel-header h3 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.header-desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
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
  font-weight: 600;
  color: var(--text-secondary);
}

.quick-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--accent-blue-500);
  background: transparent;
  color: var(--accent-blue-500);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-btn:hover {
  background: var(--accent-blue-500);
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
  font-weight: 700;
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
  transition: all 0.2s ease;
}

.option-chip:hover {
  border-color: var(--accent-blue-500);
  color: var(--accent-blue-500);
}

.option-chip.active {
  background: var(--accent-blue-500);
  color: #fff;
  border-color: var(--accent-blue-500);
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
  transition: all 0.2s ease;
}

.tag-chip:hover {
  border-color: var(--tag-color);
  background: color-mix(in srgb, var(--tag-color) 10%, var(--bg-card));
}

.tag-chip.active {
  background: var(--tag-color);
  color: #fff;
  border-color: var(--tag-color);
}

.tag-icon {
  font-size: 16px;
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
  transition: all 0.2s ease;
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
  background: var(--accent-blue-500);
  cursor: pointer;
}

.count-value {
  min-width: 60px;
  text-align: right;
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-blue-500);
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
  accent-color: var(--accent-blue-500);
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
  font-weight: 700;
  color: var(--accent-blue-500);
}

.btn-start {
  padding: 12px 32px;
  border-radius: 10px;
  border: none;
  background: var(--accent-blue-500);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-start:hover:not(:disabled) {
  background: var(--accent-blue-600);
  transform: translateY(-1px);
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
