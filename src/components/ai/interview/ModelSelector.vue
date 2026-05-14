<script setup lang="ts">
/**
 * ModelSelector - VRM 模型选择器
 * 紧凑的横向角色卡片列表，点击选择模型
 */
import type { VrmModelInfo } from '@/config/vrmModels'

const props = defineProps<{
  /** 可选模型列表 */
  models: VrmModelInfo[]
  /** 当前选中的模型 ID */
  selectedId: string
  /** 选择器标题 */
  title?: string
}>()

const emit = defineEmits<{
  (e: 'select', model: VrmModelInfo): void
}>()

/** 取角色名首字（或前两个字母） */
function getInitial(name: string): string {
  if (/[\u4e00-\u9fff]/.test(name)) return name.slice(0, 1)
  return name.slice(0, 2).toUpperCase()
}
</script>

<template>
  <div class="model-selector">
    <div v-if="title" class="selector-title">{{ title }}</div>
    <div class="selector-grid">
      <button
        v-for="model in models"
        :key="model.id"
        class="model-chip"
        :class="{
          selected: model.id === selectedId,
          male: model.gender === 'male',
          female: model.gender === 'female',
        }"
        :title="`${model.name} · ${model.tag}`"
        @click="emit('select', model)"
      >
        <span class="chip-avatar">{{ getInitial(model.name) }}</span>
        <span class="chip-name">{{ model.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.model-selector {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.selector-title {
  font-size: 10px;
  font-weight: 700;
  color: rgba(122, 139, 160, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding-left: 2px;
}

.selector-grid {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.model-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px 4px 4px;
  border-radius: 10px;
  border: 1px solid rgba(80, 120, 180, 0.15);
  background: rgba(20, 30, 50, 0.5);
  cursor: pointer;
  transition: all 0.25s ease;
  font-family: inherit;
}

.model-chip:hover {
  background: rgba(30, 45, 70, 0.7);
  border-color: rgba(80, 120, 180, 0.3);
}

.model-chip.selected {
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.1);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.08);
}

.model-chip.selected.female {
  border-color: rgba(236, 72, 153, 0.4);
  background: rgba(236, 72, 153, 0.08);
}

.model-chip.selected.male {
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.08);
}

.chip-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  flex-shrink: 0;
}

.model-chip.female .chip-avatar {
  background: rgba(236, 72, 153, 0.15);
  color: #f472b6;
}

.model-chip.male .chip-avatar {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.model-chip.selected.female .chip-avatar {
  background: rgba(236, 72, 153, 0.25);
}

.model-chip.selected.male .chip-avatar {
  background: rgba(59, 130, 246, 0.25);
}

.chip-name {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  white-space: nowrap;
  transition: color 0.25s;
}

.model-chip:hover .chip-name {
  color: #cbd5e1;
}

.model-chip.selected .chip-name {
  color: #e2e8f0;
}
</style>
