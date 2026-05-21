'use client';
import RoleDashboardShell from '@/components/intake/RoleDashboardShell';

export const dynamic = 'force-dynamic';

export default function FarmerPage() {
  return (
    <RoleDashboardShell
      role="farmer"
      label="Farmer"
      icon="🌱"
      heroTitle="Submit Harvest"
      heroSub="Photo of today's harvest. GPS + timestamp tag the farm location. Dedrick approves before it's live."
    />
  );
}
