import { redirect } from "next/navigation";
import ProjectCostingClient from "@/components/pages/ProjectCostingClient";
import { getProjectCostingAccess } from "@/lib/project-costing-access";

export const dynamic = "force-dynamic";

export default async function ProjectCostingPage() {
  const access = await getProjectCostingAccess();
  if (!access) redirect("/dashboard");
  return <ProjectCostingClient isAdmin={access.isAdmin} />;
}
