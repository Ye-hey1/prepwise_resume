import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'workspace-dashboard',
    component: () => import('@/views/WorkspaceDashboardView.vue'),
  },
  {
    path: '/resume',
    name: 'resume-editor',
    component: () => import('@/views/ResumeEditorView.vue'),
  },
  {
    path: '/interview',
    name: 'ai-interviewer',
    component: () => import('@/views/AiInterviewerView.vue'),
  },
  {
    path: '/jd-analysis',
    name: 'jd-analysis',
    component: () => import('@/views/JdAnalysisView.vue'),
  },
  {
    path: '/applications',
    name: 'application-tracker',
    component: () => import('@/views/ApplicationTrackerView.vue'),
  },
  {
    path: '/training',
    name: 'training-center',
    component: () => import('@/views/TrainingCenterView.vue'),
  },
  {
    path: '/resume-import',
    name: 'resume-import',
    component: () => import('@/views/ResumeImportView.vue'),
  },
  {
    path: '/resume-review',
    name: 'resume-review',
    component: () => import('@/views/ResumeReviewView.vue'),
  },
  {
    path: '/question-bank',
    name: 'question-bank',
    component: () => import('@/views/QuestionBankView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
