"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

const TABS = [
  { href: "/", label: "Begin" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
  { href: "/why", label: "Why?" },
];

export default function NavTabs() {
  const pathname = usePathname();

  if (pathname === "/sign-in" || pathname.startsWith("/sign-in/")) return null;
  if (pathname === "/sign-up" || pathname.startsWith("/sign-up/")) return null;

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1.5rem",
        padding: "1rem 1.5rem",
        borderBottom: "1px solid #e2ddd1",
      }}
    >
      <div style={{ display: "flex", gap: "1.5rem" }}>
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                fontWeight: active ? 700 : 400,
                textDecoration: "none",
                color: "inherit",
                opacity: active ? 1 : 0.6,
                textTransform: "uppercase",
                fontSize: "0.85rem",
                letterSpacing: "0.04em",
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {/* Clerk's own prebuilt component — sign-out lives in its popover.
          No custom account-settings UI is built on top of it (out of
          scope for Phase 8; see CLAUDE.md). */}
      <UserButton afterSignOutUrl="/sign-in" />
    </nav>
  );
}
