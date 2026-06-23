<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = withDefaults(
  defineProps<{
    left: number
    minLeft?: number
    minRight?: number
    defaultLeft?: number
  }>(),
  {
    minLeft: 300,
    minRight: 400,
    defaultLeft: 0,
  }
)

const emit = defineEmits<{
  (e: 'update:left', value: number): void
  (e: 'drag-start'): void
  (e: 'drag-end'): void
}>()

const dragging = ref(false)
const STORAGE_KEY = 'resume-builder-split-left'

function getDefaultLeft(): number {
  if (props.defaultLeft > 0) return props.defaultLeft
  return Math.floor(window.innerWidth * 0.45)
}

function loadSavedLeft(): number {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    const val = Number(saved)
    if (!isNaN(val) && val >= props.minLeft && val <= window.innerWidth - props.minRight) {
      return val
    }
  }
  return getDefaultLeft()
}

onMounted(() => {
  const saved = loadSavedLeft()
  emit('update:left', saved)
})

function onMouseDown(e: MouseEvent) {
  e.preventDefault()
  dragging.value = true
  emit('drag-start')
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const startX = e.clientX
  const startLeft = props.left

  function onMouseMove(ev: MouseEvent) {
    const delta = ev.clientX - startX
    const newLeft = Math.max(props.minLeft, Math.min(window.innerWidth - props.minRight, startLeft + delta))
    emit('update:left', newLeft)
  }

  function onMouseUp() {
    dragging.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    localStorage.setItem(STORAGE_KEY, String(props.left))
    emit('drag-end')
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onDoubleClick() {
  const defaultLeft = getDefaultLeft()
  emit('update:left', defaultLeft)
  localStorage.setItem(STORAGE_KEY, String(defaultLeft))
}
</script>

<template>
  <div
    class="split-divider"
    :class="{ dragging }"
    @mousedown="onMouseDown"
    @dblclick="onDoubleClick"
  >
    <div class="split-handle"></div>
  </div>
</template>

<style scoped>
.split-divider {
  width: 10px;
  flex: 0 0 10px;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  position: relative;
  z-index: 5;
  transition: background 0.18s ease;
}

.split-divider::before {
  content: '';
  position: absolute;
  top: 18px;
  bottom: 18px;
  width: 1px;
  background: var(--border-color);
}

.split-divider:hover,
.split-divider.dragging {
  background: rgba(43, 123, 184, 0.04);
}

.split-handle {
  width: 6px;
  height: 56px;
  border-radius: 999px;
  background: var(--gray-300);
  box-shadow: none;
  transition: background 0.18s ease, height 0.18s ease;
}

.split-divider:hover .split-handle,
.split-divider.dragging .split-handle {
  background: var(--accent-blue-500);
  height: 88px;
  box-shadow: none;
  transform: none;
}
</style>
