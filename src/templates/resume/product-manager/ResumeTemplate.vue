<script setup lang="ts">
import { computed } from 'vue'
import { iconPaths, iconViewBox, isFilledIcon, toHref, type MetaIconKey } from '../../shared/metaIcons'
import { useResumeTemplateData } from '../../shared/useResumeTemplateData'
import { useTemplateCustomization } from '../../shared/useTemplateCustomization'

const { store, hasAnyContent, lineOneMeta, lineTwoMeta, lineThreeMeta, moduleOrderStyle } = useResumeTemplateData()
const { cssVars } = useTemplateCustomization()

interface UnifiedMetaItem {
  key: string;
  icon: MetaIconKey;
  text: string;
  isLink?: boolean;
  href?: string;
  label?: string;
}

const metaLabelMap: Partial<Record<MetaIconKey, string>> = {
  phone: '电话',
  mail: '邮箱',
  wechat: '微信',
  workYears: '经验',
  status: '状态',
  location: '地区',
  currentCity: '城市',
  salary: '期望薪资',
  education: '学历',
  gender: '性别',
  user: '个人简况',
  github: 'GitHub',
  job: '职位',
  blog: '博客',
  website: '个人主页',
}

// 将所有的 Meta 数据拼合，用于打造极致紧凑的单行或双行排列
const allMetaItems = computed<UnifiedMetaItem[]>(() => {
  const mapWithLink = (item: any) => ({ ...item, isLink: false, href: '', label: metaLabelMap[item.icon as MetaIconKey] })
  const items = [...lineOneMeta.value.map(mapWithLink), ...lineTwoMeta.value.map(mapWithLink)]
  const locationText = store.basicInfo.location?.trim()
  if (locationText) {
    items.push({
      key: 'locationRaw',
      icon: 'location' as MetaIconKey,
      label: '所在地',
      text: locationText,
      isLink: false,
      href: '',
    })
  }
  // 将链接也加入进来，补充映射标签
  items.push(...lineThreeMeta.value.map(item => ({ ...item, label: metaLabelMap[item.icon as MetaIconKey] })))
  return items
})

function subLine(values: Array<string | undefined>): string {
  return values
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .join(' / ')
}
</script>

<template>
  <div class="resume-template-product-manager" :style="cssVars">
    <!-- 头部基础信息 -->
    <header class="header">
      <div class="header-main">
        <div class="name-row">
          <h1 class="name">{{ store.basicInfo.name || '姓名' }}</h1>
          <span class="job-title" v-if="store.basicInfo.jobTitle">{{ store.basicInfo.jobTitle }}</span>
        </div>
        
        <div class="meta-bar">
          <span v-for="item in allMetaItems" :key="item.key" class="meta-item">
            <span class="meta-icon-wrap">
              <svg class="meta-icon-svg" :class="{ 'meta-icon-fill': isFilledIcon(item.icon) }" :viewBox="iconViewBox[item.icon]" aria-hidden="true">
                <path v-for="(d, idx) in iconPaths[item.icon]" :key="idx" :d="d" />
              </svg>
            </span>
            <span class="meta-label-wrap" v-if="item.label">{{ item.label }}</span>
            <a v-if="'isLink' in item && item.isLink" class="meta-link" :href="item.href" target="_blank" rel="noopener noreferrer"><span class="meta-label" v-if="item.label">{{ item.label }}: </span>{{ item.text }}</a>
            <span v-else><span class="meta-label" v-if="item.label">{{ item.label }}: </span>{{ item.text }}</span>
          </span>
        </div>
      </div>

      <div class="header-avatar" v-if="store.basicInfo.avatar">
        <img :src="store.basicInfo.avatar" alt="Avatar" />
      </div>
    </header>

    <main class="content-body">
      <section v-if="store.isModuleVisible('selfIntro') && store.selfIntro" class="resume-section" :style="moduleOrderStyle('selfIntro')">
        <h2 class="section-title">个人简介</h2>
        <div class="entry-rich intro-text" v-html="store.selfIntro"></div>
      </section>

      <section
        v-if="store.isModuleVisible('workExperience') && store.workList.some((w) => w.company)"
        class="resume-section"
        :style="moduleOrderStyle('workExperience')"
      >
        <h2 class="section-title">工作经历</h2>
        <article v-for="work in store.workList" :key="work.id" class="entry" v-show="work.company">
          <div class="entry-header">
            <h3 class="entry-company">{{ work.company }}</h3>
            <span class="entry-date">{{ work.startDate }} - {{ work.endDate || '至今' }}</span>
          </div>
          <div class="entry-subtitle" v-if="subLine([work.department, work.position, work.location])">
            <strong>{{ subLine([work.department, work.position]) }}</strong>
            <span v-if="work.location" class="entry-loc"> | {{ work.location }}</span>
          </div>
          <div v-if="work.description" class="entry-rich" v-html="work.description"></div>
        </article>
      </section>

      <section
        v-if="store.isModuleVisible('projectExperience') && store.projectList.some((p) => p.name)"
        class="resume-section"
        :style="moduleOrderStyle('projectExperience')"
      >
        <h2 class="section-title">项目经历</h2>
        <article v-for="project in store.projectList" :key="project.id" class="entry" v-show="project.name">
          <div class="entry-header">
            <h3 class="entry-company">
              {{ project.name }}
              <span v-if="project.role" class="entry-role">{{ project.role }}</span>
            </h3>
            <span class="entry-date">{{ project.startDate }} - {{ project.endDate || '至今' }}</span>
          </div>
          <div class="entry-subtitle" v-if="project.link">
            <a :href="project.link" target="_blank" rel="noopener noreferrer" class="entry-link">项目链接：{{ project.link }}</a>
          </div>
          <div v-if="project.introduction || project.mainWork">
            <template v-if="project.introduction">
              <p v-if="store.showProjectSubtitles" class="project-block-title">项目介绍</p>
              <div class="entry-rich" v-html="project.introduction"></div>
            </template>
            <template v-if="project.mainWork">
              <p v-if="store.showProjectSubtitles" class="project-block-title">主要工作</p>
              <div class="entry-rich" v-html="project.mainWork"></div>
            </template>
          </div>
        </article>
      </section>

      <section
        v-if="store.isModuleVisible('education') && store.educationList.some((e) => e.school)"
        class="resume-section"
        :style="moduleOrderStyle('education')"
      >
        <h2 class="section-title">教育经历</h2>
        <article v-for="edu in store.educationList" :key="edu.id" class="entry" v-show="edu.school">
          <div class="entry-header">
            <h3 class="entry-company">{{ edu.school }}</h3>
            <span class="entry-date">{{ edu.startDate }} - {{ edu.endDate || '至今' }}</span>
          </div>
          <div class="entry-subtitle" v-if="subLine([edu.major, edu.degree, edu.college])">
            <strong>{{ subLine([edu.major, edu.degree]) }}</strong>
            <span v-if="edu.college"> | {{ edu.college }}</span>
            <span v-if="edu.location"> | {{ edu.location }}</span>
          </div>
          <div v-if="edu.description" class="entry-rich" v-html="edu.description"></div>
        </article>
      </section>

      <section v-if="store.isModuleVisible('skills') && store.skills" class="resume-section" :style="moduleOrderStyle('skills')">
        <h2 class="section-title">专业技能</h2>
        <div class="entry-rich" v-html="store.skills"></div>
      </section>

      <section
        v-if="store.isModuleVisible('awards') && store.awardList.some((a) => a.name)"
        class="resume-section"
        :style="moduleOrderStyle('awards')"
      >
        <h2 class="section-title">荣誉奖项</h2>
        <article v-for="award in store.awardList" :key="award.id" class="entry" v-show="award.name">
          <div class="entry-header">
            <h3 class="entry-company">{{ award.name }}</h3>
            <span class="entry-date">{{ award.date }}</span>
          </div>
          <div v-if="award.description" class="entry-rich" v-html="award.description"></div>
        </article>
      </section>

      <div v-if="!hasAnyContent" class="empty">
        <p>在左侧填写信息以在此预览（推荐使用简明扼要的 PM 汇报体）</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.resume-template-product-manager {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  background: #ffffff;
  color: #1e293b;
  font-family: var(--tpl-font, 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif);
  line-height: var(--tpl-line-height, 1.6);
  padding: var(--tpl-page-padding-y, 44px) var(--tpl-page-padding-x, 50px);
}

/* Header */
.header {
  display: flex;
  justify-content: var(--tpl-header-justify, space-between);
  align-items: center;
  padding-bottom: calc(var(--tpl-section-gap, 24px) * 0.6);
  margin-bottom: calc(var(--tpl-section-gap, 24px) * 0.8);
  border-bottom: 1px solid #cbd5e1;
  gap: 24px;
}

.header-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: var(--tpl-header-align, flex-start);
}

.name-row {
  display: flex;
  align-items: baseline;
  justify-content: var(--tpl-header-align, flex-start);
  gap: 16px;
  margin-bottom: 12px;
}

.name {
  margin: 0;
  font-size: 38px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.04em;
}

.job-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--tpl-primary, #0284c7);
  letter-spacing: 0.05em;
  padding-left: 16px;
  border-left: 2px solid #cbd5e1;
}

.meta-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 20px;
  align-items: center;
  justify-content: var(--tpl-header-justify, flex-start); /* 支持右对齐或平铺 */
  max-width: 100%;
}

.meta-item {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: #475569;
}

.meta-icon-wrap {
  display: var(--tpl-meta-icon-display, inline-flex);
  align-items: center;
  justify-content: center;
  margin-right: 6px;
}

.meta-label-wrap {
  display: var(--tpl-meta-label-display, none);
  font-weight: 600;
  color: #334155;
  margin-right: 6px;
}
.meta-label-wrap::after {
  content: ':';
}

.meta-icon-svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--tpl-primary, #0284c7);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.meta-icon-fill {
  fill: var(--tpl-primary, #0284c7);
  stroke: none;
}

.meta-link {
  color: #475569;
  text-decoration: none;
}

.meta-link:hover {
  color: var(--tpl-primary, #0284c7);
  text-decoration: underline;
}

.header-avatar {
  width: 90px;
  height: 116px;
  flex-shrink: 0;
  margin-left: initial;
  border-radius: var(--tpl-avatar-radius, 4px);
  display: var(--tpl-avatar-display, block);
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

.header-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Sections */
.content-body {
  display: flex;
  flex-direction: column;
  gap: var(--tpl-section-gap, 24px);
}

.resume-section {
  display: block;
}

.section-title {
  margin: var(--tpl-title-gap-top, 0) 0 var(--tpl-title-gap-bottom, 16px);
  font-size: 16px;
  font-weight: 800;
  color: var(--tpl-primary, #0f172a);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding-bottom: 8px;
  border-bottom: 2px solid #0f172a;
  display: flex;
  align-items: center;
}

.section-title::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 16px;
  background: var(--tpl-primary, #0284c7);
  margin-right: 8px;
  border-radius: 1px;
}

/* Entries */
.entry {
  margin-bottom: 16px;
}

.entry:last-child {
  margin-bottom: 0;
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 2px;
}

.entry-company {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.entry-company .entry-role {
  color: #64748b;
  font-weight: 400;
  font-size: 14px;
}

.entry-date {
  font-size: 13px;
  color: #64748b;
  font-weight: 600;
  font-family: monospace;
}

.entry-subtitle {
  margin: 0 0 6px;
  font-size: 14px;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 8px;
}

.entry-subtitle strong {
  font-weight: 600;
  color: #1e293b;
}

.entry-loc {
  color: #94a3b8;
}

.entry-link {
  color: var(--tpl-primary, #0ea5e9);
  text-decoration: none;
  font-size: 13px;
}

.entry-link:hover {
  text-decoration: underline;
}

/* Rich Text Content */
.project-block-title {
  margin-top: 6px;
  margin-bottom: 1px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 500;
}

.entry-rich {
  font-size: var(--tpl-font-size, 13px);
  line-height: var(--tpl-line-height, 1.6);
  text-align: justify;
}

.intro-text {
  font-size: var(--tpl-font-size, 14px);
  line-height: var(--tpl-line-height, 1.8);
}

:deep(.entry-rich ul) {
  margin: 4px 0 0;
  padding-left: 1.25em;
  list-style-type: disc;
}

:deep(.entry-rich ul li) {
  margin-bottom: 4px;
  padding-left: 2px;
}

:deep(.entry-rich ol) {
  margin: 4px 0 0;
  padding-left: 1.25em;
  list-style-type: decimal;
}

:deep(.entry-rich ol li) {
  margin-bottom: 4px;
}

:deep(.entry-rich li > p) {
  margin: 0;
  display: inline;
}

:deep(.entry-rich p) {
  margin: 4px 0;
}

:deep(.entry-rich strong) {
  color: #0f172a;
  font-weight: 700;
}

.empty {
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  margin-top: 40px;
  padding: 30px;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  order: 999;
}
</style>
