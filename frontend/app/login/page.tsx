"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace("/editor");
  }, [user, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }

    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        if (authError.message.includes("Invalid login credentials")) {
          setError("Incorrect email or password. Please try again.");
        } else if (authError.message.includes("Email not confirmed")) {
          setError("Please check your email and confirm your account first.");
        } else {
          setError(authError.message);
        }
        return;
      }

      if (data.session) router.push("/editor");
    } catch {
      setError("Could not connect to authentication server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <div className={styles.page} />;

  return (
    <div className={styles.page}>
      {/* ── Left Panel ─────────────────────────────────────────────────── */}
      <div className={styles.leftPanel}>
        <div className={styles.leftGlow} />
        <div className={styles.leftGlow2} />

        <div className={styles.leftContent}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M8 6L3 12L8 18" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16 6L21 12L16 18" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 4L10 20" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className={styles.logoText}>Codeoscope</span>
          </div>

          <h1 className={styles.leftHeading}>Welcome Back</h1>
          <p className={styles.leftSubtext}>
            Sign in to run code, visualize algorithms, and analyse complexity.
          </p>

          <div className={styles.steps}>
            <div className={styles.step}>
              <span className={styles.stepNum}>1</span>
              <span className={styles.stepText}>Sign in to your account</span>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNum}>2</span>
              <span className={styles.stepText}>Write & run your code</span>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNum}>3</span>
              <span className={styles.stepText}>Visualize & analyze</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Panel ────────────────────────────────────────────────── */}
      <div className={styles.rightPanel}>
        <div className={styles.formContainer}>
          <h2 className={styles.formTitle}>Sign In</h2>
          <p className={styles.formSubtitle}>Enter your credentials to access your account.</p>

          {error && (
            <div className={styles.errorBox}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.fieldGroup}>
              <label htmlFor="email" className={styles.fieldLabel}>Email</label>
              <input
                id="email"
                className={styles.fieldInput}
                type="email"
                placeholder="eg. john@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="password" className={styles.fieldLabel}>Password</label>
              <input
                id="password"
                className={styles.fieldInput}
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? (
                <><span className={styles.btnSpinner} /> Signing in…</>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className={styles.footerText}>
            Don&apos;t have an account?{" "}
            <Link href="/register" className={styles.footerLink}>Sign Up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
