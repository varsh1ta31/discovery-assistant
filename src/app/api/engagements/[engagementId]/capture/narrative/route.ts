import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { submitNarrative } from "@/lib/orchestrator";

const submitSchema = z.object({
  contributorId: z.string().min(1),
  mode: z.enum(["WRITE_UP", "LIVE"]),
  text: z.string().min(1),
});

// POST /api/engagements/:engagementId/capture/narrative
// Submits a narrative or live fragment for structuring (§17.4 capture
// operations). Synchronous for now — a single Structuring Agent call per
// request; swap for a queued/pollable handle if extraction latency grows.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ engagementId: string }> }
) {
  const { engagementId } = await params;
  const body = await req.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const result = await submitNarrative({
      engagementId,
      contributorId: parsed.data.contributorId,
      mode: parsed.data.mode,
      text: parsed.data.text,
    });
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Structuring failed" },
      { status: 502 }
    );
  }
}
