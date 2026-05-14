<script setup lang="ts">
import type {
  ResumeAssistantAdviceItem,
  ResumeAssistantExampleItem,
  ResumeAssistantMaterialItem,
  ResumeAssistantTabKey,
} from '@/services/types/resumeAssistant'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const MOBILE_BREAKPOINT = 768
const DESKTOP_PANEL_WIDTH = 600
const VIEWPORT_GAP = 12
const ANIMATION_MS = 180

const props = defineProps<{
  visible: boolean
  anchorEl?: HTMLElement | null
  busy?: boolean
  error?: string
  examples: ResumeAssistantExampleItem[]
  advice: ResumeAssistantAdviceItem[]
  materials: ResumeAssistantMaterialItem[]
}>()

const emit = defineEmits<{
  close: []
  refreshExamples: []
  refreshAdvice: []
  saveMaterial: []
  applyExample: [text: string, mode: 'replace' | 'append']
  applyMaterial: [text: string, mode: 'replace' | 'append']
  copyText: [text: string]
  removeMaterial: [id: string]
}>()

const panelRef = ref<HTMLElement | null>(null)
const activeTab = ref<ResumeAssistantTabKey>('examples')
const keyword = ref('')
const selectedTag = ref('')
const panelStyle = ref<Record<string, string>>({})
const placement = ref<'right' | 'left' | 'mobile'>('right')
const rendered = ref(false)
const visibleState = ref(false)
let animationTimer: number | null = null

const allTags = computed(() => {
  const source = activeTab.value === 'materials' ? props.materials : props.examples
  return Array.from(new Set(source.flatMap((item) => item.tags || []))).slice(0, 12)
})

const filteredExamples = computed(() => props.examples.filter((item) => {
  const matchesKeyword = !keyword.value || `${item.text} ${(item.tags || []).join(' ')}`.toLowerCase().includes(keyword.value.toLowerCase())
  const matchesTag = !selectedTag.value || item.tags.includes(selectedTag.value)
  return matchesKeyword && matchesTag
}))

const filteredMaterials = computed(() => props.materials.filter((item) => {
  const matchesKeyword = !keyword.value || `${item.title} ${item.content} ${(item.tags || []).join(' ')}`.toLowerCase().includes(keyword.value.toLowerCase())
  const matchesTag = !selectedTag.value || item.tags.includes(selectedTag.value)
  return matchesKeyword && matchesTag
}))

function switchTab(tab: ResumeAssistantTabKey) {
  activeTab.value = tab
  keyword.value = ''
  selectedTag.value = ''
}

function clearAnimationTimer() {
  if (animationTimer !== null) {
    window.clearTimeout(animationTimer)
    animationTimer = null
  }
}

function openPanel() {
  clearAnimationTimer()
  rendered.value = true
  visibleState.value = false
  nextTick(() => {
    updatePosition()
    requestAnimationFrame(() => {
      visibleState.value = true
    })
  })
}

function closePanel() {
  visibleState.value = false
  clearAnimationTimer()
  animationTimer = window.setTimeout(() => {
    rendered.value = false
  }, ANIMATION_MS)
}

function requestClose() {
  emit('close')
}

function updatePosition() {
  if (!props.visible) return
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    placement.value = 'mobile'
    panelStyle.value = {}
    return
  }

  const anchor = props.anchorEl
  const panel = panelRef.value
  if (!anchor || !panel) return

  const rect = anchor.getBoundingClientRect()
  const panelRect = panel.getBoundingClientRect()
  const availableHeight = window.innerHeight - VIEWPORT_GAP * 2
  const panelWidth = Math.min(DESKTOP_PANEL_WIDTH, window.innerWidth - VIEWPORT_GAP * 2)
  const panelHeight = Math.min(availableHeight, Math.max(panelRect.height || 0, 480))

  let left = rect.right + VIEWPORT_GAP
  let nextPlacement: 'right' | 'left' = 'right'

  if (left + panelWidth > window.innerWidth - VIEWPORT_GAP) {
    left = rect.left - panelWidth - VIEWPORT_GAP
    nextPlacement = 'left'
  }

  left = Math.max(VIEWPORT_GAP, Math.min(left, window.innerWidth - panelWidth - VIEWPORT_GAP))

  let top = rect.top
  const maxTop = Math.max(VIEWPORT_GAP, window.innerHeight - panelHeight - VIEWPORT_GAP)
  top = Math.max(VIEWPORT_GAP, Math.min(top, maxTop))

  placement.value = nextPlacement
  panelStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(panelWidth)}px`,
    maxHeight: `${Math.round(window.innerHeight - VIEWPORT_GAP * 2)}px`,
  }
}

function handlePointerDown(event: MouseEvent) {
  if (!props.visible) return
  const target = event.target as Node | null
  if (!target) return
  const panel = panelRef.value
  const anchor = props.anchorEl
  if (panel?.contains(target) || anchor?.contains(target)) return
  requestClose()
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.visible) return
  if (event.key === 'Escape') requestClose()
}

function handleViewportChange() {
  if (!props.visible) return
  const anchor = props.anchorEl
  if (!anchor) {
    requestClose()
    return
  }

  const rect = anchor.getBoundingClientRect()
  if (window.innerWidth > MOBILE_BREAKPOINT && (rect.bottom < 0 || rect.top > window.innerHeight)) {
    requestClose()
    return
  }

  updatePosition()
}

watch(() => props.visible, (visible) => {
  if (visible) {
    openPanel()
    return
  }
  closePanel()
}, { immediate: true })

watch(() => props.anchorEl, () => {
  if (!props.visible) return
  nextTick(() => {
    updatePosition()
  })
})

watch(() => [props.examples.length, props.advice.length, props.materials.length, props.busy, props.error, activeTab.value], () => {
  if (!props.visible) return
  nextTick(() => {
    updatePosition()
  })
})

watch(rendered, (value) => {
  if (value) {
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return
  }

  document.removeEventListener('mousedown', handlePointerDown)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})

onBeforeUnmount(() => {
  clearAnimationTimer()
  document.removeEventListener('mousedown', handlePointerDown)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="rendered" class="assistant-overlay" :class="{ mobile: placement === 'mobile' }">
      <section
        ref="panelRef"
        class="assistant-popover"
        :class="[
          placement,
          { entering: visibleState, leaving: !visibleState },
        ]"
        :style="placement === 'mobile' ? undefined : panelStyle"
        role="dialog"
        aria-modal="true"
        aria-label="简历助手"
      >
        <div class="assistant-panel">
          <div class="assistant-header">
            <div>
              <h3 class="assistant-title">简历助手</h3>
              <p class="assistant-subtitle">围绕当前字段提供例句、建议和可复用素材</p>
            </div>
            <button type="button" class="close-btn" @click="requestClose">×</button>
          </div>

          <div class="assistant-body">
            <div class="tab-row">
              <button type="button" class="tab-btn" :class="{ active: activeTab === 'examples' }" @click="switchTab('examples')">精选例句</button>
              <button type="button" class="tab-btn" :class="{ active: activeTab === 'advice' }" @click="switchTab('advice')">简历建议</button>
              <button type="button" class="tab-btn" :class="{ active: activeTab === 'materials' }" @click="switchTab('materials')">我的素材</button>
            </div>

            <div v-if="activeTab !== 'advice'" class="toolbar">
              <input v-model="keyword" class="search-input" type="text" placeholder="搜索关键词或标签" />
              <button v-if="activeTab === 'examples'" type="button" class="action-btn" :disabled="busy" @click="emit('refreshExamples')">刷新例句</button>
              <button v-if="activeTab === 'materials'" type="button" class="action-btn" @click="emit('saveMaterial')">保存当前内容</button>
            </div>

            <div v-if="activeTab !== 'advice' && allTags.length" class="tag-row">
              <button type="button" class="tag-chip" :class="{ active: !selectedTag }" @click="selectedTag = ''">全部</button>
              <button v-for="tag in allTags" :key="tag" type="button" class="tag-chip" :class="{ active: selectedTag === tag }" @click="selectedTag = tag">{{ tag }}</button>
            </div>

            <p v-if="busy" class="status-text">AI 正在生成内容，请稍候...</p>
            <p v-else-if="error" class="error-text">{{ error }}</p>

            <template v-else>
              <div v-if="activeTab === 'examples'" class="list-block">
                <div v-if="filteredExamples.length === 0" class="empty-text">暂无匹配例句，可尝试刷新或更换搜索条件。</div>
                <div v-for="item in filteredExamples" :key="item.id" class="card-item">
                  <div v-if="item.tone || item.highlight || item.source === 'builtin'" class="meta-row">
                    <span v-if="item.source === 'builtin'" class="meta-chip builtin">精选</span>
                    <span v-if="item.tone" class="meta-chip">{{ item.tone }}</span>
                    <span v-if="item.highlight" class="meta-chip">{{ item.highlight }}</span>
                  </div>
                  <p class="content-text">{{ item.text }}</p>
                  <div v-if="item.tags.length" class="tag-list">
                    <span v-for="tag in item.tags" :key="tag" class="inline-tag">{{ tag }}</span>
                  </div>
                  <div class="action-row">
                    <button type="button" class="mini-btn" @click="emit('applyExample', item.text, 'replace')">替换</button>
                    <button type="button" class="mini-btn ghost" @click="emit('applyExample', item.text, 'append')">追加</button>
                    <button type="button" class="mini-btn ghost" @click="emit('copyText', item.text)">复制</button>
                  </div>
                </div>
              </div>

              <div v-else-if="activeTab === 'advice'" class="list-block">
                <div class="toolbar compact">
                  <button type="button" class="action-btn" :disabled="busy" @click="emit('refreshAdvice')">刷新建议</button>
                </div>
                <div v-if="advice.length === 0" class="empty-text">当前还没有建议，点击“刷新建议”即可生成。</div>
                <div v-for="item in advice" :key="item.id" class="card-item advice-item">
                  <div class="advice-title">{{ item.title }}</div>
                  <div class="advice-row"><span class="label">问题：</span>{{ item.problem }}</div>
                  <div class="advice-row"><span class="label">建议：</span>{{ item.suggestion }}</div>
                  <div v-if="item.example" class="advice-row"><span class="label">示例：</span>{{ item.example }}</div>
                </div>
              </div>

              <div v-else class="list-block">
                <div v-if="filteredMaterials.length === 0" class="empty-text">还没有保存的素材，可以把当前内容先存进来喵～</div>
                <div v-for="item in filteredMaterials" :key="item.id" class="card-item">
                  <div class="material-head">
                    <div class="material-title">{{ item.title }}</div>
                    <button type="button" class="text-btn" @click="emit('removeMaterial', item.id)">删除</button>
                  </div>
                  <p class="content-text">{{ item.content }}</p>
                  <div v-if="item.tags.length" class="tag-list">
                    <span v-for="tag in item.tags" :key="tag" class="inline-tag">{{ tag }}</span>
                  </div>
                  <div class="action-row">
                    <button type="button" class="mini-btn" @click="emit('applyMaterial', item.content, 'replace')">替换</button>
                    <button type="button" class="mini-btn ghost" @click="emit('applyMaterial', item.content, 'append')">追加</button>
                    <button type="button" class="mini-btn ghost" @click="emit('copyText', item.content)">复制</button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.assistant-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  pointer-events: none;
}

.assistant-popover {
  position: fixed;
  pointer-events: auto;
  z-index: 1201;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.assistant-popover.entering {
  opacity: 1;
}

.assistant-popover.leaving {
  opacity: 0;
}

.assistant-popover.right.entering,
.assistant-popover.right.leaving {
  transform-origin: top left;
}

.assistant-popover.left.entering,
.assistant-popover.left.leaving {
  transform-origin: top right;
}

.assistant-popover.right.entering,
.assistant-popover.left.entering {
  transform: translateX(0) scale(1);
}

.assistant-popover.right.leaving {
  transform: translateX(10px) scale(0.98);
}

.assistant-popover.left.leaving {
  transform: translateX(-10px) scale(0.98);
}

.assistant-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(100, 120, 150, 0.14);
  border-radius: 22px;
  background: var(--bg-card);
  box-shadow: 0 22px 48px rgba(40, 35, 30, 0.2);
  backdrop-filter: blur(10px);
  min-height: 320px;
  height: 100%;
  overflow: hidden;
}

.assistant-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding-right: 4px;
}

.assistant-body::-webkit-scrollbar {
  width: 8px;
}

.assistant-body::-webkit-scrollbar-thumb {
  background: rgba(100, 120, 150, 0.24);
  border-radius: 999px;
}

.assistant-body::-webkit-scrollbar-track {
  background: transparent;
}

.assistant-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.assistant-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.assistant-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.close-btn,
.tab-btn,
.action-btn,
.tag-chip,
.mini-btn,
.text-btn {
  cursor: pointer;
}

.close-btn {
  width: 30px;
  height: 30px;
  border: 1px solid rgba(100, 120, 150, 0.12);
  border-radius: 10px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 18px;
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.close-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
  transform: translateY(-1px);
}

.tab-row,
.tag-row,
.action-row,
.meta-row,
.tag-list,
.material-head {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-btn {
  padding: 8px 12px;
  border: 1px solid rgba(100, 120, 150, 0.16);
  border-radius: 999px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.tab-btn.active,
.tag-chip.active {
  background: var(--accent-blue-500);
  color: #ffffff;
  border-color: var(--accent-blue-500);
}

.toolbar {
  display: flex;
  gap: 10px;
}

.toolbar.compact {
  justify-content: flex-end;
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgba(100, 120, 150, 0.16);
  border-radius: 10px;
  background: var(--surface-white);
  color: var(--text-primary);
  font-size: 12px;
}

.action-btn,
.mini-btn {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--accent-blue-500);
  background: var(--accent-blue-500);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
}

.mini-btn.ghost,
.text-btn,
.tag-chip {
  border: 1px solid rgba(100, 120, 150, 0.16);
  background: var(--bg-card-muted);
  color: var(--text-secondary);
}

.text-btn {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--accent-red);
  font-size: 12px;
}

.tag-chip,
.inline-tag,
.meta-chip {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.inline-tag,
.meta-chip {
  background: rgba(43, 123, 184, 0.1);
  color: var(--accent-blue-600);
}

.meta-chip.builtin {
  background: rgba(46, 158, 90, 0.12);
  color: #238048;
}

.list-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-item {
  padding: 12px;
  border: 1px solid rgba(100, 120, 150, 0.14);
  border-radius: 14px;
  background: var(--bg-card-muted);
}

.content-text,
.status-text,
.error-text,
.empty-text,
.advice-row {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
}

.content-text {
  color: var(--text-primary);
}

.status-text,
.empty-text {
  color: var(--text-secondary);
}

.error-text {
  color: var(--accent-red);
}

.advice-title,
.material-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.label {
  font-weight: 700;
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .assistant-overlay {
    background: rgba(24, 28, 34, 0.22);
    backdrop-filter: blur(6px);
    pointer-events: auto;
  }

  .assistant-popover {
    inset: 0 !important;
    transform: none !important;
  }

  .assistant-popover.entering,
  .assistant-popover.leaving {
    transform: none !important;
  }

  .assistant-panel {
    height: 100%;
    min-height: 100%;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }
}
</style>
