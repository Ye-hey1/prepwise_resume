/**
 * HTML 消毒工具
 * 基于 DOMPurify 清理 HTML 内容，防止 XSS 注入
 */
import DOMPurify, { type Config } from 'dompurify'

/** 默认配置：允许安全的 HTML 标签和属性 */
const DEFAULT_CONFIG: Config = {
  ALLOWED_TAGS: [
    'b', 'i', 'em', 'strong', 'u', 's', 'del', 'ins',
    'p', 'br', 'div', 'span',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'blockquote', 'pre', 'code',
    'hr', 'sub', 'sup',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel',
    'src', 'alt', 'width', 'height',
    'class', 'style',
    'colspan', 'rowspan',
  ],
  ALLOW_DATA_ATTR: false,
}

/** Markdown 渲染专用配置：允许代码高亮相关属性 */
const MARKDOWN_CONFIG: Config = {
  ...DEFAULT_CONFIG,
  ADD_TAGS: ['input'],
  ADD_ATTR: ['checked', 'disabled'],
}

/**
 * 消毒 HTML 内容（默认配置）
 * 适用于简历模板中的富文本内容
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return ''
  return String(DOMPurify.sanitize(dirty, DEFAULT_CONFIG))
}

/**
 * 消毒 Markdown 转 HTML 的内容
 * 允许更多标签以支持 Markdown 渲染（如 checkbox）
 */
export function sanitizeMarkdownHtml(dirty: string): string {
  if (!dirty) return ''
  return String(DOMPurify.sanitize(dirty, MARKDOWN_CONFIG))
}
