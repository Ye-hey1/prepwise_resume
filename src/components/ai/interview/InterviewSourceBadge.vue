<script setup lang="ts">
/**
 * 面试来源标识条
 * 当从 JD 分析或题库跳转时，显示来源信息和返回按钮
 */
import { computed } from 'vue'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'

const props = defineProps<{
  analysisId: string | null
  source: 'jd-analysis' | 'standalone' | 'question-bank'
}>()

const emit = defineEmits<{
  (e: 'go-back'): void
}>()

const jdStore = useJdAnalysisStore()

const sourceInfo = computed(() => {
  if (props.source === 'jd-analysis' && props.analysisId) {
    const item = jdStore.findHistoryItemByAnalysisId(props.analysisId)
    if (item) {
      const label = [item.company, item.position].filter(Boolean).join(' - ') || 'JD 分析'
      return { label: `来自：${label}`, icon: 'jd', show: true }
    }
    return { label: '来自：JD 分析', icon: 'jd', show: true }
  }

  if (props.source === 'question-bank') {
    return { label: '来自：题库练习', icon: 'bank', show: true }
  }

  return { label: '', icon: '', show: false }
})
</script>

<template>
  <div v-if="sourceInfo.show" class="source-badge">
    <div class="source-info">
      <svg v-if="sourceInfo.icon === 'jd'" class="source-icon" viewBox="0 0 24 24" fill="none" width="14" height="14">
        <path d="M21 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <svg v-else class="source-icon" viewBox="0 0 24 24" fill="none" width="14" height="14">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span class="source-text">{{ sourceInfo.label }}</span>
    </div>
    <button class="source-back-btn" type="button" @click="emit('go-back')">
      <svg viewBox="0 0 24 24" fill="none" width="12" height="12">
        <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      返回
    </button>
  </div>
</template>

<style scoped>
.source-badge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary-500) 6%, var(--bg-card-muted));
  border: 1px solid color-mix(in srgb, var(--primary-500) 16%, var(--border-color));
}

.source-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.source-icon {
  color: var(--primary-500);
  flex-shrink: 0;
}

.source-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.source-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.source-back-btn:hover {
  border-color: var(--primary-500);
  color: var(--primary-500);
}
</style>
