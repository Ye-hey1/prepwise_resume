# PrepWise UI Iteration Plan

## Context

PrepWise is a focused career-preparation workspace. The interface should feel calm, precise, and trustworthy during long resume editing, JD comparison, review, and interview-practice sessions. This pass treats the product as an app UI, not a marketing surface.

## Current Findings

- The product context exists in `PRODUCT.md`; no dedicated `DESIGN.md` was found.
- The main design system is concentrated in `src/assets/main.css`, with tokens for color, spacing, radius, typography, motion, and shared surface classes.
- Recent work added or heavily changed the workspace dashboard, training center, interview quiz flow, review history, and several stores.
- Visual language has mostly moved toward restrained product UI, but several areas still drift: page shells repeat per view, status chips use one-off colors, buttons and cards vary by feature, and some older side-accent/bounce-motion patterns remain.
- Automated design detection flagged thick side accents, bounce or elastic motion, and layout-property transitions across several modules. The highest-value subset for this pass is the current work surface: workspace, training center, quiz dialog, review panels, global toast/sidebar patterns, and shared tokens.

## Iteration Principles

1. Design serves workflow speed: scannability, consistent affordances, and clear next actions matter more than decoration.
2. Align shared vocabulary first: tokens and reusable utility classes should make pages feel related without over-abstracting Vue components.
3. Remove recognizable generated-UI tells: side stripes, elastic motion, arbitrary shadows, and isolated card styles.
4. Preserve existing behavior: store shape, routing, data persistence, import/export, and resume preview/export flows must remain intact.
5. Verify with typecheck/build plus real viewport checks. If browser automation is unavailable, use screenshots already present and code-level responsive review, then note the gap.

## Phase 1: Design System Hygiene

- Add missing semantic state tokens for success, warning, danger, and info surfaces, borders, and text.
- Replace `--focus-ring: none` with a visible accessible focus color.
- Add shared app UI utilities for page shells, page headers, cards, metric cards, toolbar controls, pills, and product buttons.
- Reduce hard-coded status rgba values in newly touched surfaces by migrating to semantic tokens.
- Keep radius moderate: cards at 8-12px, dialogs at 14-16px, pills only where the control truly reads as a pill.

## Phase 2: Workspace Dashboard

- Replace bespoke tab, card, metric, quick-entry, and status styles with shared product utilities.
- Remove left-stripe hero treatment and use full border/background state instead.
- Tighten information hierarchy: page title, tabs, next action, stats, pipeline, quick entries.
- Ensure mobile stacks are stable and every text block can wrap without overflow.
- Improve keyboard focus on route links and tabs.

## Phase 3: Training Center

- Align the page shell and header with the workspace dashboard.
- Standardize primary/secondary/text buttons and select controls.
- Remove left side accents from active rows and plan cards; use selected border, status dot, or surface tone.
- Make job rows and plan cards handle long company, role, and question text cleanly.
- Keep the right-side task panels dense but readable.

## Phase 4: Interview Quiz Dialog

- Align modal sizing, header, close button, overlay, and transitions with product-dialog conventions.
- Remove wide decorative shadow and use border/surface structure.
- Ensure the modal works on mobile without clipped header/body actions.
- Audit setup, session, and result panels for thick side accents and layout-width transitions in the touched flow.

## Phase 5: Review And Shared Feedback

- Align review page header, empty state, stale/error notices, history panel, and action blocks to the shared shell.
- Replace toast side stripes with semantic full-border/background variants.
- Make status/focus/disabled states consistent in light and dark themes.

## Phase 6: Validation

- Run `npm run type-check`.
- Run `npm run build`.
- Run the impeccable detector again on `src`.
- Capture desktop and mobile screenshots if a browser runtime is available.
- Review `git diff` for unrelated churn and avoid touching user-owned changes outside the intended UI polish scope.

