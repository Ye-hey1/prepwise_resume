<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useResumeStore } from '@/stores/resume'
import type { JDMatchResult, JDSuggestion, RequirementMatch, JdPrepModuleKey } from '@/services/types/jd'

const props = defineProps<{
  matchResult: JDMatchResult | null
  suggestions: JDSuggestion[]
  isLoading: boolean
}>()

const router = useRouter()
const resumeStore = useResumeStore()
const appliedMap = ref<Record<string, Set<number>>>({})

const groupedSuggestions = computed<Record<string, JDSuggestion[]>>(() => {
  const groups: Record<string, JDSuggestion[]> = {}
  for (const suggestion of props.suggestions) {
    const section = suggestion.section
    const sectionGroup = groups[section] ?? (groups[section] = [])
    sectionGroup.push(suggestion)
  }
  return groups
})

const availableSections = computed(() => Object.keys(groupedSuggestions.value))
const activeSection = ref('')

watch(availableSections, (sections) => {
  if (!sections.length) {
    activeSection.value = ''
    return
  }

  if (!activeSection.value || !sections.includes(activeSection.value)) {
    activeSection.value = sections[0] ?? ''
  }
}, { immediate: true })

const criticalGaps = computed(() => {
  if (!props.matchResult) return []
  return props.matchResult.matches.filter((item: RequirementMatch) => {
    const isGap = item.status === 'missing' || (item.riskGaps?.length ?? 0) > 0
    const isCriticalCategory = item.category === 'mustHave' || item.category === 'techStack'
    return isGap && isCriticalCategory
  })
})

const activeSuggestions = computed(() => {
  if (!activeSection.value) return []
  return groupedSuggestions.value[activeSection.value] ?? []
})

function getSectionLabel(key: string): string {
  const matched = resumeStore.modules.find((module) => module.key === key)
  return matched?.label || key
}

function handleApply(suggestion: JDSuggestion, index: number) {
  const success = resumeStore.applySuggestionToStore(suggestion.section, suggestion.suggestedText)
  if (!success) return

  if (!appliedMap.value[suggestion.section]) {
    appliedMap.value[suggestion.section] = new Set()
  }

  appliedMap.value[suggestion.section]?.add(index)
}

function isApplied(section: string, index: number): boolean {
  return appliedMap.value[section]?.has(index) ?? false
}

function getIssueLabel(type: string): string {
  const map: Record<string, string> = {
    missing_keyword: '关键词缺失',
    irrelevant_content: '信息不相关',
    experience_gap: '经历表达偏弱',
    logic_error: '逻辑有断层',
    format_issue: '结构可优化',
  }

  return map[type] || type
}

function goToModule(moduleKey: JdPrepModuleKey | string) {
  resumeStore.requestScrollToModule(moduleKey as string)
  router.push({ name: 'resume-editor' })
}

function categoryLabel(category: RequirementMatch['category']): string {
  const labels: Record<RequirementMatch['category'], string> = {
    mustHave: '硬性要求',
    niceToHave: '加分项',
    degree: '学历',
    experience: '经验',
    techStack: '技术栈',
    jobDuties: '岗位职责',
  }
  return labels[category]
}
</script>

<template>
  <article class="action-enhance-card">
    <header class="ae-header">
      <h2 class="ae-title">差距分析与优化动作</h2>
      <p class="ae-desc">把关键缺口和可直接落地的改写建议放在一起，方便你边看结论边回写到简历模块。</p>
    </header>

    <div v-if="isLoading && !criticalGaps.length && !suggestions.length" class="ae-skeleton">
      <div class="pulse-bar" style="width: 80%" />
      <div class="pulse-bar" style="width: 56%" />
      <div class="pulse-grid">
        <div class="pulse-box" />
        <div class="pulse-box" />
      </div>
    </div>

    <div v-else class="ae-content">
      <section v-if="criticalGaps.length" class="section-block">
        <div class="section-header">
          <h3 class="section-title danger">关键缺口</h3>
          <span class="section-badge">优先补齐</span>
        </div>

        <div class="gap-list">
          <article v-for="(gap, index) in criticalGaps" :key="`${gap.requirement}-${index}`" class="gap-item">
            <div class="gap-head">
              <strong class="gap-title">{{ gap.requirement }}</strong>
              <span class="gap-tag">{{ categoryLabel(gap.category) }}</span>
            </div>

            <p v-if="gap.matchReason" class="gap-text">{{ gap.matchReason }}</p>

            <ul v-if="gap.riskGaps?.length" class="detail-list risk">
              <li v-for="(risk, riskIndex) in gap.riskGaps" :key="`${gap.requirement}-risk-${riskIndex}`">{{ risk }}</li>
            </ul>

            <div class="gap-actions">
              <button class="ghost-btn" type="button" @click="goToModule(gap.category === 'experience' || gap.category === 'jobDuties' ? 'workExperience' : 'skills')">
                去编辑
              </button>
            </div>
          </article>
        </div>
      </section>

      <section v-if="suggestions.length" class="section-block">
        <div class="section-header">
          <h3 class="section-title">定向优化建议</h3>
        </div>

        <div v-if="availableSections.length > 1" class="module-tabs">
          <button
            v-for="section in availableSections"
            :key="section"
            type="button"
            class="tab-btn"
            :class="{ active: activeSection === section }"
            @click="activeSection = section"
          >
            <span>{{ getSectionLabel(section) }}</span>
            <span class="tab-count">{{ groupedSuggestions[section]?.length ?? 0 }}</span>
          </button>
        </div>

        <div class="suggestion-list">
          <article
            v-for="(suggestion, index) in activeSuggestions"
            :key="`${suggestion.section}-${index}`"
            class="suggestion-card"
            :class="{ applied: isApplied(activeSection, index) }"
          >
            <div class="suggestion-header">
              <span class="issue-chip">{{ getIssueLabel(suggestion.issueType) }}</span>
              <div class="suggestion-actions">
                <button class="ghost-btn" type="button" @click="goToModule(suggestion.section)">定位模块</button>
                <button
                  class="primary-btn"
                  type="button"
                  :disabled="isApplied(activeSection, index)"
                  @click="handleApply(suggestion, index)"
                >
                  {{ isApplied(activeSection, index) ? '已应用' : '一键应用' }}
                </button>
              </div>
            </div>

            <p class="reason-text">{{ suggestion.reason }}</p>

            <div class="comparison-grid">
              <div class="comparison-card muted">
                <span class="comparison-label">当前内容</span>
                <div class="comparison-text">{{ suggestion.originalText || '当前模块没有抽取到足够证据，可直接参考右侧建议落地。' }}</div>
              </div>

              <div class="comparison-card focus">
                <span class="comparison-label">建议改写</span>
                <div class="comparison-text">{{ suggestion.suggestedText }}</div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </article>
</template>

<style scoped>
.action-enhance-card {
  padding: 28px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.03);
}

.ae-header {
  margin-bottom: 24px;
}

.ae-title {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  color: var(--text-primary);
}

.ae-desc {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.ae-skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pulse-bar,
.pulse-box {
  border-radius: 16px;
  background: rgba(148, 163, 184, 0.14);
  animation: pulse 1.5s infinite;
}

.pulse-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.pulse-bar {
  height: 18px;
}

.pulse-box {
  height: 160px;
}

.ae-content {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 900;
  color: var(--text-primary);
}

.section-title.danger {
  color: var(--accent-red);
}

.section-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.08);
  color: var(--accent-red);
  font-size: 11px;
  font-weight: 800;
}

.gap-list,
.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gap-item,
.suggestion-card {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.88);
}

.suggestion-card.applied {
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(236, 253, 245, 0.9);
}

.gap-head,
.suggestion-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.gap-title {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
}

.gap-tag,
.issue-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.08);
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 800;
  flex-shrink: 0;
}

.gap-text,
.reason-text {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.detail-list {
  margin: 12px 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-list li {
  font-size: 13px;
  line-height: 1.7;
}

.detail-list.risk li {
  color: var(--accent-red);
}

.gap-actions,
.suggestion-actions {
  display: flex;
  gap: 8px;
}

.module-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tab-btn,
.ghost-btn,
.primary-btn {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.tab-btn,
.ghost-btn {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.85);
  color: var(--text-secondary);
}

.tab-btn.active {
  border-color: rgba(59, 130, 246, 0.22);
  background: rgba(59, 130, 246, 0.08);
  color: var(--primary-600);
}

.tab-count {
  margin-left: 8px;
  color: inherit;
}

.primary-btn {
  border: none;
  background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
  color: #fff;
}

.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.comparison-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.comparison-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 16px;
}

.comparison-card.muted {
  background: rgba(248, 250, 252, 0.95);
}

.comparison-card.focus {
  background: rgba(239, 246, 255, 0.95);
}

.comparison-label {
  font-size: 11px;
  font-weight: 800;
  color: var(--text-muted);
}

.comparison-text {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-primary);
  white-space: pre-wrap;
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

@media (max-width: 768px) {
  .pulse-grid,
  .comparison-grid {
    grid-template-columns: 1fr;
  }

  .gap-head,
  .suggestion-header {
    flex-direction: column;
  }
}
</style>
