# Auto Claims FNOL extraction review

Reviewed 2026-09-08 against the two stored narrative captures for **Auto Claims First Notice of Loss** (process: *FNOL Through Initial Claims Handling*), including the follow-up system-access table and the automated-validation exit criteria.

## Verified

- One process with 7 ordered steps matching the narrative's stated flow; the follow-up updated the existing process rather than creating a second one.
- Step 3's exit criteria carries the follow-up's full definition, including both the happy path and the exception path.
- All 15 systems from the follow-up table are present with accurate `dataHeld`. The `apiAvailability` banding is correct: `PARTIAL` for the four the source qualified as restricted or read-only (Payment, PAS, SIU, Fraud/risk), `YES` elsewhere. Nothing over-claimed.
- Five exceptions at step 2 exactly match the five the source enumerates for claim creation/policy matching.
- Step 1 preserves the constraint that the intake rep does not decide liability.
- No fabricated content and no duplicate entities. Personas correctly keep the generic "Adjuster" distinct from the routing table's specialist owners, and the escalation tiers distinct from the routing owners — these come from different lists serving different purposes and should not be merged.

## Findings corrected in the stored data

The extraction was accurate where it existed; the defect was recall, not precision. Roughly the back third of the first narrative — escalation routing, authority limits, and the monitored metrics — was almost entirely uncaptured, and the follow-up's central point was flattened into descriptive prose.

1. **The authorization dimension was dropped.** The follow-up's explicit framing was "I'd distinguish between an API being technically available and Operations being authorized to use it directly," closing with "API available ≠ unrestricted agent access." All 15 systems had `accessConstraints` null; "RBAC", "scope" and "audit" returned zero hits anywhere in the KB. The constraint detail survived only informally inside `dataHeld` prose. This is the field a solution designer needs: `apiAvailability: YES` read alone invites an automation the SME's controls forbid.
2. **Financial authority limits unmodeled.** "If the proposed amount exceeds the handler's authority, approval moves up the appropriate authority chain" is a hard control on payment automation. All 18 personas had `decisionAuthority` null.
3. **Escalation and exception routing invisible — and this finding was itself partly wrong on first pass.** The initial review reported that the routing paths went unextracted, because a query filtering by `processId`/`stepId` returned only the five step-2 exceptions. The originals were in fact extracted: `apply.ts` had written six of them with *neither* `processId` nor `stepId` set, which hides a record from every view in the application, this review's own queries included. What looked like a recall failure was a storage defect masking real data. Separately and correctly: the original lumped seven distinct management-escalation triggers into one record, and no step had `isEscalationPoint` set.
4. **Zero metrics.** The Ops SME enumerates thirteen monitored measures. These survived only as a run-on sentence in a persona's `responsibilities`.
5. **Missing source-stated system links.** Step 4 (Triage) had no system link at all despite "our triage engine"; the narrative also places the portal and contact-center desktop at step 1 and SMS/email/portal at step 7.
6. **Empty scaffolding.** Engagement scope/objectives/boundaries null despite the narrative's opening; `Process.inputs` and `businessValue` null.
7. **No gap records at all.** 107 provenance rows, every one STATED/INFERRED/ESTIMATED, `flaggedForReview` zero throughout. Everything absent was silently absent, so a reader would see a clean, complete-looking extraction and none of the above. This is the structural finding: a KB that omits silently gets trusted.

## What was applied

Two scripts, each scoped to this process, in one transaction with assertions before commit, and each detecting repeat application.

`scripts/repair-fnol-extraction.mjs` — the transcription-shaped findings, where the value is quotable from the source. Every one of the 15 access-constraint strings is asserted against a verbatim source phrase before commit.

- `accessConstraints` on all 15 systems; the "API available ≠ unrestricted agent access" principle stored on the engagement where it is queryable.
- `decisionAuthority` on Adjuster and the three escalation tiers, with the missing thresholds recorded as GAP provenance rather than invented.
- 13 Metric records with `currentValue` left null and a GAP record on each — the schema's documented "known to matter, not yet quantified."
- 8 source-stated step-system links (triage engine at steps 4–5, channels at steps 1 and 7).
- Engagement scope, objectives and boundaries.
- GAP provenance for four questions the source never addressed (process inputs, business value, knowledge sources, data sources).

`scripts/reextract-fnol-escalation.mjs` — the escalation section, re-extracted rather than hand-written, because mapping each routing path to the step it leaves from is judgment against the source, not transcription. The model returns a verbatim `sourceQuote` per exception and the script aborts if any quote is not found in the narrative, which is the guard against a plausible-sounding invented routing path. Run with `--dry-run` to inspect without writing.

- 12 exceptions recovered, now spread across steps 2, 4, 6, 7 and the process level instead of all sitting on step 2. Management escalations are tagged distinctly from defined routing paths, preserving the distinction the SME drew deliberately.
- `isEscalationPoint` set on steps 2, 4, 5, 6, 7.
- A GAP record on each new exception's `frequency` — the routing paths are stated, how often they fire is not.
- "Senior casualty handler" created as a persona, since the source names it as a resolver and it was absent from the persona list.
- The model initially also emitted the Ops SME's manual-queue example as an exception. It is already stored as pain point `PP-SX1B1Z`, and it is a symptom the SME investigates rather than a defined routing path, so the script drops any extraction overlapping an existing pain point rather than storing one observation under two entity kinds.

`scripts/repair-orphaned-entities.mjs` — the orphaning defect's existing damage, across all engagements. Because the re-extraction above ran against a KB where the original escalation records were hidden, it recreated work that already existed; this script resolves that overlap and reattaches what it can.

- 42 pain points, exceptions and metrics had been written with neither `processId` nor `stepId` — invisible to every view in the application. This affected all three engagements, not just this one.
- 3 were attributable by provenance and are now attached to their process.
- 6 FNOL exceptions were duplicate pairs. The re-extracted copy is kept where it carries step attribution the orphan lacked; the lumped seven-trigger original is retired in favour of the split scenarios. Each removal writes an audit record naming the reason before the delete.
- 33 remain unattributable and are deliberately untouched. Their provenance chain is severed at both ends — no capture session (`onDelete: SetNull` cleared it when the capture was deleted) and no contributor — and they predate the earliest surviving capture, marking them as remnants of deleted engagements. Where their content was re-captured it already exists as a properly attached record, so attributing them by text similarity would duplicate live data. The script reports them and stops.

Result: 15/15 systems constrained, 13 metrics, 17 exceptions across 5 locations, 5 escalation points, 23 step-system links, and 33 gap/flagged provenance records where there were none.

Payment systems, Reporting/BI and SIU/fraud tooling remain deliberately unlinked to any step. Payment issues claim payments downstream of where this process ends, and Reporting/BI is the SME's own monitoring surface — neither participates in FNOL-through-initial-handling. Leaving them unlinked is correct, not a remaining gap.

## Code corrections

The same shape appeared in both this and the Payment Exceptions review: narrative sections that are not the numbered walkthrough get under-mined relative to the steps, and enumerated lists are extracted completely inside a step but dropped in a trailing section. That is an extraction-prompt problem, not a one-off.

- `accessConstraints` added to the system schema and `decisionAuthority` to the persona schema, both wired through `apply.ts` with provenance. Neither adds a nullable/union parameter — the empty-string convention keeps the structured-output parameter budget unchanged.
- METRIC added as an extractable entity kind, with the measure's name in `attributes.label` since the Metric table has no name column.
- `touchedProcess` is now resolved before metrics are written, so a submission describing a process and its metrics without restating steps still attaches them to the process.
- Structuring instructions now direct the agent to re-read non-walkthrough sections before finishing, to map exceptions to the step they arise from rather than clustering them, to keep exceptions distinct from pain points, to extract metrics named without values, and to treat access constraints and decision authority as first-class rather than folding them into descriptive prose.
- The knowledge surface shows `accessConstraints` under the system name, so a green "yes" in the API column is never read as unrestricted access.
- **Pain points, exceptions and metrics no longer orphan.** `apply.ts` set only `stepId`, so any record the model did not tie to a specific step was created belonging to nothing. `touchedProcess` is now resolved before all three loops and used as the fallback owner. This is the defect that hid six correctly-extracted FNOL exceptions and made this review's first pass overstate the recall gap; it had been silently losing records across every engagement since the code was written.

## How learnings feed forward

Worth stating explicitly, since two reviews now exist and the answer differs by mechanism:

- **Prompt and schema changes propagate automatically.** `buildSystemInstruction` is built per capture, so every future extraction in every engagement gets the current rules. The Payment Exceptions review's lessons (file resources, uncertain write destinations, complete coverage of enumerated failures) are already in there, and this review's additions sit alongside them. This is the mechanism that actually carries learnings forward.
- **Code fixes propagate automatically and retroactively where data is regenerated.** The current-state artifact is generated on demand from live EKB state and never persisted, so a generator fix reaches every process the next time it is viewed. The escalation points and GAP records added here surfaced in the FNOL artifact immediately, with no regeneration step.
- **Stored data does not propagate.** Repair scripts are scoped to one process by design, so nothing in them improves another engagement. The Payment Exceptions repair did not help this one, and this one will not help the next. That is correct for corrections, but it means each already-captured process carries its own extraction-era defects until someone reviews it.
- **The prompt is the only durable memory, and it was previously untested.** Each review appends rules and nothing consolidated them, so a future prompt edit could silently undo any of this. `scripts/test-structuring.mjs` now closes that gap — see below.

## Regression suite

`scripts/test-structuring.mjs`, run by `npm test` alongside the existing current-state suite. Two layers, because the agent has two failure modes and only one needs a model.

**Layer 1 — persistence contract** (default; no network, no database). Compiles `apply.ts` in-process against a fake transaction and asserts the shape of what would be written. Covers orphan prevention for all three entity kinds, step/process exclusivity, `accessConstraints` and `decisionAuthority` reaching the database with provenance, an unquantified metric persisting with a null value, and the empty-string sentinel never being written as a stated blank. A separate block asserts the prompt still contains every rule earned by a prior review, each keyed to the review that earned it.

**Layer 2 — extraction quality** (`npm run test:model`; opt-in, calls the live model). Runs a purpose-built vendor-invoice narrative — deliberately *not* one of the stored captures, since those are what the prompt was tuned against — shaped to carry every failure mode the reviews found: a numbered walkthrough plus a trailing section holding exception routing, an authorization distinction, and an enumerated list of monitored measures. Asserts the trailing section gets mined, exceptions don't cluster on one step, metrics survive without invented values, `accessConstraints` stays separate from `dataHeld`, a stated approval limit reaches `decisionAuthority`, and no observation is stored as both an exception and a pain point. Current result: 3 steps, 7 exceptions, 6 metrics, 5 systems, 6 personas — all assertions passing.

Both layers were verified to fail on regression, not merely to pass: deleting the review-earned prompt rules fails layer 1 with a message naming the lost rule, and reintroducing the original orphaning bug fails it with `exception with no step must fall back to the process, not orphan`. A suite that has never been seen to fail proves nothing.

**A second bug the suite found on first run.** The orphan fallback resolved the process with a raw `Map.get(first.name)`, but that map is keyed by *lowercased* name via `setByNameCI`. Any process whose name is not already lowercase — every real one — missed the lookup, so the fallback silently did nothing for exactly the case it was written for: a follow-up capture that discusses a process without restating its steps. The fix uses `findByNameCI`, matching every other lookup against those maps. This was a live defect in the fix for the original orphaning bug, found within minutes of the suite existing and not by any amount of reading the code.

## Still open for the SME

Recorded as gaps in the KB rather than left silent — these are the questions the next session should ask:

- Financial authority thresholds. The rule is captured; the amounts are not.
- Values and targets for all thirteen monitored metrics.
- Exception volumes by reason — every recovered routing path lacks a frequency.
- What SOPs, lookup tables or tacit knowledge intake reps and adjusters actually follow. No KnowledgeSource records exist because the source describes none; that is a question to ask, not a table to fill.
- Data sources independent of the systems holding them.
