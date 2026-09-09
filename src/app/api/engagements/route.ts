import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/db";

const createEngagementSchema = z.object({
  organization: z.string().min(1),
  scope: z.string().optional(),
  boundaries: z.string().optional(),
  objectives: z.string().optional(),
});

// GET /api/engagements
// List view for the landing page: each row carries entity/gap counts so the
// dashboard can show real coverage instead of placeholders, plus an
// aggregate across all engagements for the sidebar summary card.
export async function GET() {
  const engagements = await prisma.engagement.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      processes: { include: { steps: true } },
      personas: true,
      systems: true,
    },
  });

  const engagementIds = engagements.map((e) => e.id);
  const [painPoints, exceptions, provenanceRows] = await Promise.all([
    prisma.painPoint.findMany({
      where: { OR: [{ process: { engagementId: { in: engagementIds } } }, { step: { process: { engagementId: { in: engagementIds } } } }] },
      select: { id: true, processId: true, process: { select: { engagementId: true } }, step: { select: { process: { select: { engagementId: true } } } } },
    }),
    prisma.exception.findMany({
      where: { OR: [{ process: { engagementId: { in: engagementIds } } }, { step: { process: { engagementId: { in: engagementIds } } } }] },
      select: { id: true, process: { select: { engagementId: true } }, step: { select: { process: { select: { engagementId: true } } } } },
    }),
    // Every live record, all entity kinds and all fields. The structuring
    // agent writes provenance per attribute (see recordFieldProvenance), so
    // filtering to attribute: null would match nothing at all.
    prisma.provenance.findMany({
      where: { supersededById: null },
      select: { entityKind: true, entityId: true, attribute: true, evidenceState: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // One current state per (entity, attribute) — newest wins, since rows
  // arrive ordered by createdAt desc.
  const currentEvidence = new Map<string, string>();
  for (const row of provenanceRows) {
    const key = `${row.entityId}:${row.attribute ?? ""}`;
    if (!currentEvidence.has(key)) currentEvidence.set(key, row.evidenceState);
  }

  // KB-wide evidence mix for the summary card, plus a per-entity GAP tally
  // feeding each engagement's gap count. Both read the deduped map, so a
  // field that was a GAP and has since been answered counts only once, as
  // its current state.
  let totalStated = 0;
  const gapCountByEntityId = new Map<string, number>();
  for (const [key, state] of currentEvidence) {
    if (state === "STATED") totalStated++;
    if (state !== "GAP") continue;
    const entityId = key.slice(0, key.indexOf(":"));
    gapCountByEntityId.set(entityId, (gapCountByEntityId.get(entityId) ?? 0) + 1);
  }
  const totalWithEvidence = currentEvidence.size;

  // Ids, not just counts — the gap rollup below needs to know which entities
  // belong to each engagement.
  const painPointIdsByEngagement = new Map<string, string[]>();
  for (const pp of painPoints) {
    const engId = pp.process?.engagementId ?? pp.step?.process.engagementId;
    if (engId) painPointIdsByEngagement.set(engId, [...(painPointIdsByEngagement.get(engId) ?? []), pp.id]);
  }
  const exceptionIdsByEngagement = new Map<string, string[]>();
  for (const ex of exceptions) {
    const engId = ex.process?.engagementId ?? ex.step?.process.engagementId;
    if (engId) exceptionIdsByEngagement.set(engId, [...(exceptionIdsByEngagement.get(engId) ?? []), ex.id]);
  }

  let totalProcesses = 0;
  let totalSystems = 0;
  let totalGaps = 0;

  const rows = engagements.map((e) => {
    const stepCount = e.processes.reduce((sum, p) => sum + p.steps.length, 0);
    const stepsMissingExitCriteria = e.processes.reduce(
      (sum, p) => sum + p.steps.filter((s) => !s.exitCriteria).length,
      0
    );
    const systemsUnknownApi = e.systems.filter((s) => s.apiAvailability === "UNKNOWN").length;
    const painPointCount = painPointIdsByEngagement.get(e.id)?.length ?? 0;
    const exceptionCount = exceptionIdsByEngagement.get(e.id)?.length ?? 0;

    const entities =
      e.processes.length + stepCount + e.personas.length + e.systems.length + painPointCount + exceptionCount;

    // GAP-flagged fields on anything belonging to this engagement.
    let gapEvidenceCount = 0;
    const ownedEntityIds = [
      ...e.processes.flatMap((p) => [p.id, ...p.steps.map((s) => s.id)]),
      ...e.personas.map((x) => x.id),
      ...e.systems.map((x) => x.id),
      ...(painPointIdsByEngagement.get(e.id) ?? []),
      ...(exceptionIdsByEngagement.get(e.id) ?? []),
    ];
    for (const id of ownedEntityIds) {
      gapEvidenceCount += gapCountByEntityId.get(id) ?? 0;
    }

    const gaps = stepsMissingExitCriteria + systemsUnknownApi + gapEvidenceCount;

    totalProcesses += e.processes.length;
    totalSystems += e.systems.length;
    totalGaps += gaps;

    return {
      id: e.id,
      organization: e.organization,
      scope: e.scope,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      entities,
      gaps,
    };
  });

  return NextResponse.json({
    engagements: rows,
    summary: {
      processes: totalProcesses,
      systems: totalSystems,
      statedPct: totalWithEvidence > 0 ? Math.round((totalStated / totalWithEvidence) * 100) : 0,
      openGaps: totalGaps,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createEngagementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const engagement = await prisma.engagement.create({ data: parsed.data });
  return NextResponse.json({ engagement }, { status: 201 });
}
