"use client";

import { useState } from "react";
import type { ActiveSessionData } from "@/lib/sessionTypes";
import styles from "./begin.module.css";

export default function SubmissionScreen({
  session,
  onSubmit,
  onDelete,
}: {
  session: ActiveSessionData;
  onSubmit: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [sourceInput, setSourceInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addSource() {
    const trimmed = sourceInput.trim();
    if (!trimmed) return;
    setSources((prev) => [...prev, trimmed]);
    setSourceInput("");
  }

  function removeSource(index: number) {
    setSources((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description, sources }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Submit failed");
        return;
      }
      onSubmit();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/entry`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Delete failed");
        return;
      }
      onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={styles.screen}>
      <h1>Wrap up</h1>
      <p>Everything below is optional.</p>

      <div className={styles.field}>
        <label htmlFor="entry-title">Title</label>
        <input
          id="entry-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="entry-description">Description</label>
        <textarea
          id="entry-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label>Visibility</label>
        <div className={styles.visibilityRow}>
          <button
            type="button"
            className={`${styles.visibilityOption} ${styles.visibilityOptionActive}`}
          >
            For You
          </button>
          <button
            type="button"
            className={styles.visibilityOption}
            disabled
            title="Coming soon"
          >
            Friends
          </button>
          <button
            type="button"
            className={styles.visibilityOption}
            disabled
            title="Coming soon"
          >
            Public
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <label>Sources</label>
        <div className={styles.sourceList}>
          {sources.map((source, index) => (
            <div className={styles.sourceItem} key={`${source}-${index}`}>
              <span>{source}</span>
              <button
                type="button"
                className={styles.sourceRemove}
                onClick={() => removeSource(index)}
                aria-label={`Remove source ${source}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className={styles.sourceAddRow}>
          <input
            type="text"
            placeholder="Add a source"
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSource();
              }
            }}
          />
          <button type="button" className={styles.button} onClick={addSource}>
            Add
          </button>
        </div>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <div className={styles.submitRow}>
        <button
          className={`${styles.button} ${styles.buttonSmall}`}
          onClick={handleDelete}
          disabled={deleting || submitting}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
        <button
          className={styles.buttonPrimary}
          onClick={handleSubmit}
          disabled={deleting || submitting}
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
