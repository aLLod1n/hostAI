<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project status doc

`PROJECT_STATUS.md` at the repo root tracks what stage this project is in — build health, env var status, per-feature completion against `hostAI plan.md`, and what's blocking end-to-end testing.

**Rule: whenever you make a change to this project (code, schema, env config, deployment, dependencies), update the relevant section of `PROJECT_STATUS.md` in the same piece of work.** Don't treat it as a separate task — update it before considering the change done. Keep entries factual and current; remove/revise stale status rather than appending a history log.
