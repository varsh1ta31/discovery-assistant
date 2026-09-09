/** Resolve the latest evidence per attribute before selecting gaps. A later
 * stated answer must retire an older GAP even if an older writer omitted
 * supersededById. Do not blindly resurface stale uncertainty attributes.
 */
export function unresolvedStepGaps(records: Array<{
  attribute: string | null;
  evidenceState: string;
  note: string | null;
  flaggedForReview: boolean;
}>, attributes: unknown): string[] {
  const latest = new Map<string | null, typeof records[number]>();
  for (const row of records) if (!latest.has(row.attribute)) latest.set(row.attribute, row);
  const gaps = [...latest.values()].filter(r => r.evidenceState === "GAP" || r.flaggedForReview)
    .map(r => r.attribute === "systemsWritten" ? "correction destination needs confirmation" : r.note || `${r.attribute ?? "step"} needs confirmation`);
  const data = attributes && typeof attributes === "object" ? attributes as Record<string, unknown> : {};
  if (!latest.has("systemsWritten") && typeof data.systemWriteUncertainty === "string") {
    gaps.push("correction destination needs confirmation");
  }
  return [...new Set(gaps)];
}
