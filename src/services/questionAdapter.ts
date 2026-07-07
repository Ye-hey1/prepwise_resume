import type { SavedQuestion } from '@/stores/questionBank'
import type { DrillQuestion } from '@/components/ai/interview/types'

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
