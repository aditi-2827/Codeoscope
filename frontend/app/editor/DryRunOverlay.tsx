"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./dryrun.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/* ── Types ──────────────────────────────────────────────────────────────────── */
interface CallFrame {
  func: string;
  line: number;
}

interface DryRunStep {
  step: number;
  line: number;
  event: "line" | "call" | "return" | "exception";
  code: string;
  variables: Record<string, string>;
  callStack: CallFrame[];
  output: string;
  explanation: string;
  returnValue?: string;
  error?: string;
}

interface DryRunData {
  dryRun: DryRunStep[];
}

/* ── Props ───────────────────────────────────────────────────────────────────── */
interface Props {
  code: string;
  language: string;
  languageId: string;
  onClose: () => void;
}

/* ── Event Badge ──────────────────────────────────────────────────────────────── */
function EventBadge({ event }: { event: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    call: { label: "↓ CALL", cls: styles.eventCall },
    return: { label: "↑ RET", cls: styles.eventReturn },
    exception: { label: "⚠ ERR", cls: styles.eventException },
  };
  const info = map[event];
  if (!info) return null;
  return <span className={`${styles.eventBadge} ${info.cls}`}>{info.label}</span>;
}

/* ── Call Stack Cell ──────────────────────────────────────────────────────────── */
function CallStackCell({ frames }: { frames: CallFrame[] }) {
  const cleaned = (frames || []).filter(
    (f) => f.func !== "__global__" && f.func !== "<module>"
  );

  if (cleaned.length === 0) {
    return <span className={styles.stackGlobal}>global</span>;
  }

  return (
    <div className={styles.stackFrames}>
      {cleaned.map((f, i) => (
        <span
          key={i}
          className={styles.stackFrame}
          style={{ opacity: 0.45 + 0.55 * ((i + 1) / cleaned.length) }}
        >
          {f.func}()
        </span>
      ))}
      <span className={styles.stackDepth}>depth&nbsp;{cleaned.length}</span>
    </div>
  );
}

/* ── Component ───────────────────────────────────────────────────────────────── */
export default function DryRunOverlay({ code, language, languageId, onClose }: Props) {
  const [data, setData] = useState<DryRunData | null>(null);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  /* ── Auto-play state ─────────────────────────────────────────────────── */
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(800); // ms per step


  const tableRef = useRef<HTMLTableSectionElement>(null);

  const steps = data?.dryRun ?? [];
  const total = steps.length;
  const currentStep = idx > 0 && idx <= total ? steps[idx - 1] : null;

  /* ── Auto-play timer (derived effect — fires whenever idx changes) ──── */
  useEffect(() => {
    if (!isPlaying) return;
    if (idx >= total) { setIsPlaying(false); return; }
    const timer = setTimeout(() => {
      setIdx((i) => Math.min(i + 1, total));
    }, playSpeed);
    return () => clearTimeout(timer);
  }, [isPlaying, idx, total, playSpeed]);

  /* ── Fetch dry-run data from backend ─────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    setData(null);
    setIdx(0);
    setIsPlaying(false);
    try {
      const res = await fetch(`${API_BASE}/api/dryrun`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: languageId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Dry run failed");
      if (!json.dryRun || !Array.isArray(json.dryRun) || json.dryRun.length === 0) {
        throw new Error("No dry-run steps were generated. Try different code.");
      }
      setData(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate dry run";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [code, languageId]);

  useEffect(() => { fetchData(); }, [fetchData]);



  /* ── Auto-scroll active row into view ───────────────────────────────── */
  useEffect(() => {
    if (!tableRef.current || idx <= 0) return;
    const row = tableRef.current.querySelector(`[data-step="${idx}"]`) as HTMLElement;
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [idx]);

  /* ── Step navigation ─────────────────────────────────────────────────── */
  const stop = () => setIsPlaying(false);
  const goNext = () => { stop(); setIdx((i) => Math.min(i + 1, total)); };
  const goPrev = () => { stop(); setIdx((i) => Math.max(i - 1, 1)); };
  const goStart = () => { stop(); setIdx(1); };
  const goEnd = () => { stop(); setIdx(total); };
  const togglePlay = () => {
    if (idx >= total) setIdx(1);   // restart from beginning if at end
    setIsPlaying((p) => !p);
  };

  /* ── Banner color based on event ─────────────────────────────────────── */
  const bannerCls = currentStep
    ? currentStep.event === "call" ? styles.bannerCall
      : currentStep.event === "return" ? styles.bannerReturn
        : currentStep.event === "exception" ? styles.bannerException
          : ""
    : "";

  const bannerIcon = currentStep
    ? currentStep.event === "call" ? "→"
      : currentStep.event === "return" ? "←"
        : currentStep.event === "exception" ? "⚠️"
          : "💡"
    : "💡";

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className={styles.overlayHeader}>
          <h2 className={styles.overlayTitle}>
            Codeoscope — {language} Dry Run
          </h2>
          <div className={styles.overlayActions}>
            <button className={styles.regenBtn} onClick={fetchData}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Regenerate
            </button>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>



        {/* ── Loading ─────────────────────────────────────────────────── */}
        {loading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingContent}>
              <span className={styles.loadingSpinner} />
              <p className={styles.loadingText}>Tracing code execution step by step…</p>
              <p className={styles.loadingHint}>Running instrumented code via JDoodle</p>
            </div>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && !loading && (
          <div className={styles.errorOverlay}>
            <div className={styles.errorContent}>
              <p className={styles.errorIcon}>⚠️</p>
              <p className={styles.errorText}>{error}</p>
              <button className={styles.errorRetry} onClick={fetchData}>Try Again</button>
              <button className={styles.errorClose} onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {/* ── Main Content ─────────────────────────────────────────────── */}
        {!loading && !error && (
          <div className={styles.mainContent}>

            {/* ── Dry Run Table ────────────────────────────────────────── */}
              <div className={styles.dryRunWrap}>

                {/* Step controls bar */}
                <div className={styles.stepBar}>
                  <span className={styles.stepInfo}>
                    Step {idx} of {total}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={total}
                    value={idx}
                    onChange={(e) => { stop(); setIdx(Number(e.target.value)); }}
                    className={styles.stepSlider}
                  />
                  <div className={styles.controls}>
                    <button className={styles.ctrlBtn} onClick={goStart} disabled={idx <= 0}>
                      Start
                    </button>
                    <button className={styles.ctrlBtn} onClick={goPrev} disabled={idx <= 1}>
                      Prev
                    </button>

                    {/* Play / Pause */}
                    <button
                      className={`${styles.ctrlBtn} ${styles.playBtn} ${isPlaying ? styles.playBtnActive : ""}`}
                      onClick={togglePlay}
                      title={isPlaying ? "Pause" : "Auto-play"}
                    >
                      {isPlaying ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      )}
                      {isPlaying ? "Pause" : "Play"}
                    </button>

                    <button
                      className={`${styles.ctrlBtn} ${styles.ctrlBtnPrimary}`}
                      onClick={goNext}
                      disabled={idx >= total}
                    >
                      Next →
                    </button>
                    <button className={styles.ctrlBtn} onClick={goEnd} disabled={idx >= total}>
                      End
                    </button>

                    {/* Speed selector */}
                    <select
                      className={styles.speedSelect}
                      value={playSpeed}
                      onChange={(e) => setPlaySpeed(Number(e.target.value))}
                      title="Playback speed"
                    >
                      <option value={1600}>0.5×</option>
                      <option value={800}>1×</option>
                      <option value={400}>2×</option>
                      <option value={150}>4×</option>
                    </select>
                  </div>
                </div>

                {/* Explanation banner */}
                <div className={`${styles.explanationBanner} ${bannerCls}`}>
                  <span className={styles.explanationIcon}>{bannerIcon}</span>
                  {currentStep ? (
                    <span className={styles.explanationText}>{currentStep.explanation}</span>
                  ) : (
                    <span className={styles.explanationEmpty}>
                      Click &quot;Next →&quot; or &quot;Play&quot; to start the dry run step by step.
                    </span>
                  )}
                </div>

                {/* ── Dry Run Table ────────────────────────────────────── */}
                <div className={styles.tableScroll}>
                  <table className={styles.dryRunTable}>
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Line</th>
                        <th>Code</th>
                        <th>Call Stack</th>
                        <th>Variables</th>
                        <th>Output</th>
                      </tr>
                    </thead>
                    <tbody ref={tableRef}>
                      {steps.map((s) => {
                        const isActive = idx === s.step;
                        const prevStepVars = s.step > 1 ? steps[s.step - 2].variables : {};

                        const rowCls = [
                          isActive ? styles.rowActive : "",
                          s.event === "call" ? styles.rowCall : "",
                          s.event === "return" ? styles.rowReturn : "",
                          s.event === "exception" ? styles.rowException : "",
                        ].filter(Boolean).join(" ");

                        return (
                          <tr
                            key={s.step}
                            data-step={s.step}
                            className={rowCls}
                            onClick={() => { stop(); setIdx(s.step); }}
                            style={{ cursor: "pointer" }}
                          >
                            {/* Step + event badge */}
                            <td className={styles.cellStep}>
                              <div className={styles.stepBadgeWrap}>
                                <span className={styles.stepNum}>{s.step}</span>
                                <EventBadge event={s.event} />
                              </div>
                            </td>

                            {/* Line number */}
                            <td className={styles.cellLine}>{s.line}</td>

                            {/* Code snippet */}
                            <td className={styles.cellCode}>{s.code}</td>

                            {/* Call stack */}
                            <td className={styles.cellStack}>
                              <CallStackCell frames={s.callStack ?? []} />
                            </td>

                            {/* Variables */}
                            <td className={styles.cellVars}>
                              {Object.entries(s.variables).map(([k, v]) => {
                                const changed = prevStepVars[k] !== v;
                                const isRef = v.startsWith("[") || v.startsWith("{");
                                return (
                                  <span
                                    key={k}
                                    className={`${styles.varChip} ${changed ? styles.varChipChanged : ""} ${isRef ? styles.varChipRef : ""}`}
                                  >
                                    <span className={styles.varChipName}>{k}</span>
                                    <span className={styles.varChipEq}>=</span>
                                    <span className={styles.varChipVal}>{v}</span>
                                  </span>
                                );
                              })}

                              {/* Return value badge */}
                              {s.returnValue !== undefined && (
                                <span className={`${styles.varChip} ${styles.varChipRet}`}>
                                  <span className={styles.varChipName}>↑ ret</span>
                                  <span className={styles.varChipEq}>=</span>
                                  <span className={styles.varChipVal}>{s.returnValue}</span>
                                </span>
                              )}
                            </td>

                            {/* Latest output line */}
                            <td className={styles.cellOutput}>
                              {s.output
                                ? s.output.split("\n").filter(Boolean).pop() || "—"
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

          </div>
        )}

      </div>
    </div>
  );
}
