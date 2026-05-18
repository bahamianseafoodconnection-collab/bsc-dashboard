'use client';

// /vendor/signup — public vendor application form.
//
// Mobile-first. BSC brand. Uploads ID photo + at least 3 operation
// photos + optional video to the vendor-documents bucket under a
// signed-in-only folder. Anonymous applicants can still submit text;
// they'll be prompted to attach docs later if needed.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const LOCATIONS = ['Nassau','Andros','Eleuthera','Abaco','Grand Bahama','Exuma','Bimini','Long Island','Cat Island','Inagua','Other'];

interface DocItem {
  document_type: 'photo' | 'video' | 'id' | 'license';
  file_url:      string;
  description?:  string;
}

export default function VendorSignupPage() {
  // form fields
  const [businessName, setBusinessName] = useState('');
  const [vendorType,   setVendorType]   = useState<'fisherman' | 'farmer' | 'other'>('fisherman');
  const [contactName,  setContactName]  = useState('');
  const [phone,        setPhone]        = useState('');
  const [email,        setEmail]        = useState('');
  const [govtId,       setGovtId]       = useState('');
  const [licenseNum,   setLicenseNum]   = useState('');
  const [location,     setLocation]     = useState('Nassau');
  const [bankName,     setBankName]     = useState('');
  const [bankAcct,     setBankAcct]     = useState('');
  const [routing,      setRouting]      = useState('');

  // docs
  const [idPhoto,     setIdPhoto]     = useState<DocItem | null>(null);
  const [opPhotos,    setOpPhotos]    = useState<DocItem[]>([]);
  const [video,       setVideo]       = useState<DocItem | null>(null);

  // ui state
  const [authed,    setAuthed]    = useState<boolean>(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result,    setResult]    = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  async function uploadFile(file: File, kind: DocItem['document_type']): Promise<string | null> {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const folder = user?.id ?? 'anonymous';
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${kind}.${ext}`;
      const { error } = await supabase.storage.from('vendor-documents').upload(path, file, { contentType: file.type, upsert: false });
      if (error) { alert('Upload failed: ' + error.message); return null; }
      const { data } = supabase.storage.from('vendor-documents').getPublicUrl(path);
      // Note: bucket is private; this URL only works with signed token. For now
      // we store the path and create signed URLs server-side when admins review.
      return data.publicUrl || path;
    } finally {
      setUploading(false);
    }
  }

  async function handleIdPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const url = await uploadFile(f, 'id'); if (url) setIdPhoto({ document_type: 'id', file_url: url, description: 'government ID photo' });
  }
  async function handleOpPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const url = await uploadFile(f, 'photo'); if (url) setOpPhotos((prev) => [...prev, { document_type: 'photo', file_url: url, description: 'operation photo' }]);
    if (e.target) e.target.value = '';
  }
  async function handleVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const url = await uploadFile(f, 'video'); if (url) setVideo({ document_type: 'video', file_url: url, description: 'operation video' });
  }

  async function submit() {
    if (!businessName.trim() || !contactName.trim() || !phone.trim()) {
      setResult({ ok: false, msg: 'Business name, contact name, and phone are required.' });
      return;
    }
    if (opPhotos.length < 3) {
      setResult({ ok: false, msg: 'Please upload at least 3 operation photos.' });
      return;
    }
    setSubmitting(true); setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = 'Bearer ' + session.access_token;

      const documents: DocItem[] = [
        ...(idPhoto ? [idPhoto] : []),
        ...opPhotos,
        ...(video ? [video] : []),
      ];
      const res = await fetch('/api/vendors/signup', {
        method:  'POST',
        headers,
        body: JSON.stringify({
          business_name:        businessName,
          vendor_type:          vendorType,
          contact_name:         contactName,
          phone, email,
          government_id_number: govtId,
          license_number:       licenseNum,
          location,
          bank_account_name:    bankName,
          bank_account_number:  bankAcct,
          routing_info:         routing,
          documents,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setResult({ ok: false, msg: j.error || 'Signup failed' }); return; }
      setResult({ ok: true, msg: 'Thanks — Dedrick + Jaquel will review your application within 24 hours and reach out at ' + (phone || email || 'the contact you provided') + '.' });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Submit failed' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f2ee', fontFamily: "'DM Sans', sans-serif", color: '#0F1111' }}>
      <header style={{ background: '#060d1f', color: '#fff', padding: '18px 16px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <Link href="/" style={{ color: '#f5c518', fontSize: 12, textDecoration: 'none' }}>← bscbahamas.com</Link>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' }}>
            Sell on BSC Marketplace
          </h1>
          <p style={{ fontSize: 13, opacity: 0.8 }}>For Bahamian fishermen, farmers, and harvesters.</p>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: 20 }}>
        <section style={{ background: '#fff', borderRadius: 14, padding: 18, border: '1px solid #e7e7e7', marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: '#060d1f', marginBottom: 4 }}>How it works</h2>
          <ol style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            <li>Apply with your info + 3+ operation photos.</li>
            <li>Dedrick or Jaquel approves you within 24h.</li>
            <li>Post listings; we approve each one before it goes live.</li>
            <li>Drop product at Spiny Tail for QC. BSC delivers to customer.</li>
            <li>Payouts: bi-weekly via RBC transfer.</li>
          </ol>
        </section>

        <Section title="Your business">
          <Field label="Business name *">
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} style={inp} />
          </Field>
          <Field label="Vendor type *">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {(['fisherman','farmer','other'] as const).map((v) => (
                <button key={v} type="button" onClick={() => setVendorType(v)}
                  style={{ ...pill, background: vendorType === v ? '#060d1f' : '#fff', color: vendorType === v ? '#f5c518' : '#0F1111', borderColor: vendorType === v ? '#f5c518' : '#d5d9d9' }}>
                  {v === 'fisherman' ? '🎣' : v === 'farmer' ? '🌱' : '📦'} {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Your name *"><input value={contactName} onChange={(e) => setContactName(e.target.value)} style={inp} /></Field>
          <Field label="Phone *"><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} placeholder="+1 (242) ..." inputMode="tel" /></Field>
          <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} style={inp} type="email" /></Field>
          <Field label="Location *">
            <select value={location} onChange={(e) => setLocation(e.target.value)} style={inp}>
              {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
        </Section>

        <Section title="Compliance">
          <Field label="Government ID number"><input value={govtId} onChange={(e) => setGovtId(e.target.value)} style={inp} /></Field>
          <Field label="License number (if applicable)"><input value={licenseNum} onChange={(e) => setLicenseNum(e.target.value)} style={inp} /></Field>

          <Field label="Government ID photo *">
            <input type="file" accept="image/*" capture="environment" onChange={handleIdPhoto} />
            {idPhoto && <p style={{ fontSize: 11, color: '#067D62', marginTop: 4 }}>✓ ID uploaded</p>}
          </Field>

          <Field label="Operation photos (at least 3) *">
            <input type="file" accept="image/*" capture="environment" onChange={handleOpPhoto} />
            <p style={{ fontSize: 11, color: '#565959', marginTop: 4 }}>{opPhotos.length} uploaded</p>
            {opPhotos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 6 }}>
                {opPhotos.map((d, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={d.file_url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6 }} />
                ))}
              </div>
            )}
          </Field>

          <Field label="Operation video (optional)">
            <input type="file" accept="video/*" capture="environment" onChange={handleVideo} />
            {video && <p style={{ fontSize: 11, color: '#067D62', marginTop: 4 }}>✓ video uploaded</p>}
          </Field>
        </Section>

        <Section title="Payout info (kept private)">
          <Field label="Bank account name"><input value={bankName} onChange={(e) => setBankName(e.target.value)} style={inp} /></Field>
          <Field label="Bank account number"><input value={bankAcct} onChange={(e) => setBankAcct(e.target.value)} style={inp} /></Field>
          <Field label="Routing / branch info"><input value={routing} onChange={(e) => setRouting(e.target.value)} style={inp} /></Field>
        </Section>

        {!authed && (
          <p style={{ fontSize: 12, color: '#565959', marginBottom: 10 }}>
            Tip: <Link href="/login" style={{ color: '#007185' }}>sign in or create an account</Link> first so you can manage your listings later.
          </p>
        )}

        {result && (
          <div style={{ padding: 14, borderRadius: 10, marginBottom: 12, background: result.ok ? '#e7f7ec' : '#fce4e4', color: result.ok ? '#0a6b2f' : '#9b1c1c', fontSize: 14 }}>
            {result.msg}
          </div>
        )}

        <button onClick={submit} disabled={submitting || uploading}
          style={{ width: '100%', padding: '14px 16px', borderRadius: 12, background: '#f5c518', color: '#060d1f', fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer', opacity: (submitting || uploading) ? 0.6 : 1 }}>
          {submitting ? 'Submitting…' : uploading ? 'Uploading…' : 'Submit application'}
        </button>
      </main>
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d5d9d9', fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
const pill: React.CSSProperties = { padding: '10px 8px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '2px solid #d5d9d9', cursor: 'pointer' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', borderRadius: 14, padding: 18, border: '1px solid #e7e7e7', marginBottom: 14 }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: '#060d1f', marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#565959', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
