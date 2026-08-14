"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Begin" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
  { href: "/why", label: "Why?" },
];

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        display: "flex",
        gap: "1.5rem",
        padding: "1rem 1.5rem",
        borderBottom: "1px solid #e2ddd1",
      }}
    >
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
    </nav>
  );
}
