"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import type { HistoryEntry } from "@/lib/historyTypes";
import { emojiForCategory } from "@/lib/categoryStyle";
import styles from "./history.module.css";

export default function EntryModal({
  entry,
  onClose,
}: {
  entry: HistoryEntry;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit, TextStyle, Color, FontFamily, FontSize],
    content: entry.content as object,
    editable: false,
    immediatelyRender: false,
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleCopy() {
    const text = editor?.getText() ?? "";
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const submittedDate = new Date(entry.submittedAt);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalMeta}>
              {emojiForCategory(entry.categoryName)} {entry.categoryName} ·{" "}
              {submittedDate.toLocaleDateString()}
            </div>
            {entry.title && <div className={styles.modalTitle}>{entry.title}</div>}
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {entry.description && (
          <div className={styles.modalDescription}>{entry.description}</div>
        )}

        <div className={styles.modalContent}>
          <EditorContent editor={editor} />
        </div>

        {entry.sources.length > 0 && (
          <div className={styles.modalSources}>
            Sources: {entry.sources.join(", ")}
          </div>
        )}

        <div className={styles.modalActions}>
          <button className={styles.button} onClick={handleCopy}>
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
        </div>
      </div>
    </div>
  );
}
