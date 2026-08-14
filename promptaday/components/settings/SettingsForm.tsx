"use client";

import { useState } from "react";
import styles from "./settings.module.css";

interface CategoryData {
  id: string;
  name: string;
  enabledByDefault: boolean;
}

const PREP_DURATIONS = [5, 10, 15, 20];

export default function SettingsForm({
  userId,
  initialPrepDurationMinutes,
  initialCategories,
}: {
  userId: string;
  initialPrepDurationMinutes: number;
  initialCategories: CategoryData[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [prepDurationMinutes, setPrepDurationMinutes] = useState(
    initialPrepDurationMinutes,
  );
  const [error, setError] = useState<string | null>(null);

  const enabledCount = categories.filter((c) => c.enabledByDefault).length;

  async function toggleCategory(category: CategoryData) {
    setError(null);
    const nextEnabled = !category.enabledByDefault;

    if (!nextEnabled && enabledCount <= 1) {
      setError("At least one category must stay enabled.");
      return;
    }

    const previous = categories;
    setCategories((prev) =>
      prev.map((c) => (c.id === category.id ? { ...c, enabledByDefault: nextEnabled } : c)),
    );

    const res = await fetch(`/api/categories/${category.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabledByDefault: nextEnabled }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't update category");
      setCategories(previous);
    }
  }

  async function changePrepDuration(minutes: number) {
    setError(null);
    const previous = prepDurationMinutes;
    setPrepDurationMinutes(minutes);

    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prepDurationMinutes: minutes }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't update prep duration");
      setPrepDurationMinutes(previous);
    }
  }

  return (
    <div className={styles.screen}>
      <h1>Settings</h1>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>Categories</span>
        <span className={styles.hint}>
          Disabled categories won&apos;t be picked for future sessions.
        </span>
        {categories.map((category) => (
          <div className={styles.categoryRow} key={category.id}>
            <span className={styles.categoryName}>{category.name}</span>
            <button
              type="button"
              role="switch"
              aria-checked={category.enabledByDefault}
              aria-label={`Toggle ${category.name}`}
              className={`${styles.toggle} ${category.enabledByDefault ? styles.toggleOn : ""}`}
              onClick={() => toggleCategory(category)}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>Prep duration</span>
        <span className={styles.hint}>Write time is fixed at 5 minutes.</span>
        <select
          className={styles.select}
          value={prepDurationMinutes}
          onChange={(e) => changePrepDuration(Number(e.target.value))}
        >
          {PREP_DURATIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} min
            </option>
          ))}
        </select>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
