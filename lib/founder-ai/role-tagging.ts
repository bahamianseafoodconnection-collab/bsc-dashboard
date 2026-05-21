// lib/founder-ai/role-tagging.ts
//
// Resolves the submitter's role from the URL ?role= param (when the
// AddInventoryButton passes it) OR the session profile (when the user
// navigates directly to /founder-ai/products/intake without a param).
//
// Returns a normalized string matching the production role taxonomy:
//   founder | basic_admin | co_founder | manager | cashier | andros_staff
//   processor | supplier | fisherman | captain | farmer | partner | receiver
// Or null when no role is known (anonymous direct navigation — rare).

import { supabase } from '@/lib/supabase';

export const KNOWN_ROLES = [
  'founder',
  'basic_admin',
  'co_founder',
  'control_admin',
  'manager',
  'cashier',
  'andros_staff',
  'processor',
  'supplier',
  'fisherman',
  'captain',
  'farmer',
  'partner',
  'receiver',
] as const;

export type KnownRole = typeof KNOWN_ROLES[number];

export function isKnownRole(value: string | null | undefined): value is KnownRole {
  if (!value) return false;
  return (KNOWN_ROLES as readonly string[]).includes(value);
}

/**
 * Resolve the role tag for an intake submission.
 *
 * Precedence:
 *   1. URL ?role= param (when the AddInventoryButton on a role dashboard
 *      passes the role explicitly — useful when an admin clicks a
 *      role-specific entry point and we want to tag it that way).
 *   2. Session profile.role (when the user navigates direct).
 *   3. null (anonymous or no profile).
 */
export async function resolveSubmitterRole(urlRoleParam: string | null | undefined): Promise<KnownRole | null> {
  // URL wins if it's a known role.
  if (urlRoleParam && isKnownRole(urlRoleParam)) return urlRoleParam;

  // Fall back to session profile.
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle();
    const role = (prof as { role?: string | null } | null)?.role ?? null;
    return isKnownRole(role) ? role : null;
  } catch {
    return null;
  }
}

/**
 * Map a role to the dashboard URL it came from. Used by analytics +
 * by the AddInventoryButton when it wants to default the role param.
 */
export function dashboardUrlForRole(role: KnownRole | null | undefined): string {
  switch (role) {
    case 'founder':
    case 'basic_admin':
    case 'control_admin':
    case 'co_founder':       return '/dashboard';
    case 'manager':           return '/manager';
    case 'cashier':           return '/pos';
    case 'andros_staff':      return '/pos-andros';
    case 'processor':         return '/processor';
    case 'supplier':          return '/supplier';
    case 'fisherman':         return '/fisherman';
    case 'captain':           return '/captain';
    case 'farmer':            return '/farmer';
    case 'partner':           return '/partner';
    case 'receiver':          return '/receiver';
    default:                   return '/dashboard';
  }
}
