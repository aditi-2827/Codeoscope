"use client";
import { useRouter } from "next/navigation";
import styles from "./history.module.css";

export default function HistoryPage() {
  const router = useRouter();
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className="btn btn-ghost btn-sm" onClick={() => router.push("/editor")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to Editor
        </button>
        <h1 className={styles.title}>Code History</h1>
        <p className={styles.subtitle}>Your past runs will appear here</p>
      </div>
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>🕐</div>
        <p className={styles.emptyTitle}>No history yet</p>
        <p className={styles.emptyDesc}>Run some code in the editor and your history will be saved here.</p>
        <span className="badge badge-amber">Supabase integration coming in Module 6</span>
      </div>
    </div>
  );
}
