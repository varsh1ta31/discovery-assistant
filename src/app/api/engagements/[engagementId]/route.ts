import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/db";

const updateEngagementSchema = z.object({
  organization: z.string().min(1).optional(),
  scope: z.string().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ engagementId: string }> }
) {
  const { engagementId } = await params;

  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    include: {
      contributors: true,
      processes: { include: { steps: true } },
      personas: true,
      systems: true,
    },
  });

  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }

  return NextResponse.json({ engagement });
}

// PATCH /api/engagements/:engagementId
// Rename an engagement (organization/name) and/or edit its scope.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ engagementId: string }> }
) {
  const { engagementId } = await params;
  const body = await req.json();
  const parsed = updateEngagementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const engagement = await prisma.engagement.update({
      where: { id: engagementId },
      data: parsed.data,
    });
    return NextResponse.json({ engagement });
  } catch {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }
}

// DELETE /api/engagements/:engagementId
// Every child relation (processes, personas, systems, capture sessions, ...)
// cascades from Engagement in the schema, so a single delete here clears the
// whole record.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ engagementId: string }> }
) {
  const { engagementId } = await params;

  try {
    await prisma.engagement.delete({ where: { id: engagementId } });
  } catch {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
