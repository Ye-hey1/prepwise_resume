# Project SOP Module Design

## Context

PrepWise already supports resume editing, JD analysis, interview practice, question-bank training, and AI coaching. The missing link is a durable project-story asset: a way to turn short resume project entries into a structured SOP document, interview-ready talk track, follow-up defense manual, and improvement roadmap.

The Project SOP module will be a first-level product module. It should reuse existing resume project entries, current JD analysis, AI streaming infrastructure, question-bank storage, and local persistence patterns.

## Goal

Build a standalone "Project SOP" workspace for candidates who need to explain project experience clearly in interviews and preserve a structured project review document.

The module should:

- Convert scattered project information into a trusted structured dossier.
- Generate a formal project SOP document for work review and knowledge transfer.
- Generate 1-minute and 3-minute interview scripts based on STAR and personal contribution.
- Generate high-frequency follow-up questions and structured answers.
- Generate short-term and long-term project optimization directions.
- Prevent hallucinated data by marking missing evidence as explicit placeholders.

## Recommended Approach

Use a structured dossier-driven workflow.

The user can create a dossier from an existing resume project or start from a blank dossier. The dossier becomes the single trusted source for all generated artifacts. AI output must trace back to dossier fields, JD analysis fields, or explicit placeholders.

Rejected alternatives:

- Direct generation from resume project text only. It is fast, but resume project entries are too shallow for reliable SOP and interview defense output.
- Chat-only project coach. It can feel natural, but it complicates state, validation, versioning, and artifact reuse for the first release.

## Product Scope

Add a first-level sidebar route named "Project SOP" at `/project-sop`.

The page has three primary areas:

- Project dossier list: create from resume project, create blank dossier, duplicate, delete, and view completeness.
- Dossier collection form: guided sections for project facts, personal role, background, goals, execution, decisions, problems, solutions, results, feedback, and future plans.
- Generated assets: SOP document, 1-minute script, 3-minute script, follow-up Q&A, improvement roadmap, and bonus talking points.

Generated Q&A items can be added to the existing question bank. Generated documents can be copied or downloaded as Markdown.

## Information Architecture

The dossier collection form is split into seven sections:

- Basic information: project name, industry or business line, project period, current stage, team size.
- Personal role: role, responsibility scope, collaboration objects, personal contribution boundary.
- Background and goals: macro background, concrete pain points, pain impact, target metrics.
- Execution process: core actions, timeline or module breakdown, key decisions, input/output, owner, acceptance criteria.
- Problems and solutions: one business or logic challenge, one execution or collaboration challenge, root cause, solution, landing actions.
- Results and feedback: launch data, measurement method, business value, stakeholder or manager recognition.
- Review and planning: shortcomings, short-term optimization, long-term roadmap, reusable scenarios.

## Data Model

Create an independent `projectSop` domain instead of extending the resume `ProjectEntry` type. Resume projects are optimized for display; Project SOP dossiers need deeper evidence and generated artifacts.

Core types:

- `ProjectSopDossier`: trusted input fields, source resume project ID, linked JD analysis ID, status, timestamps, and missing field metadata.
- `ProjectSopArtifact`: generated SOP, scripts, Q&A, roadmap, bonus sections, source signatures, generated time, and schema version.
- `ProjectSopValidation`: blocking issues, warning issues, completeness score, and targeted follow-up questions.
- `ProjectSopQuestion`: question type, interview difficulty, interviewer intent, answer strategy, answer text, and optional pressure-test flag.

Local persistence should follow existing Pinia plus localStorage patterns used by JD analysis, resume review, and question bank.

## Generation Flow

The generation flow is sequential:

1. Import an existing resume project or create a blank dossier.
2. Fill the guided dossier.
3. Run completeness validation.
4. Generate the SOP document.
5. Generate interview scripts.
6. Generate follow-up Q&A.
7. Generate optimization roadmap and bonus points.

Generation can be surfaced as one main action, but internally should keep separate artifact sections so failed stages can be retried without discarding completed output.

## AI Rules

The prompt must enforce JSON-only output for structured artifacts and these content rules:

- Do not invent metrics, technical details, business outcomes, manager feedback, or team facts.
- Missing metrics must be rendered as `[待补充：指标名称/统计口径]`.
- Avoid passive framing such as "领导安排".
- Avoid vague claims such as "用户体验不好", "效率低", or "通过努力克服".
- Make personal contribution explicit. Use "我负责", "我主导", or equivalent wording when supported by the dossier.
- Goals must map back to pain points.
- Results must include measurement logic when data exists.
- Follow-up answers should use "问题 - 思路 - 答案" or equivalent structured framing.
- Scripts should cover the four interview questions: why, how, result, and future optimization.

## Validation Rules

Blocking issues prevent full generation but still allow saving a draft:

- Missing project name.
- Missing personal role.
- Missing project background.
- Missing project goal.
- Fewer than two core execution actions.
- No project challenge.
- Missing current project stage.

Warning issues allow generation with placeholders:

- Missing quantitative result.
- Missing measurement method.
- Missing business or manager feedback.
- Missing key decision rationale.
- Missing future optimization direction.
- Missing evidence for JD-specific relevance.

## UI Behavior

The left panel lists dossiers with project name, source, completeness, linked JD, and last generated time.

The middle panel displays the guided form and validation prompts. Missing fields should be actionable, with targeted questions such as "上线后最能证明价值的指标是什么，统计周期是多少？"

The right panel displays generated artifacts in tabs:

- SOP 文档
- 1 分钟稿
- 3 分钟稿
- 深挖问答
- 优化路线图
- 加分项

Each artifact should show stale state when the dossier or linked JD changed after generation.

## Integration Points

- Resume store: import project name, role, period, introduction, and main work.
- JD analysis store: use target company, target position, requirements, gaps, prep insight, and candidate-fit artifacts when available.
- Question bank store: save generated follow-up questions with source type `jd_analysis` or a new source label if the existing union is extended.
- Agent assistant context: include top Project SOP dossiers and generated interview risks in the global assistant context later, so the floating assistant can reason over project-story assets.
- Prompt registry: add a `project-sop` category if prompt versioning is needed for this module.

## Proposed Files

- `src/stores/projectSop.ts`
- `src/services/projectSop/types.ts`
- `src/services/projectSop/prompt.ts`
- `src/services/projectSop/generator.ts`
- `src/views/ProjectSopView.vue`
- `src/components/projectSop/ProjectSopList.vue`
- `src/components/projectSop/ProjectSopDossierForm.vue`
- `src/components/projectSop/ProjectSopValidationPanel.vue`
- `src/components/projectSop/ProjectSopArtifactTabs.vue`
- Router and sidebar updates for `/project-sop`.

## First Release Boundary

Include:

- First-level route and sidebar menu.
- Dossier creation from resume projects.
- Manual dossier editing and local persistence.
- Completeness validation.
- AI generation for all core artifacts.
- Copy and Markdown download.
- Add selected Q&A to question bank.
- Stale artifact indicator.

Defer:

- Supabase sync.
- Chat-style multi-round intake.
- Complex artifact version diff.
- Automatic extraction from project management systems.
- Mock interview mode driven directly by Project SOP.

## Testing And Verification

Minimum verification:

- `npm run type-check`
- `npm run build-only`
- Manual smoke path: import resume project, complete dossier, validate missing fields, generate artifacts with placeholders, add Q&A to question bank, refresh page, confirm persistence.

Focused functional checks:

- Validation blocks full generation when required fields are missing.
- Warning fields produce placeholders instead of invented data.
- Generated artifacts become stale when the dossier changes.
- Question-bank import deduplicates or avoids obvious duplicate questions.

## Open Implementation Notes

The first implementation should favor clear domain types and deterministic validation before prompt complexity. The AI generator can be split into staged calls if one large JSON response proves brittle, but the user-facing flow should remain one coherent generation action.
