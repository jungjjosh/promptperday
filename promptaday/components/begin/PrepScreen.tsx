"use client";

import { useEffect, useState } from "react";
import type { ActiveSessionData } from "@/lib/sessionTypes";
import { formatCountdown } from "@/lib/formatDuration";
import styles from "./begin.module.css";

export default function PrepScreen({
  session,
  onExpire,
  onReroll,
}: {
  session: ActiveSessionData;
  onExpire: () => void;
  onReroll: (updated: Partial<ActiveSessionData>) => void;
}) {
  const [remaining, setRemaining] = useState(
    () => new Date(session.prepEndsAt).getTime() - Date.now(),
  );
  const [rerolling, setRerolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const target = new Date(session.prepEndsAt).getTime();
    const tick = () => {
      const msLeft = target - Date.now();
      setRemaining(msLeft);
      if (msLeft <= 0) onExpire();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session.prepEndsAt, onExpire]);

  async function reroll(type: "category" | "question") {
    setRerolling(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/reroll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Reroll failed");
        return;
      }
      onReroll({
        categoryId: data.category.id,
        categoryName: data.category.name,
        questionId: data.question.id,
        questionText: data.question.text,
        rerollUsed: true,
      });
    } finally {
      setRerolling(false);
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.countdown}>{formatCountdown(remaining)}</div>
      <span className={styles.categoryTag}>{session.categoryName}</span>
      <p className={styles.question}>{session.questionText}</p>

      <div className={styles.rerollRow}>
        <span className={styles.rerollLabel}>
          {session.rerollUsed ? "Reroll used" : "One reroll available — use it on:"}
        </span>
        <button
          className={styles.button}
          disabled={session.rerollUsed || rerolling}
          onClick={() => reroll("category")}
        >
          New category
        </button>
        <button
          className={styles.button}
          disabled={session.rerollUsed || rerolling}
          onClick={() => reroll("question")}
        >
          New question
        </button>
      </div>
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
