// Translates raw Supabase / Postgres / network errors into plain-English
// messages safe to show staff. Falls back to a generic "try again" line
// rather than leaking internals.
//
// Pair with the LoadingState / ErrorState components in /components.

const PATTERNS: Array<{ test: RegExp; msg: string }> = [
  { test: /jwt|token expired|session/i,                  msg: 'Your session expired. Please sign in again.' },
  { test: /not authenticated|unauthorized|401/i,         msg: 'You need to sign in to continue.' },
  { test: /permission denied|insufficient privilege|403/i, msg: 'You do not have permission for this action.' },
  { test: /this record is locked|row is locked/i,        msg: 'This record is locked. A founder or co-founder must unlock it first.' },
  { test: /duplicate key|already exists|unique constraint/i, msg: 'This entry already exists. Pick a different value.' },
  { test: /violates check|invalid input|22P02|enum/i,    msg: 'One of the values is not allowed. Please double-check the form.' },
  { test: /violates foreign key|23503/i,                 msg: 'A linked record is missing or has been removed.' },
  { test: /column|relation .* does not exist/i,          msg: 'Data setup is incomplete. Please contact Dedrick — a database update is needed.' },
  { test: /timeout|aborted|network|failed to fetch/i,    msg: 'Network was slow or unavailable. Please try again.' },
  { test: /rate limit|429/i,                             msg: 'Too many requests just now. Please wait a moment and retry.' },
];

export function plainError(err: unknown): string {
  const raw = err instanceof Error ? err.message
            : typeof err === 'string' ? err
            : err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message)
            : '';
  if (!raw) return 'Something went wrong. Please try again.';
  for (const { test, msg } of PATTERNS) {
    if (test.test(raw)) return msg;
  }
  return 'Something went wrong. Please try again.';
}
