'use client';
import RoleDashboardShell from '@/components/intake/RoleDashboardShell';

export const dynamic = 'force-dynamic';

export default function CaptainPage() {
  return (
    <RoleDashboardShell
      role="captain"
      label="Captain"
      icon="🛥"
      heroTitle="Log Vessel Intake"
      heroSub="Photo of the offload + vessel registration. GPS + timestamp lock the dock location automatically."
    />
  );
}
