import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultUser } from "@/lib/currentUser";
import SettingsForm from "@/components/settings/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getOrCreateDefaultUser();
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

  return (
    <SettingsForm
      userId={user.id}
      initialPrepDurationMinutes={user.prepDurationMinutes}
      initialCategories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        enabledByDefault: c.enabledByDefault,
      }))}
    />
  );
}
