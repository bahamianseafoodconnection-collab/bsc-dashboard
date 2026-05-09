'use client';

// app/contact/page.tsx — public contact form. Posts to /api/contact
// which writes the message into the notifications queue (channel='email')
// addressed to BSC's mailbox. Until SendGrid creds are wired the row
// lands as 'stub_sent' so the message is preserved as an audit trail.

import { useState } from 'react';
import Link from 'next/link';
import PublicShell from '@/components/PublicShell';

export const dynamic = 'force-dynamic';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [topic, setTopic] = useState('General question');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !message.trim() || (!email.trim() && !phone.trim())) {
      setError('Please fill in your name, message, and either email or phone.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          topic,
          message: message.trim(),
        }),
      });
      const j = await res.json();
      if (j.ok) {
        setSent(true);
        setName(''); setEmail(''); setPhone(''); setTopic('General question'); setMessage('');
      } else {
        setError(j.error || 'Could not send your message');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicShell
      eyebrow="Get in touch"
      title="Contact BSC"
      subtitle="WhatsApp is fastest — but if you prefer to type, we read every message."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-2xl bg-navy p-5 text-white shadow-card">
            <div className="text-xs font-bold uppercase tracking-wider text-gold">WhatsApp</div>
            <a
              href="https://wa.me/12423613474"
              target="_blank"
              rel="noreferrer"
              className="mt-1 block font-display text-lg font-black hover:text-gold"
            >
              +1 (242) 361-3474
            </a>
            <div className="mt-1 text-xs text-white/60">Fastest replies — usually within an hour.</div>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Phone</div>
            <a href="tel:+12425584495" className="mt-1 block font-display text-lg font-black text-navy hover:text-navy-700">
              +1 (242) 558-4495
            </a>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Email</div>
            <a
              href="mailto:Bahamiansc@iCloud.com"
              className="mt-1 block break-all font-display text-base font-black text-navy hover:text-navy-700"
            >
              Bahamiansc@iCloud.com
            </a>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Already a customer?</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href="/my-orders" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
                Track an order
              </Link>
              <Link href="/help" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
                FAQ
              </Link>
            </div>
          </div>
        </div>

        {sent ? (
          <div className="rounded-2xl bg-white p-6 shadow-card">
            <div className="mb-3 text-5xl">✓</div>
            <h2 className="font-display text-xl font-black text-emerald-700">Message sent</h2>
            <p className="mt-2 text-sm text-slate-600">
              Thanks — we will get back to you on the contact you provided.
            </p>
            <button
              onClick={() => setSent(false)}
              className="mt-5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              Send another
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
            <h2 className="mb-4 font-display text-lg font-black text-navy">Send a message</h2>
            <Field label="Your name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT}
                required
              />
            </Field>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={INPUT}
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="Phone (WhatsApp preferred)">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={INPUT}
                  placeholder="+1 (242) 000-0000"
                  inputMode="tel"
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Topic">
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className={INPUT}
                >
                  {[
                    'General question',
                    'Order help',
                    'Wholesale inquiry',
                    'Supplier inquiry',
                    'Returns / refunds',
                    'Technical issue',
                  ].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Message">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  className={INPUT}
                  required
                  maxLength={5000}
                />
              </Field>
            </div>
            {error && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full rounded-xl bg-navy px-6 py-3.5 text-sm font-black text-gold transition hover:bg-navy-700 disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Send message'}
            </button>
            <p className="mt-3 text-[11px] text-slate-400">
              By sending you agree we may contact you on the channels you provided.
            </p>
          </form>
        )}
      </div>
    </PublicShell>
  );
}

const INPUT =
  'w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-navy outline-none transition focus:border-navy focus:shadow-[0_0_0_3px_rgba(26,46,90,0.1)] placeholder:text-slate-300';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
