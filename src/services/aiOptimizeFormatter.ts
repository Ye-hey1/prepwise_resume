import MarkdownIt from 'markdown-it'
import type { ResumeFieldAiContext } from './types/resumeAssistant'

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})

type PreferredListType = 'ordered' | 'unordered'

const PROJECT_TECH_KEYWORDS = [
  'Vue', 'Vue2', 'Vue3', 'React', 'Redux', 'TypeScript', 'JavaScript', 'Vite', 'Webpack', 'Node.js', 'Java', 'Spring Boot', 'Go', 'Python', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes',
] as const

const PROJECT_RESULT_PHRASE_REGEX = /(提升[^，。；\n]*|降低[^，。；\n]*|优化[^，。；\n]*|缩短[^，。；\n]*|减少[^，。；\n]*|支撑[^，。；\n]*|保障[^，。；\n]*)/g
const PROJECT_METRIC_REGEX = /(\d+(?:\.\d+)?%|\d+(?:\.\d+)?倍|\d+(?:\.\d+)?万|\d+(?:\.\d+)?ms|\d+(?:\.\d+)?秒)/g

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripMarkdownDecorators(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+\.\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim()
}

export function normalizeMarkdownListContent(markdownText: string): string {
  const lines = markdownText.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let lastListIndex = -1

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    const plain = stripMarkdownDecorators(trimmed).replace(/[：:]$/, '')
    const isSectionHeading = /^#{1,6}\s+/.test(trimmed)
      || /^\*\*[^*]+[:：]?\*\*$/.test(trimmed)
      || /^(项目介绍|项目简介|主要工作|核心职责|工作内容|职责|成果|技术栈)$/.test(plain)
    if (isSectionHeading) {
      out.push(trimmed)
      lastListIndex = -1
      continue
    }

    const isListItem = /^([-*+]\s+|\d+\.\s+)/.test(trimmed)
    if (isListItem) {
      out.push(trimmed)
      lastListIndex = out.length - 1
      continue
    }

    if (lastListIndex >= 0) {
      out[lastListIndex] = `${out[lastListIndex]} ${trimmed}`.replace(/\s+/g, ' ').trim()
    } else {
      out.push(trimmed)
    }
  }

  return out.join('\n').trim()
}

export function sanitizeMarkdownForRender(markdownText: string): string {
  let sanitized = markdownText
    .replace(/(^|\n)(\s*)\*\*(?=\s+)/g, '$1$2')
    .replace(/^\s*(?:如下|优化后如下|优化如下|优化后内容如下)\s*[：:]?\s*/i, '')
    .replace(/(^|\n)(\s*)(?:\*\*)?\s*(?:优化后内容|优化内容|优化建议|建议如下)\s*[：:]?\s*(?:\*\*)?\s*(?=\n|$)/gi, '$1$2')
    .trim()

  let previous = ''
  while (previous !== sanitized) {
    previous = sanitized
    sanitized = sanitized.replace(/\*\*\s*\*\*/g, '')
  }

  const boldMarkerCount = (sanitized.match(/\*\*/g) ?? []).length
  if (boldMarkerCount % 2 !== 0) {
    sanitized = sanitized.replace(/\*\*/g, '')
  }

  return sanitized
}

function createBoldToken(raw: string, tokenMap: Record<string, string>): string {
  const key = `@@BOLD_TOKEN_${Object.keys(tokenMap).length}@@`
  tokenMap[key] = raw
  return key
}

function protectBoldTokens(text: string, tokenMap: Record<string, string>): string {
  return text.replace(/\*\*[^*]+\*\*/g, (match) => createBoldToken(match, tokenMap))
}

function wrapRegexMatchesAsBoldToken(text: string, regex: RegExp, tokenMap: Record<string, string>): string {
  return text.replace(regex, (match) => createBoldToken(`**${match}**`, tokenMap))
}

function wrapKeywordsAsBoldToken(text: string, keywords: readonly string[], tokenMap: Record<string, string>): string {
  let output = text
  const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length)
  for (const keyword of sortedKeywords) {
    const regex = new RegExp(escapeRegExp(keyword), 'gi')
    output = output.replace(regex, (match) => createBoldToken(`**${match}**`, tokenMap))
  }
  return output
}

function restoreBoldTokens(text: string, tokenMap: Record<string, string>): string {
  let output = text
  for (const [token, raw] of Object.entries(tokenMap)) {
    output = output.split(token).join(raw)
  }
  return output
}

function enhanceProjectMainWorkLineBold(lineBody: string): string {
  const tokenMap: Record<string, string> = {}
  let working = protectBoldTokens(lineBody, tokenMap)
  working = wrapRegexMatchesAsBoldToken(working, PROJECT_RESULT_PHRASE_REGEX, tokenMap)
  working = wrapRegexMatchesAsBoldToken(working, PROJECT_METRIC_REGEX, tokenMap)
  working = wrapKeywordsAsBoldToken(working, PROJECT_TECH_KEYWORDS, tokenMap)
  return restoreBoldTokens(working, tokenMap)
}

export function enhanceProjectMainWorkBold(markdownText: string): string {
  const lines = markdownText.replace(/\r\n/g, '\n').split('\n')
  return lines.map((line) => {
    const itemMatch = line.match(/^(\s*(?:[-*+]\s+|\d+\.\s+))(.*)$/)
    if (!itemMatch) return line
    const prefix = itemMatch[1] ?? ''
    const body = itemMatch[2] ?? ''
    if (!body.trim()) return line
    return `${prefix}${enhanceProjectMainWorkLineBold(body)}`
  }).join('\n')
}

function removeMarkdownStrongMarkers(markdownText: string): string {
  return markdownText
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
}

function normalizeProjectIntroductionSingleLine(markdownText: string): string {
  const noStrong = removeMarkdownStrongMarkers(markdownText)
    .replace(/建设目标[:：]?\s*/g, '')
    .replace(/建设目的[:：]?\s*/g, '')
  const lines = noStrong.replace(/\r\n/g, '\n').split('\n')
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectPreferredListTypeFromHtml(html: string): PreferredListType | null {
  const firstListTagMatch = html.match(/<(ol|ul)\b/i)
  if (!firstListTagMatch?.[1]) return null
  return firstListTagMatch[1].toLowerCase() === 'ol' ? 'ordered' : 'unordered'
}

function normalizeMarkdownListType(markdownText: string, preferredListType: PreferredListType | null): string {
  if (!preferredListType) return markdownText
  const lines = markdownText.replace(/\r\n/g, '\n').split('\n')
  let orderedIndex = 1

  return lines.map((line) => {
    const indent = line.match(/^\s*/)?.[0] ?? ''
    const trimmed = line.trim()
    if (!trimmed) return line
    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/)
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/)
    const itemContent = unorderedMatch?.[1] ?? orderedMatch?.[1]
    if (!itemContent) return line
    if (preferredListType === 'ordered') {
      return `${indent}${orderedIndex++}. ${itemContent}`
    }
    return `${indent}- ${itemContent}`
  }).join('\n')
}

function forceHtmlListType(html: string, preferredListType: PreferredListType | null): string {
  if (!preferredListType) return html
  if (preferredListType === 'ordered') {
    return html.replace(/<ul(\s|>)/gi, '<ol$1').replace(/<\/ul>/gi, '</ol>')
  }
  return html.replace(/<ol(\s|>)/gi, '<ul$1').replace(/<\/ol>/gi, '</ul>')
}

function extractPreferredFontSizeFromHtml(html: string): string | null {
  const inlineFontSizeMatch = html.match(/font-size\s*:\s*([^;"']+)/i)
  if (inlineFontSizeMatch?.[1]) {
    const size = inlineFontSizeMatch[1].trim()
    if (/^\d+(\.\d+)?(px|rem|em|%)$/i.test(size)) {
      return size
    }
  }
  return null
}

function applyPreferredFontSizeToHtml(html: string, preferredFontSize: string | null): string {
  if (!preferredFontSize) return html
  return `<div data-ai-preserved-font-size="true" style="font-size:${preferredFontSize};">${html}</div>`
}

function renderWithOriginalStyle(sectionMarkdown: string, originalHtml: string, fallbackList: PreferredListType | null): string {
  const preferredListType = detectPreferredListTypeFromHtml(originalHtml) ?? fallbackList
  const preferredFontSize = extractPreferredFontSizeFromHtml(originalHtml)
  const normalizedListMarkdown = normalizeMarkdownListType(sectionMarkdown, preferredListType)
  const rendered = markdown.render(normalizedListMarkdown)
  const listTypeFixed = forceHtmlListType(rendered, preferredListType)
  return applyPreferredFontSizeToHtml(listTypeFixed, preferredFontSize)
}

export function renderOptimizedPreviewHtml(context: ResumeFieldAiContext, rawContent: string): string {
  const sanitized = sanitizeMarkdownForRender(normalizeMarkdownListContent(rawContent))
  if (!sanitized) return ''

  if (context.moduleKey === 'projectExperience' && context.fieldKey === 'mainWork') {
    return markdown.render(enhanceProjectMainWorkBold(sanitized))
  }

  if (context.moduleKey === 'projectExperience' && context.fieldKey === 'introduction') {
    return markdown.render(normalizeProjectIntroductionSingleLine(sanitized))
  }

  return markdown.render(sanitized)
}

export function renderOptimizedApplyHtml(context: ResumeFieldAiContext, rawContent: string, currentHtml: string): string {
  const sanitized = sanitizeMarkdownForRender(normalizeMarkdownListContent(rawContent))
  if (!sanitized) return ''

  if (context.moduleKey === 'skills') {
    return markdown.render(sanitized)
  }

  if (context.moduleKey === 'selfIntro' || context.moduleKey === 'education') {
    return markdown.render(sanitized)
  }

  if (context.moduleKey === 'workExperience') {
    return renderWithOriginalStyle(sanitized, currentHtml, 'unordered')
  }

  if (context.moduleKey === 'projectExperience' && context.fieldKey === 'introduction') {
    return markdown.render(normalizeProjectIntroductionSingleLine(sanitized))
  }

  if (context.moduleKey === 'projectExperience' && context.fieldKey === 'mainWork') {
    return renderWithOriginalStyle(enhanceProjectMainWorkBold(sanitized), currentHtml, 'ordered')
  }

  if (context.moduleKey === 'awards') {
    return renderWithOriginalStyle(sanitized, currentHtml, null)
  }

  return markdown.render(sanitized)
}
