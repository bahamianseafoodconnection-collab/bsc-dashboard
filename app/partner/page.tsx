'use client';
import RoleDashboardShell from '@/components/intake/RoleDashboardShell';

export const dynamic = 'force-dynamic';

export default function PartnerPage() {
  return (
    <RoleDashboardShell
      role="partner"
      label="Partner"
      icon="🤝"
      heroTitle="Submit Inventory"
      heroSub="Photo + price + qty. Goes to Dedrick's approval queue. He sets the channels and live date."
    />
  );
}
