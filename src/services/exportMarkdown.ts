import type { useResumeStore } from '@/stores/resume'
import { DEFAULT_SANITIZE_OPTIONS, sanitizeCompanyName, sanitizeLink, sanitizeName, sanitizeObject, sanitizeSchoolName, sanitizeText, type SanitizeOptions } from './export/sanitize'

type ResumeStore = ReturnType<typeof useResumeStore>

export interface ExportOptions {
  sanitize?: boolean
  sanitizeOptions?: SanitizeOptions
}

/**
 * Convert simple HTML (from RichEditor) to Markdown.
 * Handles: ul/ol/li, p, br, bold, italic, links, headings.
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return ''

  let md = html
    // Normalize line endings
    .replace(/\r\n?/g, '\n')

  // Convert <br> / <br/> / <br />
  md = md.replace(/<br\s*\/?>/gi, '\n')

  // Bold
  md = md.replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, '**$2**')
  // Italic
  md = md.replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, '*$2*')
  // Links
  md = md.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')

  // Headings h1-h6
  md = md.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, content) => {
    return '#'.repeat(Number(level)) + ' ' + content.trim()
  })

  // Ordered lists
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_match, inner: string) => {
    let index = 0
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: string, content: string) => {
      index++
      return `${index}. ${content.trim()}`
    }) + '\n'
  })

  // Unordered lists
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_match, inner: string) => {
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: string, content: string) => {
      return `- ${content.trim()}`
    }) + '\n'
  })

  // Standalone <li> (fallback)
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1')

  // Paragraphs → double newline
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')

  // Divs → newline
  md = md.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1\n')

  // Strip any remaining tags
  md = md.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  md = md
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

  // Collapse multiple blank lines to at most two
  md = md.replace(/\n{3,}/g, '\n\n')

  return md.trim()
}

/**
 * Build a formatted date range string.
 */
function dateRange(start?: string, end?: string): string {
  if (!start && !end) return ''
  return `${start || '?'} ~ ${end || '至今'}`
}

/**
 * Append a section only if it has meaningful content.
 */
function pushSection(lines: string[], title: string, content: string) {
  const trimmed = content.trim()
  if (!trimmed) return
  lines.push(`## ${title}`, '', trimmed, '')
}

/**
 * Generate a full Markdown string from the resume store.
 * Respects module visibility and ordering.
 * @param store - The resume store
 * @param options - Export options including sanitization
 */
export function generateResumeMarkdown(store: ResumeStore, options: ExportOptions = {}): string {
  const { sanitize = false, sanitizeOptions = DEFAULT_SANITIZE_OPTIONS } = options

  // 如果启用脱敏，创建简历数据的脱敏副本
  const basicInfo = sanitize ? sanitizeObject(store.basicInfo, sanitizeOptions) : store.basicInfo
  const educationList = sanitize ? store.educationList.map(e => sanitizeObject(e, sanitizeOptions)) : store.educationList
  const workList = sanitize ? store.workList.map(w => sanitizeObject(w, sanitizeOptions)) : store.workList
  const projectList = sanitize ? store.projectList.map(p => sanitizeObject(p, sanitizeOptions)) : store.projectList
  const personalWorkList = sanitize ? store.personalWorkList.map(p => sanitizeObject(p, sanitizeOptions)) : store.personalWorkList
  const trainingList = sanitize ? store.trainingList.map(p => sanitizeObject(p, sanitizeOptions)) : store.trainingList
  const customSectionList = sanitize
    ? store.customSectionList.map(section => ({
        ...sanitizeObject(section, sanitizeOptions),
        items: section.items.map(item => sanitizeObject(item, sanitizeOptions)),
      }))
    : store.customSectionList
  const awardList = sanitize ? store.awardList.map(a => sanitizeObject(a, sanitizeOptions)) : store.awardList

  // 使用脱敏后的数据
  const safeStore = {
    ...store,
    basicInfo,
    educationList,
    workList,
    projectList,
    personalWorkList,
    trainingList,
    customSectionList,
    awardList,
  }
  const lines: string[] = []

  // Iterate the module list in order, only include visible ones
  for (const mod of safeStore.modules) {
    if (!mod.visible) continue

    switch (mod.key) {
      case 'basicInfo': {
        const b = safeStore.basicInfo
        // Title
        lines.push(`# ${b.name || '未命名简历'}`, '')

        // Contact & personal info as a compact list
        const infoItems: string[] = []
        if (b.jobTitle) infoItems.push(`**求职意向**：${b.jobTitle}`)
        if (b.phone) infoItems.push(`**电话**：${b.phone}`)
        if (b.email) infoItems.push(`**邮箱**：${b.email}`)
        if (b.age) infoItems.push(`**年龄**：${b.age}`)
        if (b.gender) infoItems.push(`**性别**：${b.gender}`)
        if (b.educationLevel) infoItems.push(`**学历**：${b.educationLevel}`)
        if (b.workYears) infoItems.push(`**工作年限**：${b.workYears}`)
        if (b.currentCity) infoItems.push(`**所在城市**：${b.currentCity}`)
        if (b.location) infoItems.push(`**籍贯**：${b.location}`)
        if (b.expectedLocation) infoItems.push(`**期望工作地点**：${b.expectedLocation}`)
        if (b.expectedSalary) infoItems.push(`**期望薪资**：${b.expectedSalary}`)
        if (b.currentStatus) infoItems.push(`**当前状态**：${b.currentStatus}`)
        if (b.wechat) infoItems.push(`**微信**：${b.wechat}`)
        if (b.website) infoItems.push(`**个人网站**：${b.website}`)
        if (b.github) infoItems.push(`**GitHub**：${b.github}`)
        if (b.blog) infoItems.push(`**博客**：${b.blog}`)

        if (infoItems.length > 0) {
          lines.push(infoItems.map((item) => `- ${item}`).join('\n'), '')
        }
        break
      }

      case 'education': {
        const entries = safeStore.educationList.filter(
          (e) => e.school || e.major || e.degree || e.startDate
        )
        if (entries.length === 0) break
        lines.push('## 教育经历', '')
        for (const e of entries) {
          const header = [e.school, e.college, e.major, e.degree].filter(Boolean).join(' · ')
          lines.push(`### ${header || '未填写'}`)
          const dr = dateRange(e.startDate, e.endDate)
          if (dr) lines.push(`> ${dr}`)
          if (e.gpa) lines.push(`- **GPA**：${e.gpa}`)
          if (e.location) lines.push(`- **地点**：${e.location}`)
          const desc = htmlToMarkdown(e.description)
          if (desc) lines.push('', desc)
          lines.push('')
        }
        break
      }

      case 'skills': {
        pushSection(lines, '专业技能', htmlToMarkdown(safeStore.skills))
        break
      }

      case 'workExperience': {
        const entries = safeStore.workList.filter(
          (w) => w.company || w.position || w.startDate || w.description
        )
        if (entries.length === 0) break
        lines.push('## 工作经历', '')
        for (const w of entries) {
          const header = [w.company, w.department, w.position].filter(Boolean).join(' · ')
          lines.push(`### ${header || '未填写'}`)
          const dr = dateRange(w.startDate, w.endDate)
          if (dr) lines.push(`> ${dr}`)
          if (w.location) lines.push(`- **地点**：${w.location}`)
          const desc = htmlToMarkdown(w.description)
          if (desc) lines.push('', desc)
          lines.push('')
        }
        break
      }

      case 'projectExperience': {
        const entries = safeStore.projectList.filter(
          (p) => p.name || p.role || p.startDate || p.mainWork
        )
        if (entries.length === 0) break
        lines.push('## 项目经历', '')
        for (const p of entries) {
          const header = [p.name, p.role].filter(Boolean).join(' · ')
          lines.push(`### ${header || '未填写'}`)
          const dr = dateRange(p.startDate, p.endDate)
          if (dr) lines.push(`> ${dr}`)
          if (p.link) lines.push(`- **链接**：${p.link}`)
          const intro = htmlToMarkdown(p.introduction)
          if (intro) lines.push('', '**项目简介**', '', intro)
          const work = htmlToMarkdown(p.mainWork)
          if (work) lines.push('', '**主要工作**', '', work)
          lines.push('')
        }
        break
      }

      case 'personalWorks': {
        const entries = safeStore.personalWorkList.filter(
          (p) => p.name || p.type || p.link || p.description || p.contribution || p.techStack || p.outcome
        )
        if (entries.length === 0) break
        lines.push('## 个人作品', '')
        for (const p of entries) {
          const header = [p.name, p.type].filter(Boolean).join(' · ')
          lines.push(`### ${header || '未填写'}`)
          if (p.link) lines.push(`- **链接**：${p.link}`)
          if (p.techStack) lines.push(`- **技术栈/工具**：${p.techStack}`)
          const desc = htmlToMarkdown(p.description)
          if (desc) lines.push('', desc)
          const contribution = htmlToMarkdown(p.contribution)
          if (contribution) lines.push('', '**我的贡献**', '', contribution)
          const outcome = htmlToMarkdown(p.outcome)
          if (outcome) lines.push('', '**成果数据**', '', outcome)
          lines.push('')
        }
        break
      }

      case 'trainingExperience': {
        const entries = safeStore.trainingList.filter(
          (p) => p.institution || p.course || p.credential || p.startDate || p.description || p.outcome
        )
        if (entries.length === 0) break
        lines.push('## 培训经历', '')
        for (const p of entries) {
          const header = [p.institution, p.course].filter(Boolean).join(' · ')
          lines.push(`### ${header || '未填写'}`)
          const dr = dateRange(p.startDate, p.endDate)
          if (dr) lines.push(`> ${dr}`)
          if (p.credential) lines.push(`- **证书/资质**：${p.credential}`)
          if (p.location) lines.push(`- **地点/形式**：${p.location}`)
          const desc = htmlToMarkdown(p.description)
          if (desc) lines.push('', desc)
          const outcome = htmlToMarkdown(p.outcome)
          if (outcome) lines.push('', '**成果收获**', '', outcome)
          lines.push('')
        }
        break
      }

      case 'awards': {
        const entries = safeStore.awardList.filter((a) => a.name || a.date)
        if (entries.length === 0) break
        lines.push('## 荣誉奖项', '')
        for (const a of entries) {
          const header = [a.name, a.date].filter(Boolean).join(' — ')
          lines.push(`- **${header}**`)
          const desc = htmlToMarkdown(a.description)
          if (desc) lines.push(`  ${desc}`)
        }
        lines.push('')
        break
      }

      case 'customSections': {
        const sections = safeStore.customSectionList.filter((section) =>
          section.title && section.items.some((item) => item.title || item.subtitle || item.date || item.link || item.description)
        )
        if (sections.length === 0) break
        for (const section of sections) {
          lines.push(`## ${section.title || '自定义模块'}`, '')
          for (const item of section.items.filter((entry) => entry.title || entry.subtitle || entry.date || entry.link || entry.description)) {
            const header = [item.title, item.subtitle].filter(Boolean).join(' · ')
            lines.push(`### ${header || '未填写'}`)
            if (item.date) lines.push(`> ${item.date}`)
            if (item.link) lines.push(`- **链接**：${item.link}`)
            const desc = htmlToMarkdown(item.description)
            if (desc) lines.push('', desc)
            lines.push('')
          }
        }
        break
      }

      case 'selfIntro': {
        pushSection(lines, '个人简介', htmlToMarkdown(safeStore.selfIntro))
        break
      }
    }
  }

  return lines.join('\n').trim() + '\n'
}

/**
 * Trigger a file download in the browser.
 * @param filename - The filename to download as
 * @param content - The content to download
 * @param options - Export options including sanitization
 */
export function downloadMarkdown(filename: string, content: string, options: ExportOptions = {}) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`
  a.style.display = 'none'
  document.body.appendChild(a)
  // 给浏览器一个稳定的挂载机会，避免某些环境下过早 revoke 导致下载无响应
  a.click()
  window.setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 0)
}
