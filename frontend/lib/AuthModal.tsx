"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import styles from "./authModal.module.css";

export default function AuthModal() {
  const { isAuthModalOpen, closeAuthModal } = useAuth();
  const router = useRouter();

  if (!isAuthModalOpen) return null;

  const handleSignIn = () => {
    closeAuthModal();
    router.push("/login");
  };

  const handleCreateAccount = () => {
    closeAuthModal();
    router.push("/register");
  };

  return (
    <div className={styles.overlay} onClick={closeAuthModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button className={styles.closeBtn} onClick={closeAuthModal} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Icon */}
        <div className={styles.iconWrap}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#modalGrad)" strokeWidth="1.8">
            <defs>
              <linearGradient id="modalGrad" x1="0" y1="0" x2="24" y2="24">
                <stop offset="0%" stopColor="#4f8ef7" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h2 className={styles.title}>Sign in to continue</h2>
        <p className={styles.subtitle}>
          Create a free account or sign in to run, visualise, and analyse your code.
        </p>

        <div className={styles.actions}>
          <button id="modal-signin-btn" className={styles.primaryBtn} onClick={handleSignIn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Sign In
          </button>

          <button id="modal-register-btn" className={styles.secondaryBtn} onClick={handleCreateAccount}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            Create Free Account
          </button>
        </div>

        <p className={styles.hint}>It only takes 30 seconds — no credit card required.</p>
      </div>
    </div>
  );
}
