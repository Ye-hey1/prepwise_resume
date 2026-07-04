<script setup lang="ts">
import { computed } from 'vue'
import { toHref } from '../../shared/metaIcons'
import { useResumeTemplateData } from '../../shared/useResumeTemplateData'
import { useTemplateCustomization } from '../../shared/useTemplateCustomization'

const { store, hasAnyContent, simpleContactMeta, moduleOrderStyle, educationTitleParts, educationTags, workTitleParts, workSideParts, hasPersonalWorkContent, hasTrainingContent, trainingMetaParts, hasCustomSectionContent, hasCustomSectionItemContent, customItemMetaParts, linkHref, dateText, dateRangeText } = useResumeTemplateData()
const { cssVars } = useTemplateCustomization()

const displayName = computed(() => store.basicInfo.name || '通用职场简历')

const contactText = computed(() => {
  const items = simpleContactMeta.value.map((item) => item.text.trim()).filter(Boolean)
  return items.join(' | ')
})

const baseMetaLineOne = computed(() =>
  [store.basicInfo.age, store.basicInfo.gender, store.basicInfo.workYears, store.basicInfo.educationLevel]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' | ')
)

const baseMetaLineTwo = computed(() =>
  [store.basicInfo.currentStatus, store.basicInfo.jobTitle, store.basicInfo.expectedLocation, store.basicInfo.expectedSalary]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' | ')
)

const baseMetaLineThree = computed(() =>
  [store.basicInfo.wechat, store.basicInfo.currentCity]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' | ')
)

const extraLinks = computed(() => {
  return [
    { key: 'website', text: store.basicInfo.website.trim() },
    { key: 'github', text: store.basicInfo.github.trim() },
    { key: 'blog', text: store.basicInfo.blog.trim() },
  ]
    .filter((item) => item.text)
    .map((item, index) => ({
      key: `${item.key}-${index}`,
      label: item.key === 'website' ? 'Web' : item.key === 'github' ? 'GitHub' : 'Blog',
      text: item.text,
      href: toHref(item.text),
    }))
})

</script>

<template>
  <div class="resume-template-workplace" :style="cssVars">
    <div class="hero-bg">
      <div v-if="store.basicInfo.avatar" class="avatar-wrap">
        <img :src="store.basicInfo.avatar" alt="头像" />
      </div>
    </div>

    <header v-if="store.isModuleVisible('basicInfo')" class="header-main">
      <h1 class="name">{{ displayName }}</h1>
      <p v-if="contactText" class="contact-line">{{ contactText }}</p>
      <p v-if="baseMetaLineOne" class="meta-line">{{ baseMetaLineOne }}</p>
      <p v-if="baseMetaLineTwo" class="meta-line">{{ baseMetaLineTwo }}</p>
      <p v-if="baseMetaLineThree" class="meta-line">{{ baseMetaLineThree }}</p>
      <div v-if="extraLinks.length" class="extra-links">
        <a v-for="item in extraLinks" :key="item.key" :href="item.href" target="_blank" rel="noopener noreferrer"><span class="meta-label" v-if="item.label">{{ item.label }}: </span>{{ item.text }}</a>
      </div>
    </header>

    <section v-if="store.isModuleVisible('selfIntro') && store.selfIntro" class="resume-section" :style="moduleOrderStyle('selfIntro')">
      <h2 class="section-title"><span>个人简介</span></h2>
      <div class="entry-rich" v-safe-html="store.selfIntro"></div>
    </section>

    <section
      v-if="store.isModuleVisible('workExperience') && store.workList.some((w) => w.company)"
      class="resume-section"
      :style="moduleOrderStyle('workExperience')"
    >
      <h2 class="section-title"><span>工作经历</span></h2>
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
      <h2 class="section-title"><span>项目经历</span></h2>
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
      <h2 class="section-title"><span>个人作品</span></h2>
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
      <h2 class="section-title"><span>教育经历</span></h2>
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
      <h2 class="section-title"><span>专业技能</span></h2>
      <div class="entry-rich" v-safe-html="store.skills"></div>
    </section>

    <section
      v-if="store.isModuleVisible('awards') && store.awardList.some((a) => a.name)"
      class="resume-section"
      :style="moduleOrderStyle('awards')"
    >
      <h2 class="section-title"><span>荣誉奖项</span></h2>
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
      <h2 class="section-title"><span>培训经历</span></h2>
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
      <h2 class="section-title"><span>{{ section.title || '自定义模块' }}</span></h2>
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
.resume-template-workplace {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  padding: var(--tpl-page-padding-y, 0) var(--tpl-page-padding-x, 28px) 16px;
  color: #1a1a1a;
  background: linear-gradient(160deg, #f8fbff 0%, #f3f6ff 100%);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: var(--tpl-font, 'Noto Sans SC', sans-serif);
}

.resume-template-workplace::after {
  content: '';
  position: absolute;
  right: -70px;
  top: 120px;
  width: 310px;
  height: 310px;
  border-radius: 50%;
  border: 1px solid rgba(59, 130, 246, 0.12);
  box-shadow:
    inset 0 0 0 38px transparent,
    0 0 0 40px rgba(59, 130, 246, 0.06),
    0 0 0 80px rgba(59, 130, 246, 0.04);
  pointer-events: none;
}

.hero-bg {
  position: relative;
  margin: 0 -28px;
  height: 116px;
  overflow: visible;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  background: linear-gradient(180deg, var(--tpl-primary, #4e86f2) 0%, var(--tpl-primary-dark, #3d74e4) 100%);
  border-bottom-left-radius: 50% 28%;
  border-bottom-right-radius: 50% 28%;
}

.avatar-wrap {
  position: relative;
  left: auto;
  bottom: -20px;
  transform: none;
  margin: 0 auto -20px;
  width: 80px;
  height: 100px;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  border: 4px solid #fff;
  box-shadow: 0 6px 20px rgba(61, 116, 228, 0.20);
  z-index: 2;
  isolation: isolate;
}

.avatar-wrap img {
  display: block;
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
  color: #8ea5d9;
  font-size: 12px;
  background: #f2f6ff;
}

.header-main {
  order: 0;
  text-align: center;
  margin-top: 54px;
  margin-bottom: 8px;
}

.name {
  margin: 0;
  font-size: 32px;
  line-height: 1.05;
  color: #1f2f4d;
  font-weight: 700;
}

.contact-line {
  margin: 8px 0 0;
  font-size: 14px;
  color: #34445f;
}

.meta-line {
  margin: 3px 0 0;
  font-size: 13px;
  color: #4b5b77;
}

.extra-links {
  margin-top: 6px;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
}

.extra-links a {
  flex: 0 0 auto;
  max-width: 320px;
  white-space: nowrap;
  overflow-wrap: normal;
  word-break: keep-all;
  color: var(--tpl-primary, #2f67da);
  text-decoration: none;
  font-size: 12px;
}

.extra-links a:hover {
  text-decoration: underline;
}

.resume-section {
  margin-bottom: var(--tpl-section-gap, 8px);
}

.resume-section:last-of-type {
  margin-bottom: 0;
}

.section-title {
  position: relative;
  margin: var(--tpl-title-gap-top, 4px) 0 var(--tpl-title-gap-bottom, 4px);
  text-align: center;
  color: var(--tpl-primary, #3c78ef);
  font-size: 18px;
  font-weight: 500;
  line-height: 1.2;
}

.section-title::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1px solid var(--tpl-primary, #4f82f3);
  opacity: 0.75;
}

.section-title span {
  position: relative;
  z-index: 1;
  padding: 0 14px;
  background: linear-gradient(160deg, #f8fbff 0%, #f3f6ff 100%);
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
  color: #111827;
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
  font-size: 18px;
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
  color: #334155;
  font-size: 14px;
}

.entry-work-parts {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  column-gap: 18px;
  row-gap: 2px;
  color: #334155;
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
  border: 1px solid rgba(47, 103, 218, 0.22);
  background: rgba(47, 103, 218, 0.08);
  color: var(--tpl-primary, #2f67da);
  font-size: 11px !important;
  line-height: 1;
  font-weight: 700;
}

.entry-date {
  grid-column: 3;
  color: #334155;
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
  color: #334155;
  font-size: 14px;
  white-space: nowrap;
}

.entry-subline {
  margin: 2px 0 0;
  display: flex;
  flex-wrap: wrap;
  column-gap: 18px;
  row-gap: 2px;
  color: #334155;
  font-size: 14px;
  min-height: 20px;
}

.entry-link-row {
  margin: 4px 0 2px;
}

.entry-link {
  color: var(--tpl-primary, #2f67da);
  text-decoration: none;
  font-size: 13px;
}

.entry-link:hover {
  text-decoration: underline;
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
  color: #111827;
  font-size: var(--tpl-font-size, 13px);
  line-height: var(--tpl-line-height, 1.85);
}

.empty {
  margin-top: 40px;
  text-align: center;
  color: #8a94ab;
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
  color: var(--tpl-primary, #2f67da);
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
