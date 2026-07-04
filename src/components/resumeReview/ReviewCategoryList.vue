<script setup lang="ts">
import type { ReviewCategory } from '@/services/resumeReview'

defineProps<{
  title: string
  categories: ReviewCategory[]
}>()
</script>

<template>
  <section class="review-category-list">
    <header class="section-head">
      <h3>{{ title }}</h3>
      <span>{{ categories.length }} 项</span>
    </header>

    <div v-if="categories.length" class="category-rows">
      <article v-for="category in categories" :key="category.key" class="category-row">
        <div class="category-score">
          <strong>{{ category.score }}</strong>
          <span>/ {{ category.max }}</span>
        </div>

        <div class="category-body">
          <div class="category-title-row">
            <h4>{{ category.label }}</h4>
            <span v-if="category.missingHardRequirement" class="risk-tag">硬性缺口</span>
          </div>
          <dl class="category-details">
            <div>
              <dt>依据</dt>
              <dd>{{ category.evidence || '暂无明确证据' }}</dd>
            </div>
            <div>
              <dt>扣分</dt>
              <dd>{{ category.deductions || '无明显扣分项' }}</dd>
            </div>
            <div>
              <dt>建议</dt>
              <dd>{{ category.actionableAdvice || '保持当前表达' }}</dd>
            </div>
          </dl>
        </div>
      </article>
    </div>

    <p v-else class="empty-text">暂无评分项</p>
  </section>
</template>

<style scoped>
.review-category-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.section-head h3 {
  margin: 0;
  min-width: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.section-head span {
  flex: 0 0 auto;
  min-height: 24px;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
}

.category-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-row {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card-muted);
  min-width: 0;
}

.category-score {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  font-variant-numeric: tabular-nums;
}

.category-score strong {
  color: var(--text-primary);
  font-size: 25px;
  font-weight: 900;
  line-height: 1;
}

.category-score span {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
}

.category-body {
  min-width: 0;
}

.category-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.category-title-row h4 {
  margin: 0;
  min-width: 0;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.risk-tag {
  flex: 0 0 auto;
  min-height: 22px;
  padding: 2px 7px;
  border: 1px solid rgba(216, 80, 80, 0.25);
  border-radius: 7px;
  background: rgba(216, 80, 80, 0.08);
  color: var(--accent-red);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.35;
  white-space: nowrap;
}

.category-details {
  display: grid;
  gap: 5px;
  margin: 8px 0 0;
  min-width: 0;
}

.category-details div {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
}

.category-details dt {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.55;
}

.category-details dd {
  margin: 0;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.empty-text {
  margin: 0;
  padding: 22px 12px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}

@media (max-width: 560px) {
  .category-row {
    grid-template-columns: 1fr;
  }

  .category-score {
    flex-direction: row;
    align-items: baseline;
    justify-content: flex-start;
    gap: 4px;
  }

  .category-details div {
    grid-template-columns: 1fr;
    gap: 1px;
  }
}
</style>
