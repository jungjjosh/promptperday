import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { QuestionStatus, SourceType } from "@prisma/client";
import { PATCH as patchQuestion } from "@/app/api/questions/[id]/route";
import { pickQuestion, NoQuestionsAvailableError } from "@/lib/questionPool";
import { prisma, resetDb, createTestUser } from "./helpers";

const TEST_CATEGORY_NAME = "test category";

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetDb();
});

describe("PATCH /api/questions/:id", () => {
  it("approve flips status to approved and makes the question selectable via pickQuestion", async () => {
    const user = await createTestUser();
    const category = await prisma.category.create({
      data: { name: TEST_CATEGORY_NAME, enabledByDefault: true },
    });
    const question = await prisma.question.create({
      data: {
        categoryId: category.id,
        text: "A pending-review test question",
        sourceType: SourceType.AI_GENERATED,
        status: QuestionStatus.PENDING_REVIEW,
      },
    });

    // Not yet eligible: no APPROVED question exists in this isolated category.
    await expect(pickQuestion(prisma, user.id, category.id)).rejects.toThrow(
      NoQuestionsAvailableError,
    );

    const res = await patchQuestion(
      jsonRequest(`http://localhost/api/questions/${question.id}`, "PATCH", {
        status: "approved",
      }),
      { params: { id: question.id } },
    );
    expect(res.status).toBe(200);

    const updated = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(updated.status).toBe(QuestionStatus.APPROVED);

    // Now eligible: it's the only APPROVED question in this category, so
    // pickQuestion must return it.
    const picked = await pickQuestion(prisma, user.id, category.id);
    expect(picked.id).toBe(question.id);
  });

  it("reject flips status to archived and keeps the question ineligible", async () => {
    const user = await createTestUser();
    const category = await prisma.category.create({
      data: { name: TEST_CATEGORY_NAME, enabledByDefault: true },
    });
    const question = await prisma.question.create({
      data: {
        categoryId: category.id,
        text: "A pending-review test question to reject",
        sourceType: SourceType.NEWS_DERIVED,
        status: QuestionStatus.PENDING_REVIEW,
      },
    });

    const res = await patchQuestion(
      jsonRequest(`http://localhost/api/questions/${question.id}`, "PATCH", {
        status: "archived",
      }),
      { params: { id: question.id } },
    );
    expect(res.status).toBe(200);

    const updated = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(updated.status).toBe(QuestionStatus.ARCHIVED);

    // Still no APPROVED question in this category -> ineligible.
    await expect(pickQuestion(prisma, user.id, category.id)).rejects.toThrow(
      NoQuestionsAvailableError,
    );
  });

  it("rejects an invalid status value with 400", async () => {
    const category = await prisma.category.create({
      data: { name: TEST_CATEGORY_NAME, enabledByDefault: true },
    });
    const question = await prisma.question.create({
      data: {
        categoryId: category.id,
        text: "Another pending-review test question",
        sourceType: SourceType.AI_GENERATED,
        status: QuestionStatus.PENDING_REVIEW,
      },
    });

    const res = await patchQuestion(
      jsonRequest(`http://localhost/api/questions/${question.id}`, "PATCH", {
        status: "not-a-real-status",
      }),
      { params: { id: question.id } },
    );
    expect(res.status).toBe(400);
  });
});
