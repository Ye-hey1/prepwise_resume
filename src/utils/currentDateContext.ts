export interface CurrentDateContext {
  today: string
  currentMonth: string
}

const YEAR_MONTH_PATTERN = /((?:19|20)\d{2})\s*(?:年|[-./_])\s*(0?[1-9]|1[0-2])(?:\s*月)?/g
const FUTURE_DATE_ACCUSATION_PATTERN = /未来(?:时间|日期|月份)?|尚未(?:发生|开始|完成)|还(?:未|没)(?:发生|开始|完成)|未实际完成|时间.*未来|日期.*未来/

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function getCurrentDateContext(now = new Date()): CurrentDateContext {
  const year = now.getFullYear()
  const month = pad2(now.getMonth() + 1)
  const day = pad2(now.getDate())

  return {
    today: `${year}-${month}-${day}`,
    currentMonth: `${year}-${month}`,
  }
}

export function buildCurrentDateContextPrompt(now = new Date()): string {
  const context = getCurrentDateContext(now)

  return [
    `当前日期：${context.today}`,
    `当前月份：${context.currentMonth}`,
    '日期判断硬规则：',
    `1. 必须以“当前日期/当前月份”为准判断过去、当前和未来，不要使用模型训练截止时间或默认系统时间。`,
    `2. 简历/JD 中的 YYYY-MM 只要小于或等于 ${context.currentMonth}，就不是未来时间，不能因此标记为高风险。`,
    `3. 只有 YYYY-MM 严格晚于 ${context.currentMonth}，才可以作为“未来日期/尚未发生”的核实点。`,
    '4. 对未来日期只能提出保守核实问题，不要断言项目未完成，也不要把实测数据直接说成预估。',
  ].join('\n')
}

export function extractYearMonths(text: string): string[] {
  const normalized = new Set<string>()
  for (const match of text.matchAll(YEAR_MONTH_PATTERN)) {
    const year = match[1]
    const month = match[2]
    if (!year || !month) continue
    normalized.add(`${year}-${month.padStart(2, '0')}`)
  }
  return [...normalized]
}

export function compareYearMonth(left: string, right: string): number {
  const [leftYear = '0', leftMonth = '0'] = left.split('-')
  const [rightYear = '0', rightMonth = '0'] = right.split('-')
  const leftValue = Number(leftYear) * 12 + Number(leftMonth)
  const rightValue = Number(rightYear) * 12 + Number(rightMonth)
  return leftValue - rightValue
}

export function isStaleFutureDateRiskText(text: string, now = new Date()): boolean {
  const trimmed = text.trim()
  if (!trimmed || !FUTURE_DATE_ACCUSATION_PATTERN.test(trimmed)) return false

  const months = extractYearMonths(trimmed)
  if (months.length === 0) return false

  const { currentMonth } = getCurrentDateContext(now)
  return months.every(month => compareYearMonth(month, currentMonth) <= 0)
}
