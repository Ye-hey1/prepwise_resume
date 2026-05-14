export interface ValidationResult {
  valid: boolean
  message?: string
}

const DATE_PATTERN = /^\d{4}[.\-/]\d{2}$/

export function validateDateFormat(value: string): ValidationResult {
  if (!value) return { valid: true }
  if (DATE_PATTERN.test(value)) return { valid: true }
  // Allow "至今" or free text
  if (value === '至今' || value === 'present') return { valid: true }
  return { valid: false, message: '请使用 YYYY.MM 或 YYYY-MM 格式' }
}

export function validateDateRange(start: string, end: string): ValidationResult {
  if (!start && !end) return { valid: true }
  if (start && !end) return validateDateFormat(start)
  const startResult = validateDateFormat(start)
  if (!startResult.valid) return startResult
  const endResult = validateDateFormat(end)
  if (!endResult.valid) return endResult
  if (DATE_PATTERN.test(start) && DATE_PATTERN.test(end) && start > end) {
    return { valid: false, message: '开始日期不能晚于结束日期' }
  }
  return { valid: true }
}
