"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Login failed");
      setSubmitting(false);
      return;
    }

    const next = searchParams.get("next") ?? "/";
    router.push(next);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <label htmlFor="password" style={{ fontSize: "0.85rem" }}>
        Password
      </label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        style={{ padding: "0.5rem", fontSize: "1rem" }}
      />
      {error && (
        <p style={{ color: "#b00020", fontSize: "0.85rem" }}>{error}</p>
      )}
      <button type="submit" disabled={submitting} style={{ padding: "0.6rem" }}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
