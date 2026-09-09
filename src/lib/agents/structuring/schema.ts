import * as z from "zod";

// The Structuring Agent's output: a set of proposed EKB entities and
// relationships extracted from raw narrative (§9.2), not yet committed. The
// Orchestrator/UI reviews and applies this — resolution against existing
// records happens by referencing an existing entity's id where the model is
// confident, or emitting a new entity otherwise.

export const evidenceStateSchema = z.enum(["STATED", "INFERRED", "ESTIMATED"]);
// Note: GAP is not produced by extraction — it is the absence of a claim,
// recorded separately by gap analysis (§9.2, Discovery Agent), not asserted
// by the Structuring Agent about content that was never mentioned.

// Claude's beta structured-output endpoint caps a schema at 16 total
// nullable/union-typed parameters (compiling more is exponentially
// expensive). `.nullable()` on every optional field pushed this schema to
// 19. Instead of a null union, "not mentioned" is represented by an empty
// string (value: "") — apply.ts treats an empty value the same way it used
// to treat null.
const extractedFieldSchema = z.object({
  value: z.string(),
  evidenceState: evidenceStateSchema,
});

// apiAvailability needs the same "was this actually said, or just absent"
// tracking as any other field, but it's a typed enum, not free text — and
// UNKNOWN is itself now a legitimate, confirmable answer ("the SME said
// nobody knows"), not a stand-in for "not asked." So the sentinel for
// absence can't reuse UNKNOWN the way the empty-string convention works
// for text fields; NOT_MENTIONED is a distinct fifth option. When the
// value is NOT_MENTIONED, evidenceState is meaningless and apply.ts
// ignores it — this keeps the object shape uniform (still just 2 params)
// rather than introducing a union, which the schema comment above already
// flags as expensive to compile more of.
export const extractedApiAvailabilitySchema = z.object({
  value: z.enum(["YES", "NO", "PARTIAL", "UNKNOWN", "NOT_MENTIONED"]),
  evidenceState: evidenceStateSchema,
});

// existingId: "" means "no match in the EKB, create new" — same convention,
// no union type.
const EXISTING_ID_NONE = "";

export const extractedProcessSchema = z.object({
  kind: z.literal("PROCESS"),
  existingId: z.string(),
  name: z.string(),
  purpose: extractedFieldSchema,
  trigger: extractedFieldSchema,
  outcome: extractedFieldSchema,
});

export const extractedProcessStepSchema = z.object({
  kind: z.literal("PROCESS_STEP"),
  existingId: z.string(),
  processName: z.string(),
  order: z.number().int(),
  // "" means not grouped into a phase — the swim-lane artifact falls back
  // to deriving phase bands on the fly when this is absent (§13, stage
  // is a plain string per §8.2, not evidence-tracked like exitCriteria —
  // it's the model's own grouping, not a claim from the narrative).
  stage: z.string(),
  activity: z.string(),
  personaRoles: z.array(z.string()),
  entryTrigger: extractedFieldSchema,
  exitCriteria: extractedFieldSchema,
  systemsRead: z.array(z.string()),
  systemsWritten: z.array(z.string()),
  isEscalationPoint: z.boolean(),
});

export const extractedPersonaSchema = z.object({
  kind: z.literal("PERSONA"),
  existingId: z.string(),
  role: z.string(),
  isExternal: z.boolean(),
  responsibilities: extractedFieldSchema,
  // What this role can decide or approve on its own, including financial
  // authority limits. A stated limit is a hard control on any downstream
  // automation, so it can't stay buried in responsibilities prose.
  decisionAuthority: extractedFieldSchema,
});

export const extractedSystemSchema = z.object({
  kind: z.literal("SYSTEM"),
  existingId: z.string(),
  name: z.string(),
  apiAvailability: extractedApiAvailabilitySchema,
  dataHeld: extractedFieldSchema,
  // Distinct from apiAvailability on purpose: an API can exist and still be
  // unusable by an automated agent. Scopes, RBAC, read-only access, approval
  // gates and audit requirements land here — the difference between "an API
  // exists" and "we are allowed to call it this way".
  accessConstraints: extractedFieldSchema,
});

// §8.2 — what the business measures. Frequently named without a value
// ("things I monitor"), which is why currentValue is expected to be empty
// far more often than not; an unquantified metric the SME watches is still
// worth recording, and asking for its value is a discovery question.
export const extractedMetricSchema = z.object({
  kind: z.literal("METRIC"),
  existingId: z.string(),
  // "" means it applies to the process as a whole.
  relatedStepActivity: z.string(),
  // What is measured, e.g. "First-contact SLA attainment".
  label: z.string(),
  // volume | speed | accuracy | effort | escalations | complexity, or "".
  category: z.string(),
  currentValue: extractedFieldSchema,
  target: extractedFieldSchema,
});

export const extractedPainPointSchema = z.object({
  kind: z.literal("PAIN_POINT"),
  existingId: z.string(),
  // "" means not tied to a specific step.
  relatedStepActivity: z.string(),
  description: z.string(),
  operationalImpact: extractedFieldSchema,
  frequency: extractedFieldSchema,
});

export const extractedExceptionSchema = z.object({
  kind: z.literal("EXCEPTION"),
  existingId: z.string(),
  relatedStepActivity: z.string(),
  scenario: z.string(),
  frequency: extractedFieldSchema,
  currentResolutionMethod: extractedFieldSchema,
});

export const extractedEntitySchema = z.discriminatedUnion("kind", [
  extractedProcessSchema,
  extractedProcessStepSchema,
  extractedPersonaSchema,
  extractedSystemSchema,
  extractedPainPointSchema,
  extractedExceptionSchema,
  extractedMetricSchema,
]);

export const structuringAgentOutputSchema = z.object({
  entities: z.array(extractedEntitySchema),
  // Extractions the model itself is unsure about — surfaced for review
  // rather than silently committed (§9.2 "flags low-confidence extractions").
  lowConfidenceNotes: z.array(
    z.object({
      relatesTo: z.string(), // free-text pointer, e.g. "Process Step: Review Completeness"
      reason: z.string(),
    })
  ),
});

export type ExtractedEntity = z.infer<typeof extractedEntitySchema>;
export type StructuringAgentOutput = z.infer<typeof structuringAgentOutputSchema>;
export type ExtractedField = z.infer<typeof extractedFieldSchema>;
export type ExtractedApiAvailability = z.infer<typeof extractedApiAvailabilitySchema>;
/** apiAvailability once NOT_MENTIONED is ruled out — a real, DB-writable value. */
export type MentionedApiAvailability = {
  value: "YES" | "NO" | "PARTIAL" | "UNKNOWN";
  evidenceState: ExtractedApiAvailability["evidenceState"];
};

// --- Empty-string-sentinel helpers, shared with apply.ts -------------------

/** True when a field the model returned actually carries a claim. */
export function hasValue(field: ExtractedField | undefined | null): field is ExtractedField {
  return !!field && field.value !== "";
}

/** True when existingId/relatedStepActivity-style strings resolve to something. */
export function isSet(id: string | undefined | null): id is string {
  return !!id && id !== EXISTING_ID_NONE;
}

/** True when apiAvailability was actually addressed — including a confirmed "unknown". */
export function apiAvailabilityMentioned(
  field: ExtractedApiAvailability | undefined | null
): field is MentionedApiAvailability {
  return !!field && field.value !== "NOT_MENTIONED";
}
