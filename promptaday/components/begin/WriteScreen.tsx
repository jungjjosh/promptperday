"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import CharacterCount from "@tiptap/extension-character-count";
import type { ActiveSessionData } from "@/lib/sessionTypes";
import { formatCountdown } from "@/lib/formatDuration";
import styles from "./begin.module.css";

const AUTOSAVE_INTERVAL_MS = 10_000;
const GRACE_SECONDS = 60;

const FONT_SIZES = [
  { label: "Small", value: "14px" },
  { label: "Normal", value: "16px" },
  { label: "Large", value: "20px" },
  { label: "X-Large", value: "28px" },
];

const FONT_FAMILIES = [
  { label: "Sans", value: "" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "'JetBrains Mono', ui-monospace, monospace" },
];

export default function WriteScreen({
  session,
  onExpire,
  onGraceUsed,
}: {
  session: ActiveSessionData;
  onExpire: () => void;
  onGraceUsed: () => void;
}) {
  const effectiveDeadline = session.graceUsed
    ? new Date(session.writeEndsAt).getTime() + GRACE_SECONDS * 1000
    : new Date(session.writeEndsAt).getTime();

  const [remaining, setRemaining] = useState(() => effectiveDeadline - Date.now());
  const [graceLoading, setGraceLoading] = useState(false);
  const [graceError, setGraceError] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [showFocusWarning, setShowFocusWarning] = useState(false);
  const wasHiddenRef = useRef(false);
  const contentRef = useRef<JSONContent | null>(null);
  const savingRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      CharacterCount,
    ],
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      contentRef.current = editor.getJSON();
    },
    onBlur: () => {
      void saveDraft();
    },
  });

  const saveDraft = useCallback(async () => {
    if (!contentRef.current || savingRef.current) return;
    savingRef.current = true;
    try {
      await fetch(`/api/sessions/${session.id}/content`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: contentRef.current }),
      });
    } catch {
      // best-effort autosave; the next interval tick will retry
    } finally {
      savingRef.current = false;
    }
  }, [session.id]);

  // Countdown to the effective deadline (write_ends_at, or +60s once grace
  // has been used); ticks every second and flips to the submission screen
  // once it hits zero, doing one last best-effort save first.
  useEffect(() => {
    const tick = () => {
      const msLeft = effectiveDeadline - Date.now();
      setRemaining(msLeft);
      if (msLeft <= 0) {
        void saveDraft().finally(onExpire);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [effectiveDeadline, onExpire, saveDraft]);

  useEffect(() => {
    const interval = setInterval(() => {
      void saveDraft();
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [saveDraft]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        wasHiddenRef.current = true;
      } else if (wasHiddenRef.current) {
        wasHiddenRef.current = false;
        setShowFocusWarning(true);
        setTimeout(() => setShowFocusWarning(false), 6000);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  async function handleGrace() {
    setGraceLoading(true);
    setGraceError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/grace`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setGraceError(data.error ?? "Couldn't extend");
        return;
      }
      onGraceUsed();
    } finally {
      setGraceLoading(false);
    }
  }

  const words = editor?.storage.characterCount?.words() ?? 0;
  const characters = editor?.storage.characterCount?.characters() ?? 0;

  return (
    <div className={styles.screen}>
      <div className={styles.countdown}>{formatCountdown(remaining)}</div>

      {showFocusWarning && (
        <p className={styles.focusWarning}>
          Welcome back — try writing from what&apos;s already in your head rather than searching.
        </p>
      )}

      <div className={styles.toolbar}>
        <select
          aria-label="Font size"
          onChange={(e) => editor?.chain().focus().setFontSize(e.target.value).run()}
          defaultValue="16px"
        >
          {FONT_SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Font family"
          onChange={(e) => {
            const value = e.target.value;
            if (value) editor?.chain().focus().setFontFamily(value).run();
            else editor?.chain().focus().unsetFontFamily().run();
          }}
          defaultValue=""
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <input
          aria-label="Font color"
          type="color"
          defaultValue="#1a1a1a"
          onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
        />
      </div>
      <div className={styles.editor}>
        <EditorContent editor={editor} />
      </div>

      <details
        className={styles.legend}
        open={legendOpen}
        onToggle={(e) => setLegendOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className={styles.legendSummary}>Word count</summary>
        <div className={styles.legendBody}>
          <span>{words} words</span>
          <span>{characters} characters</span>
        </div>
      </details>

      <div className={styles.actionsRow}>
        <button
          className={styles.button}
          disabled={session.graceUsed || graceLoading}
          onClick={handleGrace}
        >
          {session.graceUsed ? "Grace used" : "+60s grace"}
        </button>
        {graceError && <span className={styles.errorText}>{graceError}</span>}
      </div>
    </div>
  );
}
