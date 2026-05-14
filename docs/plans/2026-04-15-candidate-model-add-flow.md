# Candidate Model Add Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change model fetching so fetched results are treated as temporary candidate models, and only user-added models are persisted and selectable as the primary model.

**Architecture:** Keep `fetchedModels` in the Pinia channel store as the persisted list of user-added models. Add a temporary `availableModels` state inside the config dialog for the current modal session only, and route all `+` interactions through that local state. Reset candidate state when provider changes or the dialog closes.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vite

---

### Task 1: Split candidate models from added models in the dialog

**Files:**
- Modify: `src/components/ai/AiConfigDialog.vue`

1. Add a local `availableModels` state for the current dialog session.
2. Keep the existing primary-model dropdown bound only to `editingChannel.fetchedModels`.
3. Change the fetch-models handler so API results populate `availableModels` instead of `editingChannel.fetchedModels`.
4. Clear `availableModels` when switching providers and when closing the dialog.

### Task 2: Add explicit candidate-model actions

**Files:**
- Modify: `src/components/ai/AiConfigDialog.vue`

1. Build a candidate-model list derived from `availableModels`.
2. Add an `addModel` action that appends the model to `editingChannel.fetchedModels` only once.
3. Auto-select the added model as `editingChannel.modelName` if it is the first added model.
4. Show `已添加` disabled state for models already added.

### Task 3: Verify the minimal closed loop

**Files:**
- Modify: `src/components/ai/AiConfigDialog.vue`

1. Run `npm run type-check`.
2. Run `npm run build`.
3. Confirm the dialog still saves only the manually added models.
