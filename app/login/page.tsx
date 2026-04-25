// File: app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
"https://auqjjrisivhfmpleusyt.supabase.co",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg"
);

export default function LoginPage() {
const router = useRouter();
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [error, setError] = useState("");
const [loading, setLoading] = useState(false);
const [resetMode, setResetMode] = useState(false);
const [resetSent, setResetSent] = useState(false);

async function handleLogin() {
setError("");
if (!email || !password) {
setError("Email and password required");
return;
}
setLoading(true);
const { data, error: err } = await supabase.auth.signInWithPassword({
email,
password,
});
if (err) {
setError(err.message);
setLoading(false);
return;
}
const { data: profile } = await supabase
.from("profiles")
.select("role")
.eq("id", data.user.id)
.single();
setLoading(false);
if (profile?.role === "cashier") {
router.push("/pos");
} else {
router.push("/");
}
}

async function handleReset() {
setError("");
if (!email) {
setError("Enter your email address");
return;
}
setLoading(true);
const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
redirectTo: "https://bsc-dashboard.vercel.app/reset-password",
});
if (err) {
setError(err.message);
setLoading(false);
return;
}
setResetSent(true);
setLoading(false);
}

const inp: React.CSSProperties = {
display: "block",
width: "100%",
padding: "12px 14px",
borderRadius: 10,
backgroundColor: "#060b18",
color: "#fff",
border: "1px solid #1e2d4a",
fontSize: 15,
marginBottom: 16,
boxSizing: "border-box",
};

const lbl: React.CSSProperties = {
display: "block",
color: "#6b7280",
fontSize: 11,
letterSpacing: 1,
textTransform: "uppercase",
marginBottom: 6,
};

const primaryBtn: React.CSSProperties = {
width: "100%",
padding: "13px",
borderRadius: 10,
backgroundColor: "#f5c518",
color: "#000",
fontWeight: "bold",
border: "none",
fontSize: 15,
cursor: "pointer",
marginBottom: 10,
};

const secondaryBtn: React.CSSProperties = {
width: "100%",
padding: "11px",
borderRadius: 10,
backgroundColor: "transparent",
color: "#6b7280",
border: "1px solid #1e2d4a",
fontSize: 14,
cursor: "pointer",
};

return (
<div
style={{
minHeight: "100vh",
backgroundColor: "#060b18",
display: "flex",
alignItems: "center",
justifyContent: "center",
fontFamily: "sans-serif",
padding: 20,
}}
>
<div
style={{
width: "100%",
maxWidth: 380,
backgroundColor: "#0d1528",
borderRadius: 20,
padding: 32,
border: "1px solid #1e2d4a",
}}
>
<div style={{ textAlign: "center", marginBottom: 28 }}>
<div style={{ fontSize: 40, marginBottom: 8 }}>🐟</div>
<h1
style={{
margin: 0,
color: "#f5c518",
fontSize: 20,
letterSpacing: 1,
}}
>
BSC CONTROL
</h1>
<p
style={{
margin: "4px 0 0",
color: "#4a5568",
fontSize: 11,
letterSpacing: 2,
}}
>
BAHAMIAN SEAFOOD CONNECTION
</p>
</div>

{resetSent ? (
<div
style={{
backgroundColor: "#0a1f0a",
border: "1px solid #4ade80",
borderRadius: 12,
padding: 20,
textAlign: "center",
}}
>
<p style={{ color: "#4ade80", fontSize: 14, margin: "0 0 12px" }}>
Reset link sent to
<br />
<b>{email}</b>
</p>
<p
style={{ color: "#4a5568", fontSize: 12, margin: "0 0 16px" }}
>
Check your email inbox
</p>
<button
onClick={() => {
setResetMode(false);
setResetSent(false);
}}
style={secondaryBtn}
>
Back to Login
</button>
</div>
) : resetMode ? (
<>
<h2
style={{ color: "#fff", fontSize: 17, margin: "0 0 6px" }}
>
Reset Password
</h2>
<p
style={{
color: "#4a5568",
fontSize: 13,
margin: "0 0 20px",
}}
>
Enter your email to receive a reset link
</p>
<label style={lbl}>Email Address</label>
<input
type="email"
placeholder="your@email.com"
value={email}
onChange={(e) => setEmail(e.target.value)}
style={inp}
/>
{error && (
<p
style={{
color: "#f87171",
fontSize: 13,
marginBottom: 12,
}}
>
{error}
</p>
)}
<button
onClick={handleReset}
disabled={loading}
style={primaryBtn}
>
{loading ? "Sending..." : "Send Reset Link"}
</button>
<button onClick={() => setResetMode(false)} style={secondaryBtn}>
Back
</button>
</>
) : (
<>
<h2
style={{ color: "#fff", fontSize: 17, margin: "0 0 20px" }}
>
Staff Login
</h2>
<label style={lbl}>Email</label>
<input
type="email"
placeholder="your@email.com"
value={email}
onChange={(e) => setEmail(e.target.value)}
style={inp}
/>
<label style={lbl}>Password</label>
<input
type="password"
placeholder="Password"
value={password}
onChange={(e) => setPassword(e.target.value)}
onKeyDown={(e) => e.key === "Enter" && handleLogin()}
style={inp}
/>
{error && (
<p
style={{
color: "#f87171",
fontSize: 13,
backgroundColor: "#2d0000",
padding: "10px 12px",
borderRadius: 8,
marginBottom: 14,
}}
>
{error}
</p>
)}
<button
onClick={handleLogin}
disabled={loading}
style={primaryBtn}
>
{loading ? "Signing in..." : "Sign In"}
</button>
<button
onClick={() => setResetMode(true)}
style={{
background: "none",
border: "none",
color: "#4a5568",
fontSize: 13,
cursor: "pointer",
width: "100%",
marginTop: 10,
}}
>
Forgot password?
</button>
</>
)}
</div>
</div>
);
}
