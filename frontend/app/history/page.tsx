"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import styles from "./history.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface HistoryEntry {
  id: string;
  name: string;
  language: string;
  code: string;
  created_at: string;
}

const LANGUAGES = [
  { id: "all", label: "All Languages" },
  { id: "python", label: "Python 3" },
  { id: "javascript", label: "JavaScript" },
  { id: "java", label: "Java" },
  { id: "c", label: "C" },
];

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return (
      d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }) +
      ", " +
      d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    );
  } catch {
    return dateStr;
  }
}

export default function HistoryPage() {
  const router = useRouter();
  const { user, session } = useAuth();

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [langFilter, setLangFilter] = useState("all");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // View Modal state
  const [selectedSnippet, setSelectedSnippet] = useState<HistoryEntry | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch history from API
  const fetchHistory = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/history`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
      }
    } catch {
      /* fallback */
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Delete snippet handler
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this code snippet?")) return;
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (selectedSnippet?.id === id) setSelectedSnippet(null);

    if (session?.access_token) {
      try {
        await fetch(`${API_BASE}/api/history/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch {
        /* ignore */
      }
    }
  };

  // Open snippet in editor
  const handleOpenInEditor = (entry: HistoryEntry) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("codeoscope_load_snippet", JSON.stringify(entry));
    }
    router.push("/editor");
  };

  // Copy code to clipboard
  const handleCopyCode = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filtered entries
  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.language.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLang =
        langFilter === "all" || item.language.toLowerCase() === langFilter.toLowerCase();
      return matchesSearch && matchesLang;
    });
  }, [history, searchTerm, langFilter]);

  // Stats calculation
  const totalExecutions = history.length;
  const pythonCount = history.filter(
    (h) => h.language.toLowerCase() === "python"
  ).length;
  const jsCount = history.filter(
    (h) => h.language.toLowerCase() === "javascript"
  ).length;
  const javaCount = history.filter((h) => h.language.toLowerCase() === "java").length;
  const cCount = history.filter((h) => h.language.toLowerCase() === "c").length;

  const topLangName =
    pythonCount >= Math.max(jsCount, javaCount, cCount)
      ? "Python"
      : jsCount >= Math.max(javaCount, cCount)
      ? "JavaScript"
      : javaCount >= cCount
      ? "Java"
      : "C";
  const topLangCount = Math.max(pythonCount, jsCount, javaCount, cCount);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const paginatedEntries = filteredHistory.slice(startIndex, startIndex + pageSize);

  const getLangBadgeClass = (langStr: string) => {
    const l = langStr.toLowerCase();
    if (l === "javascript" || l === "js") return styles.langBadgeJs;
    if (l === "python") return styles.langBadgePy;
    if (l === "java") return styles.langBadgeJava;
    return styles.langBadgeC;
  };

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        {/* Back Button on top left */}
        <button
          className={styles.backBtn}
          onClick={() => router.push("/editor")}
          title="Back to Code Editor"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Editor
        </button>

        {/* ── Top Header Row ────────────────────────────────────────────── */}
        <div className={styles.topHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.titleRow}>
              <div className={styles.clockIconBox}>
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h1 className={styles.title}>Code History</h1>
            </div>
            <p className={styles.subtitle}>
              View and manage your previously executed code.
            </p>
          </div>

          {/* Search and Filter */}
          <div className={styles.headerRight}>
            <div className={styles.searchBox}>
              <svg
                className={styles.searchIcon}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search by title or language..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div className={styles.filterBox}>
              <svg
                className={styles.filterIcon}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <select
                className={styles.filterSelect}
                value={langFilter}
                onChange={(e) => {
                  setLangFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── 4 Summary Stat Cards ────────────────────────────────────── */}
        <div className={styles.statsGrid}>
          {/* Card 1: Total Executions */}
          <div className={styles.statCard}>
            <div className={`${styles.statIconBox} ${styles.iconBoxPurple}`}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div className={styles.statDetails}>
              <span className={styles.statValue}>{totalExecutions}</span>
              <span className={styles.statLabel}>Total Executions</span>
            </div>
          </div>

          {/* Card 2: Python / Top Lang */}
          <div className={styles.statCard}>
            <div className={`${styles.statIconBox} ${styles.iconBoxBlue}`}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </div>
            <div className={styles.statDetails}>
              <span className={styles.statValue}>{topLangCount}</span>
              <span className={styles.statLabel}>{topLangName}</span>
            </div>
          </div>

          {/* Card 3: Successful */}
          <div className={styles.statCard}>
            <div className={`${styles.statIconBox} ${styles.iconBoxGreen}`}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="9 12 11 14 15 9" />
              </svg>
            </div>
            <div className={styles.statDetails}>
              <span className={styles.statValue}>{totalExecutions}</span>
              <span className={styles.statLabel}>Successful</span>
            </div>
          </div>

          {/* Card 4: Failed */}
          <div className={styles.statCard}>
            <div className={`${styles.statIconBox} ${styles.iconBoxRed}`}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div className={styles.statDetails}>
              <span className={styles.statValue}>0</span>
              <span className={styles.statLabel}>Failed</span>
            </div>
          </div>
        </div>

        {/* ── Main Code History Table Card ─────────────────────────────────── */}
        <div className={styles.tableCard}>
          {loading ? (
            <div className={styles.loadingBox}>
              <div className={styles.spinner} />
              <span>Loading code history...</span>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className={styles.emptyBox}>
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ opacity: 0.3 }}
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p className={styles.emptyTitle}>No code history found</p>
              <p className={styles.emptyDesc}>
                {searchTerm || langFilter !== "all"
                  ? "No saved snippets match your search criteria."
                  : "Write and save code snippets in the editor to view them here."}
              </p>
            </div>
          ) : (
            <div className={styles.tableResponsive}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}>#</th>
                    <th>TITLE</th>
                    <th style={{ width: "140px" }}>LANGUAGE</th>
                    <th style={{ width: "130px" }}>STATUS</th>
                    <th style={{ width: "230px" }}>LAST EXECUTED</th>
                    <th style={{ width: "140px", textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEntries.map((entry, idx) => {
                    const globalIdx = startIndex + idx + 1;
                    const langLabel =
                      LANGUAGES.find((l) => l.id === entry.language.toLowerCase())?.label ||
                      entry.language;
                    return (
                      <tr key={entry.id} className={styles.tableRow}>
                        <td className={styles.colIndex}>{globalIdx}</td>
                        <td className={styles.colTitle}>
                          <div className={styles.titleContainer}>
                            <span className={styles.snippetName}>{entry.name}</span>
                            <span className={styles.snippetDesc}>No description</span>
                          </div>
                        </td>
                        <td>
                          <span className={getLangBadgeClass(entry.language)}>
                            {langLabel}
                          </span>
                        </td>
                        <td>
                          <span className={styles.statusPillSuccess}>
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Success
                          </span>
                        </td>
                        <td className={styles.colDate}>
                          <div className={styles.dateGroup}>
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className={styles.calendarIcon}
                            >
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span>{formatDate(entry.created_at)}</span>
                          </div>
                        </td>
                        <td className={styles.colActions}>
                          <div className={styles.actionGroup}>
                            <button
                              className={`${styles.actionBtn} ${styles.actionBtnPurple}`}
                              title="View Code"
                              onClick={() => setSelectedSnippet(entry)}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>

                            <button
                              className={`${styles.actionBtn} ${styles.actionBtnBlue}`}
                              title="Duplicate / Load to Editor"
                              onClick={() => handleOpenInEditor(entry)}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            </button>

                            <button
                              className={`${styles.actionBtn} ${styles.actionBtnRed}`}
                              title="Delete snippet"
                              onClick={() => handleDelete(entry.id)}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Table Footer & Pagination Controls ────────────────────────── */}
          {!loading && filteredHistory.length > 0 && (
            <div className={styles.paginationFooter}>
              <div className={styles.paginationInfo}>
                Showing {startIndex + 1} to{" "}
                {Math.min(startIndex + pageSize, filteredHistory.length)} of{" "}
                {filteredHistory.length} results
              </div>

              <div className={styles.paginationButtons}>
                <button
                  className={styles.pageArrow}
                  disabled={validPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    className={`${styles.pageNumber} ${
                      pageNum === validPage ? styles.pageActive : ""
                    }`}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  className={styles.pageArrow}
                  disabled={validPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              <div className={styles.pageSizeSelectGroup}>
                <span>Show</span>
                <select
                  className={styles.pageSizeSelect}
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
                <span>per page</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Actions Help / Legend Footer ───────────────────────────── */}
        <div className={styles.legendCard}>
          <span className={styles.legendTitle}>ACTIONS:</span>

          <div className={styles.legendItem}>
            <div className={`${styles.legendIconBox} ${styles.iconBoxPurple}`}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div>
              <span className={styles.legendName}>View Code</span>
              <span className={styles.legendDesc}>View the code and details</span>
            </div>
          </div>

          <div className={styles.legendDivider} />

          <div className={styles.legendItem}>
            <div className={`${styles.legendIconBox} ${styles.iconBoxBlue}`}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </div>
            <div>
              <span className={styles.legendName}>Duplicate</span>
              <span className={styles.legendDesc}>Copy code to editor</span>
            </div>
          </div>

          <div className={styles.legendDivider} />

          <div className={styles.legendItem}>
            <div className={`${styles.legendIconBox} ${styles.iconBoxRed}`}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </div>
            <div>
              <span className={styles.legendName}>Delete</span>
              <span className={styles.legendDesc}>Remove from history</span>
            </div>
          </div>
        </div>

        {/* ── View Code Modal Overlay ─────────────────────────────────── */}
        {selectedSnippet && (
          <div className={styles.modalBackdrop} onClick={() => setSelectedSnippet(null)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div className={styles.modalHeaderTitle}>
                  <h3>{selectedSnippet.name}</h3>
                  <span className={getLangBadgeClass(selectedSnippet.language)}>
                    {LANGUAGES.find(
                      (l) => l.id === selectedSnippet.language.toLowerCase()
                    )?.label || selectedSnippet.language}
                  </span>
                </div>
                <button
                  className={styles.modalCloseBtn}
                  onClick={() => setSelectedSnippet(null)}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className={styles.modalSubHeader}>
                <span>Saved on {formatDate(selectedSnippet.created_at)}</span>
              </div>

              <div className={styles.modalBody}>
                <pre className={styles.codePreview}>
                  <code>{selectedSnippet.code}</code>
                </pre>
              </div>

              <div className={styles.modalFooter}>
                <button
                  className={styles.secondaryModalBtn}
                  onClick={() => handleCopyCode(selectedSnippet.code)}
                >
                  {copied ? "Copied!" : "Copy Code"}
                </button>
                <button
                  className={styles.primaryModalBtn}
                  onClick={() => handleOpenInEditor(selectedSnippet)}
                >
                  Open in Editor
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
