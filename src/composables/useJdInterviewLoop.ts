import { computed, type ComputedRef, type Ref } from 'vue'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'

/**
 * 闭环阶段定义
 * jd-input → analysis → match-review → interview-prep → interview-done
 * → weakness-analysis → resume-optimize → re-match → loop-complete
 */
export type LoopPhase =
  | 'jd-input'
  | 'analysis'
  | 'match-review'
  | 'interview-prep'
  | 'interview-done'
  | 'weakness-analysis'
  | 'resume-optimize'
  | 're-match'
  | 'loop-complete'

export interface LoopNextAction {
  label: string
  phase: LoopPhase
}

/**
 * JD 分析 ↔ 面试闭环状态机
 *
 * 根据当前分析状态和面试历史计算闭环进度，并建议下一步操作
 */
export function useJdInterviewLoop(analysisId: Ref<string | null>) {
  const store = useJdAnalysisStore()

  const historyItem = computed(() => {
    const id = analysisId.value
    if (!id) return null
    return store.findHistoryItemByAnalysisId(id)
  })

  /** 判断当前闭环阶段 */
  const currentPhase: ComputedRef<LoopPhase> = computed(() => {
    const item = historyItem.value
    if (!item) {
      // 无历史项，判断 store 当前状态
      if (!store.jdData) return 'jd-input'
      if (!store.matchResult) return 'analysis'
      if ((store as any).practiceCount ?? 0 === 0) return 'match-review'
      return 'match-review'
    }

    // 有历史项，按完整链路判断
    if (!item.jdData) return 'jd-input'
    if (!item.matchResult) return 'analysis'

    const practiceCount = item.practiceCount ?? 0
    if (practiceCount === 0) return 'match-review'

    if (item.lastInterviewScore == null) return 'interview-prep'

    const weaknesses = item.lastWeaknesses ?? []
    if (!weaknesses.length) return 'interview-done'

    // 检查是否已生成面试驱动的优化建议
    const hasInterviewSuggestions = item.suggestions.some(
      (s) => s.issueType === 'interview-weakness',
    )
    if (!hasInterviewSuggestions) return 'weakness-analysis'

    // 检查简历是否已变化（通过 resumeSignature）
    const currentSig = store.analysisMeta?.resumeSignature ?? ''
    const savedSig = item.analysisMeta?.resumeSignature ?? ''
    if (currentSig && savedSig && currentSig !== savedSig) return 're-match'

    // 如果有最新面试分数 >= 75，认为循环达标
    if (item.lastInterviewScore != null && item.lastInterviewScore >= 75) return 'loop-complete'

    return 'resume-optimize'
  })

  /** 闭环进度百分比 */
  const loopProgress: ComputedRef<number> = computed(() => {
    const phases: LoopPhase[] = [
      'jd-input', 'analysis', 'match-review', 'interview-prep',
      'interview-done', 'weakness-analysis', 'resume-optimize', 're-match', 'loop-complete',
    ]
    const idx = phases.indexOf(currentPhase.value)
    return Math.round(((idx + 1) / phases.length) * 100)
  })

  /** 建议下一步操作 */
  const nextAction: ComputedRef<LoopNextAction | null> = computed(() => {
    switch (currentPhase.value) {
      case 'jd-input':
        return { label: '粘贴目标岗位 JD，开始分析', phase: 'analysis' }
      case 'analysis':
        return { label: '等待分析完成', phase: 'match-review' }
      case 'match-review':
        return { label: '查看匹配结果，进入面试准备', phase: 'interview-prep' }
      case 'interview-prep':
        return { label: '开始模拟面试，检验实际表现', phase: 'interview-done' }
      case 'interview-done': {
        const weaknesses = historyItem.value?.lastWeaknesses ?? []
        if (weaknesses.length) {
          return { label: '面试暴露了薄弱点，分析改进方向', phase: 'weakness-analysis' }
        }
        return { label: '面试表现不错，再来一轮巩固', phase: 'interview-prep' }
      }
      case 'weakness-analysis':
        return { label: '生成针对性简历优化建议', phase: 'resume-optimize' }
      case 'resume-optimize':
        return { label: '优化简历后重新匹配，验证提升', phase: 're-match' }
      case 're-match':
        return { label: '重新匹配中...', phase: 'loop-complete' }
      case 'loop-complete':
        return null
      default:
        return null
    }
  })

  /** 分数提升幅度（如果重新匹配过） */
  const scoreImprovement: ComputedRef<number | null> = computed(() => {
    const item = historyItem.value
    if (!item?.linkedInterviewRecordIds?.length) return null
    const records = store.loadLinkedInterviewRecords(item.linkedInterviewRecordIds)
    if (records.length < 2) return null
    const sorted = [...records].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
    const latestRecord = sorted[0]
    const previousRecord = sorted[1]
    if (!latestRecord || !previousRecord) return null
    const latest = latestRecord.totalScore ?? 0
    const previous = previousRecord.totalScore ?? 0
    const diff = latest - previous
    return diff !== 0 ? diff : null
  })

  return {
    currentPhase,
    loopProgress,
    nextAction,
    scoreImprovement,
  }
}
