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
if (!email || !password) { setError("Email and password required"); return; }
setLoading(true);
const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
if (err) { setError(err.message); setLoading(false); return; }
const { data: profile } = await supabase
.from("profiles").select("role").eq("id", data.user.id).single();
setLoading(false);
if (profile?.role === "cashier") router.push("/pos");
else router.push("/");​​​​​​​​​​​​​​​​
