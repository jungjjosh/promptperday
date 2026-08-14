import { prisma } from "@/lib/prisma";
import { QuestionStatus } from "@prisma/client";
import QuestionReview from "@/components/admin/QuestionReview";

// Internal, not public-facing: deliberately not linked from NavTabs. See
// PROJECT.md "No auth in v1" — reachable only by direct URL, same posture
// as the rest of the app.
export const dynamic = "force-dynamic";

export default async function AdminQuestionsPage() {
  const questions = await prisma.question.findMany({
    where: { status: QuestionStatus.PENDING_REVIEW },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <QuestionReview
      initialQuestions={questions.map((q) => ({
        id: q.id,
        text: q.text,
        categoryName: q.category.name,
        sourceType: q.sourceType,
        createdAt: q.createdAt.toISOString(),
      }))}
    />
  );
}
