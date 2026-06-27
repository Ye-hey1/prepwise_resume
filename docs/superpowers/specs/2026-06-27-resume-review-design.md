# AI Resume Review Design

## Context

PrepWise currently covers resume import, resume editing, JD analysis, AI interview practice, question bank management, and post-interview optimization. The new AI resume review module should fit that loop instead of becoming a disconnected scoring tool.

The design borrows the useful parts of `interviewstreet/hiring-agent`:

- Structured resume-to-score pipeline.
- Strict rubric-based scoring.
- Evidence for each score.
- Bonus and deduction reasoning.
- Fairness constraints that ignore demographics, school prestige, grades, and location.

The first version will not fetch GitHub data. It will only evaluate the current structured resume, project links already present in the resume, and the existing JD analysis result when available.

## Goals

- Add a first-class `AI Resume Review` module to PrepWise.
- Provide both a strict recruiter-style score and a candidate-facing optimization checklist.
- Support a general resume quality score whether or not a JD exists.
- Add a JD fit score when current JD analysis data exists.
- Auto-select a scoring rubric based on target role.
- Keep implementation compatible with the current pure frontend architecture.

## Non-Goals

- No GitHub API enrichment in version one.
- No automatic resume rewriting from review tasks in version one.
- No backend persistence.
- No multi-candidate hiring dashboard.
- No institution, GPA, location, gender, or age based scoring.

## User Flow

1. User opens `Resume Review` from the sidebar.
2. User can also click a shortcut from the resume editor to jump to the review page.
3. The page reads the active resume data from `resumeStore`.
4. If JD analysis exists, the page includes JD context and shows a JD fit score.
5. User clicks `Start Review`.
6. The app calls the configured AI model and asks for strict JSON.
7. The page shows:
   - Overall score.
   - General resume quality score.
   - JD fit score when available.
   - Verdict: `ready`, `needs_work`, or `high_risk`.
   - Category scores with evidence and deductions.
   - Candidate-facing optimization tasks.
8. User can click a task to return to the related resume editor module.
9. Review results are saved locally and can be compared through a compact history list.

## Navigation

Add a new route:

- Path: `/resume-review`
- Name: `resume-review`
- View: `src/views/ResumeReviewView.vue`

Add a sidebar item:

- Label: `简历审查`
- Position: after `简历编辑` and before `JD分析`

Add an editor shortcut:

- A lightweight `AI 审查打分` entry in the resume editor workbench or preview/editor toolbar.
- The shortcut navigates to `/resume-review`.

## Role Family Detection

The first version supports two role families:

- `technical`
- `general`

Detection uses:

- `resumeStore.basicInfo.jobTitle`
- current JD position, if available
- current JD tech stack, if available

Technical role indicators include frontend, backend, full stack, algorithm, AI, data, testing, DevOps, engineer, developer, software, Java, Python, Go, C++, cloud, platform, infrastructure, and similar Chinese equivalents.

If no technical signal is found, use the `general` rubric.

Future role families such as product, operations, and design can be added without changing the result schema.

## Scoring Model

Use a fixed output structure with adaptive rubric content.

Top-level fields:

- `overallScore`: 0-100.
- `generalScore`: 0-100.
- `jdFitScore`: 0-100 or `null`.
- `verdict`: `ready`, `needs_work`, or `high_risk`.
- `roleFamily`: `technical` or `general`.
- `summary`: short recruiter-style conclusion.
- `categories`: category score list.
- `tasks`: actionable optimization task list.
- `fairnessNotes`: short note confirming excluded factors.

### Technical Rubric

- Project complexity and real impact: 30.
- Production, internship, or work experience: 25.
- Technical skills and role alignment: 20.
- Verifiable links and public work signals: 10.
- Writing quality and quantified outcomes: 15.

### General Rubric

- Role-relevant experience: 30.
- Evidence and quantified outcomes: 25.
- Capability structure completeness: 20.
- Clarity and professional expression: 15.
- Risk and credibility signals: 10.

### Category Shape

Each category should include:

- `key`
- `label`
- `score`
- `max`
- `evidence`
- `deductions`
- `actionableAdvice`
- `relatedModuleKey`

Allowed `relatedModuleKey` values:

- `basicInfo`
- `education`
- `skills`
- `workExperience`
- `projectExperience`
- `awards`
- `selfIntro`

### Task Shape

Each optimization task should include:

- `id`
- `priority`: `high`, `medium`, or `low`
- `title`
- `reason`
- `suggestion`
- `relatedModuleKey`
- `sourceCategoryKey`

Tasks should be candidate-facing and directly actionable. They should translate scoring problems into edits the user can make.

## Data Storage

Add a new Pinia store:

- File: `src/stores/resumeReview.ts`
- Local storage key: `prepwise-resume-review`
- Keep maximum 12 history records.

Store state:

- latest result
- history
- loading flag
- error message
- active review id

Each history item stores:

- result
- generated time
- role family
- resume signature
- JD signature or empty string
- target role label

Do not store AI keys or provider secrets.

## AI Service Design

Add `src/services/resumeReview/`:

- `types.ts`: result and request types.
- `formatResume.ts`: convert current structured resume into review text.
- `rubrics.ts`: role-family detection and rubric definitions.
- `prompt.ts`: build system and user prompts.
- `review.ts`: call AI, parse JSON, validate, clamp scores, and normalize output.

The service should use the existing AI request utilities:

- Use `nonStreamAIRequest` for the first version.
- Use `cleanJsonResponse` before parsing.
- Use existing OpenAI-compatible config.

Add a new AI feature key:

- `resumeReview`

Config resolution:

1. Use `aiConfigStore.getConfigForFeature('resumeReview')`.
2. If no override exists, existing store behavior should fall back to the active/default channel.

## Prompt Requirements

The prompt should include:

- Strict JSON-only output.
- Exact output schema.
- Rubric for the detected role family.
- JD context only when available.
- Fairness constraints adapted from hiring-agent:
  - ignore name
  - ignore gender
  - ignore age
  - ignore school prestige
  - ignore GPA or grades
  - ignore city/location
  - score only on role-relevant experience, skills, projects, impact, evidence, and professional expression
- Explicit requirement that each score needs evidence.
- Explicit requirement that deductions are specific and actionable.

The first version should not ask the model to infer live GitHub activity. It may evaluate whether project links, portfolio links, GitHub links, or demos are present in the resume text.

## UI Components

Add `src/components/resumeReview/`:

- `ReviewScoreHero.vue`: overall score, verdict, general score, JD fit score.
- `ReviewCategoryList.vue`: category cards or rows with score, evidence, deductions, advice.
- `ReviewActionList.vue`: optimization tasks with priority and module jump action.
- `ReviewHistoryPanel.vue`: recent review records.
- `ReviewEvidencePanel.vue`: optional detail area for evidence and scoring notes.

Add `src/views/ResumeReviewView.vue` as the orchestration view.

The UI should follow the current PrepWise workbench style:

- Dense and scannable.
- No nested card stacks.
- Calm professional visuals.
- Clear states for loading, empty result, error, and completed review.

## Error Handling

- If resume content is too thin, do not call AI. Ask the user to add at least core basic info plus one of skills, project, or work experience.
- If AI config is missing, show the existing configuration path.
- If AI returns invalid JSON, show a readable error and allow retry.
- If a score is outside its allowed range, clamp it on the client.
- If JD data is missing, set `jdFitScore` to `null` and do not mark this as an error.
- If role detection is uncertain, use the `general` rubric and expose that choice in the UI.

## Integration With Existing Loop

The module should connect to existing PrepWise flows:

- Resume editor shortcut opens review page.
- Review tasks can jump back to resume editor modules through `resumeStore.requestScrollToModule`.
- If JD analysis exists, include JD fit score and JD-driven risks.
- Later, review tasks can feed existing AI optimization services, but version one only navigates.

## Validation Plan

Run:

- `npm run type-check`
- `npm run build-only`

Manual checks:

- Empty or very thin resume.
- Technical resume without JD.
- Technical resume with JD.
- General resume without JD.
- General resume with JD.
- Invalid AI JSON response.
- Review history capped at 12.
- Task click jumps to the expected resume module.
- Desktop and mobile layout do not overflow.

## Implementation Boundaries

This spec is one implementation project. It includes the route, store, AI service, prompt, page, sidebar entry, editor shortcut, and local history for AI resume review.

It intentionally excludes GitHub enrichment and automatic rewriting so the first version remains stable in the current frontend-only app.
