"use client";

import { useMemo, useState } from "react";
import type { PendingQuestion } from "@/lib/questionReviewTypes";
import styles from "./question-review.module.css";

export default function QuestionReview({
  initialQuestions,
}: {
  initialQuestions: PendingQuestion[];
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function decide(id: string, status: "approved" | "archived") {
    setPendingId(id);
    const res = await fetch(`/api/questions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    }
    setPendingId(null);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, PendingQuestion[]>();
    for (const q of questions) {
      const list = map.get(q.categoryName) ?? [];
      list.push(q);
      map.set(q.categoryName, list);
    }
    return map;
  }, [questions]);

  return (
    <div className={styles.screen}>
      <h1>Question review</h1>

      {questions.length === 0 && (
        <p className={styles.emptyState}>Nothing pending review.</p>
      )}

      {Array.from(grouped.entries()).map(([categoryName, categoryQuestions]) => (
        <div className={styles.categoryGroup} key={categoryName}>
          <span className={styles.categoryTitle}>
            {categoryName} ({categoryQuestions.length})
          </span>
          {categoryQuestions.map((q) => (
            <div className={styles.card} key={q.id}>
              <span className={styles.cardMeta}>
                {q.sourceType} · {new Date(q.createdAt).toLocaleString()}
              </span>
              <span className={styles.cardText}>{q.text}</span>
              <div className={styles.actions}>
                <button
                  className={`${styles.button} ${styles.approveButton}`}
                  disabled={pendingId === q.id}
                  onClick={() => decide(q.id, "approved")}
                >
                  Approve
                </button>
                <button
                  className={`${styles.button} ${styles.rejectButton}`}
                  disabled={pendingId === q.id}
                  onClick={() => decide(q.id, "archived")}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
