"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import styles from "../login/login.module.css";

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace("/editor");
  }, [user, authLoading, router]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });

      if (authError) { setError(authError.message); return; }

      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError("An account with this email already exists. Try signing in instead.");
        return;
      }

      if (data.session) { router.push("/editor"); return; }

      setSuccess("Account created! Check your inbox for a confirmation link.");
    } catch {
      setError("An unexpected error occurred. Please try again.");
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

          <h1 className={styles.leftHeading}>Get Started with Us</h1>
          <p className={styles.leftSubtext}>
            Create your free account and start visualizing code in seconds.
          </p>

          <div className={styles.steps}>
            <div className={styles.step}>
              <span className={styles.stepNum}>1</span>
              <span className={styles.stepText}>Sign up your account</span>
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
          <h2 className={styles.formTitle}>Sign Up Account</h2>
          <p className={styles.formSubtitle}>Enter your personal data to create your account.</p>

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

          {success && (
            <div className={styles.successBox}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              {success}
            </div>
          )}

          <form onSubmit={handleRegister} className={styles.form}>
            <div className={styles.fieldRow}>
              <div className={styles.fieldGroup}>
                <label htmlFor="first-name" className={styles.fieldLabel}>First Name</label>
                <input
                  id="first-name"
                  className={styles.fieldInput}
                  type="text"
                  placeholder="eg. John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="last-name" className={styles.fieldLabel}>Last Name</label>
                <input
                  id="last-name"
                  className={styles.fieldInput}
                  type="text"
                  placeholder="eg. Francisco"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="reg-email" className={styles.fieldLabel}>Email</label>
              <input
                id="reg-email"
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
              <label htmlFor="reg-password" className={styles.fieldLabel}>Password</label>
              <input
                id="reg-password"
                className={styles.fieldInput}
                type="password"
                placeholder="Enter your password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <span className={styles.passwordHint}>Must be at least 6 characters.</span>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="reg-confirm" className={styles.fieldLabel}>Confirm Password</label>
              <input
                id="reg-confirm"
                className={styles.fieldInput}
                type="password"
                placeholder="Confirm your password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? (
                <><span className={styles.btnSpinner} /> Creating account…</>
              ) : (
                "Sign Up"
              )}
            </button>
          </form>

          <p className={styles.footerText}>
            Already have an account?{" "}
            <Link href="/login" className={styles.footerLink}>Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
