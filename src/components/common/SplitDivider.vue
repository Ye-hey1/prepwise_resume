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
  width: 14px;
  flex: 0 0 14px;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, transparent, rgba(91, 111, 132, 0.05), transparent);
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
  background: linear-gradient(180deg, transparent, var(--border-color-strong), transparent);
}

.split-divider:hover,
.split-divider.dragging {
  background: linear-gradient(180deg, transparent, rgba(74, 99, 126, 0.08), transparent);
}

.split-handle {
  width: 6px;
  height: 56px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--gray-300), var(--gray-400));
  box-shadow: 0 0 0 3px var(--glass-low);
  transition: background 0.18s ease, height 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.split-divider:hover .split-handle,
.split-divider.dragging .split-handle {
  background: linear-gradient(180deg, var(--accent-blue-400), var(--accent-blue-600));
  height: 88px;
  box-shadow: 0 0 0 4px rgba(232, 238, 248, 0.92);
  transform: scaleX(1.05);
}
</style>
