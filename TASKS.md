# AI Transformation Discovery Platform — Build Task List

Derived from `AI_Transformation_Platform_Full_Spec.docx`. Tasks are sequenced by the five capability phases in the roadmap (§19), scoped against the v1 boundary the spec draws in §7. Each phase should ship something usable and rest on the phase before it.

---

## Phase 1 — The Knowledge Spine

**Rationale:** the riskiest piece, so it comes first. Get this wrong and nothing downstream is trustworthy.
**Ships when:** a user types an account of a process and sees it become structured, editable knowledge.

### EKB data model
- [x] Model the 9 core entities — Engagement, Process, Process Step, Stakeholder/Persona, System/Application, Data Source, Knowledge Source, Pain Point, Exception, Metric, Opportunity (§8.2)
- [x] Design relational + JSON hybrid schema in PostgreSQL — relational core, JSON columns for gappy/evolving attributes (§17.2)
- [x] Build join tables for entity relationships (step↔system, pain point↔step, opportunity↔pain point, etc.) (§8.3)
- [x] Add provenance + evidence-state metadata columns (stated / inferred / estimated / gap) at entity and attribute level (§8.4, §17.2) — polymorphic `Provenance` table, see `prisma/schema.prisma`
- [x] Make every entity support a partial/gap state by construction, not by convention (§8.1) — all attribute columns nullable

### Structuring Agent
- [x] Build extraction pipeline: raw narrative text → structured EKB entities + relationships (§9.2) — `src/lib/agents/structuring`
- [x] Implement entity resolution against existing EKB records (e.g. "the recon platform" → System: ReconPro) (§9.2) — existingId matching against a supplied entity summary list
- [x] Assign evidence states (stated / inferred / estimated) during extraction (§9.2, §8.4)
- [x] Flag low-confidence extractions for review (§9.2) — `lowConfidenceNotes` in agent output
- [x] Tune capture-mode behavior: faithful/loose structuring in live mode vs. assertive structuring in write-up mode (§9.2, §6.5) — `src/lib/agents/structuring/prompt.ts`

### Platform scaffolding
- [x] Stand up back end: EKB store, agent orchestration shell, business logic layer (§17.1) — Next.js + Postgres/Prisma
- [x] Build model-layer abstraction (structured output, retries, context mgmt) so agents stay model-agnostic (§17.3, §9.1) — `src/lib/model`, Claude provider first, swappable
- [x] Define initial API contract for entity CRUD + relate operations (§17.4) — `src/app/api/engagements/**`
- [x] Stub the Orchestrator: routes narrative input to Structuring Agent (§9.2) — `src/lib/orchestrator.ts`

---

## Phase 2 — Capture and Current State

**Rationale:** the first real output the platform delivers.
**Ships when:** narrative + swim-lane artifacts render from live EKB data.

### Capture modes & ingestion
- [ ] Build capture-mode toggle (relayed write-up ↔ live scratchpad) governing response behavior only (§6.2, §6.4)
- [ ] Implement write-up mode: structure + converse back (confirm captured, surface gaps, ask targeted questions) (§6.2)
- [ ] Implement live-scratchpad mode: quiet structuring, gaps parked rather than interrupting (§6.2)
- [ ] Build document ingestion (SOPs, spreadsheet extracts, email templates) into EKB with source tagging (§6.3)
- [ ] Build screenshot ingestion with conservative confidence handling — tag as visually derived, flag for confirmation (§6.3, §6.5)

### Current-State Agent
- [ ] Generate prose narrative from Process/Step/Persona/System EKB records (§9.2, §13.1)
- [ ] Generate swim-lane flow view organized by actor, with data movement and escalation points marked (§13.1)
- [ ] Size decision-diamond and task nodes to their actual text content rather than a fixed footprint, so lane height/diamond size stay proportional as real process data varies (design ref: `design/design-system.html` §05)
- [ ] Render gaps honestly in generated artifacts (undefined exit criteria, unknown API status, etc.) rather than papering over them (§13.2)
- [ ] Implement regenerate-on-change: artifacts rebuild from EKB rather than being edited in place (§13.3)

### Direct editing & UI split
- [ ] Build EKB direct-edit surface — correct facts, add entities, attach evidence without going through conversation (§6.4)
- [x] Build the two-pane UI shell: capture surface + knowledge surface, bound to shared state (§17.5) — `src/app/engagements/[engagementId]`, MVP: live entity counts + gap badges, not yet the full coverage/process-flow views
- [ ] Wire contributor tagging on all capture so provenance records session + person (§17.6)
- [ ] Handle concurrent contribution at entity level — preserve both inputs on collision rather than overwrite (§17.6)

---

## Phase 3 — Gaps and the Co-Pilot

**Rationale:** the differentiator that makes this more than a structured notepad — the platform starts directing discovery, not just recording it.
**Ships when:** the coverage dashboard and live-scratchpad prompts are driven by real gap analysis.

### Discovery Agent
- [ ] Define coverage targets per process as the concrete standard gap detection measures against (§10.1, §20)
- [ ] Build gap analysis: scan EKB for missing/thin/contradictory data (undefined exit criteria, unknown API status, unsupported high-volume pain point, etc.) (§9.2)
- [ ] Implement adaptive probing — surface the single most value-limiting gap next, not a fixed question list (§10.2)
- [ ] Encode general-purpose discovery reflexes: chase the branch ("depends on the type"), quantify the relative ("most of it"), establish system API access (§10.2)
- [ ] Route Discovery Agent output by context: conversational questions in write-up mode, parked prompts in live mode (§9.2, §10.3)

### Confidence engine
- [ ] Build the single confidence engine derived from evidence-state completeness (not separately entered) (§12.3, §12.4)
- [ ] Wire confidence engine as a shared component behind: gap detection, dashboard, and (later) canvas markers (§12.4)
- [ ] Build the Discovery Confidence Dashboard — per-area, per-process breakdown with concrete next actions (§7 Core Artifacts)

### Live co-pilot surface
- [ ] Build the coverage view on the knowledge surface (solid vs. thin areas) (§17.5)
- [ ] Surface parked live-mode prompts as facilitator-optional questions, never auto-asked to the expert (§6.2, §10.3)
- [ ] Make long-running gap analysis asynchronous so live capture never blocks (§18 Responsiveness)

---

## Phase 4 — Opportunities and the Canvas

**Rationale:** completes the v1 arc — raw narrative to a prioritized, solution-classified opportunity set with visible reasoning.
**Ships when:** opportunities are derived, classified, scored, and plotted with honest confidence.

### Opportunity Agent
- [ ] Derive candidate opportunities from pain points, exceptions, and process structure (§9.2)
- [ ] Capture problem, linked pain points, proposed solution, benefits, risks, dependencies per opportunity (§8.2)
- [ ] Classify transformation-lens category: eliminate / automate / optimize / value-add (§8.2, §7 Core Artifacts)

### Decision framework (solution fit)
- [ ] Build the solution-class decision tree over the 8 classes, from No Change through Agentic AI (§11.1, §11.2)
- [ ] Wire each tree question to concrete EKB fields (exception density, API availability, data structure, decision authority) (§11.2)
- [ ] Generate reasoning + alternatives-considered output alongside every classification (§11.2)
- [ ] Handle thin-evidence case: say the classification isn't confident yet and name what's missing (§11.2)

### Assessment Agent & scoring
- [ ] Define value factors (volume, time/effort, error/rework, people, escalation load, strategic importance) and weight-of-evidence roll-up (§12.2)
- [ ] Define complexity factors (systems touched, API availability, exception density, judgment/regulatory load, data state) and worst-constraint roll-up (§12.2)
- [ ] Implement High/Medium/Low/Unknown banding — no numeric scores (§12.1)
- [ ] Derive per-opportunity confidence from factor completeness (§12.3)

### AI Transformation Canvas
- [ ] Build value × complexity grid with automation-fit overlay (§7 Core Artifacts)
- [ ] Render confidence as marker solidity (solid = well-evidenced, faded/outlined = thin) (§12.3)
- [ ] Surface the roll-up asymmetry (value adds up, complexity gates on worst factor) in the UI, not hidden logic (§12.2)

---

## Phase 5 — The Domain Pack

**Rationale:** demonstrates the pack mechanism and proves the platform can probe at expert level in a real vertical — more load-bearing than its "demonstration" framing suggests.
**Ships when:** one vertical's Discovery/Structuring probing measurably outperforms the generic core.

### Pack mechanism
- [ ] Design the domain-pack interface: how packs plug into Discovery + Structuring agents (§9.3)
- [ ] Keep packs additive/swappable — no core schema changes required per pack (§9.3, §18 Reusability)

### First vertical pack
- [ ] Choose the first vertical and select a real target process for validation
- [ ] Author domain-specific probing questions, common systems/patterns, and typical lurking exceptions (§9.3)
- [ ] Validate the generic core still functions standalone (unaffected by the pack) on a second, unrelated process (§18 Reusability)

---

## Explicitly Deferred (out of v1 scope, §7)

- **Expert-direct interview mode** — architecture reserves a place for it as an alternate front-end onto Structuring/Discovery (§6.2)
- **Meeting/voice transcript ingestion** — out of scope entirely (§7)
- **Future-state design** — target operating model, human checkpoints, agent interactions (§14)
- **ROI estimation** — waits on real baseline metrics, not estimates (§15)
- **Executive deliverables** — decks, business cases, roadmaps (§16)
- **Formal prioritization/sequencing** — beyond canvas placement (§15)
- **Additional domain packs** — beyond the first (§7)

---

## Risks Worth Tracking While Building (§20)

| Risk | Mitigation |
|---|---|
| **Gap detection is load-bearing** | The co-pilot, confidence model, and canvas honesty all rest on it. Weak gap detection collapses the platform's core advantage over a form. Keep coverage targets explicit and test against them early — the single biggest technical risk. |
| **Extraction quality tracks input quality** | Hurried live fragments and screenshots produce noisier structure. Stance: capture faithfully, structure loosely, flag for review — accept this asks more of the user during write-up. |
| **Scoring is only as good as its inputs** | Mostly-Unknown factors mean bands rest on estimates. The confidence mechanism must make this visible rather than hide it. |
| **Narrative-first assumes competence** | Serves experts and facilitators well; serves a naive user poorly. Deliberate v1 bet — deferred expert-direct mode is the eventual answer. |
| **Generic core vs. expert probing** | The first domain pack's quality determines whether the core reads as "impressively broad" or "disappointingly shallow" — treat it as load-bearing, not a demo. |

---

*Source: `AI_Transformation_Platform_Full_Spec.docx` — Parts I–III. Phase groupings follow §19 Development Roadmap; scope boundary follows §7.*
