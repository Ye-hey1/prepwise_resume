import { computed, ref } from 'vue'
import { extractJD } from '@/services/jdService'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useResumeStore } from '@/stores/resume'
import type { JDData } from '@/services/types/jd'
import type { JdPrepHistoryItem } from '@/stores/jdAnalysis'
import type { InterviewJdContext } from '@/components/ai/interview/types'

/**
 * JD 分析与岗位上下文 composable
 *
 * 管理 JD 文本输入、AI/启发式分析、简历缺口检测、以及与 JD 分析 store 的联动
 */
export function useInterviewJd() {
  const aiConfig = useAiConfigStore()
  const jdAnalysisStore = useJdAnalysisStore()
  const resumeStore = useResumeStore()

  const jdDraft = ref('')
  const isLoading = ref(false)
  const errorMsg = ref('')

  const currentAnalysisId = ref<string | null>(null)
  const currentAnalysisSource = ref<'jd-analysis' | 'standalone'>('standalone')

  const jdContext = ref<InterviewJdContext>(createEmptyJdContext())

  // ── 工具函数 ──

  function extractResumeRole(): string {
    return resumeStore.basicInfo.jobTitle?.trim() || '目标岗位'
  }

  function extractHighlightedProjects(): string[] {
    return resumeStore.projectList.map((item) => item.name.trim()).filter(Boolean).slice(0, 3)
  }

  function buildResumeSearchCorpus(): string {
    return [
      resumeStore.skills,
      resumeStore.selfIntro || '',
      ...resumeStore.workList.map((item) => `${item.company} ${item.position} ${item.description}`),
      ...resumeStore.projectList.map((item) => `${item.name} ${item.role} ${item.introduction} ${item.mainWork}`),
    ]
      .join('\n')
      .toLowerCase()
  }

  function trimList(items: string[]): string[] {
    return items.map((item) => item.trim()).filter(Boolean)
  }

  function dedupeLimited(items: string[], limit: number): string[] {
    return Array.from(new Set(trimList(items))).slice(0, limit)
  }

  function splitInputItems(value: string): string[] {
    return value
      .split(/\n|,|，|;|；/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  function detectSeniorityLabel(text: string): string {
    if (/高级|资深|专家|leader|负责人/i.test(text)) return '高级'
    if (/初级|校招|应届|实习/i.test(text)) return '初级'
    return '中级'
  }

  function detectDifficulty(text: string): 'junior' | 'mid' | 'senior' {
    if (/高级|资深|专家|leader|负责人/i.test(text)) return 'senior'
    if (/初级|校招|应届|实习/i.test(text)) return 'junior'
    return 'mid'
  }

  function createEmptyJdContext(): InterviewJdContext {
    return {
      jdText: '',
      summary: '',
      targetRole: extractResumeRole(),
      seniority: '',
      mustHaveSkills: [],
      focusAreas: [],
      resumeGaps: [],
      highlightedProjects: extractHighlightedProjects(),
      prepSummary: '',
      prepPriorities: [],
      recommendedStories: [],
      highRiskFollowUps: [],
    }
  }

  // ── 从结构化 JDData 构建 ──

  function buildJdContextFromStructuredData(jdText: string, jdData: JDData): InterviewJdContext {
    const lines = jdText.split(/\n+/).map((line) => line.trim()).filter(Boolean)
    const mustHaveSkills = dedupeLimited([
      ...jdData.requirements.techStack,
      ...jdData.requirements.mustHave.map((item) => item.text),
    ], 6)
    const focusAreas = dedupeLimited([
      ...jdData.requirements.jobDuties,
      ...jdData.requirements.mustHave.map((item) => item.text),
      ...jdData.requirements.niceToHave.map((item) => item.text),
    ], 4)
    const resumeCorpus = buildResumeSearchCorpus()
    const resumeGaps = mustHaveSkills
      .filter((item) => item && !resumeCorpus.includes(item.toLowerCase()))
      .slice(0, 4)

    const summaryParts = [
      jdData.basicInfo.jobTitle,
      jdData.requirements.experience,
      jdData.requirements.degree,
      ...focusAreas.slice(0, 2),
    ].filter(Boolean)

    return {
      jdText,
      summary: summaryParts.join('；').slice(0, 180) || lines.slice(0, 3).join('；').slice(0, 180),
      targetRole: jdData.basicInfo.jobTitle || extractResumeRole() || lines[0] || '目标岗位',
      seniority: detectSeniorityLabel(`${jdData.requirements.experience} ${jdText}`),
      mustHaveSkills,
      focusAreas: focusAreas.length > 0 ? focusAreas : mustHaveSkills.slice(0, 4),
      resumeGaps,
      highlightedProjects: extractHighlightedProjects(),
      prepSummary: '',
      prepPriorities: [],
      recommendedStories: [],
      highRiskFollowUps: [],
    }
  }

  // ── 启发式分析（降级） ──

  function buildJdContextByHeuristic(jdText: string): InterviewJdContext {
    const items = splitInputItems(jdText)
    const mustHaveSkills = items
      .filter((item) => /[A-Za-z+#]|前端|后端|架构|性能|工程化|测试|算法|设计|管理/.test(item))
      .slice(0, 6)
    const focusAreas = items.filter((item) => item.length <= 24).slice(0, 4)
    const resumeCorpus = buildResumeSearchCorpus()
    const resumeGaps = mustHaveSkills.filter((item) => !resumeCorpus.includes(item.toLowerCase())).slice(0, 4)
    const lines = jdText.split(/\n+/).map((line) => line.trim()).filter(Boolean)

    return {
      jdText,
      summary: lines.slice(0, 3).join('；').slice(0, 180),
      targetRole: extractResumeRole() || lines[0] || '目标岗位',
      seniority: detectSeniorityLabel(jdText),
      mustHaveSkills,
      focusAreas: focusAreas.length > 0 ? focusAreas : mustHaveSkills.slice(0, 4),
      resumeGaps,
      highlightedProjects: extractHighlightedProjects(),
      prepSummary: '',
      prepPriorities: [],
      recommendedStories: [],
      highRiskFollowUps: [],
    }
  }

  // ── Store 联动 ──

  function buildContextFromStoredAnalysis(item: Pick<JdPrepHistoryItem, 'jdText' | 'jdData' | 'prepInsight' | 'companyIntel'>): InterviewJdContext | null {
    const sourceJdText = item.jdText?.trim()
    if (!sourceJdText) return null

    const baseContext = item.jdData
      ? buildJdContextFromStructuredData(sourceJdText, item.jdData)
      : buildJdContextByHeuristic(sourceJdText)

    const prepInsight = item.prepInsight
    const companyIntel = item.companyIntel
    const mergedContext = prepInsight ? {
      ...baseContext,
      prepSummary: prepInsight.summary || baseContext.prepSummary,
      prepPriorities: Array.isArray(prepInsight.prepPriorities) ? prepInsight.prepPriorities : [],
      recommendedStories: Array.isArray(prepInsight.recommendedStories) ? prepInsight.recommendedStories : [],
      highRiskFollowUps: Array.isArray(prepInsight.highRiskFollowUps) ? prepInsight.highRiskFollowUps : [],
      focusAreas: baseContext.focusAreas.length > 0
        ? baseContext.focusAreas
        : Array.isArray(prepInsight.focusAreas) && prepInsight.focusAreas.length > 0
          ? prepInsight.focusAreas
          : baseContext.focusAreas,
    } : baseContext

    return {
      ...mergedContext,
      companyCulture: companyIntel?.cultureNotes,
      techStack: companyIntel?.techStack ?? [],
      competitors: companyIntel?.competitors ?? [],
      reverseQuestions: companyIntel?.reverseQuestions ?? [],
    }
  }

  function getJdStoreContext(): InterviewJdContext | null {
    return buildContextFromStoredAnalysis({
      jdText: jdAnalysisStore.jdText,
      jdData: jdAnalysisStore.jdData,
      prepInsight: jdAnalysisStore.prepInsight,
      companyIntel: jdAnalysisStore.companyIntel,
    })
  }

  // ── 主操作 ──

  function syncAnalysisBinding(analysisId: string | null, source: 'jd-analysis' | 'standalone') {
    currentAnalysisId.value = analysisId?.trim() || null
    currentAnalysisSource.value = currentAnalysisId.value ? source : 'standalone'
  }

  function applyJdAnalysisResult(
    nextContext: InterviewJdContext,
    binding?: { analysisId?: string | null; source?: 'jd-analysis' | 'standalone' },
  ) {
    jdContext.value = {
      ...nextContext,
      focusAreas: nextContext.focusAreas.length > 0
        ? nextContext.focusAreas
        : nextContext.prepPriorities.slice(0, 4),
    }
    syncAnalysisBinding(binding?.analysisId ?? null, binding?.source ?? 'standalone')
    errorMsg.value = ''
  }

  async function handleGenerateJdAnalysis(): Promise<boolean> {
    const text = jdDraft.value.trim()
    if (!text) {
      errorMsg.value = '请先粘贴目标岗位 JD。'
      return false
    }

    // 检查 store 中是否已有相同 JD 的分析结果
    const storeContext = getJdStoreContext()
    if (storeContext && jdAnalysisStore.jdText.trim() === text) {
      applyJdAnalysisResult({
        ...storeContext,
        jdText: text,
      }, {
        analysisId: jdAnalysisStore.analysisMeta?.analysisId ?? null,
        source: jdAnalysisStore.analysisMeta?.analysisId ? 'jd-analysis' : 'standalone',
      })
      return true
    }

    isLoading.value = true
    errorMsg.value = ''

    try {
      const jdData = await extractJD(
        aiConfig.getConfigForFeature('jdAnalysis'),
        text,
        { onChunk: () => {}, onDone: () => {}, onError: () => {} },
      )
      applyJdAnalysisResult(buildJdContextFromStructuredData(text, jdData), {
        analysisId: null,
        source: 'standalone',
      })
      return true
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn('AI JD analysis failed, falling back to heuristic mode.', reason)
      applyJdAnalysisResult(buildJdContextByHeuristic(text), {
        analysisId: null,
        source: 'standalone',
      })
      errorMsg.value = `JD AI 解析失败（${reason}），已自动切换为本地快速解析结果。`
      return false
    } finally {
      isLoading.value = false
    }
  }

  function handleReuseStoredJd(): boolean {
    const context = getJdStoreContext()
    if (!context) return false
    applyJdAnalysisResult({
      ...context,
      jdText: jdAnalysisStore.jdText,
    }, {
      analysisId: jdAnalysisStore.analysisMeta?.analysisId ?? null,
      source: jdAnalysisStore.analysisMeta?.analysisId ? 'jd-analysis' : 'standalone',
    })
    return true
  }

  function resetJd() {
    jdDraft.value = ''
    jdContext.value = createEmptyJdContext()
    currentAnalysisId.value = null
    currentAnalysisSource.value = 'standalone'
    errorMsg.value = ''
  }

  // ── 计算属性 ──

  const jdSummaryText = computed(() => {
    const parts: string[] = []
    if (jdContext.value.targetRole) parts.push(`岗位：${jdContext.value.targetRole}`)
    if (jdContext.value.seniority) parts.push(`级别：${jdContext.value.seniority}`)
    if (jdContext.value.focusAreas.length > 0) parts.push(`重点：${jdContext.value.focusAreas.join(' / ')}`)
    if (jdContext.value.resumeGaps.length > 0) parts.push(`缺口：${jdContext.value.resumeGaps.join(' / ')}`)
    return parts.join(' ｜ ') || '还未完成 JD 分析'
  })

  const hasStoredJdContext = computed(() => Boolean(getJdStoreContext()?.jdText.trim()))

  const storedJdSummary = computed(() => {
    const context = getJdStoreContext()
    if (!context) return ''
    return context.prepSummary || context.summary || context.targetRole || ''
  })

  return {
    // state
    jdDraft,
    isLoading,
    errorMsg,
    currentAnalysisId,
    currentAnalysisSource,
    jdContext,
    // computed
    jdSummaryText,
    hasStoredJdContext,
    storedJdSummary,
    // actions
    handleGenerateJdAnalysis,
    handleReuseStoredJd,
    resetJd,
    applyJdAnalysisResult,
    syncAnalysisBinding,
    // utilities (used by other composables)
    detectDifficulty,
    extractResumeRole,
    extractHighlightedProjects,
    getJdStoreContext,
    buildContextFromStoredAnalysis,
    trimList,
    splitInputItems,
  }
}
