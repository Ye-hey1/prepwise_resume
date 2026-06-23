<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  rows?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRef = ref<HTMLDivElement | null>(null)
const isFocused = ref(false)
const showPlaceholder = ref(!props.modelValue)

const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const MAX_UNDO = 50
let undoLock = false
let savedRange: Range | null = null

function saveSelection() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (!editorRef.value?.contains(range.commonAncestorContainer)) return
  savedRange = range.cloneRange()
}

function restoreSelection() {
  if (!savedRange || !editorRef.value) return
  const selection = window.getSelection()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(savedRange)
}

function pushUndoState() {
  if (undoLock) return
  const html = editorRef.value?.innerHTML ?? ''
  if (undoStack.value.length > 0 && undoStack.value[undoStack.value.length - 1] === html) return
  undoStack.value.push(html)
  if (undoStack.value.length > MAX_UNDO) undoStack.value.shift()
  redoStack.value = []
}

function handleUndo() {
  if (undoStack.value.length <= 1) return
  undoLock = true
  restoreSelection()
  const current = editorRef.value?.innerHTML ?? ''
  redoStack.value.push(current)
  if (undoStack.value[undoStack.value.length - 1] === current) {
    undoStack.value.pop()
  }
  const prev = undoStack.value[undoStack.value.length - 1] ?? ''
  if (editorRef.value) editorRef.value.innerHTML = prev
  onInput()
  undoLock = false
}

function handleRedo() {
  if (redoStack.value.length === 0) return
  undoLock = true
  restoreSelection()
  const current = editorRef.value?.innerHTML ?? ''
  undoStack.value.push(current)
  const next = redoStack.value.pop()!
  if (editorRef.value) editorRef.value.innerHTML = next
  onInput()
  undoLock = false
}

const showLinkDialog = ref(false)
const linkUrl = ref('')
const linkText = ref('')

function openLinkDialog() {
  saveSelection()
  const sel = window.getSelection()
  linkText.value = sel?.toString() ?? ''
  linkUrl.value = ''
  showLinkDialog.value = true
}

function confirmLink() {
  if (!linkUrl.value) return
  const url = linkUrl.value.startsWith('http') ? linkUrl.value : `https://${linkUrl.value}`
  editorRef.value?.focus()
  restoreSelection()
  if (linkText.value && window.getSelection()?.toString() !== linkText.value) {
    document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" rel="noopener">${linkText.value}</a>`)
  } else {
    document.execCommand('createLink', false, url)
  }
  showLinkDialog.value = false
  onInput()
}

const pasteAsPlainText = ref(true)

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function textToDefaultHtml(text: string): string {
  return escapeHtml(text).replace(/\r\n|\r|\n/g, '<br>')
}

function sanitizeHref(href: string): string {
  const value = href.trim()
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value
  return ''
}

function sanitizePastedNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? '')
  }

  if (!(node instanceof HTMLElement)) {
    return Array.from(node.childNodes).map(sanitizePastedNode).join('')
  }

  const children = Array.from(node.childNodes).map(sanitizePastedNode).join('')
  const tag = node.tagName.toLowerCase()

  switch (tag) {
    case 'br':
      return '<br>'
    case 'p':
    case 'div':
    case 'section':
    case 'article':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return children.trim() ? `<p>${children}</p>` : ''
    case 'ul':
    case 'ol':
      return children.trim() ? `<${tag}>${children}</${tag}>` : ''
    case 'li':
      return `<li>${children || '<br>'}</li>`
    case 'strong':
    case 'b':
      return children ? `<strong>${children}</strong>` : ''
    case 'em':
    case 'i':
      return children ? `<em>${children}</em>` : ''
    case 'u':
      return children ? `<u>${children}</u>` : ''
    case 'a': {
      const href = sanitizeHref(node.getAttribute('href') ?? '')
      if (!children) return ''
      return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${children}</a>` : children
    }
    default:
      return children
  }
}

function sanitizePastedHtml(html: string, fallbackText: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  const sanitized = Array.from(template.content.childNodes).map(sanitizePastedNode).join('').trim()
  return sanitized || textToDefaultHtml(fallbackText)
}

function sanitizeEditorHtml(html: string): string {
  const normalized = html.trim()
  if (!normalized || normalized === '<br>' || normalized === '<div><br></div>') return ''

  const template = document.createElement('template')
  template.innerHTML = normalized
  return Array.from(template.content.childNodes).map(sanitizePastedNode).join('').trim()
}

function handlePaste(e: ClipboardEvent) {
  e.preventDefault()
  restoreSelection()
  pushUndoState()
  const text = e.clipboardData?.getData('text/plain') ?? ''
  const html = e.clipboardData?.getData('text/html') ?? ''
  const normalized = pasteAsPlainText.value || !html
    ? textToDefaultHtml(text)
    : sanitizePastedHtml(html, text)

  document.execCommand('insertHTML', false, normalized)
  editorRef.value?.focus()
  saveSelection()
  onInput()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      handleUndo()
    } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
      e.preventDefault()
      handleRedo()
    }
  }
}

watch(() => props.modelValue, (val) => {
  if (!editorRef.value || isFocused.value) return
  const clean = sanitizeEditorHtml(val || '')
  if (editorRef.value.innerHTML !== clean) {
    editorRef.value.innerHTML = clean
  }
  showPlaceholder.value = !clean
  if (clean !== (val || '').trim()) {
    emit('update:modelValue', clean)
  }
})

onMounted(() => {
  if (editorRef.value) {
    const clean = sanitizeEditorHtml(props.modelValue || '')
    editorRef.value.innerHTML = clean
    showPlaceholder.value = !clean
    if (clean !== (props.modelValue || '').trim()) {
      emit('update:modelValue', clean)
    }
    pushUndoState()
  }
})

function onInput() {
  const clean = sanitizeEditorHtml(editorRef.value?.innerHTML ?? '')
  showPlaceholder.value = !clean
  saveSelection()
  pushUndoState()
  emit('update:modelValue', clean)
}

function execCmd(cmd: string, value?: string) {
  restoreSelection()
  pushUndoState()
  document.execCommand(cmd, false, value)
  editorRef.value?.focus()
  saveSelection()
  onInput()
}

function isActive(cmd: string): boolean {
  try { return document.queryCommandState(cmd) } catch { return false }
}

const canUndo = () => undoStack.value.length > 1
const canRedo = () => redoStack.value.length > 0
</script>

<template>
  <div class="rich-editor-wrap" :class="{ focused: isFocused }">
    <div class="rich-toolbar">
      <button type="button" class="tool-btn" :class="{ active: isActive('bold') }" @mousedown.prevent="execCmd('bold')" title="粗体 (Ctrl+B)">
        <strong>B</strong>
      </button>
      <button type="button" class="tool-btn" :class="{ active: isActive('italic') }" @mousedown.prevent="execCmd('italic')" title="斜体 (Ctrl+I)">
        <em>I</em>
      </button>
      <button type="button" class="tool-btn" :class="{ active: isActive('underline') }" @mousedown.prevent="execCmd('underline')" title="下划线 (Ctrl+U)">
        <u>U</u>
      </button>
      <div class="tool-divider"></div>
      <button type="button" class="tool-btn" :disabled="!canUndo()" @mousedown.prevent="handleUndo" title="撤销 (Ctrl+Z)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 10h10a5 5 0 0 1 0 10H9M3 10l4-4M3 10l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="tool-btn" :disabled="!canRedo()" @mousedown.prevent="handleRedo" title="重做 (Ctrl+Y)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 10H11a5 5 0 0 0 0 10h4M21 10l-4-4M21 10l-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="tool-divider"></div>
      <button type="button" class="tool-btn" @mousedown.prevent="openLinkDialog" title="插入链接">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="tool-btn" :class="{ active: isActive('insertUnorderedList') }" @mousedown.prevent="execCmd('insertUnorderedList')" title="无序列表">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <circle cx="2" cy="4" r="1.2" fill="currentColor"/>
          <circle cx="2" cy="8" r="1.2" fill="currentColor"/>
          <circle cx="2" cy="12" r="1.2" fill="currentColor"/>
          <path d="M5 4h9M5 8h9M5 12h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>
      <button type="button" class="tool-btn" :class="{ active: isActive('insertOrderedList') }" @mousedown.prevent="execCmd('insertOrderedList')" title="有序列表">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <text x="0" y="5.5" font-size="5" fill="currentColor" font-weight="bold">1.</text>
          <text x="0" y="9.5" font-size="5" fill="currentColor" font-weight="bold">2.</text>
          <text x="0" y="13.5" font-size="5" fill="currentColor" font-weight="bold">3.</text>
          <path d="M5 4h9M5 8h9M5 12h9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>
      <button type="button" class="tool-btn" @mousedown.prevent="execCmd('removeFormat')" title="清除格式">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M3 12L9 3M6 12h7M3 6l7 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>
      <div class="tool-divider"></div>
      <button
        type="button"
        class="tool-btn"
        :class="{ active: pasteAsPlainText }"
        @mousedown.prevent="pasteAsPlainText = !pasteAsPlainText"
        :title="pasteAsPlainText ? '粘贴时统一为默认样式' : '粘贴时保留基础结构并清除外部样式'"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" stroke-width="1.8"/></svg>
      </button>
    </div>

    <div class="editor-area-wrap">
      <div
        ref="editorRef"
        class="editor-area"
        contenteditable="true"
        :style="{ minHeight: (rows || 3) * 1.9 + 'em' }"
        @input="onInput"
        @focus="isFocused = true; saveSelection()"
        @blur="isFocused = false"
        @keydown="handleKeydown"
        @keyup="saveSelection"
        @mouseup="saveSelection"
        @paste="handlePaste"
        spellcheck="false"
      ></div>
      <div v-if="showPlaceholder" class="editor-placeholder">{{ placeholder || '请输入内容...' }}</div>
    </div>

    <slot name="ai-panel" />

    <slot name="footer" />

    <div v-if="isFocused" class="shortcut-hints">
      <span>Ctrl+B 粗体</span>
      <span class="hint-sep">/</span>
      <span>Ctrl+I 斜体</span>
      <span class="hint-sep">/</span>
      <span>Ctrl+U 下划线</span>
      <span class="hint-sep">/</span>
      <span>Ctrl+Z 撤销</span>
      <span class="hint-sep">/</span>
      <span>Ctrl+Y 重做</span>
    </div>

    <Teleport to="body">
      <div v-if="showLinkDialog" class="link-dialog-overlay" @click.self="showLinkDialog = false">
        <div class="link-dialog">
          <h4 class="link-dialog-title">插入链接</h4>
          <label class="link-field">
            <span class="link-label">链接文本</span>
            <input v-model="linkText" type="text" class="link-input" placeholder="显示的文字" />
          </label>
          <label class="link-field">
            <span class="link-label">链接地址</span>
            <input v-model="linkUrl" type="url" class="link-input" placeholder="https://..." @keydown.enter="confirmLink" />
          </label>
          <div class="link-actions">
            <button type="button" class="link-cancel" @click="showLinkDialog = false">取消</button>
            <button type="button" class="link-confirm" :disabled="!linkUrl" @click="confirmLink">确认</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.rich-editor-wrap {
  border: 1px solid var(--border-color-strong);
  border-radius: calc(var(--radius-lg) + 2px);
  background: var(--bg-card);
  overflow: hidden;
  box-shadow: none;
  transition: border-color 0.18s ease, background-color 0.18s ease;
}

.rich-editor-wrap.focused {
  border-color: var(--border-accent);
  background: var(--bg-card);
  box-shadow: none;
}

.rich-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 14px;
  background: var(--bg-card-muted);
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.tool-btn {
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--glass-low);
  cursor: pointer;
  color: var(--text-primary);
  font-size: 0.82rem;
  transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.tool-btn:hover:not(:disabled) {
  background: var(--glass-high);
  border-color: rgba(43, 123, 184, 0.18);
  color: var(--accent-blue-600);
}

.tool-btn.active {
  background: rgba(43, 123, 184, 0.12);
  border-color: rgba(43, 123, 184, 0.26);
  color: var(--accent-blue-600);
}

.tool-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.tool-divider {
  width: 1px;
  height: 18px;
  background: var(--border-color);
  margin: 0 2px;
}

.editor-area-wrap {
  position: relative;
  background: var(--bg-input);
}

.editor-area {
  padding: 16px 16px 18px;
  font-size: 14px;
  line-height: 1.78;
  color: var(--text-primary);
  outline: none;
  word-break: break-word;
}

.editor-area:empty {
  min-height: 3em;
}

.editor-placeholder {
  position: absolute;
  top: 16px;
  left: 16px;
  color: var(--text-muted);
  font-size: 14px;
  pointer-events: none;
  user-select: none;
}

.shortcut-hints {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: var(--bg-card-muted);
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-secondary);
  flex-wrap: wrap;
}

.hint-sep {
  color: var(--text-muted);
}

.editor-area ul {
  list-style-type: disc;
  padding-left: 18px;
  margin: 4px 0;
}

.editor-area ol {
  list-style-type: decimal;
  padding-left: 18px;
  margin: 4px 0;
}

.editor-area li {
  margin-bottom: 2px;
  font-size: inherit;
}

.editor-area li::marker {
  font-size: 1em;
  font-weight: inherit;
  color: currentColor;
}

.link-dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.link-dialog {
  width: min(420px, calc(100vw - 32px));
  background: var(--bg-elevated);
  border: 1px solid var(--border-color-strong);
  border-radius: 18px;
  padding: 22px;
  box-shadow: none;
}

.link-dialog-title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}

.link-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.link-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.link-input {
  padding: 11px 13px;
  border: 1px solid var(--border-color-strong);
  border-radius: 12px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-input);
  outline: none;
  transition: border-color 0.18s ease;
}

.link-input:focus {
  border-color: rgba(43, 123, 184, 0.36);
  box-shadow: none;
}

.link-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.link-cancel,
.link-confirm {
  min-height: 38px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid var(--border-color);
  transition: border-color 0.18s ease, background-color 0.18s ease;
}

.link-cancel {
  background: var(--glass-mid);
  color: var(--text-secondary);
}

.link-cancel:hover {
  border-color: var(--border-color-strong);
}

.link-confirm {
  background: var(--accent-blue-500);
  color: white;
  border-color: var(--accent-blue-500);
}

.link-confirm:hover:not(:disabled) {
  background: var(--accent-blue-600);
}

.link-confirm:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
