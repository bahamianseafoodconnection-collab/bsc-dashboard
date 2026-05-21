'use client';
import RoleDashboardShell from '@/components/intake/RoleDashboardShell';

export const dynamic = 'force-dynamic';

export default function FishermanPage() {
  return (
    <RoleDashboardShell
      role="fisherman"
      label="Fisherman"
      icon="🎣"
      heroTitle="Add Your Catch"
      heroSub="Snap a photo of today's catch — boat name + GPS + timestamp are captured automatically. Goes to Dedrick's approval queue."
    />
  );
}
