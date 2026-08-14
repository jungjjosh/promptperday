import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runNewsQuestionsJob } from "@/lib/jobs/newsQuestions";

// Meant to be invoked by an external scheduler (system cron + curl, Vercel
// Cron, etc.) rather than run in-process — see CLAUDE.md.
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNewsQuestionsJob();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// Vercel Cron Jobs (see vercel.json) only ever issue a GET, and
// automatically attach `Authorization: Bearer $CRON_SECRET` when that env
// var is set on the project — exactly what isAuthorizedCronRequest already
// checks, so no separate handler body is needed. Manual/external triggers
// (curl, a different scheduler) can keep using POST.
export const GET = POST;
