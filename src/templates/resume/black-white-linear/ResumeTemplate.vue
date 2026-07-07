<script setup lang="ts">
import { computed } from 'vue'
import { iconPaths, iconViewBox, isFilledIcon } from '../../shared/metaIcons'
import { useResumeTemplateData } from '../../shared/useResumeTemplateData'
import { useTemplateCustomization } from '../../shared/useTemplateCustomization'

const { store, hasAnyContent, lineOneMeta, lineTwoMeta, lineThreeMeta, moduleOrderStyle, educationTitleParts, educationTags, workTitleParts, workSideParts, hasPersonalWorkContent, hasTrainingContent, trainingMetaParts, hasCustomSectionContent, hasCustomSectionItemContent, customItemMetaParts, linkHref, dateText, dateRangeText } = useResumeTemplateData()
const { cssVars } = useTemplateCustomization()

const headerClass = computed(() => {
  const align = store.getCustomization(store.selectedTemplateKey).layoutAlign || 'space-between'
  return `resume-header align-${align}`
})
</script>

<template>
  <div class="resume-template-black-white-linear" :style="cssVars">
    <header v-if="store.isModuleVisible('basicInfo')" :class="headerClass">
      <div class="header-main">
        <h1 class="name">{{ store.basicInfo.name || '姓名' }}</h1>

        <div v-if="lineOneMeta.length" class="contact-line contact-line-primary">
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

        <div v-if="lineThreeMeta.length" class="contact-line contact-line-links">
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
      v-if="store.isModuleVisible('personalWorks') && store.personalWorkList.some(hasPersonalWorkContent)"
      class="resume-section"
      :style="moduleOrderStyle('personalWorks')"
    >
      <h2 class="section-title">个人作品</h2>
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

    <section
      v-if="store.isModuleVisible('trainingExperience') && store.trainingList.some(hasTrainingContent)"
      class="resume-section"
      :style="moduleOrderStyle('trainingExperience')"
    >
      <h2 class="section-title">培训经历</h2>
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
      <h2 class="section-title">{{ section.title || '自定义模块' }}</h2>
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
      <h2 class="section-title">个人简介</h2>
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
.resume-template-black-white-linear {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  padding: var(--tpl-page-padding-y, 24px) var(--tpl-page-padding-x, 28px);
  color: #111;
  display: flex;
  flex-direction: column;
  font-family: var(--tpl-font, 'Noto Sans SC', sans-serif);
}

.resume-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  order: 0;
}

.header-main {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.name {
  margin: 0;
  font-size: var(--tpl-name-size, 28px);
  line-height: 1.12;
  font-weight: 800;
  letter-spacing: 0;
  color: #111;
}

.contact-line {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start !important;
  column-gap: 14px;
  row-gap: 5px;
  margin-top: 6px;
  color: #4a4a4a;
  font-size: var(--tpl-body-size, 14px);
  line-height: 1.35;
}

.contact-line-primary {
  margin-top: 8px;
  color: #262626;
  font-weight: 650;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  line-height: 1.25;
}

.meta-link {
  color: #1f1f1f;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
}

.meta-icon-svg {
  display: block;
  width: 13px;
  height: 13px;
  fill: none;
  stroke: #5a5a5a;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

.meta-icon-fill {
  fill: #5a5a5a;
  stroke: none;
}

.avatar-wrap {
  width: 84px;
  height: 104px;
  border: 1px solid #c8c8c8;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
  background: #f2f2f2;
}

.resume-template-black-white-linear .resume-header {
  flex-direction: row !important;
  align-items: flex-start !important;
}

.resume-template-black-white-linear .header-main {
  align-items: flex-start !important;
  text-align: left !important;
}

.resume-template-black-white-linear .avatar-wrap {
  margin: 0 !important;
}

.resume-template-black-white-linear .resume-header.align-space-between {
  justify-content: space-between !important;
}

.resume-template-black-white-linear .resume-header.align-left {
  justify-content: flex-start !important;
}

.resume-template-black-white-linear .resume-header.align-center {
  justify-content: center !important;
}

.resume-template-black-white-linear .resume-header.align-right {
  justify-content: flex-end !important;
}

.resume-template-black-white-linear .resume-header.align-center .header-main {
  align-items: center !important;
  text-align: center !important;
}

.resume-template-black-white-linear .resume-header.align-center .contact-line {
  justify-content: center !important;
}

.resume-template-black-white-linear .resume-header.align-right .header-main {
  align-items: flex-end !important;
  text-align: right !important;
}

.resume-template-black-white-linear .resume-header.align-right .contact-line {
  justify-content: flex-end !important;
}

.resume-template-black-white-linear .resume-header.align-center .header-main {
  flex: 0 1 auto;
  max-width: 520px;
}

.resume-template-black-white-linear .resume-header.align-right .header-main {
  flex: 0 1 auto;
  max-width: 520px;
}

.avatar-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9a9a9a;
  font-size: 12px;
}

.resume-section {
  margin-bottom: var(--tpl-section-gap, 10px);
}

.resume-section:last-of-type {
  margin-bottom: 0;
}

.section-title {
  margin-top: var(--tpl-title-gap-top, 0px);
  margin-bottom: var(--tpl-title-gap-bottom, 8px);
  padding: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
  color: #111;
  border-bottom: 1px solid var(--tpl-primary, #2c2c2c);
  line-height: 1.3;
}

.entry {
  margin-bottom: 10px;
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
  font-size: 16px;
  color: #111;
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
  font-weight: 700;
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
  color: #434343;
  font-size: 14px;
}

.entry-work-parts {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  column-gap: 18px;
  row-gap: 2px;
  color: #434343;
  font-size: 14px;
  font-weight: 400;
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
  border: 1px solid #c7c7c7;
  background: #f4f4f4;
  color: #2d2d2d;
  font-size: 11px !important;
  line-height: 1;
  font-weight: 700;
}

.entry-date {
  grid-column: 3;
  color: #3a3a3a;
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
  color: #3a3a3a;
  font-size: 14px;
  white-space: nowrap;
}

.entry-subline {
  margin: 3px 0 0;
  display: flex;
  justify-content: flex-start;
  flex-wrap: wrap;
  column-gap: 18px;
  row-gap: 2px;
  font-size: 14px;
  color: #434343;
}

.entry-link-row {
  margin-top: 4px;
  margin-bottom: 2px;
}

.entry-link {
  color: #2d2d2d;
  text-decoration: underline;
  font-size: 13px;
}

.project-block-title {
  margin-top: 6px;
  margin-bottom: 2px;
  color: #111;
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
  margin-top: 3px;
  color: #111;
  font-size: var(--tpl-font-size, 14px);
  line-height: var(--tpl-line-height, 1.85);
}

.empty {
  margin-top: 40px;
  text-align: center;
  color: #8d8d8d;
  font-size: 12px;
  order: 999;
}

:deep(.entry-rich ul) {
  margin: 0;
  padding-left: 1.2em;
  list-style: disc;
}

:deep(.entry-rich ul li) {
  margin: 4px 0;
  padding-left: 0;
}

:deep(.entry-rich ol) {
  margin: 0;
  padding-left: 1.25em;
  list-style: decimal;
  list-style-position: outside;
}

:deep(.entry-rich ol li) {
  margin: 4px 0;
  padding-left: 0;
}

:deep(.entry-rich li > p) {
  margin: 0;
}

:deep(.entry-rich p) {
  margin: 3px 0;
}

:deep(.entry-rich a) {
  color: #2d2d2d;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
}

:deep(.entry-rich span[style*='font-size']) {
  line-height: inherit;
}
</style>
