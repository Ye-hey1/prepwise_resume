<script setup lang="ts">
import { computed, ref } from 'vue'
import { RESUME_TEMPLATES, getTemplatesByCategoryId, getCategoryInfo, type ResumeTemplateCategory } from '@/templates/resume'
import type { ResumeTemplateDefinition } from '@/templates/resume'

defineProps<{
  modelValue: ResumeTemplateDefinition['key']
}>()

const emit = defineEmits<{
  'update:modelValue': [key: ResumeTemplateDefinition['key']]
}>()

const selectedCategory = ref<ResumeTemplateCategory | 'all'>('all')
const hoveredTemplate = ref<string | null>(null)

const categories = computed(() => [
  { id: 'all' as const, name: '全部', icon: '📋', count: RESUME_TEMPLATES.length },
  ...(import.meta.env.TEMPLATE_CATEGORIES || []),
])

const templates = computed(() => {
  if (selectedCategory.value === 'all') {
    return RESUME_TEMPLATES
  }
  return getTemplatesByCategoryId(selectedCategory.value)
})

const categoryInfo = computed(() => {
  if (selectedCategory.value === 'all') return null
  return getCategoryInfo(selectedCategory.value)
})

function selectTemplate(key: ResumeTemplateDefinition['key']) {
  emit('update:modelValue', key)
}

function getCategoryClass(categoryId: ResumeTemplateCategory | 'all'): string {
  if (categoryId === 'all') return 'category-all'
  switch (categoryId) {
    case 'ats': return 'category-ats'
    case 'tech': return 'category-tech'
    case 'product': return 'category-product'
    case 'consulting': return 'category-consulting'
    case 'academic': return 'category-academic'
    case 'medical': return 'category-medical'
    case 'management': return 'category-management'
    case 'design': return 'category-design'
    default: return ''
  }
}
</script>

<template>
  <div class="template-group-selector">
    <div class="category-bar">
      <button
        v-for="cat in categories"
        :key="cat.id"
        type="button"
        class="category-chip"
        :class="[
          { active: selectedCategory === cat.id },
          getCategoryClass(cat.id)
        ]"
        @click="selectedCategory = cat.id"
      >
        <span class="category-icon">{{ cat.icon }}</span>
        <span class="category-name">{{ cat.name }}</span>
        <span class="category-count">{{ cat.count }}</span>
      </button>
    </div>

    <div v-if="categoryInfo" class="category-description">
      <span class="category-icon">{{ categoryInfo.icon }}</span>
      <p>{{ categoryInfo.description }}</p>
    </div>

    <div class="template-grid">
      <div
        v-for="template in templates"
        :key="template.key"
        class="template-card"
        :class="{
          active: modelValue === template.key,
          hovered: hoveredTemplate === template.key
        }"
        @click="selectTemplate(template.key)"
        @mouseenter="hoveredTemplate = template.key"
        @mouseleave="hoveredTemplate = null"
      >
        <div class="template-preview">
          <img :src="template.previewImage" :alt="template.name" loading="lazy" />
          <div class="template-overlay">
            <div class="template-overlay-content">
              <span class="overlay-icon">✓</span>
              <span>已选择</span>
            </div>
          </div>
        </div>
        <div class="template-info">
          <strong class="template-name">{{ template.name }}</strong>
          <p class="template-desc">{{ template.description || '经典简历模板' }}</p>
          <div class="template-tags">
            <span v-for="tag in (template.tags || []).slice(0, 3)" :key="tag" class="tag">
              {{ tag }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-group-selector {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

.category-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.category-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-chip:hover {
  border-color: var(--accent-blue-500);
  color: var(--accent-blue-500);
  transform: translateY(-1px);
}

.category-chip.active {
  background: var(--accent-blue-500);
  color: #fff;
  border-color: var(--accent-blue-500);
  box-shadow: 0 4px 12px rgba(43, 123, 184, 0.24);
}

.category-icon {
  font-size: 16px;
}

.category-name {
  font-weight: 600;
}

.category-count {
  padding: 2px 8px;
  background: var(--bg-elevated);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.category-chip.active .category-count {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.category-description {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: color-mix(in srgb, var(--accent-blue-500) 8%, var(--bg-card));
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent-blue-500) 20%, var(--border-color));
}

.category-description .category-icon {
  font-size: 24px;
}

.category-description p {
  margin: 0;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.5;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.template-card {
  position: relative;
  padding: 12px;
  background: var(--bg-card-muted);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
}

.template-card:hover {
  border-color: var(--accent-blue-500);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(43, 123, 184, 0.12);
}

.template-card.active {
  border-color: var(--accent-blue-500);
  background: color-mix(in srgb, var(--accent-blue-500) 5%, var(--bg-card-muted));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-blue-500) 15%, transparent);
}

.template-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 210 / 297;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  margin-bottom: 12px;
}

.template-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.template-overlay {
  position: absolute;
  inset: 0;
  background: rgba(43, 123, 184, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.template-card.active .template-overlay,
.template-card.hovered .template-overlay {
  opacity: 1;
}

.template-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.overlay-icon {
  font-size: 32px;
}

.template-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.template-name {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.template-desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.template-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  padding: 3px 8px;
  background: var(--bg-elevated);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .template-group-selector {
    padding: 16px;
  }

  .category-bar {
    gap: 8px;
  }

  .category-chip {
    padding: 8px 12px;
    font-size: 12px;
  }

  .template-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
  }
}
</style>
