import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { ResumeAssistantMaterialItem, ResumeFieldAiContext } from '@/services/types/resumeAssistant'

const STORAGE_KEY = 'resume-builder-assistant-materials'

function loadMaterials(): ResumeAssistantMaterialItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function extractTags(text: string): string[] {
  return Array.from(new Set(
    text
      .split(/[，。、；;,.\s/]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .slice(0, 8),
  ))
}

export const useResumeAssistantStore = defineStore('resumeAssistant', () => {
  const materials = ref<ResumeAssistantMaterialItem[]>(loadMaterials())

  watch(materials, (value) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  }, { deep: true })

  const materialCount = computed(() => materials.value.length)

  function getMaterialsByModule(moduleKey?: string) {
    if (!moduleKey) return materials.value
    return materials.value.filter((item) => !item.moduleKey || item.moduleKey === moduleKey)
  }

  function saveMaterialFromContext(context: ResumeFieldAiContext) {
    const content = context.currentText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!content) return false

    const now = new Date().toISOString()
    const existing = materials.value.find((item) => item.content === content && item.moduleKey === context.moduleKey)
    if (existing) {
      existing.title = context.entryTitle || context.fieldLabel
      existing.updatedAt = now
      existing.tags = extractTags(`${context.fieldLabel} ${Object.values(context.entryMeta ?? {}).join(' ')}`)
      return true
    }

    materials.value.unshift({
      id: `material_${Date.now()}`,
      title: context.entryTitle || context.fieldLabel,
      moduleKey: context.moduleKey,
      type: context.moduleKey === 'skills' ? 'skill' : context.moduleKey === 'projectExperience' ? 'project' : 'experience',
      content,
      tags: extractTags(`${context.fieldLabel} ${Object.values(context.entryMeta ?? {}).join(' ')}`),
      createdAt: now,
      updatedAt: now,
    })
    return true
  }

  function removeMaterial(id: string) {
    materials.value = materials.value.filter((item) => item.id !== id)
  }

  return {
    materials,
    materialCount,
    getMaterialsByModule,
    saveMaterialFromContext,
    removeMaterial,
  }
})
