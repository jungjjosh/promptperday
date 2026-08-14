"use client";

import { useCallback, useState } from "react";
import type { ActiveSessionData, TodaySessionState } from "@/lib/sessionTypes";
import StartScreen from "./StartScreen";
import PrepScreen from "./PrepScreen";
import WriteScreen from "./WriteScreen";
import SubmissionScreen from "./SubmissionScreen";
import CongratsScreen from "./CongratsScreen";

type Phase = "idle" | "prepping" | "writing" | "submission" | "congrats";

function derivePhase(state: TodaySessionState): Phase {
  if (state.status === "submitted") return "congrats";
  if (state.status === "idle") return "idle";

  const now = Date.now();
  const prepEndsAt = new Date(state.session.prepEndsAt).getTime();
  const writeEndsAt = new Date(state.session.writeEndsAt).getTime();
  const effectiveDeadline = state.session.graceUsed ? writeEndsAt + 60_000 : writeEndsAt;

  if (now < prepEndsAt) return "prepping";
  if (now < effectiveDeadline) return "writing";
  return "submission";
}

export default function BeginFlow({
  userId,
  initialState,
}: {
  userId: string;
  initialState: TodaySessionState;
}) {
  const [phase, setPhase] = useState<Phase>(() => derivePhase(initialState));
  const [session, setSession] = useState<ActiveSessionData | null>(
    initialState.status === "active" ? initialState.session : null,
  );

  const handleStart = useCallback(async () => {
    const res = await fetch("/api/sessions/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to start session");

    setSession({
      id: data.id,
      categoryId: data.category.id,
      categoryName: data.category.name,
      questionId: data.question.id,
      questionText: data.question.text,
      prepEndsAt: data.prepEndsAt,
      writeEndsAt: data.writeEndsAt,
      rerollUsed: false,
      graceUsed: false,
    });
    setPhase("prepping");
  }, [userId]);

  const handleReroll = useCallback((updated: Partial<ActiveSessionData>) => {
    setSession((prev) => (prev ? { ...prev, ...updated } : prev));
  }, []);

  const handleGraceUsed = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, graceUsed: true } : prev));
  }, []);

  const handlePrepExpire = useCallback(() => setPhase("writing"), []);
  const handleWriteExpire = useCallback(() => setPhase("submission"), []);
  const handleSubmitted = useCallback(() => setPhase("congrats"), []);
  const handleDeleted = useCallback(() => {
    setSession(null);
    setPhase("idle");
  }, []);

  switch (phase) {
    case "idle":
      return <StartScreen onStart={handleStart} />;
    case "prepping":
      if (!session) return null;
      return (
        <PrepScreen session={session} onExpire={handlePrepExpire} onReroll={handleReroll} />
      );
    case "writing":
      if (!session) return null;
      return (
        <WriteScreen
          session={session}
          onExpire={handleWriteExpire}
          onGraceUsed={handleGraceUsed}
        />
      );
    case "submission":
      if (!session) return null;
      return (
        <SubmissionScreen
          session={session}
          onSubmit={handleSubmitted}
          onDelete={handleDeleted}
        />
      );
    case "congrats":
      return <CongratsScreen />;
  }
}
