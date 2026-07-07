<script setup lang="ts">
import InlineAiRichEditor from '@/components/resume/InlineAiRichEditor.vue'
import { useResumeStore } from '@/stores/resume'
import { ref } from 'vue'

const store = useResumeStore()
const collapsed = ref(false)

function buildCustomSectionAiContext(
  section: (typeof store.customSectionList)[number],
  item: (typeof store.customSectionList)[number]['items'][number],
) {
  return {
    moduleKey: 'customSections' as const,
    moduleLabel: section.title || '自定义模块',
    fieldKey: 'description',
    fieldLabel: '内容描述',
    currentText: item.description,
    entryId: item.id,
    entryTitle: [item.title, item.subtitle].filter(Boolean).join(' / '),
    entryMeta: {
      模块标题: section.title,
      条目标题: item.title,
      补充信息: item.subtitle,
      时间: item.date,
      链接: item.link,
    },
    targetJob: store.basicInfo.jobTitle?.trim() || '',
  }
}
</script>

<template>
  <section class="editor-section">
    <div class="section-header" @click="collapsed = !collapsed">
      <div class="section-toggle">
        <svg class="chevron" :class="{ rotated: !collapsed }" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h3>自定义模块</h3>
      </div>
    </div>

    <div v-show="!collapsed" class="section-body compact-section-body">
      <div
        v-for="(section, sectionIndex) in store.customSectionList"
        :key="section.id"
        class="entry-card section-card compact-entry-card"
      >
        <div class="entry-header">
          <span class="entry-index">自定义模块 {{ sectionIndex + 1 }}</span>
          <div
            v-if="store.customSectionList.length > 1"
            class="entry-actions"
            aria-label="调整自定义模块顺序"
          >
            <button
              type="button"
              class="btn-reorder"
              title="上移"
              aria-label="上移自定义模块"
              :disabled="sectionIndex === 0"
              @click.stop="store.moveCustomSection(section.id, 'up')"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 3.5L4.5 7M8 3.5L11.5 7M8 3.5V12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              class="btn-reorder"
              title="下移"
              aria-label="下移自定义模块"
              :disabled="sectionIndex === store.customSectionList.length - 1"
              @click.stop="store.moveCustomSection(section.id, 'down')"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 12.5L4.5 9M8 12.5L11.5 9M8 12.5V3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              class="btn-remove"
              title="删除"
              aria-label="删除自定义模块"
              @click.stop="store.removeCustomSection(section.id)"
            >
              x
            </button>
          </div>
        </div>

        <div class="form-grid title-grid">
          <div class="form-group span-2">
            <label class="form-label">模块标题</label>
            <input v-model="section.title" type="text" class="form-input" placeholder="例如：论文发表 / 专利成果 / 志愿经历" />
          </div>
        </div>

        <div
          v-for="(item, itemIndex) in section.items"
          :key="item.id"
          class="sub-entry-card"
        >
          <div class="sub-entry-header">
            <span class="sub-entry-index">条目 {{ itemIndex + 1 }}</span>
            <div
              v-if="section.items.length > 1"
              class="entry-actions"
              aria-label="调整条目顺序"
            >
              <button
                type="button"
                class="btn-reorder"
                title="上移"
                aria-label="上移条目"
                :disabled="itemIndex === 0"
                @click.stop="store.moveCustomSectionItem(section.id, item.id, 'up')"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 3.5L4.5 7M8 3.5L11.5 7M8 3.5V12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                class="btn-reorder"
                title="下移"
                aria-label="下移条目"
                :disabled="itemIndex === section.items.length - 1"
                @click.stop="store.moveCustomSectionItem(section.id, item.id, 'down')"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 12.5L4.5 9M8 12.5L11.5 9M8 12.5V3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                class="btn-remove"
                title="删除"
                aria-label="删除条目"
                @click.stop="store.removeCustomSectionItem(section.id, item.id)"
              >
                x
              </button>
            </div>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">条目标题</label>
              <input v-model="item.title" type="text" class="form-input" placeholder="例如：论文题目 / 专利名称 / 活动名称" />
            </div>
            <div class="form-group">
              <label class="form-label">补充信息</label>
              <input v-model="item.subtitle" type="text" class="form-input" placeholder="例如：作者 / 角色 / 发布平台 / 级别" />
            </div>
            <div class="form-group">
              <label class="form-label">时间</label>
              <input v-model="item.date" type="month" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label">链接</label>
              <input v-model="item.link" type="url" class="form-input" placeholder="例如：https://example.com" />
            </div>
          </div>

          <div class="form-group form-group-full">
            <InlineAiRichEditor
              v-model="item.description"
              :rows="3"
              label="内容描述"
              placeholder="用简洁条目说明背景、你的角色、成果或可验证信息..."
              :context="buildCustomSectionAiContext(section, item)"
            />
          </div>
        </div>

        <button class="btn-add sub-add-btn" @click="store.addCustomSectionItem(section.id)">
          <span class="btn-add-icon">+</span>
          添加条目
        </button>
      </div>

      <button class="btn-add compact-add-btn" @click="store.addCustomSection()">
        <span class="btn-add-icon">+</span>
        添加自定义模块
      </button>
    </div>
  </section>
</template>

<style scoped>
.editor-section {
  margin-bottom: var(--spacing-lg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  overflow: hidden;
  transition: border-color var(--transition-base);
}

.editor-section:hover {
  border-color: var(--border-color-strong);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg) var(--spacing-xl);
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast);
}

.section-header:hover {
  background: var(--gray-50);
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.section-toggle h3 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.chevron {
  color: var(--text-secondary);
  transition: transform var(--transition-base);
  transform: rotate(0deg);
}

.chevron.rotated {
  transform: rotate(90deg);
}

.section-body {
  padding: 0 var(--spacing-xl) var(--spacing-xl);
}

.entry-card {
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  background: var(--gray-50);
  border-radius: var(--radius-md);
  border: 1px solid var(--gray-100);
}

.section-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.entry-header,
.sub-entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.entry-index {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--primary-600);
}

.sub-entry-index {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.entry-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-reorder,
.btn-remove {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-reorder:hover:not(:disabled) {
  border-color: var(--primary-300);
  background: var(--primary-50);
  color: var(--primary-600);
}

.btn-reorder:disabled {
  color: var(--gray-400);
  background: var(--gray-100);
  border-color: transparent;
}

.btn-remove {
  font-size: 0.72rem;
  font-weight: 700;
}

.btn-remove:hover {
  border-color: var(--accent-red);
  background: rgba(216, 80, 80, 0.08);
  color: var(--accent-red);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--spacing-md) var(--spacing-lg);
}

.title-grid {
  margin-bottom: 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-group-full {
  margin-top: var(--spacing-md);
}

.span-2 {
  grid-column: span 2;
}

.form-label {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-input {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  color: var(--text-primary);
  background: var(--bg-card);
  transition: all var(--transition-fast);
  outline: none;
}

.form-input:focus {
  border-color: var(--primary-400);
}

.form-input::placeholder {
  color: var(--gray-400);
}

.sub-entry-card {
  padding: 14px 0 0;
  border-top: 1px solid rgba(100, 120, 150, 0.12);
}

.sub-entry-header {
  margin-bottom: var(--spacing-md);
}

.btn-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-md);
  border: 2px dashed var(--primary-200);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--primary-600);
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sub-add-btn {
  min-height: 36px;
  padding: 0 12px;
}

.btn-add:hover {
  background: var(--primary-50);
  border-color: var(--primary-400);
}

.btn-add-icon {
  font-size: 1.1rem;
  font-weight: 700;
}
</style>
