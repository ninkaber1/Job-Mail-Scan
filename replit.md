# Job Application Email Tracker

A full-stack job application tracker that connects to email via IMAP/Gmail OAuth, uses AI to scan for job-related emails, and organizes all applications into a searchable table. Each user's data is fully isolated.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

Required env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (`artifacts/job-tracker`)
- **Backend**: Express 5 (`artifacts/api-server`)
- **Database**: PostgreSQL + Drizzle ORM (`lib/db`)
- **Auth**: Clerk (`@clerk/express` on server, `@clerk/react` on client)
- **AI**: OpenAI gpt-4o-mini via Replit AI Integrations
- **Email**: imapflow (IMAP), mailparser
- **API**: Contract-first OpenAPI → Orval codegen → React Query hooks + Zod schemas

## Where things live

```
lib/db/src/schema/         — DB schema (applications, email_sessions)
lib/api-spec/openapi.yaml  — Source of truth for API contract
lib/api-client-react/      — Generated React Query hooks
lib/api-zod/               — Generated Zod schemas
artifacts/api-server/src/routes/  — Express route handlers
artifacts/api-server/src/lib/     — email-scanner.ts, email-providers.ts
artifacts/job-tracker/src/pages/  — connect.tsx, applications.tsx, dashboard.tsx
```

## Architecture decisions

- **userId isolation**: All application and email_session DB queries filter by `getAuth(req).userId` (Clerk). No cross-user data leakage.
- **Multi-email**: Users can connect multiple email accounts. `GET /email/status` returns `{ accounts: [] }`. Disconnect takes `{ sessionId }`.
- **AI scanner**: gpt-4o-mini classifies each email. `interviewerInfo` extracted for interview emails; falls back to sender name if not found. Results: `interview | next-stage | rejected | applied | no-response`.
- **IMAP credentials**: Obfuscated with XOR in DB (IMAP app passwords are low-risk by design). Google OAuth tokens stored directly.
- **Codegen gotcha**: After `codegen`, fix `lib/api-zod/src/index.ts` to only `export * from "./generated/api";` — orval adds stale `api.schemas` export each time.
- **imapflow/mailparser**: Externalized in `build.mjs` (CJS deps incompatible with ESM bundling).

## Product

- Sign in with Google (via Clerk)
- Connect multiple Gmail/Outlook/Yahoo/iCloud/custom IMAP accounts per user
- Gmail OAuth (no app password needed) or IMAP app password
- AI-powered inbox scan: extracts employer, position, contact, interviewer, method, result, notes
- Applications table: search, filter by status, export CSV, always-visible edit/delete buttons, inline-editable Comment column
- Dashboard: total / interviews / next-stage / rejected / no-response stats + recent activity
- Manual application entry form (includes Comment + AI Notes fields)

## User preferences

- Contact column in table shows email address only (no name)
- Name & Title (interviewerInfo) column hidden from table; still stored and populated by AI
- "Applied" is a distinct status (application receipt confirmation)
- AI extracts interviewer name/title; falls back to sender name for interview emails
- `comment` column is user-editable free text (separate from AI-generated `notes`); click-to-edit inline in the table
- Mobile nav Sheet closes automatically when a nav link is tapped

## Gotchas

- After codegen, always fix `lib/api-zod/src/index.ts` (see above)
- `email_sessions.user_id` and `applications.user_id` are nullable TEXT (old rows have NULL — they're effectively orphaned)
- The `node` type definition error in typecheck:libs is pre-existing and doesn't affect builds
- Do not call service ports directly — use `localhost:80/<path>` through the shared proxy
