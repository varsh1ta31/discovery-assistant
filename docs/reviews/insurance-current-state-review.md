# Insurance claims current-state swimlane review

Evaluated the live current-state API artifact generated at 2026-09-09T02:19:48.720Z against the stored narrative previously reviewed and the current generator/renderer. This is a content and implementation review; no browser was available for visual/PDF verification. Labels and phases regenerate, so this snapshot may differ from a previously open diagram.

## Overall assessment

Useful as an inventory of activities, but not yet a reliable process-flow slide.

## Findings, ordered by importance

1. **Alternative routes are presented as a mandatory sequence.** The renderer connects every consecutive node. Simple correction → duplicate investigation → sanctions referral → high-value approval therefore reads as a single path. These are conditional routes, not stages every payment traverses. The return-to-queue loop after a failed retry is absent. Urgent handling and daily reporting are also appended as sequential steps despite being an alternate entry path and a recurring oversight activity. The model needs explicit conditional edges and loops before these can be drawn faithfully.

2. **Lane ownership is not explicitly modeled.** The generator uses `personas[0]`, while the API does not order that relation or identify a primary performer. This generation assigns step 14 (daily aging report) to Team Manager, although the reviewed clarification describes the analyst preparing/reconciling the report and sending it to management. Step 13 combines the adjuster's request with the team's triage work. Step 1 combines adjuster approval with automated overnight routing. These combined activities need clearer ownership or decomposition; alphabetical sorting would not establish responsibility.

3. **Recorded uncertainty is not fully surfaced.** The artifact reports zero gaps. The generator only checks missing exit criteria, unconfirmed API availability, and missing personas. It does not read the repaired `systemsWritten` GAP provenance / `systemWriteUncertainty` for step 6. Removing unsupported writes was correct, but the unresolved destination should remain visible. Step 12 now has a newer activity and no reported gap; this review does not assume the earlier completion gap remains unresolved after subsequent user captures.

4. **Labels lose meaningful conditions.** Step 3 says “Research payment across ClaimCenter and PolicyAdmin,” making optional PolicyAdmin use sound mandatory. Step 11 says “Resubmit payment and confirm success,” obscuring the next-day success/failure check. The label prompt explicitly encourages cutting conditionals; for exception handling this can change meaning. Prefer labels such as “Check payment and policy details” and “Check next-day payment outcome.”

5. **Readability at slide scale is weak by construction.** The configured canvas is approximately 1636 × 844 px before content expansion, with 14 columns, roughly 85 px-wide cards, 10 px activity text, and 8 px metadata. At 12 inches wide in a presentation, these correspond to about 5.3 pt and 4.2 pt respectively. Long resource names and multiple participants add wrapping. This is calculated from layout rules, not a visual clipping observation. Larger text plus a main-path overview and separate exception-detail view would be more readable than shrinking the entire inventory onto one slide.

## What is working

- All 14 steps are present once, in order, with non-overlapping columns.
- Five contiguous phases cover the process: Receive & Assign; Investigate Exception; Resolve or Escalate; Resubmit & Track; Escalate & Report.
- Spreadsheet WRITE links now appear on assignment and status tracking.
- Unsupported ClaimCenter/PayHub WRITE links are absent from simple correction.
- Spreadsheet resources are not flagged as requiring their own API.
- Read/write directions and secondary participants are retained.

## Recommended correction order

Establish explicit step ownership and conditional edges first; surface relevant unresolved provenance next; then revise labels and slide-scale layout. Styling alone cannot correct the misleading process sequence.

No code or stored process data was changed during this evaluation.
