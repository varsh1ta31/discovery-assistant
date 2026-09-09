import { prisma } from "@/lib/db";
import type { CaptureMode } from "@/generated/prisma/enums";
import {
  apiAvailabilityMentioned,
  hasValue,
  isSet,
  type ExtractedEntity,
  type ExtractedField,
  type StructuringAgentOutput,
} from "./schema";

export interface ApplyContext {
  engagementId: string;
  contributorId: string;
  mode: CaptureMode;
  sourceType: "narrative" | "fragment" | "document" | "screenshot";
  rawText: string;
  /**
   * Known process names already in the EKB, mapped to their id. Lets a step
   * that references a process by name resolve to it even when this
   * fragment's extraction didn't re-emit a PROCESS entity for it (the
   * common case for a live fragment continuing a process a prior fragment
   * already created).
   */
  knownProcessIdByName?: Map<string, string>;
}

export interface ApplyResult {
  captureSessionId: string;
  createdEntityIds: Record<string, string>; // extraction-local key -> db id
  flaggedForReview: number;
  /** The process this application touched most, if any — for the live-mode active-process pointer. */
  touchedProcess: { id: string; name: string } | null;
}

// Case-insensitive exact-name lookup, keyed by lowercased name. This is the
// dedupe backstop for when the model doesn't set existingId for an entity
// that (by exact name, modulo case) already exists — e.g. two separate
// write-up submissions both naming a process "Commercial Loan Covenant
// Monitoring". It only catches exact repeats; near-duplicates with
// different wording ("Excel Covenant Tracker" vs "Covenant Tracker (Excel
// workbook on shared drive)") still rely on the model's own matching and
// need a human merge if it misses.
function findByNameCI(map: Map<string, string>, name: string): string | undefined {
  return map.get(name.trim().toLowerCase());
}
function setByNameCI(map: Map<string, string>, name: string, id: string): void {
  map.set(name.trim().toLowerCase(), id);
}

// Commits a Structuring Agent proposal to the EKB: creates a CaptureSession
// to anchor provenance, then writes each entity plus a Provenance record per
// evidence-bearing field (§8.4). Runs inside a transaction so a partially
// structured narrative never leaves the EKB half-written.
export async function applyStructuringOutput(
  output: StructuringAgentOutput,
  ctx: ApplyContext
): Promise<ApplyResult> {
  return prisma.$transaction(async (tx) => {
    const captureSession = await tx.captureSession.create({
      data: {
        engagementId: ctx.engagementId,
        contributorId: ctx.contributorId,
        mode: ctx.mode,
        sourceType: ctx.sourceType,
        rawContent: ctx.rawText,
      },
    });

    const createdEntityIds: Record<string, string> = {};
    let flaggedForReview = 0;

    // Processes and personas first — steps, pain points, and exceptions
    // reference them by name. Seed each map with every entity of that kind
    // already in the EKB (not just what the orchestrator passed in), keyed
    // case-insensitively, so an exact-name repeat updates the existing
    // record instead of creating a duplicate even when the model doesn't
    // set existingId itself.
    const [existingProcesses, existingPersonas, existingSystems, existingSteps] = await Promise.all([
      tx.process.findMany({ where: { engagementId: ctx.engagementId }, select: { id: true, name: true } }),
      tx.persona.findMany({ where: { engagementId: ctx.engagementId }, select: { id: true, role: true } }),
      tx.systemApplication.findMany({ where: { engagementId: ctx.engagementId }, select: { id: true, name: true } }),
      tx.processStep.findMany({
        where: { process: { engagementId: ctx.engagementId } },
        select: { id: true, activity: true, processId: true },
      }),
    ]);
    const processIdByName = new Map<string, string>(ctx.knownProcessIdByName ?? []);
    for (const p of existingProcesses) setByNameCI(processIdByName, p.name, p.id);
    const personaIdByRole = new Map<string, string>();
    for (const p of existingPersonas) setByNameCI(personaIdByRole, p.role, p.id);
    const systemIdByName = new Map<string, string>();
    for (const s of existingSystems) setByNameCI(systemIdByName, s.name, s.id);
    // Keyed by processId + lowercased activity — a step's identity is only
    // unambiguous alongside the process it belongs to, so this is a
    // composite key rather than reusing findByNameCI/setByNameCI directly.
    const stepIdByProcessAndActivity = new Map<string, string>();
    for (const s of existingSteps) {
      stepIdByProcessAndActivity.set(`${s.processId}::${s.activity.trim().toLowerCase()}`, s.id);
    }

    const processes = output.entities.filter(
      (e): e is Extract<ExtractedEntity, { kind: "PROCESS" }> => e.kind === "PROCESS"
    );
    for (const p of processes) {
      const matchedId = isSet(p.existingId) ? p.existingId : findByNameCI(processIdByName, p.name);
      const record = matchedId
        ? await tx.process.update({
            where: { id: matchedId },
            data: {
              purpose: hasValue(p.purpose) ? p.purpose.value : undefined,
              trigger: hasValue(p.trigger) ? p.trigger.value : undefined,
              outcome: hasValue(p.outcome) ? p.outcome.value : undefined,
            },
          })
        : await tx.process.create({
            data: {
              engagementId: ctx.engagementId,
              name: p.name,
              purpose: hasValue(p.purpose) ? p.purpose.value : undefined,
              trigger: hasValue(p.trigger) ? p.trigger.value : undefined,
              outcome: hasValue(p.outcome) ? p.outcome.value : undefined,
            },
          });
      setByNameCI(processIdByName, p.name, record.id);
      createdEntityIds[`PROCESS:${p.name}`] = record.id;

      await recordFieldProvenance(tx, captureSession.id, "PROCESS", record.id, [
        ["purpose", p.purpose],
        ["trigger", p.trigger],
        ["outcome", p.outcome],
      ]);
    }

    const personas = output.entities.filter(
      (e): e is Extract<ExtractedEntity, { kind: "PERSONA" }> => e.kind === "PERSONA"
    );
    for (const pr of personas) {
      const matchedId = isSet(pr.existingId) ? pr.existingId : findByNameCI(personaIdByRole, pr.role);
      const record = matchedId
        ? await tx.persona.update({
            where: { id: matchedId },
            data: {
              responsibilities: hasValue(pr.responsibilities) ? pr.responsibilities.value : undefined,
              decisionAuthority: hasValue(pr.decisionAuthority) ? pr.decisionAuthority.value : undefined,
              isExternal: pr.isExternal,
            },
          })
        : await tx.persona.create({
            data: {
              engagementId: ctx.engagementId,
              role: pr.role,
              isExternal: pr.isExternal,
              responsibilities: hasValue(pr.responsibilities) ? pr.responsibilities.value : undefined,
              decisionAuthority: hasValue(pr.decisionAuthority) ? pr.decisionAuthority.value : undefined,
            },
          });
      setByNameCI(personaIdByRole, pr.role, record.id);
      createdEntityIds[`PERSONA:${pr.role}`] = record.id;

      await recordFieldProvenance(tx, captureSession.id, "PERSONA", record.id, [
        ["responsibilities", pr.responsibilities],
        ["decisionAuthority", pr.decisionAuthority],
      ]);
    }

    const systems = output.entities.filter(
      (e): e is Extract<ExtractedEntity, { kind: "SYSTEM" }> => e.kind === "SYSTEM"
    );
    for (const s of systems) {
      const matchedId = isSet(s.existingId) ? s.existingId : findByNameCI(systemIdByName, s.name);
      // NOT_MENTIONED means the text never addressed API access at all — leave
      // the column alone on an update (don't overwrite a prior real answer
      // with silence), and let create fall through to the schema default
      // (UNKNOWN, with no provenance record — an actual absence of a claim,
      // not a confirmed "nobody knows"). A mentioned value, including a
      // confirmed UNKNOWN, always writes through.
      const mentioned = apiAvailabilityMentioned(s.apiAvailability) ? s.apiAvailability : null;
      const apiAvailabilityValue = mentioned?.value;

      const record = matchedId
        ? await tx.systemApplication.update({
            where: { id: matchedId },
            data: {
              apiAvailability: apiAvailabilityValue,
              dataHeld: hasValue(s.dataHeld) ? s.dataHeld.value : undefined,
              accessConstraints: hasValue(s.accessConstraints) ? s.accessConstraints.value : undefined,
            },
          })
        : await tx.systemApplication.create({
            data: {
              engagementId: ctx.engagementId,
              name: s.name,
              apiAvailability: apiAvailabilityValue,
              dataHeld: hasValue(s.dataHeld) ? s.dataHeld.value : undefined,
              accessConstraints: hasValue(s.accessConstraints) ? s.accessConstraints.value : undefined,
            },
          });
      setByNameCI(systemIdByName, s.name, record.id);
      createdEntityIds[`SYSTEM:${s.name}`] = record.id;

      await recordFieldProvenance(tx, captureSession.id, "SYSTEM", record.id, [
        mentioned
          ? ["apiAvailability", { value: mentioned.value, evidenceState: mentioned.evidenceState }]
          : null,
        ["dataHeld", s.dataHeld],
        ["accessConstraints", s.accessConstraints],
      ]);
    }

    // Process steps depend on processes/personas/systems above.
    const stepIdByActivity = new Map<string, string>();
    const steps = output.entities.filter(
      (e): e is Extract<ExtractedEntity, { kind: "PROCESS_STEP" }> => e.kind === "PROCESS_STEP"
    );
    let touchedProcess: { id: string; name: string } | null = null;

    // `order` is a per-process sequence with a uniqueness constraint. The
    // model's own `order` guess is only valid within a single extraction —
    // it can't know what a sibling live fragment already assigned to the
    // same process, so a fresh fragment continuing a process must resume
    // numbering from what's actually in the DB, not from the model's count.
    const nextOrderByProcessId = new Map<string, number>();
    async function nextOrderFor(processId: string): Promise<number> {
      const cached = nextOrderByProcessId.get(processId);
      if (cached !== undefined) {
        nextOrderByProcessId.set(processId, cached + 1);
        return cached;
      }
      const maxStep = await tx.processStep.findFirst({
        where: { processId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const next = (maxStep?.order ?? 0) + 1;
      nextOrderByProcessId.set(processId, next + 1);
      return next;
    }

    for (const st of steps) {
      const processId = findByNameCI(processIdByName, st.processName);
      if (!processId) {
        flaggedForReview += 1;
        continue; // orphaned step reference — surfaced via flaggedForReview count
      }
      touchedProcess = { id: processId, name: st.processName };

      // Same dedup backstop as processes/personas/systems: if the model
      // didn't set existingId but this exact activity already exists under
      // this process, update it rather than creating a sibling duplicate.
      const matchedStepId =
        isSet(st.existingId) ? st.existingId : stepIdByProcessAndActivity.get(`${processId}::${st.activity.trim().toLowerCase()}`);

      // stage isn't evidence-tracked (it's the model's own grouping, not a
      // claim from the narrative) so it uses the plain empty-string-means-
      // absent convention, same as isSet(existingId) — and the same "don't
      // overwrite a real value with silence" rule as apiAvailability: an
      // update that didn't address stage shouldn't blank out a stage a
      // prior submission set.
      const stageValue = isSet(st.stage) ? st.stage : undefined;

      const record = matchedStepId
        ? await tx.processStep.update({
            where: { id: matchedStepId },
            data: {
              activity: st.activity,
              stage: stageValue,
              entryTrigger: hasValue(st.entryTrigger) ? st.entryTrigger.value : undefined,
              exitCriteria: hasValue(st.exitCriteria) ? st.exitCriteria.value : undefined,
              isEscalationPoint: st.isEscalationPoint,
            },
          })
        : await tx.processStep.create({
            data: {
              processId,
              order: await nextOrderFor(processId),
              activity: st.activity,
              stage: stageValue,
              entryTrigger: hasValue(st.entryTrigger) ? st.entryTrigger.value : undefined,
              exitCriteria: hasValue(st.exitCriteria) ? st.exitCriteria.value : undefined,
              isEscalationPoint: st.isEscalationPoint,
            },
          });
      stepIdByActivity.set(st.activity, record.id);
      stepIdByProcessAndActivity.set(`${processId}::${st.activity.trim().toLowerCase()}`, record.id);
      createdEntityIds[`PROCESS_STEP:${st.activity}`] = record.id;

      await recordFieldProvenance(tx, captureSession.id, "PROCESS_STEP", record.id, [
        ["entryTrigger", st.entryTrigger],
        ["exitCriteria", st.exitCriteria],
      ]);

      for (const role of st.personaRoles) {
        const personaId = findByNameCI(personaIdByRole, role);
        if (personaId) {
          await tx.stepPersona.upsert({
            where: { stepId_personaId: { stepId: record.id, personaId } },
            create: { stepId: record.id, personaId },
            update: {},
          });
        }
      }
      for (const sysName of st.systemsRead) {
        const systemId = findByNameCI(systemIdByName, sysName);
        if (systemId) {
          await tx.stepSystem.upsert({
            where: { stepId_systemId_direction: { stepId: record.id, systemId, direction: "READ" } },
            create: { stepId: record.id, systemId, direction: "READ" },
            update: {},
          });
        }
      }
      for (const sysName of st.systemsWritten) {
        const systemId = findByNameCI(systemIdByName, sysName);
        if (systemId) {
          await tx.stepSystem.upsert({
            where: { stepId_systemId_direction: { stepId: record.id, systemId, direction: "WRITE" } },
            create: { stepId: record.id, systemId, direction: "WRITE" },
            update: {},
          });
        }
      }
    }

    // Resolved before pain points, exceptions and metrics, all of which fall
    // back to the process when they aren't tied to a specific step. A
    // submission that discusses a process without restating its steps — a
    // follow-up answering "what goes wrong?", say — would otherwise leave
    // every one of them attached to nothing and invisible to the process
    // views, which query by processId or stepId.
    if (!touchedProcess && processes.length > 0) {
      const first = processes[0];
      // findByNameCI, not a raw Map.get: the map is keyed by lowercased name,
      // so a direct get misses on any process whose name isn't already
      // lowercase and silently drops the fallback.
      const id = findByNameCI(processIdByName, first.name);
      if (id) touchedProcess = { id, name: first.name };
    }

    // Pain points and exceptions attach to steps where named, and to the
    // process itself otherwise — never to neither.
    const painPoints = output.entities.filter(
      (e): e is Extract<ExtractedEntity, { kind: "PAIN_POINT" }> => e.kind === "PAIN_POINT"
    );
    for (const pp of painPoints) {
      const stepId = isSet(pp.relatedStepActivity)
        ? stepIdByActivity.get(pp.relatedStepActivity)
        : undefined;
      const refCode = `PP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      const record = isSet(pp.existingId)
        ? await tx.painPoint.update({
            where: { id: pp.existingId },
            data: {
              description: pp.description,
              operationalImpact: hasValue(pp.operationalImpact) ? pp.operationalImpact.value : undefined,
              frequency: hasValue(pp.frequency) ? pp.frequency.value : undefined,
            },
          })
        : await tx.painPoint.create({
            data: {
              refCode,
              // Step when one was named, process otherwise. Setting neither
              // orphans the record from every view that reads pain points.
              ...(stepId ? { stepId } : { processId: touchedProcess?.id }),
              description: pp.description,
              operationalImpact: hasValue(pp.operationalImpact) ? pp.operationalImpact.value : undefined,
              frequency: hasValue(pp.frequency) ? pp.frequency.value : undefined,
            },
          });
      createdEntityIds[`PAIN_POINT:${pp.description}`] = record.id;

      await recordFieldProvenance(tx, captureSession.id, "PAIN_POINT", record.id, [
        ["description", { value: pp.description, evidenceState: "STATED" as const }],
        ["operationalImpact", pp.operationalImpact],
        ["frequency", pp.frequency],
      ]);
    }

    const exceptions = output.entities.filter(
      (e): e is Extract<ExtractedEntity, { kind: "EXCEPTION" }> => e.kind === "EXCEPTION"
    );
    for (const ex of exceptions) {
      const stepId = isSet(ex.relatedStepActivity)
        ? stepIdByActivity.get(ex.relatedStepActivity)
        : undefined;

      const record = isSet(ex.existingId)
        ? await tx.exception.update({
            where: { id: ex.existingId },
            data: {
              scenario: ex.scenario,
              frequency: hasValue(ex.frequency) ? ex.frequency.value : undefined,
              currentResolutionMethod: hasValue(ex.currentResolutionMethod) ? ex.currentResolutionMethod.value : undefined,
            },
          })
        : await tx.exception.create({
            data: {
              // Same fallback as pain points: a process-level exception (an
              // escalation trigger that isn't tied to one step) belongs to the
              // process, not to nothing.
              ...(stepId ? { stepId } : { processId: touchedProcess?.id }),
              scenario: ex.scenario,
              frequency: hasValue(ex.frequency) ? ex.frequency.value : undefined,
              currentResolutionMethod: hasValue(ex.currentResolutionMethod) ? ex.currentResolutionMethod.value : undefined,
            },
          });
      createdEntityIds[`EXCEPTION:${ex.scenario}`] = record.id;

      await recordFieldProvenance(tx, captureSession.id, "EXCEPTION", record.id, [
        ["scenario", { value: ex.scenario, evidenceState: "STATED" as const }],
        ["frequency", ex.frequency],
        ["currentResolutionMethod", ex.currentResolutionMethod],
      ]);
    }

    const metrics = output.entities.filter(
      (e): e is Extract<ExtractedEntity, { kind: "METRIC" }> => e.kind === "METRIC"
    );
    for (const mt of metrics) {
      const stepId = isSet(mt.relatedStepActivity)
        ? stepIdByActivity.get(mt.relatedStepActivity)
        : undefined;

      // What's measured is the label; the Metric table has no name column, so
      // it lives in attributes alongside category. An SME naming a metric
      // without a value is the common case, not a failed extraction — the
      // record exists so the value becomes a question someone can ask.
      const data = {
        category: mt.category || undefined,
        currentValue: hasValue(mt.currentValue) ? mt.currentValue.value : undefined,
        target: hasValue(mt.target) ? mt.target.value : undefined,
        attributes: { label: mt.label },
      };

      const record = isSet(mt.existingId)
        ? await tx.metric.update({ where: { id: mt.existingId }, data })
        : await tx.metric.create({
            data: stepId
              ? { ...data, stepId }
              : { ...data, processId: touchedProcess?.id },
          });
      createdEntityIds[`METRIC:${mt.label}`] = record.id;

      await recordFieldProvenance(tx, captureSession.id, "METRIC", record.id, [
        ["currentValue", mt.currentValue],
        ["target", mt.target],
      ]);
    }

    if (output.lowConfidenceNotes.length > 0) {
      flaggedForReview += output.lowConfidenceNotes.length;
    }

    return { captureSessionId: captureSession.id, createdEntityIds, flaggedForReview, touchedProcess };
  });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function recordFieldProvenance(
  tx: Tx,
  captureSessionId: string,
  entityKind: "PROCESS" | "PROCESS_STEP" | "PERSONA" | "SYSTEM" | "PAIN_POINT" | "EXCEPTION" | "METRIC",
  entityId: string,
  // A null entry means "this field wasn't actually mentioned" — the
  // apiAvailability caller passes null instead of a field object since its
  // value is a real enum, not free text, so the empty-string hasValue()
  // check below doesn't apply to it.
  fields: Array<[string, ExtractedField] | null>
) {
  for (const entry of fields) {
    if (!entry) continue;
    const [attribute, field] = entry;
    if (!hasValue(field)) continue;
    await tx.provenance.create({
      data: {
        entityKind,
        entityId,
        attribute,
        evidenceState: field.evidenceState,
        captureSessionId,
      },
    });
  }
}
