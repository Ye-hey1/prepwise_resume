<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQuestionBankStore, type SavedQuestion } from '@/stores/questionBank'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'

const props = defineProps<{
  question: SavedQuestion
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'deleted'): void
  (e: 'updated'): void
}>()

const router = useRouter()
const qbStore = useQuestionBankStore()
const jdStore = useJdAnalysisStore()

const isEditing = ref(false)
const localNotes = ref(props.question.user_notes || '')
const isSaving = ref(false)
const masteryValue = ref(props.question.mastery_level ?? 0)

const sourceIcon = computed(() => {
  const s = props.question.source
  if (s?.includes('JD')) return '🔍'
  if (s?.includes('训练')) return '🎯'
  if (s?.includes('面试')) return '🤖'
  if (s?.includes('手动')) return '✍️'
  return '📌'
})

const sourceLabel = computed(() => props.question.source || '未知来源')

const difficultyStars = computed(() => {
  const d = props.question.difficulty ?? 0
  return Array.from({ length: 5 }, (_, i) => i < d)
})

const linkedJdInfo = computed(() => {
  const id = props.question.jd_analysis_id
  if (!id) return null
  const item = jdStore.history.find((h) =>
    h.analysisMeta?.analysisId === id || h.id === id,
  )
  if (!item) return null
  return `${item.company || ''} ${item.position || ''}`.trim() || 'JD分析'
})

async function handleSaveNotes() {
  if (!props.question.id || isSaving.value) return
  isSaving.value = true
  const success = await qbStore.updateQuestion(props.question.id, {
    user_notes: localNotes.value,
  })
  if (success) {
    isEditing.value = false
    emit('updated')
  }
  isSaving.value = false
}

async function handleMasteryChange(level: number) {
  if (!props.question.id) return
  masteryValue.value = level
  await qbStore.updateMastery(props.question.id, level)
  emit('updated')
}

async function handleDelete() {
  if (!props.question.id) return
  if (!confirm('确定要从题库中移除这道题吗？')) return
  await qbStore.deleteQuestion(props.question.id)
  emit('deleted')
}

function goToInterview() {
  router.push({ name: 'ai-interviewer' })
}

function goToJdAnalysis() {
  const id = props.question.jd_analysis_id
  if (id) {
    jdStore.openHistoryItem(id)
  }
  router.push({ name: 'jd-analysis' })
}

function formatDate(dateStr?: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function masteryLabel(level: number): string {
  if (level === 0) return '未练习'
  if (level <= 1) return '薄弱'
  if (level <= 2) return '一般'
  if (level <= 3) return '熟练'
  return '精通'
}
</script>

<template>
  <div class="modal-overlay" @click="emit('close')">
    <div class="modal-window" @click.stop>
      <button class="close-btn" @click="emit('close')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <header class="modal-header">
        <div class="header-badges">
          <span class="badge category">{{ question.category }}</span>
          <span v-if="question.source" class="badge source">{{ sourceIcon }} {{ sourceLabel }}</span>
          <span v-if="question.difficulty" class="badge difficulty">
            <span v-for="(s, i) in difficultyStars" :key="i" class="star" :class="{ filled: s }">★</span>
          </span>
        </div>
        <h2 class="modal-title">{{ question.content }}</h2>
        <div class="modal-meta">
          <span v-if="question.created_at">录入: {{ formatDate(question.created_at) }}</span>
          <span v-if="question.focus_area">· {{ question.focus_area }}</span>
        </div>
      </header>

      <div class="modal-body custom-scroll">
        <!-- 来源追溯 -->
        <div v-if="linkedJdInfo || question.interview_session_id" class="detail-section trace-section">
          <h3 class="section-label">来源追溯</h3>
          <div class="trace-links">
            <button v-if="linkedJdInfo" class="trace-btn" @click="goToJdAnalysis">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              {{ linkedJdInfo }}
            </button>
          </div>
        </div>

        <!-- 掌握度 -->
        <div class="detail-section">
          <h3 class="section-label">掌握程度 — {{ masteryLabel(masteryValue) }}</h3>
          <div class="mastery-bar">
            <button
              v-for="n in 5" :key="n"
              class="mastery-dot"
              :class="{ active: n <= masteryValue, [`level-${n}`]: n <= masteryValue }"
              @click="handleMasteryChange(n === masteryValue ? n - 1 : n)"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <!-- 考察意图 -->
        <div v-if="question.intent" class="detail-section">
          <h3 class="section-label">考察意图</h3>
          <p class="section-text">{{ question.intent }}</p>
        </div>

        <!-- 答题框架 -->
        <div v-if="question.framework" class="detail-section">
          <h3 class="section-label">推荐框架</h3>
          <p class="section-text framework-text">{{ question.framework }}</p>
        </div>

        <!-- 参考答案 -->
        <div v-if="question.reference_answer" class="detail-section">
          <h3 class="section-label">参考答案</h3>
          <div class="section-text answer-text">{{ question.reference_answer }}</div>
        </div>

        <!-- 笔记 -->
        <div class="detail-section">
          <div class="section-head-row">
            <h3 class="section-label">我的笔记</h3>
            <div class="notes-actions">
              <button v-if="!isEditing" class="edit-btn" @click="isEditing = true">编辑</button>
              <template v-else>
                <button class="action-btn cancel" @click="isEditing = false">取消</button>
                <button class="action-btn save" :disabled="isSaving" @click="handleSaveNotes">
                  {{ isSaving ? '...' : '保存' }}
                </button>
              </template>
            </div>
          </div>
          <div v-if="!isEditing" class="section-text notes-text" :class="{ empty: !question.user_notes }">
            {{ question.user_notes || '还没有记笔记，点击编辑开始复盘吧' }}
          </div>
          <textarea v-else v-model="localNotes" class="notes-editor" placeholder="输入复盘笔记..." />
        </div>

        <!-- 标签 -->
        <div v-if="question.tags?.length" class="detail-section">
          <h3 class="section-label">标签</h3>
          <div class="tag-cloud">
            <span v-for="t in question.tags" :key="t" class="detail-tag"># {{ t }}</span>
          </div>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="footer-btn primary" @click="goToInterview">
          去练习
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
        <button class="footer-btn danger" @click="handleDelete">删除</button>
        <button class="footer-btn secondary" @click="emit('close')">关闭</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.modal-window {
  width: 100%;
  max-width: 780px;
  max-height: 85vh;
  background: var(--bg-card);
  border-radius: 24px;
  border: 1px solid var(--border-color);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(24px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.close-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
  background: var(--bg-card-muted);
  border: none;
  color: var(--text-secondary);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover { background: var(--accent-red); color: white; transform: rotate(90deg); }

.modal-header {
  padding: 32px 36px 20px;
  border-bottom: 1px solid var(--border-color);
}

.header-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
}

.badge.category { background: var(--primary-500); color: white; }
.badge.source { background: var(--bg-card-muted); color: var(--text-secondary); border: 1px solid var(--border-color); }
.badge.difficulty { background: transparent; padding: 0; }
.star { color: var(--border-color); font-size: 14px; }
.star.filled { color: #f59e0b; }

.modal-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 900;
  color: var(--text-primary);
  line-height: 1.4;
}

.modal-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 36px 36px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.section-text {
  padding: 16px 18px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  color: var(--text-primary);
}

.trace-section { gap: 6px; }
.trace-links { display: flex; gap: 8px; }
.trace-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--primary-300);
  border-radius: 8px;
  background: color-mix(in srgb, var(--primary-500) 4%, var(--bg-card));
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.trace-btn:hover { background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card)); }

.mastery-bar {
  display: flex;
  gap: 6px;
}

.mastery-dot {
  width: 40px;
  height: 32px;
  border-radius: 8px;
  border: 1.5px solid var(--border-color);
  background: var(--bg-card-muted);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s;
}

.mastery-dot:hover { border-color: var(--primary-300); }
.mastery-dot.active {
  color: white;
  border-color: transparent;
}

.mastery-dot.level-1 { background: #ef4444; }
.mastery-dot.level-2 { background: #f59e0b; }
.mastery-dot.level-3 { background: #10b981; }
.mastery-dot.level-4 { background: #3b82f6; }
.mastery-dot.level-5 { background: #8b5cf6; }

.framework-text {
  background: color-mix(in srgb, #8b5cf6 6%, var(--bg-card-muted));
  border-left: 3px solid #8b5cf6;
}

.answer-text {
  background: color-mix(in srgb, var(--primary-500) 4%, var(--bg-card-muted));
  border-left: 3px solid var(--primary-500);
}

.section-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.notes-actions { display: flex; gap: 6px; }

.edit-btn,
.action-btn {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}

.edit-btn {
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.action-btn.save { background: var(--primary-500); color: white; }
.action-btn.cancel { background: var(--bg-card-muted); color: var(--text-secondary); }

.notes-text {
  background: color-mix(in srgb, #f59e0b 6%, var(--bg-card-muted));
  border-left: 3px solid #f59e0b;
  min-height: 60px;
}

.notes-text.empty { color: var(--text-muted); font-style: italic; opacity: 0.7; }

.notes-editor {
  width: 100%;
  min-height: 100px;
  padding: 14px;
  border-radius: 12px;
  background: color-mix(in srgb, #f59e0b 6%, var(--bg-card-muted));
  border: 2px solid #f59e0b;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  resize: vertical;
  outline: none;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-tag {
  background: var(--bg-card-muted);
  padding: 4px 12px;
  border-radius: 100px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.modal-footer {
  padding: 16px 36px;
  background: var(--bg-card-muted);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.footer-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 20px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}

.footer-btn.primary {
  background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
  color: var(--text-inverse);
}

.footer-btn.danger {
  background: #fee2e2;
  color: #ef4444;
}

.footer-btn.secondary {
  background: var(--bg-card);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.footer-btn:hover { transform: translateY(-1px); filter: brightness(0.95); }

.custom-scroll::-webkit-scrollbar { width: 5px; }
.custom-scroll::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 10px; }
</style>
