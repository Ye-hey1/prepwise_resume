import { ref } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import {
  requestInterviewHint,
  type InterviewHistoryItem,
  type InterviewHintResult,
} from '@/services/interviewService'
import type { ResumeSnapshot } from '@/services/interviewService'

/**
 * 答题思路提示 composable
 *
 * 管理 hint 请求/展示/使用次数/倒计时
 */
export function useInterviewHint() {
  const aiConfig = useAiConfigStore()

  const isHinting = ref(false)
  const hintData = ref<InterviewHintResult | null>(null)
  const hintCount = ref(0)
  const hintLimit = ref(3)

  const MIN_HINT_LIMIT = 1
  const MAX_HINT_LIMIT = 5

  function clampHintLimit(value: unknown): number {
    const next = Number(value)
    if (!Number.isFinite(next)) return 3
    return Math.max(MIN_HINT_LIMIT, Math.min(MAX_HINT_LIMIT, Math.round(next)))
  }

  async function requestHint(options: {
    mode: 'candidate' | 'interviewer'
    history: InterviewHistoryItem[]
    resumeSnapshot: ResumeSnapshot
    durationMinutes: number
    elapsedSeconds: number
    memorySummary: string
    jobContext: Record<string, unknown>
  }): Promise<boolean> {
    if (isHinting.value) return false
    if (hintCount.value >= hintLimit.value) return false

    isHinting.value = true
    hintData.value = null

    try {
      const result = await requestInterviewHint({
        config: { ...aiConfig.getConfigForFeature('interview') },
        mode: options.mode,
        command: 'continue',
        history: options.history,
        resumeSnapshot: options.resumeSnapshot,
        durationMinutes: options.durationMinutes,
        elapsedSeconds: options.elapsedSeconds,
        memorySummary: options.memorySummary,
        jobContext: options.jobContext,
      })
      hintData.value = result
      hintCount.value++
      return true
    } catch (error) {
      console.error('Failed to request hint:', error)
      return false
    } finally {
      isHinting.value = false
    }
  }

  function dismissHint() {
    hintData.value = null
  }

  function resetHints() {
    hintData.value = null
    hintCount.value = 0
    isHinting.value = false
  }

  const isHintExhausted = () => hintCount.value >= hintLimit.value

  return {
    // state
    isHinting,
    hintData,
    hintCount,
    hintLimit,
    // actions
    requestHint,
    dismissHint,
    resetHints,
    clampHintLimit,
    isHintExhausted,
  }
}
