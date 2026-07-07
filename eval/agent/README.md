# Agent Evals

This folder contains deterministic guardrail checks for the PrepWise Agent entry.

Run:

```bash
npm run eval:agent
```

Current coverage:

- Tool decision rules: resume writes must use `resume.apply_change_proposal` with `preview_required`.
- ReAct routing rules: natural language should choose JD summary, resume proposal, chat, or external-action blocking.
- Read-only JD summary: JD gap analysis must use `jd.build_match_summary`.
- External action safety: unsupported delivery automation must not be executed directly.
- JD summary shape: matched, partial, missing keywords, Top gaps, fact gaps, confirmed changes.
- Keyword lift: confirmed changes must explain which missing keywords improved.

These evals are intentionally deterministic and do not call an LLM. They are a small safety baseline before replacing the lightweight frontend ReAct router with a backend ReAct loop, real SSE replay, or an LLM judge.
