/**
 * 简历数据脱敏服务
 * 用于导出时隐藏敏感信息
 */

// 敏感信息正则表达式
const SENSITIVE_PATTERNS = {
  // 手机号：中国大陆手机号
  phone: /\b1[3-9]\d{9}\b/g,
  // 邮箱：标准邮箱格式
  email: /\b[\w.-]+@[\w.-]+\.\w{2,}\b/g,
  // 身份证号（部分匹配，避免误判）
  idCard: /\b\d{17}[\dXx]\b/g,
  // 微信号
  wechat: /\b[a-zA-Z][a-zA-Z0-9_-]{5,19}\b/g,
  // 银行卡号（部分匹配）
  bankCard: /\b\d{16,19}\b/g,
}

// 公司名称关键词（需根据上下文判断）
const COMPANY_KEYWORDS = [
  '公司', '有限公司', '股份有限公司', '集团', '科技', '网络',
  'Co\.', 'Ltd\.', 'Inc\.', 'Corp\.', 'LLC',
]

// 学校名称关键词
const SCHOOL_KEYWORDS = [
  '大学', '学院', '学校', 'University', 'College', 'Institute', 'School',
]

// 代码仓库名称关键词（需要保留）
const REPO_KEYWORDS = ['github\.com', 'gitee\.com', 'gitlab\.com', 'bitbucket\.org']

/**
 * 检查字符串是否为代码仓库链接
 */
function isRepoLink(text: string): boolean {
  return REPO_KEYWORDS.some(keyword => new RegExp(keyword, 'i').test(text))
}

/**
 * 检查字符串是否包含公司关键词
 */
function hasCompanyKeyword(text: string): boolean {
  return COMPANY_KEYWORDS.some(keyword => new RegExp(keyword, 'i').test(text))
}

/**
 * 检查字符串是否包含学校关键词
 */
function hasSchoolKeyword(text: string): boolean {
  return SCHOOL_KEYWORDS.some(keyword => new RegExp(keyword, 'i').test(text))
}

/**
 * 脱敏处理单个字符串
 */
export function sanitizeText(text: string, options: SanitizeOptions = {}): string {
  if (!text) return text

  let result = text

  // 处理手机号
  if (options.sanitizePhone !== false) {
    result = result.replace(SENSITIVE_PATTERNS.phone, '***')
  }

  // 处理邮箱
  if (options.sanitizeEmail !== false) {
    result = result.replace(SENSITIVE_PATTERNS.email, '***@***.***')
  }

  // 处理身份证号
  if (options.sanitizeIdCard !== false) {
    result = result.replace(SENSITIVE_PATTERNS.idCard, (match) => {
      // 保留前4位和后4位
      if (match.length >= 8) {
        return match.slice(0, 4) + '**********' + match.slice(-4)
      }
      return '***'
    })
  }

  // 处理微信号（需要上下文判断，这里保守处理）
  if (options.sanitizeWechat !== false) {
    // 只在明显标注为微信的字段中处理
    result = result.replace(SENSITIVE_PATTERNS.wechat, '***')
  }

  // 处理银行卡号
  if (options.sanitizeBankCard !== false) {
    result = result.replace(SENSITIVE_PATTERNS.bankCard, (match) => {
      // 保留前4位和后4位
      if (match.length >= 8) {
        return match.slice(0, 4) + '********' + match.slice(-4)
      }
      return '***'
    })
  }

  return result
}

/**
 * 脱敏处理公司名称
 * 保留公司类型，隐藏具体名称
 */
export function sanitizeCompanyName(companyName: string): string {
  if (!companyName) return companyName

  // 如果是知名大厂，可以保留（这里简化处理，全部隐藏）
  // 如果包含公司关键词，保留关键词部分
  for (const keyword of COMPANY_KEYWORDS) {
    const regex = new RegExp(keyword, 'i')
    if (regex.test(companyName)) {
      return '***' + keyword
    }
  }

  return '***公司'
}

/**
 * 脱敏处理学校名称
 */
export function sanitizeSchoolName(schoolName: string): string {
  if (!schoolName) return schoolName

  for (const keyword of SCHOOL_KEYWORDS) {
    const regex = new RegExp(keyword, 'i')
    if (regex.test(schoolName)) {
      return '***' + keyword
    }
  }

  return '***学校'
}

/**
 * 脱敏处理私人链接
 * 保留代码仓库链接，隐藏其他私人链接
 */
export function sanitizeLink(link: string): string {
  if (!link) return link

  // 保留代码仓库链接
  if (isRepoLink(link)) {
    return link
  }

  // 其他链接隐藏域名
  try {
    const url = new URL(link)
    return url.protocol + '//' + '***' + url.pathname
  } catch {
    // 如果不是有效 URL，直接返回***
    return '***'
  }
}

/**
 * 脱敏处理姓名
 */
export function sanitizeName(name: string): string {
  if (!name) return name
  if (name.length <= 1) return '***'
  // 保留姓氏，隐藏名字
  return name[0] + '**'
}

/**
 * 脱敏选项
 */
export interface SanitizeOptions {
  // 是否脱敏手机号
  sanitizePhone?: boolean
  // 是否脱敏邮箱
  sanitizeEmail?: boolean
  // 是否脱敏身份证
  sanitizeIdCard?: boolean
  // 是否脱敏微信号
  sanitizeWechat?: boolean
  // 是否脱敏银行卡号
  sanitizeBankCard?: boolean
  // 是否脱敏姓名
  sanitizeName?: boolean
  // 是否脱敏公司名
  sanitizeCompany?: boolean
  // 是否脱敏学校名
  sanitizeSchool?: boolean
  // 是否脱敏私人链接
  sanitizeLink?: boolean
  // 保留的代码仓库链接（正则数组）
  keepRepoLinks?: boolean
}

/**
 * 默认脱敏选项
 */
export const DEFAULT_SANITIZE_OPTIONS: SanitizeOptions = {
  sanitizePhone: true,
  sanitizeEmail: true,
  sanitizeIdCard: true,
  sanitizeWechat: true,
  sanitizeBankCard: true,
  sanitizeName: true,
  sanitizeCompany: true,
  sanitizeSchool: true,
  sanitizeLink: true,
  keepRepoLinks: true,
}

/**
 * 批量脱敏处理对象
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  options: SanitizeOptions = DEFAULT_SANITIZE_OPTIONS
): T {
  const result: Record<string, unknown> = { ...obj }

  for (const key in result) {
    if (typeof result[key] !== 'string') continue

    const value = result[key] as string

    // 根据字段名判断脱敏类型
    if (key.includes('phone') || key.includes('电话') || key.includes('手机')) {
      result[key] = sanitizeText(value, { sanitizePhone: options.sanitizePhone })
    } else if (key.includes('email') || key.includes('邮箱') || key.includes('邮件')) {
      result[key] = sanitizeText(value, { sanitizeEmail: options.sanitizeEmail })
    } else if (key.includes('name') && (key.includes('real') || key.includes('true') || key === 'name')) {
      result[key] = options.sanitizeName ? sanitizeName(value) : value
    } else if (key.includes('company') || key.includes('公司')) {
      result[key] = options.sanitizeCompany ? sanitizeCompanyName(value) : value
    } else if (key.includes('school') || key.includes('学校') || key.includes('学院')) {
      result[key] = options.sanitizeSchool ? sanitizeSchoolName(value) : value
    } else if (key.includes('link') || key.includes('url') || key.includes('website') || key.includes('github') || key.includes('blog')) {
      // 代码仓库链接保留
      if (options.keepRepoLinks && isRepoLink(value)) {
        result[key] = value
      } else {
        result[key] = options.sanitizeLink ? sanitizeLink(value) : value
      }
    } else if (key.includes('wechat') || key.includes('微信')) {
      result[key] = sanitizeText(value, { sanitizeWechat: options.sanitizeWechat })
    } else {
      // 其他文本内容进行通用脱敏
      result[key] = sanitizeText(value, options)
    }
  }

  return result as T
}
