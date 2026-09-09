import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { prisma } from "@/lib/db";

const createContributorSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  email: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ engagementId: string }> }
) {
  const { engagementId } = await params;
  const contributors = await prisma.contributor.findMany({
    where: { engagementId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ contributors });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ engagementId: string }> }
) {
  const { engagementId } = await params;
  const body = await req.json();
  const parsed = createContributorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const contributor = await prisma.contributor.create({
    data: { engagementId, ...parsed.data },
  });
  return NextResponse.json({ contributor }, { status: 201 });
}
