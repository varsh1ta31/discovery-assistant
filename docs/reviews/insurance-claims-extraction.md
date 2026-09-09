# Insurance claims extraction review

Reviewed 2026-09-08 against the two stored narrative captures for **Insurance Claims Payment Exception Handling**, including the later access and exit-criteria clarifications.

## Verified

- One process with 14 ordered steps; the follow-up updated existing steps rather than creating another process or duplicate steps.
- Four linked system/resource records: ClaimCenter, PayHub, PolicyAdmin, and Exception Tracking Spreadsheet.
- Seven pain-point records and five exception records linked to the process or its steps.
- The follow-up's detailed completion criteria are present on investigation, bank-detail validation, routing, urgent handling, and daily aging reporting.
- Bank-detail validation preserves the requirement to stop a discrepant payment, obtain claimant verification, and use authorized approval.
- The spreadsheet's explicitly stated `NO` direct API answer is stored. ClaimCenter and PolicyAdmin retain `UNKNOWN`, consistent with the follow-up.

## Findings corrected in the stored data

1. **Missing spreadsheet links:** step 2 assigns work by editing the spreadsheet, and step 12 updates its statuses/comments, but neither has a spreadsheet write link.
2. **Uncertain writes represented as definite:** step 6 links writes to both ClaimCenter and PayHub. The source explicitly says it is unclear which system is corrected. These links should be reviewed, not assumed confirmed.
3. **Missing distinct exception coverage:** missing tax information, claim/policy holds, accounting-code validation failure, and system timeout/unknown technical error are not represented in the five exception records. Bank issues, duplicates, sanctions, approval thresholds, and urgent handling are represented.
4. **Missing distinct pain-point coverage:** switching among applications/resources and outdated guidance have no dedicated pain-point records. Repeat failures and difficulty identifying previously investigated items are reasonably combined in one record.
5. **Completion ambiguity:** step 12 uses released/paid as the exit criterion, while the original narrative also says tracking may stop at successful resubmission and claimant receipt is unconfirmed. That ambiguity needs to remain explicit in discovery.

The corrections were applied on 2026-09-08 with `scripts/repair-insurance-extraction.mjs`, in one transaction with assertions before commit. No model re-extraction was performed.

- Added spreadsheet WRITE links to steps 2 and 12.
- Removed unsupported ClaimCenter/PayHub WRITE links from step 6, preserving their previous records in the step’s repair metadata and recording the uncertain destination as GAP provenance.
- Added four source-stated exceptions and two source-stated pain points at process scope.
- Cleared step 12’s definitive exit criterion and preserved both the previous value and the source’s competing completion points in its attributes. The criterion now has GAP provenance.
- Each correction references the original capture; replaced field provenance is superseded rather than deleted.
- Verified before commit: 14 steps, 9 exceptions, 9 pain points, both missing spreadsheet WRITE links present, and no unsupported step-6 WRITE links to ClaimCenter/PayHub.

The script is scoped to this process and detects repeat application. Original source notes remain unchanged.

## Code corrections

- Read/write chips now use compound resource/step + direction keys. Both directions are valid database links; their repeated IDs were a rendering-key collision, not duplicate entities.
- Current-state system chips receive the same direction-aware keys.
- Repeated read/write links no longer repeat the same API-gap reason on one step.
- Explicit spreadsheet/workbook files are excluded from API-gap prompts and totals in both the knowledge surface and current-state artifact. The knowledge table identifies their API field as file-based / not applicable.
- Hosting applications remain distinct: file classification does not automatically exempt SharePoint or another hosting platform from access discovery.
- Structuring instructions now emphasize file-resource links, uncertain write destinations, and complete coverage of enumerated failures/pain points for future submissions.

## Scope of file handling

For compatibility with existing step links, spreadsheet resources remain in the existing system/resource storage and counts. This change does not migrate them to the separate DataSource table. It also does not assert that a file is accessible: location, permissions, and an approved retrieval method still matter, independently of a dedicated API.
