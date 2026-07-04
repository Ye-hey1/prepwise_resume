<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useResumeStore } from '@/stores/resume'
import { useResumeVersionsStore } from '@/stores/resumeVersions'

const resumeStore = useResumeStore()
const versionsStore = useResumeVersionsStore()

const recentResumes = computed(() => {
  const activeVersion = versionsStore.activeVersion
  const items: Array<{
    id: string
    name: string
    jobTitle: string
    updatedAt: string
    completion: number
  }> = []

  // 当前激活版本
  if (activeVersion) {
    items.push({
      id: activeVersion.id,
      name: activeVersion.name,
      jobTitle: resumeStore.basicInfo.jobTitle || '未设置目标岗位',
      updatedAt: activeVersion.updatedAt || new Date().toISOString(),
      completion: calculateCompletion(),
    })
  }

  // 其他版本
  for (const version of versionsStore.versions) {
    if (version.id !== activeVersion?.id) {
      items.push({
        id: version.id,
        name: version.name,
        jobTitle: version.targetJob || '未设置目标岗位',
        updatedAt: version.updatedAt || new Date().toISOString(),
        completion: 0, // 简化：其他版本不计算完整度
      })
    }
  }

  return items.slice(0, 5)
})

function calculateCompletion(): number {
  let count = 0
  const checks = [
    resumeStore.basicInfo.name || resumeStore.basicInfo.jobTitle,
    resumeStore.educationList.some(e => e.school || e.major),
    resumeStore.skills,
    resumeStore.workList.some(w => w.company || w.description),
    resumeStore.projectList.some(p => p.name || p.mainWork),
    resumeStore.selfIntro,
  ]
  for (const check of checks) {
    if (check) count++
  }
  return Math.round((count / checks.length) * 100)
}

function formatTime(time: string): string {
  const date = new Date(time)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return date.toLocaleDateString('zh-CN')
}

const actions = [
  { id: 'edit', label: '继续编辑', icon: '✏️' },
  { id: 'duplicate', label: '复制', icon: '📋' },
  { id: 'delete', label: '删除', icon: '🗑️' },
]
</script>

<template>
  <section class="recent-resumes">
    <div class="section-header">
      <h3>最近编辑简历</h3>
      <RouterLink :to="{ name: 'resume-editor' }" class="view-all">查看全部</RouterLink>
    </div>

    <div v-if="recentResumes.length === 0" class="empty-state">
      <span class="empty-icon">📄</span>
      <p>还没有简历，创建第一份吧</p>
      <RouterLink :to="{ name: 'resume-editor' }" class="btn-primary">
        + 新建简历
      </RouterLink>
    </div>

    <div v-else class="resume-list">
      <RouterLink
        v-for="resume in recentResumes"
        :key="resume.id"
        :to="{ name: 'resume-editor' }"
        class="resume-item"
      >
        <div class="resume-icon">📄</div>
        <div class="resume-info">
          <div class="resume-header">
            <strong class="resume-name">{{ resume.name }}</strong>
            <span class="resume-time">{{ formatTime(resume.updatedAt) }}</span>
          </div>
          <p class="resume-desc">{{ resume.jobTitle }}</p>
          <div class="resume-meta">
            <span class="completion-badge" :class="{ high: resume.completion >= 70 }">
              完整度 {{ resume.completion }}%
            </span>
          </div>
        </div>
        <div class="resume-actions">
          <button type="button" class="action-btn" title="继续编辑">✏️</button>
          <button type="button" class="action-btn" title="复制">📋</button>
        </div>
      </RouterLink>

      <RouterLink :to="{ name: 'resume-editor' }" class="resume-item add-new">
        <div class="resume-icon add-icon">+</div>
        <div class="resume-info">
          <strong class="resume-name">新建简历</strong>
          <p class="resume-desc">创建新的简历版本</p>
        </div>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.recent-resumes {
  padding: 16px;
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.view-all {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-blue-500);
  text-decoration: none;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 16px;
  text-align: center;
}

.empty-icon {
  font-size: 40px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.btn-primary {
  padding: 8px 16px;
  background: var(--accent-blue-500);
  color: #fff;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.resume-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.resume-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-card-muted);
  border-radius: 10px;
  text-decoration: none;
  transition: all 0.16s ease;
  cursor: pointer;
}

.resume-item:hover {
  background: var(--bg-elevated);
  transform: translateY(-1px);
}

.resume-item.add-new {
  border: 1px dashed var(--border-color);
  background: transparent;
}

.resume-item.add-new:hover {
  border-color: var(--accent-blue-500);
  background: color-mix(in srgb, var(--accent-blue-500) 5%, var(--bg-card));
}

.resume-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.add-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  font-size: 24px;
  color: var(--accent-blue-500);
}

.resume-info {
  flex: 1;
  min-width: 0;
}

.resume-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.resume-name {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.resume-time {
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.resume-desc {
  margin: 2px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resume-meta {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.completion-badge {
  padding: 2px 8px;
  background: var(--bg-elevated);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.completion-badge.high {
  background: color-mix(in srgb, var(--accent-green) 15%, var(--bg-card));
  color: var(--accent-green);
}

.resume-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.16s ease;
}

.resume-item:hover .resume-actions {
  opacity: 1;
}

.action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: var(--bg-elevated);
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.16s ease;
}

.action-btn:hover {
  background: var(--accent-blue-500);
}

@media (max-width: 768px) {
  .resume-item {
    padding: 10px;
  }

  .resume-actions {
    opacity: 1;
  }
}
</style>
