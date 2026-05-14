import type { InterviewQuestion } from '@/services/jd/interviewBank'
import type { DrillQuestion } from '@/components/ai/interview/types'
import type { SavedQuestion } from '@/stores/questionBank'

/** 难度字符串 → 数字映射 */
function difficultyToNumber(diff: string): number {
  const lower = diff.toLowerCase()
  if (/初|junior/.test(lower)) return 1
  if (/中级|mid/.test(lower)) return 3
  if (/高|senior|expert/.test(lower)) return 5
  return 3
}

/** 难度数字 → 字符串映射 */
function difficultyToString(diff: number): string {
  if (diff <= 2) return '初级'
  if (diff <= 4) return '中级'
  return '高级'
}

/**
 * 将 JD 题库的 InterviewQuestion 转为练习题 DrillQuestion 格式
 * 使 JD 分析生成的题目可作为面试练习的种子题目
 */
export function interviewQuestionToDrill(q: InterviewQuestion, index: number): DrillQuestion {
  return {
    id: index,
    question: q.question,
    category: q.category || '综合',
    focusArea: q.keyPoints[0] || '通用',
    difficulty: difficultyToNumber(q.difficulty),
    intent: q.context,
    framework: q.answerStructure,
    thinkingPoints: q.keyPoints,
    sampleAnswer: q.sampleAnswer,
  }
}

/**
 * 将练习题 DrillQuestion 转为 JD 题库 InterviewQuestion 格式（部分字段）
 * 用于将练习结果回显到题库面板
 */
export function drillToInterviewQuestion(q: DrillQuestion): Partial<InterviewQuestion> {
  return {
    id: `drill-${q.id}`,
    category: q.category,
    difficulty: difficultyToString(q.difficulty),
    question: q.question,
    context: q.intent ?? '',
    answerStructure: q.framework ?? '',
    sampleAnswer: q.sampleAnswer ?? '',
    keyPoints: q.thinkingPoints ?? [],
    pitfalls: [],
    followUpHints: [],
  }
}

/**
 * 将题库收藏的 SavedQuestion 转为专项训练 DrillQuestion。
 * 题库里的 id 是数据库字符串，而训练面板使用数字 id，所以这里用传入顺序生成稳定队列 id。
 */
export function savedQuestionToDrill(q: SavedQuestion, index: number): DrillQuestion {
  const difficulty = typeof q.difficulty === 'number'
    ? Math.max(1, Math.min(5, Math.round(q.difficulty)))
    : 3

  return {
    id: index + 1,
    question: q.content,
    category: q.category || '综合',
    focusArea: q.focus_area || q.tags?.[0] || q.category || '通用',
    difficulty,
    intent: q.intent || '',
    framework: q.framework || '',
    thinkingPoints: q.tags || [],
    sampleAnswer: q.reference_answer || '',
    referenceAnswer: q.reference_answer || '',
  }
}
