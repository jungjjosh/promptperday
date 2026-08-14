"use client";

import { useState } from "react";
import styles from "./begin.module.css";

export default function StartScreen({
  onStart,
}: {
  onStart: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      await onStart();
    } catch {
      setError("Couldn't start a session. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`${styles.screen} ${styles.centered}`}>
      <h1>One prompt. Today.</h1>
      <p>Prep, then write — no searching once the clock starts.</p>
      <button className={styles.buttonPrimary} onClick={handleClick} disabled={loading}>
        {loading ? "Starting…" : "Begin"}
      </button>
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
