import { getOrCreateDefaultUser } from "@/lib/currentUser";
import { getTodaySessionState } from "@/lib/todaySession";
import BeginFlow from "@/components/begin/BeginFlow";

// Depends on request-time DB state (today's session), and can write on
// first run (creating the default user) — must never be statically
// prerendered at build time.
export const dynamic = "force-dynamic";

export default async function BeginPage() {
  const user = await getOrCreateDefaultUser();
  const todayState = await getTodaySessionState(user);

  return <BeginFlow userId={user.id} initialState={todayState} />;
}
