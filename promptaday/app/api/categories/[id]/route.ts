import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const category = await prisma.category.findUnique({ where: { id: params.id } });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.enabledByDefault !== "boolean") {
    return NextResponse.json(
      { error: "enabledByDefault must be a boolean" },
      { status: 400 },
    );
  }

  if (category.enabledByDefault && !body.enabledByDefault) {
    const otherEnabledCount = await prisma.category.count({
      where: { enabledByDefault: true, id: { not: category.id } },
    });
    if (otherEnabledCount === 0) {
      return NextResponse.json(
        { error: "At least one category must stay enabled" },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.category.update({
    where: { id: category.id },
    data: { enabledByDefault: body.enabledByDefault },
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    enabledByDefault: updated.enabledByDefault,
  });
}
