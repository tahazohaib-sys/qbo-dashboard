import { getCurrentSession, isAdminEmail } from "@/lib/auth";
import { findUserById } from "@/lib/auth-db";

export type ProjectCostingAccess = { email: string; isAdmin: boolean };

/**
 * Who can open Project Costing: the admin (data entry + reports) and the users
 * the admin gave "Project Costing" access to (data entry only). null = no access.
 */
export async function getProjectCostingAccess(): Promise<ProjectCostingAccess | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  const user = await findUserById(session.sub);
  if (!user || user.status !== "approved") return null;
  const isAdmin = isAdminEmail(user.email);
  if (!isAdmin && !user.project_costing_access) return null;
  return { email: user.email, isAdmin };
}
