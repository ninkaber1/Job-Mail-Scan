# Job Application Email Tracker

## Overview

A full-stack job application tracker that connects to your email via IMAP, uses AI (OpenAI) to scan for job-related emails, and organizes all applications into a searchable table.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (artifacts/job-tracker)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: OpenAI via Replit AI Integrations (email scanning/parsing)
- **Email**: imapflow (IMAP), mailparser

## Key Features

- Connect Gmail, Outlook, Yahoo, iCloud, or custom IMAP
- AI-powered email scan to extract job application data
- Applications table with search, filter by status, CSV export, inline edit
- Dashboard with stats: total, interviews, next-stage, rejected, no-response
- Manual application entry

## Application Data

Columns: Date of Contact, Position, Employer, Contact Name, Method of Contact (email/zoom/teams/google-meet/phone/linkedin), Email Address, Result (interview/next-stage/rejected/no-response)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Important Notes

- After running codegen, manually fix `lib/api-zod/src/index.ts` to only contain `export * from "./generated/api";` (orval adds stale exports)
- Email passwords are obfuscated with XOR in the DB (not real encryption — IMAP app passwords are intended for this use)
- imapflow and mailparser are externalized in build.mjs (CJS deps)
- OpenAI integration: AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY are auto-set

## DB Schema

- `applications` — job application records
- `email_sessions` — connected email account (one at a time)
