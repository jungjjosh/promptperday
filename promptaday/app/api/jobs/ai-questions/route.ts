import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runAiQuestionsJob, type AiQuestionCategory } from "@/lib/jobs/aiQuestions";

const VALID_CATEGORIES: AiQuestionCategory[] = ["philosophy", "personal life"];

// On-demand (or scheduled the same way as news-questions). Body:
// { category?: "philosophy" | "personal life" } — omit to run both.
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requested = body?.category;

  if (requested !== undefined && !VALID_CATEGORIES.includes(requested)) {
    return NextResponse.json(
      { error: 'category must be "philosophy" or "personal life"' },
      { status: 400 },
    );
  }

  const categories: AiQuestionCategory[] = requested ? [requested] : VALID_CATEGORIES;

  try {
    const results = await Promise.all(categories.map((category) => runAiQuestionsJob(category)));
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
