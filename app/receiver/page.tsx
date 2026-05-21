'use client';
import RoleDashboardShell from '@/components/intake/RoleDashboardShell';

export const dynamic = 'force-dynamic';

export default function ReceiverPage() {
  return (
    <RoleDashboardShell
      role="receiver"
      label="Receiver"
      icon="📥"
      heroTitle="Log Receiving Intake"
      heroSub="Step 1 of the HACCP intake — vessel + GPS media + raw weight at the dock. Per the intake-step-ownership rule, the receiver records what arrives; the processor handles freezer/production/grading later."
    />
  );
}
