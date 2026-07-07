<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DashboardTabs from '@/components/workspace/DashboardTabs.vue'
import OverviewTab from '@/components/workspace/OverviewTab.vue'
import OpportunitiesTab from '@/components/workspace/OpportunitiesTab.vue'
import TrackerTab from '@/components/workspace/TrackerTab.vue'
import AnalyticsTab from '@/components/workspace/AnalyticsTab.vue'

defineOptions({ name: 'WorkspaceDashboardView' })

type TabKey = 'overview' | 'opportunities' | 'tracker' | 'analytics'

const route = useRoute()
const router = useRouter()

const activeTab = computed<TabKey>({
  get: () => (
    route.query.tab === 'opportunities'
    || route.query.tab === 'tracker'
    || route.query.tab === 'analytics'
      ? route.query.tab
      : 'overview'
  ) as TabKey,
  set: (value) => router.replace({ query: value === 'overview' ? {} : { tab: value } }),
})
</script>

<template>
  <section class="workspace-dashboard product-page">
    <div class="workspace-scroll product-scroll">
      <div class="dashboard-shell product-shell">
        <header class="dashboard-header product-header">
          <div class="header-titles product-header-title">
            <h1>工作台</h1>
            <p>简历、岗位和面试，在同一条链路里推进。</p>
          </div>
          <DashboardTabs v-model="activeTab" />
        </header>

        <div class="tab-panel">
          <OverviewTab v-if="activeTab === 'overview'" />
          <OpportunitiesTab v-else-if="activeTab === 'opportunities'" />
          <TrackerTab v-else-if="activeTab === 'tracker'" />
          <AnalyticsTab v-else />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dashboard-shell {
  max-width: 1180px;
}

.tab-panel {
  min-height: 0;
}
</style>
