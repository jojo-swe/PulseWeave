# HANDOVER.md

Överlämning mellan agenter och sessioner. Läs innan du börjar, uppdatera innan du slutar.

## Aktuellt läge

*Senast inventerat 2026-11-04 av Claude (Cowork).*

Projekt: A modern, secure, and scalable team communication platform built with Next.js, Express, and Socket.io.

- Huvudbranch: `master`
- Senaste commit på `master`: 2026-11-01 `8d89eed` Add privacy-guard scanning and mask private values in tests (#15)
- Öppna PR:er: 2
- Andra brancher på remote: 12

## Pågående arbete

| Agent/vem | Branch | Status | Beskrivning |
|-----------|--------|--------|-------------|
| app/dependabot | `dependabot/npm_and_yarn/npm_and_yarn-0316fbeb46` | PR #6 öppen, uppdaterad 2026-10-08 | chore(deps): bump the npm_and_yarn group across 4 directories with 6 updates |
| app/dependabot | `dependabot/npm_and_yarn/npm_and_yarn-d27fd4ffe2` | PR #5 öppen, uppdaterad 2026-10-08 | chore(deps): bump the npm_and_yarn group across 5 directories with 8 updates |
| Cursor | `cursor/privacy-guard-e723` | branch utan PR, senaste commit 2026-11-01 | Require HTTPS when the privacy-guard workflow downloads gitleaks |
| Cursor | `cursor/dual-licensing-docs-dfb3` | branch utan PR, senaste commit 2026-10-25 | fix: point the beta deploy docs at beta.pulseweave.io |
| Cursor | `cursor/readme-website-link-5a2c` | branch utan PR, senaste commit 2026-10-23 | docs: link the live PulseWeave website in the README |
| Cursor | `cursor/next-16-4-1-cve-2026-94482-f37e` | branch utan PR, senaste commit 2026-10-23 | chore(deps): bump next to 16.4.1 (CVE-2026-94482) |
| Cursor | `chore/deps-nodemailer-10.0.13` | branch utan PR, senaste commit 2026-10-15 | chore(deps): bump nodemailer to 10.0.16 |
| Cursor | `chore/deps-high-critical-sweep` | branch utan PR, senaste commit 2026-10-08 | chore(deps): bump high and critical Dependabot packages |
| Cursor | `chore/deps-nodemailer-10.0.6` | branch utan PR, senaste commit 2026-10-08 | fix(backend): import Transporter type from nodemailer 10 |
| Cursor | `cursor/agents-md-84be` | branch utan PR, senaste commit 2026-10-02 | docs: make AGENTS.md the agent instruction source of truth |
| Claude | `claude/add-claude-documentation-tSR8O` | branch utan PR, senaste commit 2026-09-29 | Run backend lint through pnpm --filter so it uses the backend's ESLint 8 |
| okänd (människa/agent) | `redesign-glassmorphism` | branch utan PR, senaste commit 2026-02-07 | docs: Expand README with comprehensive feature list, architecture details, and testing documentation |

## Nästa steg

- Granska och besluta om de öppna PR:erna ovan (merga eller stäng).
- Gå igenom brancher utan PR: öppna PR, merga eller radera (fråga användaren innan radering).
- Fyll på "Bygga och testa" i AGENTS.md om något saknas eller är fel.

## Kända problem

- Inga dokumenterade ännu.

## Senaste commits

- 2026-11-01 `8d89eed` Add privacy-guard scanning and mask private values in tests (#15)
- 2026-10-25 `d99bdf5` Merge pull request #14 from jojo-swe/cursor/dual-licensing-docs-dfb3
- 2026-10-25 `78d868f` fix: point the beta deploy docs at beta.pulseweave.io
- 2026-10-25 `3f736ee` docs: decline external pull requests
- 2026-10-25 `d7bd358` docs: describe dual licensing and prices in the README
- 2026-10-25 `57e1a1d` docs: add the commercial self-hosted license
- 2026-10-25 `f6663a5` chore: stop tracking the local Prisma SQLite database
- 2026-10-25 `6c990ed` docs: audit runtime licenses for a commercial grant
- 2026-10-23 `7298c0f` docs: link the live PulseWeave website in the README (#13)
- 2026-10-23 `ee03d9f` chore(deps): bump next to 16.4.1 (CVE-2026-94482) (#12)

## Logg

| Datum | Agent | Vad som gjordes |
|-------|-------|-----------------|
| 2026-11-04 | Claude (Cowork) | Lade till AGENTS.md, HANDOVER.md och CLAUDE.md; inventerade PR:er, brancher och commits. |
