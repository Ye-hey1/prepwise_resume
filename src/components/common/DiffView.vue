<script setup lang="ts">
/**
 * DiffView — 文本差异对比组件
 * 支持词级别差异高亮
 */
import { computed } from 'vue'

const props = defineProps<{
  original: string
  suggested: string
  label?: string
}>()

/** 简单的词级 diff：找出新增和删除的词 */
const diffResult = computed(() => {
  const oldWords = splitWords(props.original)
  const newWords = splitWords(props.suggested)

  // 使用 LCS (最长公共子序列) 简化版找差异
  const { oldTagged, newTagged } = computeWordDiff(oldWords, newWords)

  return {
    originalHtml: renderTaggedWords(oldTagged, 'del'),
    suggestedHtml: renderTaggedWords(newTagged, 'ins'),
  }
})

/** 将文本按词分割，保留标点和空白 */
function splitWords(text: string): string[] {
  return text.split(/(\s+)/).filter((s) => s.length > 0)
}

/** 简化版词级 diff — 使用集合差集 */
function computeWordDiff(oldWords: string[], newWords: string[]) {
  // 构建词频计数
  const oldCounts = new Map<string, number>()
  const newCounts = new Map<string, number>()

  for (const w of oldWords) {
    oldCounts.set(w, (oldCounts.get(w) ?? 0) + 1)
  }
  for (const w of newWords) {
    newCounts.set(w, (newCounts.get(w) ?? 0) + 1)
  }

  // 计算交集（共同词频）
  const commonCounts = new Map<string, number>()
  for (const [word, count] of oldCounts) {
    const newCount = newCounts.get(word) ?? 0
    if (newCount > 0) {
      commonCounts.set(word, Math.min(count, newCount))
    }
  }

  // 消耗共同词，标记剩余
  const commonRemaining = new Map(commonCounts)

  const oldTagged = oldWords.map((w) => {
    const remaining = commonRemaining.get(w) ?? 0
    if (remaining > 0) {
      commonRemaining.set(w, remaining - 1)
      return { word: w, type: 'common' as const }
    }
    return { word: w, type: 'removed' as const }
  })

  const commonRemaining2 = new Map(commonCounts)
  const newTagged = newWords.map((w) => {
    const remaining = commonRemaining2.get(w) ?? 0
    if (remaining > 0) {
      commonRemaining2.set(w, remaining - 1)
      return { word: w, type: 'common' as const }
    }
    return { word: w, type: 'added' as const }
  })

  return { oldTagged, newTagged }
}

/** 将标记词渲染为 HTML */
function renderTaggedWords(
  tagged: Array<{ word: string; type: 'common' | 'removed' | 'added' }>,
  changeTag: 'del' | 'ins',
): string {
  return tagged
    .map(({ word, type }) => {
      if (type === 'common') {
        return escapeHtml(word)
      }
      return `<${changeTag}>${escapeHtml(word)}</${changeTag}>`
    })
    .join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
</script>

<template>
  <div class="diff-view">
    <div v-if="label" class="diff-label">{{ label }}</div>
    <div class="diff-grid">
      <section class="diff-block original">
        <span class="diff-block-label">原文</span>
        <p class="diff-text" v-safe-html:md="diffResult.originalHtml" />
      </section>
      <section class="diff-block suggested">
        <span class="diff-block-label">建议</span>
        <p class="diff-text" v-safe-html:md="diffResult.suggestedHtml" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.diff-view {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diff-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

.diff-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.diff-block {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.diff-block.original {
  background: color-mix(in srgb, var(--accent-red) 4%, var(--bg-card));
}

.diff-block.suggested {
  background: color-mix(in srgb, var(--accent-green) 6%, var(--bg-card));
}

.diff-block-label {
  display: inline-block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

.diff-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.diff-text :deep(del) {
  background: color-mix(in srgb, var(--accent-red) 15%, transparent);
  color: var(--accent-red);
  text-decoration: line-through;
  border-radius: 2px;
  padding: 0 1px;
}

.diff-text :deep(ins) {
  background: color-mix(in srgb, var(--accent-green) 15%, transparent);
  color: var(--accent-green);
  text-decoration: none;
  border-radius: 2px;
  padding: 0 1px;
}

@media (max-width: 768px) {
  .diff-grid {
    grid-template-columns: 1fr;
  }
}
</style>
