import { getCurrentSession, isAdminEmail } from "@/lib/auth";
import { findUserById } from "@/lib/auth-db";

export type ProjectCostingAccess = { email: string; isAdmin: boolean; costingOnly: boolean };

/**
 * Who can open Project Costing: the admin (data entry + reports) and the users
 * the admin gave Project Costing data entry (with all modules, or only this
 * screen). null = no access.
 */
export async function getProjectCostingAccess(): Promise<ProjectCostingAccess | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  const user = await findUserById(session.sub);
  if (!user || user.status !== "approved") return null;
  const isAdmin = isAdminEmail(user.email);
  const costingOnly = !isAdmin && user.access_scope === "costing_only";
  if (!isAdmin && !costingOnly && !user.project_costing_access) return null;
  return { email: user.email, isAdmin, costingOnly };
}
