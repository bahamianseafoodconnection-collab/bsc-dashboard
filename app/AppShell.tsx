// 🔥 FORCE STAFF TO THEIR DASHBOARD (CRITICAL FIX)
if (STAFF_ROLES.has(role)) {
  const correctRoute =
    role === 'manager' ? '/ashley' :
    role === 'cashier' ? '/pos' :
    role === 'andros_staff' ? '/pos-andros' :
    role === 'supplier' ? '/supplier' :
    '/dashboard';

  if (!pathname.startsWith(correctRoute)) {
    console.log('[AppShell FIX] Forcing staff to:', correctRoute);
    router.replace(correctRoute);
    return;
  }
}