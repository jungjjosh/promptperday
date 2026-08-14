import { getOrCreateUser } from "@/lib/currentUser";
import { getTodaySessionState } from "@/lib/todaySession";
import BeginFlow from "@/components/begin/BeginFlow";

// Depends on request-time DB state (today's session), and can write on
// first request from a given account (lazily creating that account's User
// row) — must never be statically prerendered at build time.
export const dynamic = "force-dynamic";

export default async function BeginPage() {
  const user = await getOrCreateUser();
  const todayState = await getTodaySessionState(user);

  return <BeginFlow initialState={todayState} />;
}
