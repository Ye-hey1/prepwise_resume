<script setup lang="ts">
import { useResumeStore } from '@/stores/resume'
import { computed, reactive, ref, onMounted, onUnmounted } from 'vue'

const store = useResumeStore()
const collapsed = ref(false)

const validationErrors = reactive<Record<string, string>>({})

const extraFieldMeta: Array<{ key: ExtraFieldKey; label: string; hint: string }> = [
  { key: 'location', label: '所在地', hint: '常驻或户籍所在地' },
  { key: 'wechat', label: '微信号', hint: '补充即时沟通方式' },
  { key: 'currentCity', label: '现居城市', hint: '突出当前所在城市' },
  { key: 'github', label: 'GitHub', hint: '展示代码仓库或作品' },
  { key: 'website', label: '个人网站', hint: '放个人主页或作品集' },
  { key: 'blog', label: '博客', hint: '补充长期输出内容' },
]

function validatePhone() {
  const val = store.basicInfo.phone
  if (!val) {
    delete validationErrors.phone
    return
  }
  if (!/^1[3-9]\d{9}$/.test(val) && !/^\+?\d{7,15}$/.test(val)) {
    validationErrors.phone = '请输入有效的电话号码'
  } else {
    delete validationErrors.phone
  }
}

function validateEmail() {
  const val = store.basicInfo.email
  if (!val) {
    delete validationErrors.email
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    validationErrors.email = '请输入有效的邮箱地址'
  } else {
    delete validationErrors.email
  }
}

const extraFields = reactive<Record<string, boolean>>({
  location: Boolean(store.basicInfo.location),
  wechat: Boolean(store.basicInfo.wechat),
  currentCity: Boolean(store.basicInfo.currentCity),
  github: Boolean(store.basicInfo.github),
  website: Boolean(store.basicInfo.website),
  blog: Boolean(store.basicInfo.blog),
})

type ExtraFieldKey = 'location' | 'wechat' | 'currentCity' | 'github' | 'website' | 'blog'

const enabledExtraCount = computed(() => Object.values(extraFields).filter(Boolean).length)
const hasAvatar = computed(() => Boolean(store.basicInfo.avatar))

function toggleExtra(key: ExtraFieldKey) {
  const next = !extraFields[key]
  extraFields[key] = next
  if (!next) {
    store.basicInfo[key] = ''
  }
}

function handleAvatarUpload(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const reader = new FileReader()
    reader.onload = (ev) => {
      store.basicInfo.avatar = ev.target?.result as string
    }
    reader.readAsDataURL(input.files[0])
  }
}

function removeAvatar() {
  store.basicInfo.avatar = ''
}

// ── 下拉框管理 ──
const activeDropdown = ref<string | null>(null)
const workYearsOptions = ['应届生', '1年', '2年', '3年', '4年', '5年', '6-10年', '10年以上']
const salaryOptions = ['面议', '5k-10k', '10k-15k', '15k-20k', '20k-30k', '30k-50k', '50k以上']

function toggleDropdown(key: string, e: Event) {
  e.stopPropagation()
  activeDropdown.value = activeDropdown.value === key ? null : key
}

function selectOption(key: 'workYears' | 'expectedSalary', val: string) {
  store.basicInfo[key] = val
  activeDropdown.value = null
}

const handleGlobalClick = () => {
  activeDropdown.value = null
}

onMounted(() => {
  window.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  window.removeEventListener('click', handleGlobalClick)
})

// 统一的下拉箭头图标组件内容
const ChevronIcon = `
  <svg class="select-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`
</script>

<template>
  <section class="editor-section" :class="{ collapsed }">
    <div class="section-header" @click="collapsed = !collapsed">
      <div class="section-heading">
        <span class="section-kicker">Identity</span>
        <div class="section-title-row">
          <div class="section-toggle">
            <svg
              class="chevron"
              :class="{ rotated: !collapsed }"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <h3>基本信息</h3>
          </div>
          <p class="section-desc">先把身份信息、求职意向和公开联系方式收束清楚，后续模板与 AI 才能稳定复用。</p>
        </div>
      </div>

      <div class="section-meta">
        <span class="meta-pill">头像 {{ hasAvatar ? '已上传' : '未上传' }}</span>
        <span class="meta-pill">扩展字段 {{ enabledExtraCount }}</span>
      </div>
    </div>

    <div v-show="!collapsed" class="section-body">
      <div class="section-grid section-grid-hero">
        <div class="avatar-card card-surface-soft">
          <div class="avatar-card-head">
            <div>
              <p class="block-title">形象资料</p>
            </div>
            <span class="block-badge">可选</span>
          </div>

          <div class="avatar-area compact-avatar-area">
            <div class="avatar-preview" @click="($refs.avatarInput as HTMLInputElement).click()">
              <img v-if="store.basicInfo.avatar" :src="store.basicInfo.avatar" alt="头像" />
              <div v-else class="avatar-empty">
                <svg class="avatar-placeholder" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <span>点击上传头像</span>
              </div>
              <div class="avatar-overlay">更换图片</div>
            </div>

            <div class="avatar-actions compact-avatar-actions">
              <button class="btn-secondary" type="button" @click="($refs.avatarInput as HTMLInputElement).click()">
                {{ store.basicInfo.avatar ? '重新上传' : '选择图片' }}
              </button>
              <button v-if="store.basicInfo.avatar" class="btn-danger-lite" type="button" @click="removeAvatar">
                删除头像
              </button>
            </div>
          </div>
          <input ref="avatarInput" type="file" accept="image/*" style="display: none" @change="handleAvatarUpload" />
        </div>

        <div class="info-card card-surface-soft">
          <div class="card-headline">
            <div>
              <p class="block-title">联系信息</p>
              <p class="block-hint">保留模板页眉最常用的身份与联系字段。</p>
            </div>
          </div>

          <div class="form-grid-2 compact-grid contact-grid">
            <div class="form-group">
              <label class="form-label">姓名</label>
              <input v-model="store.basicInfo.name" type="text" class="form-input" placeholder="请输入姓名" />
            </div>
            <div class="form-group">
              <label class="form-label">电话</label>
              <input
                v-model="store.basicInfo.phone"
                type="text"
                class="form-input"
                :class="{ 'has-error': validationErrors.phone }"
                placeholder="请输入电话"
                @blur="validatePhone"
              />
              <span v-if="validationErrors.phone" class="form-error">{{ validationErrors.phone }}</span>
            </div>
            <div class="form-group">
              <label class="form-label">邮箱</label>
              <input
                v-model="store.basicInfo.email"
                type="email"
                class="form-input"
                :class="{ 'has-error': validationErrors.email }"
                placeholder="请输入邮箱"
                @blur="validateEmail"
              />
              <span v-if="validationErrors.email" class="form-error">{{ validationErrors.email }}</span>
            </div>
            <div class="form-group">
              <label class="form-label">年龄</label>
              <input v-model="store.basicInfo.age" type="text" class="form-input" placeholder="例如：25岁" />
            </div>
            <div class="form-group">
              <label class="form-label">性别</label>
              <div class="select-wrapper">
                <select v-model="store.basicInfo.gender" class="form-input">
                  <option value="">请选择</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
                <div class="select-arrow-custom" v-html="ChevronIcon"></div>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">工作年限</label>
              <div class="combo-input-group" :class="{ 'is-open': activeDropdown === 'workYears' }">
                <input
                  v-model="store.basicInfo.workYears"
                  type="text"
                  class="form-input"
                  placeholder="例如：4年"
                  @click.stop
                />
                <button
                  type="button"
                  class="combo-trigger"
                  @click="toggleDropdown('workYears', $event)"
                  aria-label="选择预设"
                >
                  <div class="select-arrow-custom" v-html="ChevronIcon"></div>
                </button>
                <Transition name="dropdown-fade">
                  <ul v-if="activeDropdown === 'workYears'" class="combo-dropdown">
                    <li
                      v-for="opt in workYearsOptions"
                      :key="opt"
                      class="dropdown-item"
                      @click="selectOption('workYears', opt)"
                    >
                      {{ opt }}
                    </li>
                  </ul>
                </Transition>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-section-head">
          <div>
            <p class="sub-section-kicker">Intent</p>
            <h4 class="sub-section-title">求职意向</h4>
          </div>
          <p class="sub-section-desc">明确目标岗位、地点与状态，方便 JD 分析和 AI 模拟更聚焦。</p>
        </div>

        <div class="form-grid-3">
          <div class="form-group">
            <label class="form-label">当前状态</label>
            <div class="select-wrapper">
              <select v-model="store.basicInfo.currentStatus" class="form-input">
                <option value="">请选择</option>
                <option value="在职-考虑机会">在职-考虑机会</option>
                <option value="在职-暂不考虑">在职-暂不考虑</option>
                <option value="离职-随时到岗">离职-随时到岗</option>
                <option value="在校生">在校生</option>
              </select>
              <div class="select-arrow-custom" v-html="ChevronIcon"></div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">职位名称</label>
            <input v-model="store.basicInfo.jobTitle" type="text" class="form-input" placeholder="例如：全栈开发工程师" />
          </div>
          <div class="form-group">
            <label class="form-label">期望工作地</label>
            <input v-model="store.basicInfo.expectedLocation" type="text" class="form-input" placeholder="例如：深圳" />
          </div>
        </div>

        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">期望薪资</label>
            <div class="combo-input-group" :class="{ 'is-open': activeDropdown === 'expectedSalary' }">
              <input
                v-model="store.basicInfo.expectedSalary"
                type="text"
                class="form-input"
                placeholder="例如：面议 / 15-25K"
                @click.stop
              />
              <button
                type="button"
                class="combo-trigger"
                @click="toggleDropdown('expectedSalary', $event)"
                aria-label="选择预设"
              >
                <div class="select-arrow-custom" v-html="ChevronIcon"></div>
              </button>
              <Transition name="dropdown-fade">
                <ul v-if="activeDropdown === 'expectedSalary'" class="combo-dropdown">
                  <li
                    v-for="opt in salaryOptions"
                    :key="opt"
                    class="dropdown-item"
                    @click="selectOption('expectedSalary', opt)"
                  >
                    {{ opt }}
                  </li>
                </ul>
              </Transition>
            </div>
          </div>
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-section-head">
          <div>
            <p class="sub-section-kicker">Profile</p>
            <h4 class="sub-section-title">补充资料</h4>
          </div>
          <p class="sub-section-desc">补充学历、城市和公开链接，让简历页眉信息更完整。</p>
        </div>

        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">最高学历</label>
            <div class="select-wrapper">
              <select v-model="store.basicInfo.educationLevel" class="form-input">
                <option value="">请选择</option>
                <option value="大专">大专</option>
                <option value="本科">本科</option>
                <option value="硕士">硕士</option>
                <option value="博士">博士</option>
              </select>
              <div class="select-arrow-custom" v-html="ChevronIcon"></div>
            </div>
          </div>
        </div>

        <!-- 更多展示字段：整合进补充资料主体喵 -->
        <div class="extra-field-section">
          <div class="extra-field-header">
            <div class="extra-field-title-row">
              <span class="extra-field-title">更多展示字段</span>
              <span class="block-hint">按需添加页眉信息，保持简洁即可。</span>
            </div>
            <span class="block-badge">已启用 {{ enabledExtraCount }}</span>
          </div>

          <div class="extra-options">
            <button
              v-for="item in extraFieldMeta"
              :key="item.key"
              class="extra-option"
              :class="{ active: extraFields[item.key] }"
              type="button"
              @click="toggleExtra(item.key)"
            >
              <span class="extra-option-check">{{ extraFields[item.key] ? '✓' : '+' }}</span>
              <span class="extra-option-label">{{ item.label }}</span>
            </button>
          </div>

          <!-- 动态展示开启的字段 -->
          <transition-group name="field-fade" tag="div" class="form-grid-2 extra-fields-grid" v-if="enabledExtraCount > 0">
            <div class="form-group" v-if="extraFields.location" key="location">
              <label class="form-label">所在地</label>
              <input v-model="store.basicInfo.location" type="text" class="form-input" placeholder="例如：北京" />
            </div>
            <div class="form-group" v-if="extraFields.wechat" key="wechat">
              <label class="form-label">微信号</label>
              <input v-model="store.basicInfo.wechat" type="text" class="form-input" placeholder="请输入微信号" />
            </div>
            <div class="form-group" v-if="extraFields.currentCity" key="currentCity">
              <label class="form-label">现居城市</label>
              <input v-model="store.basicInfo.currentCity" type="text" class="form-input" placeholder="请输入现居城市" />
            </div>
            <div class="form-group" v-if="extraFields.github" key="github">
              <label class="form-label">GitHub</label>
              <input v-model="store.basicInfo.github" type="text" class="form-input" placeholder="例如：github.com/username" />
            </div>
            <div class="form-group" v-if="extraFields.website" key="website">
              <label class="form-label">个人网站</label>
              <input v-model="store.basicInfo.website" type="text" class="form-input" placeholder="例如：example.com" />
            </div>
            <div class="form-group" v-if="extraFields.blog" key="blog">
              <label class="form-label">博客</label>
              <input v-model="store.basicInfo.blog" type="text" class="form-input" placeholder="例如：blog.example.com" />
            </div>
          </transition-group>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.editor-section {
  margin-bottom: 18px;
  border: 1px solid var(--border-color);
  border-radius: calc(var(--radius-lg) + 4px);
  background:
    linear-gradient(180deg, rgba(255, 253, 250, 0.96), rgba(249, 244, 238, 0.98));
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.editor-section:hover {
  border-color: var(--border-color-strong);
  box-shadow: var(--shadow-md);
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 22px 18px;
  cursor: pointer;
  user-select: none;
  background: linear-gradient(180deg, rgba(252, 253, 255, 0.94), rgba(240, 244, 250, 0.88));
  border-bottom: 1px solid rgba(100, 120, 150, 0.14);
}

.section-heading {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.section-kicker,
.sub-section-kicker {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.section-title-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-toggle h3 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
  font-weight: 800;
  color: var(--text-primary);
}

.section-desc,
.sub-section-desc,
.block-hint,
.avatar-tip {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);
}

.section-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.meta-pill,
.block-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(43, 123, 184, 0.2);
  background: var(--glass-mid);
  color: var(--accent-blue-600);
  font-size: 12px;
  font-weight: 700;
}

.chevron {
  color: var(--text-secondary);
  transition: transform 0.2s ease;
  transform: rotate(0deg);
}

.chevron.rotated {
  transform: rotate(90deg);
}

.section-body {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.section-grid {
  display: grid;
  gap: 18px;
}

.section-grid-hero {
  grid-template-columns: minmax(220px, 248px) minmax(0, 1fr);
}

.card-surface-soft,
.sub-section,
.extra-panel {
  border: 1px solid rgba(100, 120, 150, 0.16);
  border-radius: var(--radius-lg);
  background: var(--glass-low);
  box-shadow: inset 0 1px 0 var(--glass-minimal);
}

.card-surface-soft,
.sub-section,
.extra-panel {
  padding: 18px;
}

.card-headline,
.avatar-card-head,
.sub-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.block-title,
.sub-section-title {
  margin: 0;
  font-size: 16px;
  line-height: 1.25;
  font-weight: 800;
  color: var(--text-primary);
}

.sub-section-head {
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(100, 120, 150, 0.12);
  margin-bottom: 20px;
}

.avatar-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  flex: 1; /* 占据剩余高度以实现垂直居中 */
  width: 100%;
}

.compact-avatar-area {
  gap: 12px;
}

.avatar-preview {
  width: 116px;
  height: 144px;
  border-radius: 18px;
  border: 1px dashed rgba(43, 123, 184, 0.3);
  background: linear-gradient(180deg, rgba(234, 239, 246, 0.9), rgba(240, 244, 250, 0.96));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--glass-minimal);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.avatar-preview:hover {
  transform: translateY(-1px);
  border-color: rgba(43, 123, 184, 0.42);
  box-shadow: 0 16px 30px rgba(61, 91, 122, 0.12);
}

.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.avatar-placeholder {
  color: var(--accent-blue-500);
  opacity: 0.8;
}

.avatar-overlay {
  position: absolute;
  inset: auto 10px 10px;
  border-radius: 999px;
  background: rgba(36, 29, 24, 0.72);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  padding: 8px 10px;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.avatar-preview:hover .avatar-overlay {
  opacity: 1;
  transform: translateY(0);
}

.avatar-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.compact-avatar-actions {
  gap: 8px;
}

.btn-secondary,
.btn-danger-lite {
  min-height: 38px;
  min-width: 100px; /* 增加最小宽度使按钮更稳重 */
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--glass-mid);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease, background-color 0.18s ease, transform 0.18s ease;
}

.btn-secondary:hover,
.btn-danger-lite:hover {
  transform: translateY(-1px);
}

.btn-secondary:hover {
  border-color: rgba(43, 123, 184, 0.28);
  color: var(--accent-blue-600);
}

.btn-danger-lite:hover {
  border-color: rgba(216, 83, 83, 0.28);
  color: var(--accent-red);
  background: color-mix(in srgb, var(--accent-red) 6%, var(--bg-card));
}

.form-grid-3,
.form-grid-2 {
  display: grid;
  gap: 16px 16px;
}

.form-grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.form-grid-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.compact-grid {
  align-items: start;
}

.contact-grid {
  gap: 14px 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* 统一选择框包装器 */
.select-wrapper {
  position: relative;
  width: 100%;
}

.select-wrapper select {
  appearance: none;
  padding-right: 40px !important;
}

.select-arrow-custom {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s ease;
}

.select-wrapper:focus-within .select-arrow-custom,
.combo-input-group:focus-within .select-arrow-custom {
  color: var(--primary-500);
}

/* 混合下拉框样式重构 */
.combo-input-group {
  position: relative;
  display: flex;
  width: 100%;
}

.combo-input-group .form-input {
  padding-right: 44px;
}

.combo-trigger {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 44px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.combo-input-group.is-open .select-arrow-custom {
  transform: translateY(-50%) rotate(180deg);
}

/* 自定义下拉菜单 - 玻璃拟体 */
.combo-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--glass-high);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--border-color-strong);
  border-radius: 12px;
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 10px 20px -5px rgba(42, 33, 26, 0.12);
  padding: 6px;
  margin: 0;
  list-style: none;
  z-index: 1000;
  max-height: 260px;
  overflow-y: auto;
}

.dropdown-item {
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dropdown-item:hover {
  background: rgba(43, 123, 184, 0.08);
  color: var(--primary-600);
  padding-left: 18px;
}

/* 动画效果 */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: transform 0.2s cubic-bezier(0.165, 0.84, 0.44, 1), opacity 0.2s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}


.form-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
}

.form-input {
  width: 100%;
  min-height: 44px;
  padding: 11px 13px;
  border: 1px solid rgba(100, 120, 150, 0.18);
  border-radius: 14px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  box-sizing: border-box;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
  outline: none;
}

.form-input:focus {
  border-color: rgba(43, 123, 184, 0.4);
  background: var(--surface-white);
  box-shadow: var(--focus-ring);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-error {
  display: block;
  margin-top: -2px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--accent-red);
}

.form-input.has-error {
  border-color: rgba(216, 83, 83, 0.42);
  box-shadow: 0 0 0 3px rgba(216, 83, 83, 0.1);
}

.extra-field-section {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-top: 10px;
  padding-top: 22px;
  border-top: 1px dashed rgba(100, 120, 150, 0.14);
}

.extra-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.extra-field-title-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.extra-field-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.extra-fields-grid {
  margin-top: 4px;
}

/* 进场动画喵 */
.field-fade-enter-active,
.field-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.field-fade-enter-from,
.field-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.extra-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.extra-option {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(100, 120, 150, 0.16);
  border-radius: 999px;
  background: var(--glass-mid);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.extra-option:hover {
  transform: translateY(-1px);
  border-color: rgba(43, 123, 184, 0.24);
  box-shadow: 0 10px 18px rgba(61, 91, 122, 0.06);
}

.extra-option.active {
  border-color: rgba(43, 123, 184, 0.28);
  background: linear-gradient(180deg, rgba(234, 239, 246, 0.94), var(--glass-high));
  color: var(--accent-blue-600);
  box-shadow: 0 12px 20px rgba(61, 91, 122, 0.08);
}

.extra-option-check {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(43, 123, 184, 0.1);
  color: inherit;
  font-size: 11px;
  font-weight: 800;
  flex-shrink: 0;
}

.extra-option-label {
  white-space: nowrap;
}

.extra-fields {
  margin-top: 2px;
}

@media (max-width: 1100px) {
  .section-grid-hero,
  .form-grid-3 {
    grid-template-columns: 1fr;
  }

  .contact-grid {
    grid-template-columns: 1fr;
  }

  .form-grid-2 {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .section-header,
  .section-meta,
  .sub-section-head,
  .card-headline,
  .avatar-card-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .section-body {
    padding: 16px;
  }
}
</style>
