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

function pushUndoState() {
  if (undoLock) return
  const html = editorRef.value?.innerHTML ?? ''
  if (undoStack.value.length > 0 && undoStack.value[undoStack.value.length - 1] === html) return
  undoStack.value.push(html)
  if (undoStack.value.length > MAX_UNDO) undoStack.value.shift()
  redoStack.value = []
}

function handleUndo() {
  if (undoStack.value.length === 0) return
  undoLock = true
  const current = editorRef.value?.innerHTML ?? ''
  redoStack.value.push(current)
  const prev = undoStack.value.pop()!
  if (editorRef.value) editorRef.value.innerHTML = prev
  onInput()
  undoLock = false
}

function handleRedo() {
  if (redoStack.value.length === 0) return
  undoLock = true
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
  const sel = window.getSelection()
  linkText.value = sel?.toString() ?? ''
  linkUrl.value = ''
  showLinkDialog.value = true
}

function confirmLink() {
  if (!linkUrl.value) return
  const url = linkUrl.value.startsWith('http') ? linkUrl.value : `https://${linkUrl.value}`
  editorRef.value?.focus()
  if (linkText.value && window.getSelection()?.toString() !== linkText.value) {
    document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" rel="noopener">${linkText.value}</a>`)
  } else {
    document.execCommand('createLink', false, url)
  }
  showLinkDialog.value = false
  onInput()
}

const pasteAsPlainText = ref(false)

function handlePaste(e: ClipboardEvent) {
  if (!pasteAsPlainText.value) return
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') ?? ''
  document.execCommand('insertText', false, text)
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
  if (editorRef.value.innerHTML !== val) {
    editorRef.value.innerHTML = val || ''
  }
  showPlaceholder.value = !val
})

onMounted(() => {
  if (editorRef.value) {
    editorRef.value.innerHTML = props.modelValue || ''
    showPlaceholder.value = !props.modelValue
    pushUndoState()
  }
})

function onInput() {
  const html = editorRef.value?.innerHTML ?? ''
  const clean = html === '<br>' || html === '<div><br></div>' ? '' : html
  showPlaceholder.value = !clean
  pushUndoState()
  emit('update:modelValue', clean)
}

function execCmd(cmd: string, value?: string) {
  pushUndoState()
  document.execCommand(cmd, false, value)
  editorRef.value?.focus()
  onInput()
}

function setFontSize(e: Event) {
  const size = (e.target as HTMLSelectElement).value
  pushUndoState()
  document.execCommand('fontSize', false, '7')
  const fontEls = editorRef.value?.querySelectorAll('font[size="7"]')
  fontEls?.forEach(el => {
    const span = document.createElement('span')
    span.style.fontSize = size
    span.innerHTML = el.innerHTML
    el.parentNode?.replaceChild(span, el)
  })
  applyFontSizeToSelectedListItems(size)
  editorRef.value?.focus()
  onInput()
}

function applyFontSizeToSelectedListItems(size: string) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  const startEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement
  const endEl =
    range.endContainer.nodeType === Node.ELEMENT_NODE
      ? (range.endContainer as Element)
      : range.endContainer.parentElement

  const startLi = startEl?.closest('li') as HTMLElement | null
  const endLi = endEl?.closest('li') as HTMLElement | null

  if (startLi && endLi && startLi.parentElement && startLi.parentElement === endLi.parentElement) {
    const siblings = Array.from(startLi.parentElement.children).filter(
      (node) => node instanceof HTMLElement && node.tagName === 'LI',
    ) as HTMLElement[]
    const startIndex = siblings.indexOf(startLi)
    const endIndex = siblings.indexOf(endLi)
    if (startIndex > -1 && endIndex > -1) {
      const from = Math.min(startIndex, endIndex)
      const to = Math.max(startIndex, endIndex)
      for (let i = from; i <= to; i += 1) {
        const li = siblings[i]
        if (li) li.style.fontSize = size
      }
      return
    }
  }

  if (startLi) startLi.style.fontSize = size
  if (endLi && endLi !== startLi) endLi.style.fontSize = size
}

function setColor(e: Event) {
  const color = (e.target as HTMLInputElement).value
  execCmd('foreColor', color)
}

function isActive(cmd: string): boolean {
  try { return document.queryCommandState(cmd) } catch { return false }
}

const canUndo = () => undoStack.value.length > 0
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
      <select class="tool-select" @change="setFontSize" title="字体大小">
        <option value="">字号</option>
        <option value="10px">10</option>
        <option value="11px">11</option>
        <option value="12px">12</option>
        <option value="13px">13</option>
        <option value="14px">14</option>
        <option value="16px">16</option>
        <option value="18px">18</option>
        <option value="20px">20</option>
      </select>
      <input type="color" class="tool-color" @change="setColor" title="字体颜色" value="#333333" />
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
        title="粘贴为纯文本"
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
        @focus="isFocused = true"
        @blur="isFocused = false"
        @keydown="handleKeydown"
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
  box-shadow: var(--shadow-sm);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.rich-editor-wrap.focused {
  border-color: var(--border-accent);
  background: var(--bg-card);
  box-shadow: var(--shadow-md);
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

.tool-select,
.tool-color {
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}

.tool-select {
  min-width: 72px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
  outline: none;
}

.tool-color {
  width: 34px;
  padding: 3px;
  cursor: pointer;
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
  backdrop-filter: blur(4px);
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
  box-shadow: var(--shadow-xl);
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
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.link-input:focus {
  border-color: rgba(43, 123, 184, 0.36);
  box-shadow: var(--focus-ring);
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
  transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
}

.link-cancel {
  background: var(--glass-mid);
  color: var(--text-secondary);
}

.link-cancel:hover {
  transform: translateY(-1px);
}

.link-confirm {
  background: var(--accent-blue-500);
  color: white;
  border-color: var(--accent-blue-500);
}

.link-confirm:hover:not(:disabled) {
  transform: translateY(-1px);
  background: var(--accent-blue-600);
}

.link-confirm:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
