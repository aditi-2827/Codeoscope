"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import styles from "./editor.module.css";
import VisualizerOverlay from "./VisualizerOverlay";
import DryRunOverlay from "./DryRunOverlay";
import type * as Monaco from "monaco-editor";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";


const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className={styles.monacoLoading}><span className={styles.loadingDot} />Loading editor…</div>,
});

const LANGUAGES = [
  { id: "python", label: "Python 3", mono: "python" },
  { id: "javascript", label: "JavaScript", mono: "javascript" },
  { id: "java", label: "Java", mono: "java" },
  { id: "c", label: "C", mono: "c" },
];

const SAMPLE: Record<string, string> = {
  python: `# Write your code here
def binary_search(arr, target):
    left = 0
    right = len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2
        
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    
    return -1

# Driver Code
arr = [1, 3, 5, 7, 9, 11]
target = 7

result = binary_search(arr, target)

print(result)`,

  javascript: `// Binary Search
function binarySearch(arr, target) {
    let left = 0;
    let right = arr.length - 1;
    
    while (left <= right) {
        let mid = Math.floor((left + right) / 2);
        if (arr[mid] === target) return mid;
        else if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}

const arr = [1, 3, 5, 7, 9, 11];
const result = binarySearch(arr, 7);
if (result !== -1) console.log("Found at index:", result);
else console.log("Element not found");`,

  java: `public class Main {
    static int binarySearch(int[] arr, int target) {
        int left = 0, right = arr.length - 1;
        while (left <= right) {
            int mid = (left + right) / 2;
            if (arr[mid] == target) return mid;
            else if (arr[mid] < target) left = mid + 1;
            else right = mid - 1;
        }
        return -1;
    }
    public static void main(String[] args) {
        int[] arr = {1, 3, 5, 7, 9, 11};
        int result = binarySearch(arr, 7);
        if (result != -1) System.out.println("Found at index: " + result);
        else System.out.println("Element not found");
    }
}`,

  c: `#include <stdio.h>

int binarySearch(int arr[], int n, int target) {
    int left = 0, right = n - 1;
    while (left <= right) {
        int mid = (left + right) / 2;
        if (arr[mid] == target) return mid;
        else if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}

int main() {
    int arr[] = {1, 3, 5, 7, 9, 11};
    int result = binarySearch(arr, 6, 7);
    if (result != -1) printf("Found at index: %d\\n", result);
    else printf("Element not found\\n");
    return 0;
}`,
};

/* ── Types ────────────────────────────── */
interface OutputResult {
  status: "success" | "error";
  errorType: string;
  time: string;
  memory: string;
  stdout: string;
  stderr: string;
}

interface ComplexityBreakdown {
  section: string;
  complexity: string;
  reason: string;
}

interface ComplexityResult {
  timeComplexity: string;
  spaceComplexity: string;
  bestCase: string;
  averageCase: string;
  worstCase: string;
  explanation: string;
  breakdown: ComplexityBreakdown[];
}

interface HistoryEntry {
  id: string;
  name: string;
  language: string;
  code: string;
  created_at: string;
}

type RightTab = "output" | "complexity";

/* ── Helpers ─────────────────────────────────── */
function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} day ago`;
}

/* ── Component ────────────────────────────────── */
export default function EditorPage() {
  const router = useRouter();
  const { user, session, requireAuth, signOut } = useAuth();

  // Monaco editor instance ref
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const [lang, setLang] = useState("python");
  const [code, setCode] = useState(SAMPLE["python"]);
  const [stdin, setStdin] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<OutputResult | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [visOpen, setVisOpen] = useState(false);
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Complexity
  const [rightTab, setRightTab] = useState<RightTab>("output");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [complexity, setComplexity] = useState<ComplexityResult | null>(null);
  const [complexErr, setComplexErr] = useState("");

  // Save modal
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Helper: build auth headers
  const authHeaders = useCallback(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) h["Authorization"] = `Bearer ${session.access_token}`;
    return h;
  }, [session]);

  // Load history from Supabase when user changes
  useEffect(() => {
    if (!user || !session?.access_token) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    fetch(`${API_BASE}/api/history`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setHistory(data); })
      .catch(() => { })
      .finally(() => setHistoryLoading(false));
  }, [user, session]);

  // Check if navigating from History page with a snippet to load
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("codeoscope_load_snippet");
    if (raw) {
      try {
        const item = JSON.parse(raw);
        if (item.language && item.code) {
          setLang(item.language.toLowerCase());
          setCode(item.code);
        }
      } catch { /* ignore */ }
      sessionStorage.removeItem("codeoscope_load_snippet");
    }
  }, []);

  // Focus save input when modal opens
  useEffect(() => {
    if (saveOpen) setTimeout(() => saveInputRef.current?.focus(), 50);
  }, [saveOpen]);

  const currentLang = LANGUAGES.find(l => l.id === lang)!;
  const fileExt = lang === "python" ? "py" : lang === "javascript" ? "js" : lang === "java" ? "java" : "c";
  const fileName = `main.${fileExt}`;

  const userEmail = user?.email ?? "";
  const userInitial = userEmail ? userEmail[0].toUpperCase() : "?";

  const handleLangChange = (id: string) => {
    setLang(id);
    setCode(SAMPLE[id]);
    setLangOpen(false);
    setOutput(null);
    setComplexity(null);
    setComplexErr("");
  };

  /* ── Monaco mount handler ──────────────────────────────────────────────── */
  const handleEditorMount = (editor: Monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
  };

  /* ── Undo ──────────────────────────────────────────────────────────────── */
  const handleUndo = () => {
    editorRef.current?.trigger("keyboard", "undo", null);
    editorRef.current?.focus();
  };

  /* ── Redo ──────────────────────────────────────────────────────────────── */
  const handleRedo = () => {
    editorRef.current?.trigger("keyboard", "redo", null);
    editorRef.current?.focus();
  };

  /* ── Format ────────────────────────────────────────────────────────────── */
  const handleFormat = () => {
    editorRef.current?.getAction("editor.action.formatDocument")?.run();
    editorRef.current?.focus();
  };

  /* ── Save to Supabase ──────────────────────────────────────────────────── */
  const handleSaveConfirm = async () => {
    const name = saveName.trim();
    if (!name) return;
    setSaveOpen(false);
    setSaveName("");
    try {
      const res = await fetch(`${API_BASE}/api/history/save`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name, language: lang, code }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setHistory(prev => [data, ...prev]);
      }
    } catch { /* silently fail */ }
  };

  /* ── Load from history ─────────────────────────────────────────────────── */
  const handleLoadEntry = (entry: HistoryEntry) => {
    setLang(entry.language);
    setCode(entry.code);
    setOutput(null);
    setComplexity(null);
    setComplexErr("");
  };

  /* ── Delete history entry ──────────────────────────────────────────────── */
  const handleDeleteEntry = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(h => h.id !== id));
    try {
      await fetch(`${API_BASE}/api/history/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    } catch { /* silently fail, already removed from UI */ }
  };

  /* ── Analyse complexity ────────────────────────────────────────────────── */
  const runComplexity = useCallback(async (currentCode: string, currentLangId: string) => {
    setIsAnalyzing(true);
    setComplexity(null);
    setComplexErr("");
    try {
      const res = await fetch(`${API_BASE}/api/complexity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: currentLangId, code: currentCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setComplexity(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setComplexErr(msg);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  /* ── Run code ──────────────────────────────────────────────────────────── */
  const handleRun = async () => {
    setIsRunning(true);
    setOutput(null);
    setRightTab("output");
    runComplexity(code, lang);

    try {
      const res = await fetch(`${API_BASE}/api/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, code, stdin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execution failed");
      setOutput({
        status: data.status === 'Success' ? "success" : "error",
        errorType: data.errorType || "Error",
        time: data.time || "—",
        memory: data.memory || "—",
        stdout: data.stdout || "",
        stderr: data.stderr || "",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setOutput({ status: "error", errorType: "Error", time: "—", memory: "—", stdout: "", stderr: msg });
    } finally {
      setIsRunning(false);
    }
  };

  /* ── Download ──────────────────────────────────────────────────────────── */
  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    a.download = fileName;
    a.click();
  };

  return (
    <div className={styles.shell} onClick={() => { setLangOpen(false); setUserMenuOpen(false); }}>

      {/* ── Save Modal ────────────────────────────────────────────────────── */}
      {saveOpen && (
        <div className={styles.modalBackdrop} onClick={() => { setSaveOpen(false); setSaveName(""); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
              </svg>
              Save Snippet
            </h3>
            <p className={styles.modalSub}>Give your snippet a name so you can find it later.</p>
            <input
              ref={saveInputRef}
              className={styles.modalInput}
              type="text"
              placeholder={`e.g. Binary Search (${currentLang.label})`}
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveConfirm(); if (e.key === "Escape") { setSaveOpen(false); setSaveName(""); } }}
              maxLength={60}
            />
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => { setSaveOpen(false); setSaveName(""); }}>Cancel</button>
              <button className={styles.modalSave} onClick={handleSaveConfirm} disabled={!saveName.trim()}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
                </svg>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logoIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#logoGrad)" strokeWidth="2">
              <defs><linearGradient id="logoGrad" x1="0" y1="0" x2="24" y2="24"><stop offset="0%" stopColor="#4f82e9" /><stop offset="100%" stopColor="#a855f7" /></linearGradient></defs>
              <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
            </svg>
          </span>
          <h1 className={styles.headerTitle}>Codeoscope</h1>

          {/* Language dropdown */}
          <div className={styles.langWrap} onClick={(e) => e.stopPropagation()}>
            <button id="lang-btn" className={styles.langBtn} onClick={() => setLangOpen(o => !o)}>
              <span>{currentLang.label}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ transform: langOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {langOpen && (
              <div className={styles.langMenu}>
                {LANGUAGES.map(l => (
                  <button
                    key={l.id}
                    id={`lang-${l.id}`}
                    className={`${styles.langOption} ${lang === l.id ? styles.langOptionActive : ""}`}
                    onClick={() => handleLangChange(l.id)}
                  >
                    {l.label}
                    {lang === l.id && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: "auto" }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.headerRight}>
          {/* Save */}
          <button className={styles.headerActionBtn} title="Save snippet" onClick={() => { setSaveName(""); setSaveOpen(true); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
            </svg>
            Save
          </button>

          {/* Share */}
          <button className={styles.headerActionBtn} title="Copy shareable link"
            onClick={() => {
              const url = `${window.location.origin}/editor?code=${encodeURIComponent(code)}&lang=${lang}`;
              navigator.clipboard.writeText(url);
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Share
          </button>

          {/* Dark mode (placeholder) */}
          <button className={styles.headerIconBtn} title="Toggle theme">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>

          {/* User */}
          {user ? (
            <div className={styles.userMenuWrap} onClick={(e) => e.stopPropagation()}>
              <button className={styles.userAvatar} onClick={() => setUserMenuOpen((o) => !o)} title={userEmail}>
                {userInitial}
              </button>
              {userMenuOpen && (
                <div className={styles.userMenu}>
                  <div className={styles.userMenuHeader}>
                    <span className={styles.userMenuEmail}>{userEmail}</span>
                  </div>
                  <div className={styles.userMenuDivider} />
                  <button
                    className={styles.userMenuItem}
                    onClick={async () => { await signOut(); setUserMenuOpen(false); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className={styles.signInBtn} onClick={() => router.push("/login")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className={styles.toolbar} onClick={e => e.stopPropagation()}>

        {/* Left — action buttons */}
        <div className={styles.toolbarLeft}>
          <button id="run-btn" className={styles.runBtn} onClick={() => requireAuth(handleRun)} disabled={isRunning}>
            {isRunning ? <span className={styles.spinner} /> : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            )}
            {isRunning ? "Running..." : "Run"}
          </button>

          <button id="dryrun-btn" className={styles.dryRunBtn} onClick={() => requireAuth(() => setDryRunOpen(true))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            Dry Run
          </button>

          <button id="visualize-btn" className={styles.visualizeBtn} onClick={() => requireAuth(() => setVisOpen(true))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Visualize
          </button>
        </div>

        {/* Right — editor utilities */}
        <div className={styles.toolbarRight}>
          <button className={styles.toolbarIconBtn} title="Undo (Ctrl+Z)" onClick={handleUndo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            <span>Undo</span>
          </button>
          <button className={styles.toolbarIconBtn} title="Redo (Ctrl+Y)" onClick={handleRedo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span>Redo</span>
          </button>

          <span className={styles.toolbarDivider} />

          <button className={styles.toolbarIconBtn} title="Format document (Alt+Shift+F)" onClick={handleFormat}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="21" y1="10" x2="7" y2="10" /><line x1="21" y1="6" x2="3" y2="6" />
              <line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="7" y2="18" />
            </svg>
            <span>Format</span>
          </button>
          <button className={styles.toolbarIconBtn} title="Reset to sample code"
            onClick={() => { setCode(SAMPLE[lang]); setOutput(null); setComplexity(null); setComplexErr(""); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
            </svg>
            <span>Reset</span>
          </button>
          <button className={styles.toolbarIconBtn} title="Download code" onClick={handleDownload}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download</span>
          </button>

          <span className={styles.toolbarDivider} />

          <button className={styles.toolbarIconBtn} title="Fullscreen"
            onClick={() => document.documentElement.requestFullscreen?.()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Main Area ───────────────────────────────────────────────────────── */}
      <div className={styles.main}>

        {/* LEFT — Monaco editor with file badge */}
        <div className={styles.editorPanel}>
          <div className={styles.editorInner}>
            <MonacoEditor
              height="100%"
              language={currentLang.mono}
              value={code}
              theme="vs-dark"
              onMount={handleEditorMount}
              onChange={v => setCode(v ?? "")}
              options={{
                fontSize: 13.5,
                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                glyphMargin: false,
                folding: true,
                renderLineHighlight: "line",
                wordWrap: "off",
                tabSize: 4,
                automaticLayout: true,
                padding: { top: 12 },
              }}
            />
            <span className={styles.fileBadge}>{fileName}</span>
          </div>
        </div>

        <div className={styles.panelDivider} />

        {/* RIGHT panel */}
        <div className={styles.rightPanel}>

          {/* INPUT header */}
          <div className={styles.inputSectionHeader}>
            <span className={styles.inputLabel}>INPUT</span>
            <button
              className={styles.inputCopyBtn}
              title="Copy input"
              onClick={() => navigator.clipboard.writeText(stdin)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>

          {/* Input textarea */}
          <div className={styles.inputSection}>
            <textarea
              id="stdin-area"
              className={styles.inputArea}
              value={stdin}
              onChange={e => setStdin(e.target.value)}
              placeholder="Enter input here..."
              spellCheck={false}
            />
          </div>

          <p className={styles.inputHint}>
            If your code takes input,{" "}<a href="#stdin-area">add it</a>{" "}in the above box before running.
          </p>

          {/* Tabs + copy button */}
          <div className={styles.tabBar}>
            <div className={styles.tabBarTabs}>
              <button
                className={`${styles.tab} ${rightTab === "output" ? styles.tabActive : ""}`}
                onClick={() => setRightTab("output")}
              >OUTPUT</button>
              <button
                className={`${styles.tab} ${rightTab === "complexity" ? styles.tabActive : ""}`}
                onClick={() => setRightTab("complexity")}
              >COMPLEXITY</button>
            </div>
            <button
              className={styles.outputCopyBtn}
              title="Copy output"
              onClick={() => {
                const text = output?.stdout || output?.stderr || "";
                if (text) navigator.clipboard.writeText(text);
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>

          {/* Tab content */}
          <div className={styles.tabContent}>

            {rightTab === "output" && (
              <div className={styles.outputBox}>
                {!output && !isRunning && (
                  <p className={styles.outputEmpty}>Your output will appear here</p>
                )}
                {isRunning && (
                  <div className={styles.outputRunning}>
                    <span className={styles.spinnerSm} /><span>Executing your code…</span>
                  </div>
                )}
                {output && !isRunning && (
                  <div className={styles.outputResult}>
                    <div className={styles.statusRow}>
                      <span className={styles.statusLabel}>Status :</span>
                      <span className={output.status === "success" ? styles.statusOk : styles.statusErr}>
                        {output.status === "success" ? "Successfully executed" : (output.errorType || "Error")}
                      </span>
                    </div>
                    <div className={styles.statsRow}>
                      <div className={styles.stat}>
                        <span className={styles.statLabel}>Time:</span>
                        <span className={styles.statVal}>{output.time}</span>
                      </div>
                      <div className={styles.stat}>
                        <span className={styles.statLabel}>Memory:</span>
                        <span className={styles.statVal}>{output.memory}</span>
                      </div>
                    </div>
                    {output.stderr && <pre className={styles.stderr}>{output.stderr}</pre>}
                    {output.stdout && <pre className={styles.stdout}>{output.stdout}</pre>}
                    {!output.stdout && !output.stderr && <p className={styles.noDetails}>No output produced</p>}
                  </div>
                )}
              </div>
            )}

            {rightTab === "complexity" && (
              <div className={styles.outputBox}>
                {!complexity && !isAnalyzing && !complexErr && (
                  <p className={styles.outputEmpty}>// Run your code to see complexity analysis</p>
                )}
                {isAnalyzing && (
                  <div className={styles.outputRunning}>
                    <span className={styles.spinnerSm} /><span>Analysing complexity with AI…</span>
                  </div>
                )}
                {complexErr && <pre className={styles.stderr}>{complexErr}</pre>}
                {complexity && !isAnalyzing && (
                  <div className={styles.complexityResult}>
                    <div className={styles.cxBadges}>
                      <div className={styles.cxBadge}>
                        <span className={styles.cxBadgeLabel}>Time</span>
                        <span className={styles.cxBadgeVal}>{complexity.timeComplexity}</span>
                      </div>
                      <div className={styles.cxBadge}>
                        <span className={styles.cxBadgeLabel}>Space</span>
                        <span className={styles.cxBadgeVal}>{complexity.spaceComplexity}</span>
                      </div>
                    </div>
                    <div className={styles.cxCases}>
                      <div className={styles.cxCase}>
                        <span className={styles.cxCaseIcon}>🟢</span>
                        <span className={styles.cxCaseLabel}>Best</span>
                        <span className={styles.cxCaseVal}>{complexity.bestCase}</span>
                      </div>
                      <span className={styles.cxArrow}>→</span>
                      <div className={styles.cxCase}>
                        <span className={styles.cxCaseIcon}>🟡</span>
                        <span className={styles.cxCaseLabel}>Average</span>
                        <span className={styles.cxCaseVal}>{complexity.averageCase}</span>
                      </div>
                      <span className={styles.cxArrow}>→</span>
                      <div className={styles.cxCase}>
                        <span className={styles.cxCaseIcon}>🔴</span>
                        <span className={styles.cxCaseLabel}>Worst</span>
                        <span className={styles.cxCaseVal}>{complexity.worstCase}</span>
                      </div>
                    </div>
                    <div className={styles.cxExplain}>
                      <h4 className={styles.cxExplainTitle}>💡 Explanation</h4>
                      <p className={styles.cxExplainText}>{complexity.explanation}</p>
                    </div>
                    {complexity.breakdown && complexity.breakdown.length > 0 && (
                      <div className={styles.cxBreakdown}>
                        <h4 className={styles.cxBreakdownTitle}>📋 Breakdown</h4>
                        <table className={styles.cxTable}>
                          <thead>
                            <tr>
                              <th>Section</th><th>Complexity</th><th>Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {complexity.breakdown.map((b, i) => (
                              <tr key={i}>
                                <td className={styles.cxTableSection}>{b.section}</td>
                                <td className={styles.cxTableBigO}>{b.complexity}</td>
                                <td>{b.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── Recent Runs (History) ────────────────────────────────────── */}
          <div className={styles.recentRunsSection}>
            <div className={styles.recentRunsHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 className={styles.recentRunsTitle}>RECENT SAVES</h3>
                <button
                  className={styles.historyArrowBtn}
                  onClick={() => router.push("/history")}
                  title="View full code history"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                </button>
              </div>
              <button
                className={styles.recentRunsViewAll}
                onClick={() => setSaveOpen(true)}
                title="Save current snippet"
              >+ Save</button>
            </div>
            <div className={styles.recentRunsList}>
              {history.length === 0 ? (
                <p className={styles.recentRunsEmpty}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5 }}>
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
                  </svg>
                  No saves yet. Hit &quot;Save&quot; to store a snippet.
                </p>
              ) : (
                history.slice(0, 3).map(entry => (
                  <div
                    key={entry.id}
                    className={styles.recentRunItem}
                    onClick={() => handleLoadEntry(entry)}
                    title={`Load "${entry.name}" (${LANGUAGES.find(l => l.id === entry.language)?.label ?? entry.language})`}
                  >
                    <span className={`${styles.recentRunIcon} ${styles.recentRunIconSuccess}`}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <span className={styles.recentRunName}>{entry.name}</span>
                    <span className={styles.recentRunLang}>
                      {LANGUAGES.find(l => l.id === entry.language)?.label ?? entry.language}
                    </span>
                    <span className={styles.recentRunTime}>{timeAgo(entry.created_at)}</span>
                    <button
                      className={styles.recentRunDelete}
                      onClick={(e) => handleDeleteEntry(entry.id, e)}
                      title="Delete this save"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Status Bar ────────────────────────────────────────────────────── */}
      <div className={styles.statusBar}>
        <div className={styles.statusBarLeft}>
          <span className={styles.statusDot} />
          <span>Ready</span>
        </div>
        <div className={styles.statusBarRight}>
          <span>Ln 1, Col 1</span>
          <span className={styles.statusSep}>|</span>
          <span>Spaces: 4</span>
          <span className={styles.statusSep}>|</span>
          <span>UTF-8</span>
          <span className={styles.statusSep}>|</span>
          <span>LF</span>
          <span className={styles.statusSep}>|</span>
          <span>{currentLang.label}</span>
        </div>
      </div>

      {/* Overlays */}
      {visOpen && (
        <VisualizerOverlay
          code={code}
          language={currentLang.label}
          languageId={lang}
          onClose={() => setVisOpen(false)}
        />
      )}
      {dryRunOpen && (
        <DryRunOverlay
          code={code}
          language={currentLang.label}
          languageId={lang}
          onClose={() => setDryRunOpen(false)}
        />
      )}

    </div>
  );
}
