/**
 * Tenant context resolver — reads tenant headers set by middleware and
 * resolves the Tenant row from the database.
 *
 * This runs on the Node.js runtime (NOT Edge), so Prisma is available.
 *
 * Usage in a Server Component or Server Action:
 *   const tenant = await getCurrentTenant();
 *   if (!tenant) notFound(); // or redirect to marketing page
 */
import { headers } from "next/headers";
import { db } from "@/server/db";
import { cache } from "react";

export interface TenantContext {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  plan: string;
  planStatus: string;
  trialEndsAt: Date | null;
  customDomain: string | null;
  currentMembers: number;
  currentGroups: number;
  currentCourses: number;
  memberLimit: number;
  groupLimit: number;
  courseLimit: number;
  subscriptionBaseEnabled: boolean;
}

/**
 * Read the x-tenant-slug or x-custom-domain header set by middleware.
 * Returns null when the request is on the main platform domain.
 */
export function getTenantSlugFromHeaders(): string | null {
  const headersList = headers();
  return (
    headersList.get("x-tenant-slug") ??
    null
  );
}

export function getCustomDomainFromHeaders(): string | null {
  const headersList = headers();
  return headersList.get("x-custom-domain") ?? null;
}

/**
 * Resolve Tenant from the current request headers.
 * React.cache() ensures one DB query per server-render pass.
 *
 * Returns null on the main platform domain (no tenant in headers).
 */
export const getCurrentTenant = cache(
  async (): Promise<TenantContext | null> => {
    const slug = getTenantSlugFromHeaders();
    const customDomain = getCustomDomainFromHeaders();

    if (!slug && !customDomain) return null;

    const tenant = await db.tenant.findFirst({
      where: slug
        ? { slug }
        : { customDomain: customDomain! },
      select: {
        id: true,
        slug: true,
        name: true,
        ownerId: true,
        plan: true,
        planStatus: true,
        trialEndsAt: true,
        customDomain: true,
        currentMembers: true,
        currentGroups: true,
        currentCourses: true,
        memberLimit: true,
        groupLimit: true,
        courseLimit: true,
        subscriptionBaseEnabled: true,
      },
    });

    return tenant ?? null;
  },
);

/**
 * Same as getCurrentTenant() but throws if no tenant found.
 * Use in pages that only render inside a tenant subdomain.
 */
export async function requireCurrentTenant(): Promise<TenantContext> {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    throw new Error(
      "No tenant found for this request. This page must be accessed via a tenant subdomain.",
    );
  }
  return tenant;
}

/**
 * Fetch a Tenant by its ID — used inside server actions where you already
 * know the tenantId (e.g. from session context or DB relation).
 */
export async function getTenantById(id: string): Promise<TenantContext | null> {
  return db.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      ownerId: true,
      plan: true,
      planStatus: true,
      trialEndsAt: true,
      customDomain: true,
      currentMembers: true,
      currentGroups: true,
      currentCourses: true,
      memberLimit: true,
      groupLimit: true,
      courseLimit: true,
      subscriptionBaseEnabled: true,
    },
  });
}
