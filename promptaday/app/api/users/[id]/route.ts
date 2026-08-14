import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_PREP_DURATIONS = [5, 10, 15, 20];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (
    typeof body?.prepDurationMinutes !== "number" ||
    !ALLOWED_PREP_DURATIONS.includes(body.prepDurationMinutes)
  ) {
    return NextResponse.json(
      { error: "prepDurationMinutes must be one of 5, 10, 15, 20" },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { prepDurationMinutes: body.prepDurationMinutes },
  });

  return NextResponse.json({
    id: updated.id,
    prepDurationMinutes: updated.prepDurationMinutes,
  });
}
