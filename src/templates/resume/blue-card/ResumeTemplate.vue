<script setup lang="ts">
import { iconPaths, iconViewBox, isFilledIcon } from '../../shared/metaIcons'
import { useResumeTemplateData } from '../../shared/useResumeTemplateData'
import { useTemplateCustomization } from '../../shared/useTemplateCustomization'

const { store, hasAnyContent, lineOneMeta, lineTwoMeta, lineThreeMeta, moduleOrderStyle, educationTitleParts, educationTags, workTitleParts, workSideParts, hasPersonalWorkContent, hasTrainingContent, trainingMetaParts, hasCustomSectionContent, hasCustomSectionItemContent, customItemMetaParts, linkHref, dateText, dateRangeText } = useResumeTemplateData()
const { cssVars } = useTemplateCustomization()
</script>

<template>
  <div class="resume-template-blue-card" :style="cssVars">
    <header v-if="store.isModuleVisible('basicInfo')" class="resume-header">
      <div class="header-main">
        <h1 class="name">{{ store.basicInfo.name || '姓名' }}</h1>

        <div v-if="lineOneMeta.length" class="contact-line">
          <span v-for="item in lineOneMeta" :key="item.key" class="meta-item">
            <svg
              class="meta-icon-svg"
              :class="{ 'meta-icon-fill': isFilledIcon(item.icon) }"
              :viewBox="iconViewBox[item.icon]"
              aria-hidden="true"
            >
              <path v-for="(d, idx) in iconPaths[item.icon]" :key="`${item.key}-${idx}`" :d="d" />
            </svg>
            <span class="meta-label" v-if="item.label">{{ item.label }}: </span>{{ item.text }}
          </span>
        </div>

        <div v-if="lineTwoMeta.length" class="contact-line">
          <span v-for="item in lineTwoMeta" :key="item.key" class="meta-item">
            <svg
              class="meta-icon-svg"
              :class="{ 'meta-icon-fill': isFilledIcon(item.icon) }"
              :viewBox="iconViewBox[item.icon]"
              aria-hidden="true"
            >
              <path v-for="(d, idx) in iconPaths[item.icon]" :key="`${item.key}-${idx}`" :d="d" />
            </svg>
            <span class="meta-label" v-if="item.label">{{ item.label }}: </span>{{ item.text }}
          </span>
        </div>

        <div v-if="lineThreeMeta.length" class="contact-line">
          <span v-for="item in lineThreeMeta" :key="item.key" class="meta-item">
            <svg
              class="meta-icon-svg"
              :class="{ 'meta-icon-fill': isFilledIcon(item.icon) }"
              :viewBox="iconViewBox[item.icon]"
              aria-hidden="true"
            >
              <path v-for="(d, idx) in iconPaths[item.icon]" :key="`${item.key}-${idx}`" :d="d" />
            </svg>
            <a v-if="item.isLink" class="meta-link" :href="item.href" target="_blank" rel="noopener noreferrer"><span class="meta-label" v-if="item.label">{{ item.label }}: </span>{{ item.text }}</a>
            <span v-else><span class="meta-label" v-if="item.label">{{ item.label }}: </span>{{ item.text }}</span>
          </span>
        </div>
      </div>

      <div v-if="store.basicInfo.avatar" class="avatar-wrap">
        <img :src="store.basicInfo.avatar" alt="头像" />
      </div>
    </header>

    <section
      v-if="store.isModuleVisible('education') && store.educationList.some((e) => e.school)"
      class="resume-section"
      :style="moduleOrderStyle('education')"
    >
      <h2 class="section-title"><span class="section-badge">教育经历</span><span class="section-line"></span></h2>
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
      <h2 class="section-title"><span class="section-badge">专业技能</span><span class="section-line"></span></h2>
      <div class="entry-rich" v-safe-html="store.skills"></div>
    </section>

    <section
      v-if="store.isModuleVisible('workExperience') && store.workList.some((w) => w.company)"
      class="resume-section"
      :style="moduleOrderStyle('workExperience')"
    >
      <h2 class="section-title"><span class="section-badge">工作经历</span><span class="section-line"></span></h2>
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
      <h2 class="section-title"><span class="section-badge">项目经历</span><span class="section-line"></span></h2>
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
      v-if="store.isModuleVisible('personalWorks') && store.personalWorkList.some(hasPersonalWorkContent)"
      class="resume-section"
      :style="moduleOrderStyle('personalWorks')"
    >
      <h2 class="section-title"><span class="section-badge">个人作品</span><span class="section-line"></span></h2>
      <article v-for="work in store.personalWorkList" :key="work.id" class="entry" v-show="hasPersonalWorkContent(work)">
        <div class="entry-head">
          <p class="entry-main entry-main-wrap">
            <strong>{{ work.name || '未命名作品' }}</strong>
            <span v-if="work.type" class="entry-work-parts"><span>{{ work.type }}</span></span>
            <span v-if="work.techStack" class="entry-work-parts"><span>{{ work.techStack }}</span></span>
          </p>
        </div>
        <p v-if="work.link" class="entry-link-row">
          <a class="entry-link" :href="linkHref(work.link)" target="_blank" rel="noopener noreferrer">作品链接：{{ work.link }}</a>
        </p>
        <div v-if="work.description" class="entry-rich" v-safe-html="work.description"></div>
        <div v-if="work.contribution">
          <p v-if="store.showProjectSubtitles" class="project-block-title">我的贡献</p>
          <div class="entry-rich" v-safe-html="work.contribution"></div>
        </div>
        <div v-if="work.outcome">
          <p v-if="store.showProjectSubtitles" class="project-block-title">成果数据</p>
          <div class="entry-rich" v-safe-html="work.outcome"></div>
        </div>
      </article>
    </section>

    <section
      v-if="store.isModuleVisible('awards') && store.awardList.some((a) => a.name)"
      class="resume-section"
      :style="moduleOrderStyle('awards')"
    >
      <h2 class="section-title"><span class="section-badge">荣誉奖项</span><span class="section-line"></span></h2>
      <article v-for="award in store.awardList" :key="award.id" class="entry" v-show="award.name">
        <div class="entry-head">
          <p class="entry-main"><strong>{{ award.name }}</strong></p>
          <span class="entry-date">{{ dateText(award.date) }}</span>
        </div>
        <div v-if="award.description" class="entry-rich" v-safe-html="award.description"></div>
      </article>
    </section>

    <section
      v-if="store.isModuleVisible('trainingExperience') && store.trainingList.some(hasTrainingContent)"
      class="resume-section"
      :style="moduleOrderStyle('trainingExperience')"
    >
      <h2 class="section-title"><span class="section-badge">培训经历</span><span class="section-line"></span></h2>
      <article v-for="training in store.trainingList" :key="training.id" class="entry" v-show="hasTrainingContent(training)">
        <div class="entry-head">
          <p class="entry-main entry-main-wrap">
            <strong>{{ training.institution || training.course || '培训经历' }}</strong>
            <span v-if="training.course && training.institution" class="entry-work-parts"><span>{{ training.course }}</span></span>
            <span v-for="(part, partIdx) in trainingMetaParts(training)" :key="`${training.id}-training-meta-${partIdx}`" class="entry-work-parts"><span>{{ part }}</span></span>
          </p>
        </div>
        <div v-if="training.description" class="entry-rich" v-safe-html="training.description"></div>
        <div v-if="training.outcome">
          <p v-if="store.showProjectSubtitles" class="project-block-title">成果收获</p>
          <div class="entry-rich" v-safe-html="training.outcome"></div>
        </div>
      </article>
    </section>

    <section
      v-for="section in store.customSectionList"
      v-show="store.isModuleVisible('customSections') && hasCustomSectionContent(section)"
      :key="section.id"
      class="resume-section"
      :style="moduleOrderStyle('customSections')"
    >
      <h2 class="section-title"><span class="section-badge">{{ section.title || '自定义模块' }}</span><span class="section-line"></span></h2>
      <article v-for="item in section.items" :key="item.id" class="entry" v-show="hasCustomSectionItemContent(item)">
        <div class="entry-head">
          <p class="entry-main entry-main-wrap">
            <strong>{{ item.title || '未命名条目' }}</strong>
            <span v-for="(part, partIdx) in customItemMetaParts(item)" :key="`${item.id}-custom-meta-${partIdx}`" class="entry-work-parts"><span>{{ part }}</span></span>
          </p>
        </div>
        <p v-if="item.link" class="entry-link-row">
          <a class="entry-link" :href="linkHref(item.link)" target="_blank" rel="noopener noreferrer">相关链接：{{ item.link }}</a>
        </p>
        <div v-if="item.description" class="entry-rich" v-safe-html="item.description"></div>
      </article>
    </section>

    <section
      v-if="store.isModuleVisible('selfIntro') && store.selfIntro"
      class="resume-section"
      :style="moduleOrderStyle('selfIntro')"
    >
      <h2 class="section-title"><span class="section-badge">个人简介</span></h2>
      <div class="entry-rich" v-safe-html="store.selfIntro"></div>
    </section>

    <div v-if="!hasAnyContent" class="empty">
      <p>在左侧填写信息，这里实时预览</p>
    </div>
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
.resume-template-blue-card {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  padding: var(--tpl-page-padding-y, 28px) var(--tpl-page-padding-x, 24px);
  color: #000;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  font-family: var(--tpl-font, 'Noto Sans SC', sans-serif);
}

/* ─── Header ─── */
.resume-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 12px;
  order: 0;
}

.header-main {
  flex: 1;
}

.name {
  font-size: 26px;
  line-height: 1.1;
  color: #1a1a1a;
  margin-bottom: 10px;
  text-align: center;
}

.contact-line {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  column-gap: 14px;
  row-gap: 7px;
  color: #333;
  font-size: 14px;
  line-height: 1.35;
  margin-bottom: 6px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  line-height: 1.25;
}

.meta-link {
  color: #2563eb;
  text-decoration: none;
}

.meta-link:hover {
  color: #1d4ed8;
  text-decoration: underline;
}

.meta-icon-svg {
  display: block;
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--tpl-primary, #3b82f6);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
  margin-top: 1px;
}

.meta-icon-fill {
  fill: var(--tpl-primary, #3b82f6);
  stroke: none;
}

/* ─── Avatar ─── */
.avatar-wrap {
  width: 84px;
  height: 104px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #dbe1ea;
  flex-shrink: 0;
}

.avatar-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ─── Section ─── */
.resume-section {
  margin-bottom: var(--tpl-section-gap, 10px);
}

.resume-section:last-of-type {
  margin-bottom: 0;
}

/* ─── Section Title — Blue Pill Badge ─── */
.section-title {
  margin: var(--tpl-title-gap-top, 0) 0 var(--tpl-title-gap-bottom, 8px);
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: flex-end;
  gap: 0;
}

.section-badge {
  display: inline-block;
  background: var(--tpl-primary, #2855a0);
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  padding: 6px 18px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.section-line {
  flex: 1;
  height: 0;
  border-top: 1px solid #d0d7e2;
  margin-left: 0;
  margin-bottom: 1px;
}

/* ─── Entry ─── */
.entry {
  margin-bottom: 8px;
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
  display: flex;
  align-items: baseline;
  gap: 10px;
  color: #000;
  font-size: 16px;
}

.entry-main-wrap {
  flex-wrap: wrap;
  column-gap: 16px;
  row-gap: 4px;
}

.entry-main strong {
  font-size: 17px;
}

.entry-main span {
  font-size: 14px;
  color: rgb(148, 163, 184);
}

.entry-school-line {
  grid-column: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
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

.entry-project-role {
  grid-column: 2;
  justify-self: center;
  text-align: center;
}

.entry-inline-parts {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  column-gap: 16px;
  row-gap: 2px;
}

.entry-work-parts {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  column-gap: 18px;
  row-gap: 2px;
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
  border: 1px solid rgba(59, 130, 246, 0.22);
  background: rgba(59, 130, 246, 0.08);
  color: var(--tpl-primary, #3b82f6);
  font-size: 11px !important;
  line-height: 1;
  font-weight: 700;
}

.entry-date {
  grid-column: 3;
  color: #94a3b8;
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
  color: #94a3b8;
  font-size: 14px;
  white-space: nowrap;
}

.project-block-title {
  margin-top: 8px;
  margin-bottom: 2px;
  color: #000;
  font-size: 14px;
  font-weight: 700;
}

.entry-link-row {
  margin-top: 2px;
  margin-bottom: 2px;
}

.entry-link {
  color: var(--tpl-primary, #3b82f6);
  font-size: 14px;
  text-decoration: none;
}

.entry-link:hover {
  text-decoration: underline;
}

/* ─── Rich Text ─── */
.project-block-title {
  margin-top: 6px;
  margin-bottom: 1px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 500;
}

.entry-rich {
  margin-top: 3px;
  color: #000;
  font-size: var(--tpl-font-size, 12px);
  line-height: var(--tpl-line-height, 1.75);
}

.empty {
  margin-top: 40px;
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  order: 999;
}

/* ─── Deep selectors for rich content ─── */
:deep(.entry-rich ul) {
  margin: 0;
  padding: 0;
  list-style: none;
}

:deep(.entry-rich ul li) {
  position: relative;
  margin: 2px 0;
  padding-left: 16px;
}

:deep(.entry-rich ul li::marker) {
  content: '';
}

:deep(.entry-rich ul li::before) {
  content: '';
  position: absolute;
  left: 2px;
  top: 0.95em;
  transform: translateY(-50%);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

:deep(.entry-rich ol) {
  margin: 0;
  padding-left: 1.25em;
  list-style: decimal;
  list-style-position: outside;
}

:deep(.entry-rich ol li) {
  margin: 2px 0;
  padding-left: 0.1em;
}

:deep(.entry-rich ol li::marker) {
  color: #000;
  font-size: 1em;
  font-weight: inherit;
}

:deep(.entry-rich li > p) {
  margin: 0;
}

:deep(.entry-rich p) {
  margin: 2px 0;
}

:deep(.entry-rich a) {
  color: var(--tpl-primary, #3b82f6);
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
