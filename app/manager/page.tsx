'use client';
import RoleDashboardShell from '@/components/intake/RoleDashboardShell';

export const dynamic = 'force-dynamic';

export default function ManagerPage() {
  return (
    <RoleDashboardShell
      role="manager"
      label="Manager"
      icon="📋"
      heroTitle="Add Inventory"
      heroSub="Snap a product photo. GPS + timestamp captured. Submission lands in the approval queue for founder review."
    />
  );
}
