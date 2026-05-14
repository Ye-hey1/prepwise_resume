<script setup lang="ts">
import { computed } from 'vue'
import type { JDMatchResult } from '@/services/types/jd'

const props = defineProps<{
  matchResult: JDMatchResult | null
  isLoading: boolean
}>()

function scoreColor(score: number) {
  if (score >= 80) return 'var(--accent-green)'
  if (score >= 60) return 'var(--primary-500)'
  if (score >= 40) return '#e8a838'
  return 'var(--accent-red)'
}

const scoreLabel = computed(() => {
  if (!props.matchResult) return ''
  const total = props.matchResult.score.total
  if (total >= 80) return '高度适配'
  if (total >= 60) return '适配可提升'
  return '存在明显缺口'
})

const stats = computed(() => {
  if (!props.matchResult) return []
  const { score } = props.matchResult
  return [
    { label: '硬指标要求', value: score.mustHave },
    { label: '技术栈吻合', value: score.techStack },
    { label: '岗位职责', value: score.jobDuties },
  ]
})

const topStrengths = computed(() =>
  (props.matchResult?.strengths ?? []).slice(0, 3)
)
</script>

<template>
  <article class="match-card-modern">
    <div v-if="isLoading && !matchResult" class="skel-layout">
      <div class="skel-ring"></div>
      <div class="skel-bars">
        <div class="skel-bar w100"></div>
        <div class="skel-bar w70"></div>
        <div class="skel-bar w50"></div>
      </div>
    </div>

    <template v-else-if="matchResult">
      <div class="mc-head">
        <div class="mc-title-box">
          <h3>适配深度评估</h3>
          <span class="mc-badge">MATCH PANEL</span>
        </div>
        <p class="mc-sub">从硬指标、技术栈到岗位职责，快速判断当前简历与目标岗位的核心贴合度。</p>
      </div>

      <div class="mc-body">
        <!-- 主得分环 -->
        <div class="mc-score-ring-box">
          <div class="mc-ring">
            <svg viewBox="0 0 100 100">
              <circle class="ring-bg" cx="50" cy="50" r="45" />
              <circle class="ring-fg" cx="50" cy="50" r="45" 
                :stroke="scoreColor(matchResult.score.total)" 
                :stroke-dasharray="`${(matchResult.score.total / 100) * 283} 283`" 
              />
            </svg>
            <div class="ring-content">
              <div class="ring-val" :style="{ color: scoreColor(matchResult.score.total) }">
                {{ matchResult.score.total }}
              </div>
              <div class="ring-unit">分</div>
            </div>
          </div>
          <div class="mc-status">
            <span class="status-dot" :style="{ background: scoreColor(matchResult.score.total) }"></span>
            {{ scoreLabel }}
          </div>
        </div>

        <div class="mc-divider"></div>

        <!-- 细分指标 -->
        <div class="mc-metrics">
          <div v-for="st in stats" :key="st.label" class="metric-row">
            <span class="m-lbl">{{ st.label }}</span>
            <div class="m-track">
              <div class="m-fill" :style="{ width: `${st.value}%`, background: scoreColor(st.value) }"></div>
            </div>
            <span class="m-val">{{ st.value }}</span>
          </div>
        </div>

        <div class="mc-divider"></div>

        <!-- 核心优势 -->
        <div class="mc-strengths">
          <h4 class="str-kicker">核心匹配亮点</h4>
          <ul v-if="topStrengths.length" class="str-list">
            <li v-for="(s, i) in topStrengths" :key="i" class="str-item">
              <div class="str-icon">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <span class="str-text">{{ s }}</span>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <div v-else class="empty-state">
      <span class="empty-text">等待匹配分析完成</span>
    </div>
  </article>
</template>

<style scoped>
.match-card-modern {
  padding: 20px 24px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 120px;
}

.skel-layout {
  display: flex; align-items: center; gap: 20px; padding: 12px 0;
}
.skel-ring {
  width: 60px; height: 60px; border-radius: 50%; border: 4px solid var(--border-color); border-top-color: var(--primary-400); animation: spin 1s linear infinite; flex-shrink: 0;
}
.skel-bars { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.skel-bar { height: 6px; border-radius: 3px; background: var(--bg-card-muted); }
.w100 { width: 100%; } .w70 { width: 70%; } .w50 { width: 50%; }
@keyframes spin { 100% { transform: rotate(360deg); } }

/* Header */
.mc-head {
  display: flex; flex-direction: column; gap: 4px; border-bottom: 1px dashed var(--border-color-subtle); padding-bottom: 12px;
}
.mc-title-box { display: flex; align-items: center; gap: 8px; }
.mc-title-box h3 { margin: 0; font-size: 15px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.01em; }
.mc-badge { font-size: 9px; font-weight: 900; background: rgba(148, 163, 184, 0.1); color: var(--text-muted); padding: 2px 6px; border-radius: 4px; letter-spacing: 0.1em; }
.mc-sub { margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.5; }

/* Body Layout */
.mc-body {
  display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
}
.mc-divider {
  width: 1px; height: 60px; background: var(--border-color); opacity: 0.6;
}

/* 1. Score Ring */
.mc-score-ring-box {
  display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 110px;
}
.mc-ring {
  position: relative; width: 80px; height: 80px;
}
.mc-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: var(--bg-card-muted); stroke-width: 8; }
.ring-fg { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dasharray 1s ease-out; }
.ring-content {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.ring-val { font-size: 24px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
.ring-unit { font-size: 10px; font-weight: 700; color: var(--text-muted); margin-top: 2px; }

.mc-status {
  display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: var(--text-secondary);
}
.status-dot { width: 6px; height: 6px; border-radius: 50%; }

/* 2. Metrics Rows */
.mc-metrics {
  display: flex; flex-direction: column; gap: 12px; flex: 1; min-width: 200px;
}
.metric-row { display: flex; align-items: center; gap: 10px; }
.m-lbl { font-size: 12px; font-weight: 600; color: var(--text-muted); width: 68px; flex-shrink: 0; }
.m-track { flex: 1; height: 6px; border-radius: 3px; background: rgba(148, 163, 184, 0.1); overflow: hidden; }
.m-fill { height: 100%; border-radius: 3px; transition: width 1s ease; }
.m-val { font-size: 13px; font-weight: 800; color: var(--text-primary); width: 24px; text-align: right; font-variant-numeric: tabular-nums; }

/* 3. Strengths List */
.mc-strengths {
  flex: 1.5; min-width: 260px; display: flex; flex-direction: column; gap: 8px; justify-content: center;
}
.str-kicker { margin: 0; font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.str-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.str-item { display: flex; align-items: flex-start; gap: 8px; }
.str-icon { width: 14px; height: 14px; border-radius: 4px; background: rgba(5, 150, 105, 0.1); color: #059669; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
.str-text { font-size: 12px; color: var(--text-secondary); line-height: 1.5; font-weight: 500; }

.empty-state { display: flex; align-items: center; justify-content: center; min-height: 80px; }
.empty-text { font-size: 12px; color: var(--text-muted); font-weight: 600; }

@media (max-width: 860px) {
  .mc-divider { display: none; }
  .mc-body { flex-direction: column; align-items: stretch; gap: 16px; }
  .mc-score-ring-box { flex-direction: row; justify-content: flex-start; padding-bottom: 16px; border-bottom: 1px dashed var(--border-color-subtle); }
  .mc-strengths { padding-top: 8px; border-top: 1px dashed var(--border-color-subtle); }
}
</style>
