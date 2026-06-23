<script setup lang="ts">
import { computed } from 'vue'
import { toHref } from '../../shared/metaIcons'
import { useResumeTemplateData } from '../../shared/useResumeTemplateData'
import { useTemplateCustomization } from '../../shared/useTemplateCustomization'

const { store, hasAnyContent, moduleOrderStyle, educationTitleParts, educationTags, workTitleParts, workSideParts, linkHref, dateText, dateRangeText } = useResumeTemplateData()
const { cssVars } = useTemplateCustomization()

const contactItems = computed(() => {
  const items = [
    { label: '电话', value: store.basicInfo.phone.trim() },
    { label: '邮箱', value: store.basicInfo.email.trim() },
    { label: '微信', value: store.basicInfo.wechat.trim() },
    { label: '现居', value: store.basicInfo.currentCity.trim() },
  ]

  return items.filter((item) => item.value)
})

const baseItems = computed(() => {
  const items = [
    { label: '性别', value: store.basicInfo.gender.trim() },
    { label: '年龄', value: store.basicInfo.age.trim() },
    { label: '工作年限', value: store.basicInfo.workYears.trim() },
    { label: '学历', value: store.basicInfo.educationLevel.trim() },
    { label: '所在地', value: store.basicInfo.location.trim() },
  ]

  return items.filter((item) => item.value)
})

const intentionItems = computed(() => {
  const items = [
    { label: '目标岗位', value: store.basicInfo.jobTitle.trim() },
    { label: '当前状态', value: store.basicInfo.currentStatus.trim() },
    { label: '期望城市', value: store.basicInfo.expectedLocation.trim() },
    { label: '期望薪资', value: store.basicInfo.expectedSalary.trim() },
  ]

  return items.filter((item) => item.value)
})

const linkItems = computed(() =>
  [
    { label: '个人网站', value: store.basicInfo.website.trim() },
    { label: 'GitHub', value: store.basicInfo.github.trim() },
    { label: '博客', value: store.basicInfo.blog.trim() },
  ]
    .filter((item) => item.value)
    .map((item, index) => ({
      key: `${item.label}-${index}`,
      label: item.label,
      text: item.value,
      href: toHref(item.value),
    }))
)

</script>

<template>
  <div class="resume-template-blue-split-pro" :style="cssVars">
    <aside class="left-panel">
      <div class="identity">
        <div v-if="store.basicInfo.avatar" class="avatar-wrap">
          <img :src="store.basicInfo.avatar" alt="头像" />
        </div>
        <h1 class="name">{{ store.basicInfo.name || '姓名' }}</h1>
        <p v-if="store.basicInfo.jobTitle" class="job">{{ store.basicInfo.jobTitle }}</p>
      </div>

      <section v-if="contactItems.length" class="side-block">
        <h3>联系方式</h3>
        <p v-for="item in contactItems" :key="item.label"><span>{{ item.label }}</span>{{ item.value }}</p>
      </section>

      <section v-if="baseItems.length" class="side-block">
        <h3>基础信息</h3>
        <p v-for="item in baseItems" :key="item.label"><span>{{ item.label }}</span>{{ item.value }}</p>
      </section>

      <section v-if="intentionItems.length" class="side-block">
        <h3>求职意向</h3>
        <p v-for="item in intentionItems" :key="item.label"><span>{{ item.label }}</span>{{ item.value }}</p>
      </section>

      <section v-if="linkItems.length" class="side-block">
        <h3>个人链接</h3>
        <a v-for="item in linkItems" :key="item.key" :href="item.href" target="_blank" rel="noopener noreferrer">
          <span>{{ item.label }}</span>{{ item.text }}
        </a>
      </section>
    </aside>

    <main class="right-panel">
      <section v-if="store.isModuleVisible('selfIntro') && store.selfIntro" class="resume-section" :style="moduleOrderStyle('selfIntro')">
        <h2 class="section-title">个人简介</h2>
        <div class="entry-rich" v-safe-html="store.selfIntro"></div>
      </section>

      <section
        v-if="store.isModuleVisible('education') && store.educationList.some((e) => e.school)"
        class="resume-section"
        :style="moduleOrderStyle('education')"
      >
        <h2 class="section-title">教育经历</h2>
        <article v-for="edu in store.educationList" :key="edu.id" class="entry" v-show="edu.school">
          <div class="entry-head entry-head-education">
            <p class="entry-main entry-school-line">
              <strong>{{ edu.school }}</strong>
              <span v-if="educationTags(edu).length" class="entry-tags">
                <span v-for="tag in educationTags(edu)" :key="`${edu.id}-edu-tag-${tag}`" class="entry-tag">{{ tag }}</span>
              </span>
            </p>
            <span v-if="educationTitleParts(edu).length" class="entry-inline-parts entry-education-parts">
              <span v-for="(part, partIdx) in educationTitleParts(edu)" :key="`${edu.id}-edu-title-${partIdx}`">{{ part }}</span>
            </span>
            <span class="entry-date">{{ dateRangeText(edu.startDate, edu.endDate) }}</span>
          </div>
          <div v-if="edu.description" class="entry-rich" v-safe-html="edu.description"></div>
        </article>
      </section>

      <section v-if="store.isModuleVisible('skills') && store.skills" class="resume-section" :style="moduleOrderStyle('skills')">
        <h2 class="section-title">专业技能</h2>
        <div class="entry-rich" v-safe-html="store.skills"></div>
      </section>

      <section
        v-if="store.isModuleVisible('workExperience') && store.workList.some((w) => w.company)"
        class="resume-section"
        :style="moduleOrderStyle('workExperience')"
      >
        <h2 class="section-title">工作经历</h2>
        <article v-for="work in store.workList" :key="work.id" class="entry" v-show="work.company">
          <div class="entry-head">
            <p class="entry-main entry-main-wrap">
              <strong>{{ work.company }}</strong>
              <span v-if="workTitleParts(work).length" class="entry-work-parts">
                <span v-for="(part, partIdx) in workTitleParts(work)" :key="`${work.id}-work-title-${partIdx}`">{{ part }}</span>
              </span>
            </p>
            <span class="entry-side-line">
              <span v-for="(part, partIdx) in workSideParts(work)" :key="`${work.id}-work-side-${partIdx}`">{{ part }}</span>
            </span>
          </div>
          <div v-if="work.description" class="entry-rich" v-safe-html="work.description"></div>
        </article>
      </section>

      <section
        v-if="store.isModuleVisible('projectExperience') && store.projectList.some((p) => p.name)"
        class="resume-section"
        :style="moduleOrderStyle('projectExperience')"
      >
        <h2 class="section-title">项目经历</h2>
        <article v-for="project in store.projectList" :key="project.id" class="entry" v-show="project.name">
          <div class="entry-head entry-head-project">
            <p class="entry-main entry-project-name">
              <strong>{{ project.name }}</strong>
            </p>
            <span v-if="project.role" class="entry-inline-parts entry-project-role">{{ project.role }}</span>
            <span class="entry-date">{{ dateRangeText(project.startDate, project.endDate) }}</span>
          </div>
          <p v-if="project.link" class="entry-link-row">
            <a class="entry-link" :href="linkHref(project.link)" target="_blank" rel="noopener noreferrer">项目链接：{{ project.link }}</a>
          </p>
          <div v-if="project.introduction">
            <p v-if="store.showProjectSubtitles" class="project-block-title">项目介绍</p>
            <div class="entry-rich" v-safe-html="project.introduction"></div>
          </div>
          <div v-if="project.mainWork">
            <p v-if="store.showProjectSubtitles" class="project-block-title">主要工作</p>
            <div class="entry-rich" v-safe-html="project.mainWork"></div>
          </div>
        </article>
      </section>

      <section
        v-if="store.isModuleVisible('awards') && store.awardList.some((a) => a.name)"
        class="resume-section"
        :style="moduleOrderStyle('awards')"
      >
        <h2 class="section-title">荣誉奖项</h2>
        <article v-for="award in store.awardList" :key="award.id" class="entry" v-show="award.name">
          <div class="entry-head">
            <p class="entry-main"><strong>{{ award.name }}</strong></p>
            <span class="entry-date">{{ dateText(award.date) }}</span>
          </div>
          <div v-if="award.description" class="entry-rich" v-safe-html="award.description"></div>
        </article>
      </section>

      <div v-if="!hasAnyContent" class="empty">
        <p>在左侧填写信息，这里实时预览</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* 全局动态布局引擎支持 */
:deep(.resume-header), :deep(.header) { 
  display: flex !important;
  flex-direction: var(--tpl-header-dir, row) !important;
  justify-content: var(--tpl-header-justify, space-between) !important; 
  align-items: var(--tpl-header-align-items, flex-start) !important;
}
:deep(.header-main), :deep(.name-row) { 
  display: flex !important;
  flex-direction: column !important;
  align-items: var(--tpl-header-align, flex-start) !important; 
  text-align: var(--tpl-text-align, left) !important;
}
:deep(.contact-line), :deep(.meta-bar), :deep(.contact-info) { justify-content: var(--tpl-header-align, flex-start) !important; }
:deep(.meta-icon-svg), :deep(.meta-icon-wrap) { display: var(--tpl-meta-icon-display, inline-block) !important; }
:deep(.avatar-wrap), :deep(.header-avatar) { 
  border-radius: var(--tpl-avatar-radius, 4px) !important; 
  display: var(--tpl-avatar-display, block) !important; 
  margin: var(--tpl-avatar-margin, 0) !important;
}
:deep(.meta-label) { display: var(--tpl-meta-label-display, none) !important; margin-right: 2px; }
.resume-template-blue-split-pro {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  display: grid;
  grid-template-columns: 228px 1fr;
  background: #ffffff;
  color: #0f172a;
  font-family: var(--tpl-font, 'Noto Sans SC', sans-serif);
}

.left-panel {
  background:
    radial-gradient(circle at 100% 0, rgba(255, 255, 255, 0.16) 0 120px, transparent 121px),
    linear-gradient(180deg, var(--tpl-primary, #3f71d8) 0%, var(--tpl-primary-dark, #345fc0) 56%, var(--tpl-primary-darker, #2d54ab) 100%);
  color: #e8f1ff;
  padding: var(--tpl-page-padding-y, 22px) 16px 18px;
}

.identity {
  text-align: center;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(226, 237, 255, 0.24);
}

.avatar-wrap {
  width: 96px;
  height: 118px;
  border-radius: 8px;
  overflow: hidden;
  margin: 0 auto 10px !important;
  border: 2px solid rgba(226, 237, 255, 0.42);
  background: rgba(255, 255, 255, 0.15);
}

.avatar-wrap img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: rgba(232, 241, 255, 0.82);
}

.name {
  margin: 0;
  font-size: 26px;
  line-height: 1.14;
  font-weight: 700;
  color: #f8fbff;
}

.job {
  margin: 6px 0 0;
  font-size: 13px;
  color: rgba(224, 236, 255, 0.92);
}

.side-block {
  margin-top: 14px;
}

.side-block h3 {
  margin: 0 0 7px;
  font-size: 14px;
  font-weight: 700;
  color: #f8fbff;
  letter-spacing: 0.2px;
}

.side-block p,
.side-block a {
  margin: 0 0 5px;
  display: block;
  color: rgba(232, 241, 255, 0.95);
  font-size: 12px;
  line-height: 1.45;
  text-decoration: none;
  word-break: break-all;
}

.side-block span {
  margin-right: 6px;
  color: rgba(213, 228, 255, 0.95);
}

.side-block a:hover {
  text-decoration: underline;
}

.right-panel {
  min-width: 0;
  padding: var(--tpl-page-padding-y, 18px) var(--tpl-page-padding-x, 24px) 14px;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, rgba(59, 130, 246, 0.05), rgba(59, 130, 246, 0) 120px),
    #ffffff;
}

.resume-section {
  margin-bottom: var(--tpl-section-gap, 10px);
}

.resume-section:last-of-type {
  margin-bottom: 0;
}

.section-title {
  margin: var(--tpl-title-gap-top, 0) 0 var(--tpl-title-gap-bottom, 6px);
  font-size: 16px;
  font-weight: 700;
  color: var(--tpl-primary, #2f63c4);
  line-height: 1.2;
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-title::after {
  content: '';
  flex: 1;
  min-width: 120px;
  border-top: 1px solid #d0d7e2;
  transform: translateY(1px);
  opacity: 1;
}

.entry {
  margin-bottom: 9px;
}

.entry:last-child {
  margin-bottom: 0;
}

.entry-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
}

.entry-head-education,
.entry-head-project {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: baseline;
  column-gap: 16px;
}

.entry-main {
  margin: 0;
  color: #0f172a;
  font-size: 16px;
}

.entry-main-wrap {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  row-gap: 2px;
}

.entry-main strong {
  font-size: 17px;
}

.entry-school-line {
  grid-column: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  row-gap: 4px;
}

.entry-project-name {
  grid-column: 1;
  min-width: 0;
  margin: 0;
}

.entry-education-parts {
  grid-column: 2;
  justify-self: center;
  text-align: center;
}

.entry-main span {
  color: #64748b;
  font-size: 14px;
}

.entry-work-parts {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  column-gap: 18px;
  row-gap: 2px;
  color: #64748b;
  font-size: 14px;
  font-weight: 400;
}

.entry-inline-parts {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  column-gap: 16px;
  row-gap: 2px;
  color: #64748b;
  font-size: 14px;
}

.entry-project-role {
  grid-column: 2;
  justify-self: center;
  text-align: center;
}

.entry-tags {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.entry-tag {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid rgba(47, 99, 196, 0.22);
  background: rgba(47, 99, 196, 0.08);
  color: var(--tpl-primary, #2f63c4);
  font-size: 11px !important;
  line-height: 1;
  font-weight: 700;
}

.entry-date {
  grid-column: 3;
  color: #64748b;
  font-size: 14px;
  white-space: nowrap;
  justify-self: end;
}

.entry-side-line {
  display: inline-flex;
  align-items: baseline;
  justify-content: flex-end;
  flex-wrap: wrap;
  column-gap: 12px;
  row-gap: 2px;
  color: #64748b;
  font-size: 14px;
  white-space: nowrap;
}

.entry-subline {
  margin: 2px 0 0;
  display: flex;
  flex-wrap: wrap;
  column-gap: 18px;
  row-gap: 2px;
  color: #64748b;
  font-size: 14px;
}

.entry-link-row {
  margin: 4px 0 2px;
}

.entry-link {
  color: var(--tpl-primary, #2563eb);
  text-decoration: none;
  font-size: 13px;
}

.entry-link:hover {
  text-decoration: underline;
}

.block-title {
  margin: 7px 0 2px;
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
}

.project-block-title {
  margin-top: 6px;
  margin-bottom: 1px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 500;
}

.entry-rich {
  margin-top: 2px;
  color: #0f172a;
  font-size: var(--tpl-font-size, 13px);
  line-height: var(--tpl-line-height, 1.8);
}

.empty {
  margin-top: 40px;
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  order: 999;
}

:deep(.entry-rich ul) {
  margin: 0;
  padding-left: 1.2em;
  list-style: disc;
}

:deep(.entry-rich ul li) {
  margin: 3px 0;
}

:deep(.entry-rich ol) {
  margin: 0;
  padding-left: 1.25em;
  list-style: decimal;
  list-style-position: outside;
}

:deep(.entry-rich ol li) {
  margin: 3px 0;
}

:deep(.entry-rich li > p) {
  margin: 0;
}

:deep(.entry-rich p) {
  margin: 3px 0;
}

:deep(.entry-rich a) {
  color: var(--tpl-primary, #2563eb);
  text-decoration: none;
  overflow-wrap: anywhere;
}

:deep(.entry-rich a:hover) {
  text-decoration: underline;
}

:deep(.entry-rich span[style*='font-size']) {
  line-height: inherit;
}
</style>
