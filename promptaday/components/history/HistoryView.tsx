"use client";

import { useMemo, useState } from "react";
import type { CategoryOption, HistoryEntry } from "@/lib/historyTypes";
import { localDateKey } from "@/lib/timezone";
import { emojiForCategory } from "@/lib/categoryStyle";
import EntryModal from "./EntryModal";
import styles from "./history.module.css";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export default function HistoryView({
  entries,
  categories,
  userTimezone,
}: {
  entries: HistoryEntry[];
  categories: CategoryOption[];
  userTimezone: string;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  const todayKey = localDateKey(today, userTimezone);
  const entryByDateKey = useMemo(() => {
    const map = new Map<string, HistoryEntry>();
    for (const entry of entries) map.set(entry.dateKey, entry);
    return map;
  }, [entries]);
  const earliestDateKey = entries.length
    ? entries.reduce((min, e) => (e.dateKey < min ? e.dateKey : min), entries[0].dateKey)
    : null;

  function goToMonth(delta: number) {
    let year = viewYear;
    let month = viewMonth + delta;
    if (month < 0) {
      month = 11;
      year -= 1;
    } else if (month > 11) {
      month = 0;
      year += 1;
    }
    setViewYear(year);
    setViewMonth(month);
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<{ day: number; dateKey: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, dateKey: `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}` });
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className={styles.screen}>
      <h1>History</h1>

      <div className={styles.monthHeader}>
        <button className={styles.navButton} onClick={() => goToMonth(-1)} aria-label="Previous month">
          ‹
        </button>
        <span className={styles.monthLabel}>{monthLabel}</span>
        <button className={styles.navButton} onClick={() => goToMonth(1)} aria-label="Next month">
          ›
        </button>
      </div>

      <div className={styles.grid}>
        {WEEKDAY_LABELS.map((label) => (
          <div className={styles.weekdayLabel} key={label}>
            {label}
          </div>
        ))}
        {cells.map((cell, index) => {
          if (!cell) return <div className={`${styles.dayCell} ${styles.dayEmpty}`} key={`empty-${index}`} />;

          const entry = entryByDateKey.get(cell.dateKey);
          const isToday = cell.dateKey === todayKey;
          const isMissed =
            !entry &&
            !isToday &&
            earliestDateKey !== null &&
            cell.dateKey > earliestDateKey &&
            cell.dateKey < todayKey;

          const cellClass = entry
            ? styles.dayCompleted
            : isToday
              ? styles.dayToday
              : isMissed
                ? styles.dayMissed
                : styles.dayPlain;

          return (
            <div
              key={cell.dateKey}
              className={`${styles.dayCell} ${cellClass}`}
              onClick={entry ? () => setSelectedEntry(entry) : undefined}
              role={entry ? "button" : undefined}
              title={entry ? entry.title ?? entry.categoryName : undefined}
            >
              <span className={styles.dayNumber}>{cell.day}</span>
              {entry && <span className={styles.dayEmoji}>{emojiForCategory(entry.categoryName)}</span>}
            </div>
          );
        })}
      </div>

      {entries.length === 0 && (
        <p className={styles.emptyState}>Nothing here yet — complete a prompt to start your history.</p>
      )}

      <div className={styles.legend}>
        {categories.map((category) => {
          const count = entries.filter((e) => e.categoryId === category.id).length;
          return (
            <div className={styles.legendItem} key={category.id}>
              <span>{emojiForCategory(category.name)}</span>
              <span>{category.name}</span>
              <span className={styles.legendCount}>{count}</span>
            </div>
          );
        })}
      </div>

      {selectedEntry && (
        <EntryModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
}
