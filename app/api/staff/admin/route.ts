async function callerIsAdmin(req: Request, admin: SupabaseClient): Promise<boolean> {
  // Secret header bypass
  const secret = req.headers.get('x-admin-secret');
  if (secret === process.env.ADMIN_SECRET) return true;

  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;

  // Founder UUID bypass
  if (FOUNDER_IDS.has(extractUserIdFromJWT(token) || '')) return true;

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', extractUserIdFromJWT(token))
    .maybeSingle();

  if (profile?.role && ALLOWED_ADMIN_ROLES.has(String(profile.role))) return true;

  return false;
}
