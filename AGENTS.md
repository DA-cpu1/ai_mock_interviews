<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project instructions

These instructions apply to the entire repository. Keep the Next.js-managed block above intact; project-specific rules belong below it.

## Sources of truth

- Treat the checked-out code, `package.json`, lockfile, and configuration as the current implementation. Treat `阿里云AI实时互动接入实施计划.md` as a roadmap: do not assume an item is implemented until the code proves it.
- Before changing Next.js code, read the task-relevant guide under the installed version's `node_modules/next/dist/docs/`. Follow its current APIs and deprecation notices instead of relying on memory.
- `README.md` documents setup and currently supported entry points. `AI-Mock-Interview-中文学习讲义.md` is learning material, not permission to revive obsolete Vapi/Gemini architecture.
- If repository facts conflict with a requested assumption, report the conflict and confirm any materially different direction before proceeding.

## Mandatory working method

- Inspect `git status` and the relevant diff before editing. Preserve all user changes and unrelated uncommitted work; never discard, overwrite, or reformat them incidentally.
- Prefer the smallest coherent change that completes the current request. Preserve behavior, UI, file structure, Firebase setup, public contracts, and naming unless the task requires a change.
- Split every code change into small, independently verifiable implementation steps. Each step must have one clear purpose and leave the touched area in a coherent state.
- For each task, split the implementation into small, cohesive modules or steps with clear responsibilities. Keep each code-writing operation or patch to no more than 100 added or modified lines across all files, including source, tests, styles, and executable configuration. If a step would exceed that size, first look for a behaviorally sensible way to split it; obtain the user's explicit approval only when no such split is practical.
- Do not evade the size guideline with generated rewrites or meaningless fragments. Each split must remain independently coherent, reviewable, and verifiable.
- After each implementation step, explain in plain language what changed, why it was needed, and exactly how the user can verify it.
- Do not perform broad refactors, move many files, replace working libraries, upgrade packages, or add dependencies for convenience. Explain the necessity, affected files, risk, and rollback plan, then get approval before any genuinely larger change.
- Do not create commits, branches, deploy, or mutate external services unless the user explicitly requests it.

## Current technical baseline

- Package manager: npm with `package-lock.json`; keep the lockfile consistent with `package.json`.
- Framework: Next.js 16.3.1 App Router, React/React DOM 19.2.8, and TypeScript 5 with `strict`, `noEmit`, bundler resolution, and `@/*` mapped to the repository root.
- UI: Tailwind CSS 4, shadcn configuration with the `new-york` style, CSS variables, Base UI/Radix primitives, Lucide icons, and CSS Modules for the Aliyun interview client.
- Data/auth: Firebase client SDK plus Firebase Admin for server-side Authentication, Session Cookies, and Firestore.
- Realtime voice: pinned `aliyun-auikit-aicall` 2.10.5. Do not silently upgrade this vendor SDK; isolate an upgrade and run compile plus real call regression checks.
- Keep existing dependencies and exact architecture unless the requested feature makes a change necessary. Ask before adding a package.

## Repository map and ownership

- `app/(auth)/` owns sign-in/sign-up layouts and pages; `app/(root)/` owns authenticated product pages. Route groups do not change URL paths.
- `app/api/` contains App Router Route Handlers. `app/api/ai-realtime/sessions/route.ts` currently accepts only authenticated `POST` requests with an empty JSON object and returns short-lived browser connection data.
- `components/ui/` contains shared shadcn-style primitives. Keep feature-specific orchestration in its feature area, such as `components/interview/`, instead of expanding primitives with business logic.
- `firebase/client.ts` is browser Firebase setup. `firebase/admin.ts`, `lib/action/`, and `lib/aliyun/*.server.ts` are server-side boundaries.
- Shared domain declarations live in `types/`; generic helpers live in `lib/`; static mappings and seed/demo data live in `constants/`; public assets live in `public/`.
- Tests currently live under `tests/ai-realtime/`. Place new tests beside the domain they protect and keep deterministic crypto tests independent of wall-clock time.

## Next.js and code boundaries

- App Router components are Server Components by default. Add `"use client"` only at the narrowest boundary that needs browser APIs, state, effects, Firebase client APIs, microphone access, or the AICallKit SDK.
- Never import Firebase Admin, Node crypto, environment-secret readers, or `server-only` modules into a Client Component. Keep the session/token route on the Node.js runtime and dynamically rendered unless verified requirements change.
- Use Server Actions only for trusted server work, validate their inputs, and independently authenticate every protected action or route. A page having checked login is not sufficient API authorization.
- Prefer the configured `@/` alias for cross-directory imports. Preserve nearby naming and formatting; do not run repository-wide formatters or clean up unrelated lint issues.
- Keep TypeScript strict. Avoid new `any`, unchecked casts, duplicate boolean state that can express impossible session combinations, and swallowed errors. Return stable, user-safe failures while retaining useful server diagnostics without secrets.
- Preserve accessibility semantics, keyboard operation, loading/error/disabled states, and the existing responsive visual language when editing UI.

## Authentication, secrets, and data safety

- Server credentials belong only in ignored `.env.local` or deployment environment settings. Never commit, print, return, snapshot, or expose real secrets, tokens, Session Cookies, private keys, or raw credential-bearing errors.
- Firebase Admin uses `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`. Preserve newline normalization for the private key and reusable initialization during hot reload.
- Aliyun server configuration uses `AI_REALTIME_ENABLED`, `ALIYUN_AI_REALTIME_REGION`, `ALIYUN_AI_AGENT_ID`, `ALIYUN_RTC_APP_ID`, `ALIYUN_RTC_APP_KEY`, `ALIYUN_RTC_TOKEN_TTL_SECONDS`, and `AI_REALTIME_MAX_SESSION_MINUTES`.
- Never give `ALIYUN_RTC_APP_KEY`, Firebase Admin credentials, callback tokens, or other server secrets a `NEXT_PUBLIC_` prefix. The feature must remain safely disabled when `AI_REALTIME_ENABLED` is not exactly `true`.
- Continue validating content type, body size, fields, authentication, ownership, quotas, and bounded TTL/session values at server entry points. Sensitive responses must use `Cache-Control: no-store`.
- RTC audio flows directly between the browser/AICallKit and Aliyun ARTC; Next.js must not proxy audio or hold a long-lived media WebSocket. The current product uses microphone-only audio and does not save raw recordings.
- Browser subtitles are display-only and are not authoritative for persisted transcripts or scoring. When callback persistence is implemented, authenticate callbacks, enforce size limits, and deduplicate events before writing Firestore.

## Product scope and architecture decisions

- The default product is personal AI interview practice on desktop browsers, currently voice-only. Do not silently expand it into formal recruiting, proctoring, video, recording, or high-stakes scoring.
- `/interview/aliyun-test` is the isolated AICallKit verification page; `/interview` uses the reusable interview client. Prove vendor SDK behavior on the test page before integrating new behavior into the main flow.
- Retain the current Alibaba Cloud IMS/ARTC approach. The browser starts the practice call with short-lived server-issued connection data; Next.js handles auth, token/session preparation, persistence, callbacks, and later feedback—not STT/LLM/TTS streaming.
- Formal hiring, examination, or paid certification requires an explicit architecture decision: server-started agent instances and server callback/CallLog data as the scoring authority. Obtain approval before making that switch.
- Preserve the rollback flag and disabled state. Do not implement later phases from the roadmap unless the current user request includes them.

## Verification and handoff

- Start with the narrowest relevant check. Available baseline commands are `npm run test:artc-token`, `npm run lint`, and `npm run build`; `npx tsc --noEmit` is an additional focused type check.
- For UI or realtime changes, also exercise the affected route in `npm run dev`, inspect terminal/browser errors, and verify permission denial, start, active call, mute, interrupt, hangup, unmount cleanup, retry, and disabled-feature states as applicable.
- For authentication or API changes, verify unauthenticated and malformed requests as well as the happy path. Never use real credentials in fixtures or captured output.
- Do not claim a live Aliyun call, Firebase write, production build, or browser behavior was verified unless it actually ran. Report the exact commands/checks run, their results, and any unverified gaps.
