const PRESENT_DATE_PATTERN = /^(至今|现在|目前|当前|present|current|now)$/i
const MONTH_INPUT_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

function padMonth(month: string): string {
  return month.padStart(2, '0')
}

export function normalizeMonthInputValue(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (PRESENT_DATE_PATTERN.test(trimmed)) return ''

  const compact = trimmed.match(/^(\d{4})(0[1-9]|1[0-2])$/)
  if (compact?.[1] && compact[2]) return `${compact[1]}-${compact[2]}`

  const monthMatch = trimmed.match(/(\d{4})\s*(?:年|[./\-_])\s*(1[0-2]|0?[1-9])(?:\s*(?:月|[./\-_])\s*\d{1,2}(?:日)?)?/)
  if (!monthMatch?.[1] || !monthMatch[2]) return trimmed

  return `${monthMatch[1]}-${padMonth(monthMatch[2])}`
}

export function formatResumeDate(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (PRESENT_DATE_PATTERN.test(trimmed)) return '至今'

  const normalized = normalizeMonthInputValue(trimmed)
  if (MONTH_INPUT_PATTERN.test(normalized)) return normalized.replace('-', '.')
  return trimmed
}

export function formatResumeDateRange(start: string, end: string): string {
  const displayStart = formatResumeDate(start)
  const displayEnd = formatResumeDate(end) || '至今'
  if (!displayStart && !end.trim()) return ''
  if (!displayStart) return displayEnd
  return `${displayStart} ~ ${displayEnd}`
}
