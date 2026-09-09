# AI Transformation Discovery Platform

A consultant-facing tool that turns narrative accounts of how work actually
gets done into structured, reviewable knowledge — and then into current-state
artifacts.

Someone describes a process in prose. The Structuring Agent extracts entities
and relationships into an Engagement Knowledge Base (EKB), tagging every fact
with an **evidence state** — `stated`, `inferred`, `estimated`, or `gap` — so
that what the source actually said stays distinguishable from what the model
filled in. Gaps are first-class: a partially-known process is representable by
construction rather than by convention.

Built on Next.js, PostgreSQL via Prisma, and a provider-agnostic model layer
(Claude first).

- Build plan and roadmap: [`TASKS.md`](./TASKS.md)
- Full spec: `AI_Transformation_Platform_Full_Spec.docx`
- Extraction-quality reviews (against synthetic test narratives): [`docs/reviews/`](./docs/reviews/)

## Setup

Requires Node 20+ and a local PostgreSQL server.

1. Create the database:
   ```bash
   createdb personal_discovery_agent
   ```
2. Configure environment. Copy [`.env.example`](./.env.example) to `.env` and
   set `DATABASE_URL`; put your real `ANTHROPIC_API_KEY` in `.env.local`. Both
   are gitignored.
3. Install, migrate, and run:
   ```bash
   npm install
   npx prisma migrate dev     # creates schema + generates the client
   npm run dev
   ```
4. Open <http://localhost:3000>, create an engagement, and submit a narrative
   in the capture pane.

Without a valid `ANTHROPIC_API_KEY` the app builds and the UI loads, but
narrative capture fails at the model call.

## Layout

| Path | What lives there |
|---|---|
| `prisma/schema.prisma` | The EKB: 9 core entities, relationship join tables, and a polymorphic `Provenance` table carrying evidence state at entity *and* attribute level. |
| `src/lib/model/` | Model-layer abstraction. Agents call `getModelProvider()` and never import a provider SDK directly — swapping providers means editing `src/lib/model/index.ts`, not agent code. |
| `src/lib/agents/structuring/` | Structuring Agent: raw narrative → proposed EKB entities, tuned by capture mode (write-up vs. live). `prompt.ts` holds rules earned by the reviews in `docs/reviews/`. |
| `src/lib/agents/currentState/` | Current-state generator: EKB → swim-lane flow, panels, and gap callouts. |
| `src/lib/orchestrator.ts` | Routes capture input to the right agent and sequences the resulting EKB writes. |
| `src/app/api/engagements/**` | API contract: engagement/contributor CRUD, narrative capture, current-state generation, knowledge-surface snapshot. |
| `src/app/engagements/[engagementId]/` | Two-pane workspace: capture surface (left) bound to the same engagement as the knowledge surface (right). |

## Development

```bash
npm run dev         # dev server
npm run build       # production build
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm test            # offline suite — no network, no database
npm run test:model  # + live extraction-quality eval (costs tokens)
```

`npm test` pins the persistence contract in `apply.ts` and the pure
current-state logic against a fake transaction, so it runs without a database
or an API key. `test:model` additionally calls the live model to check
extraction quality against the lessons recorded in `docs/reviews/` — it is
opt-in because it costs tokens and is non-deterministic. Run it after editing
`prompt.ts`.

## Database

Schema changes go in `prisma/schema.prisma`, then:

```bash
npx prisma migrate dev --name <change>
```

This regenerates the client into `src/generated/prisma` (gitignored — run
`npx prisma generate` after a fresh clone if you skip the migrate step).
