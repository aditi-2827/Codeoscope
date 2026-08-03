"use client";
import { useState, useEffect, useRef, useCallback } from "react";

import styles from "./visualizer.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/* ── Types ──────────────────────────────────────────────────────────────────── */
interface ObjectViz {
  name: string;
  values: unknown[];
  type: string;
}

interface VisStep {
  step: number;
  line: number;
  event: string;
  func: string;
  globals: Record<string, unknown>;
  locals: Record<string, unknown>;
  objects: ObjectViz[];
  stdout: string;
  returnValue?: unknown;
  error?: string;
}

/* ── Syntax highlighter ─────────────────────────────────────────────────────── */
function highlightLine(raw: string, lang: string): string {
  const esc = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const stripped = esc.trimStart();

  // Comments
  if (lang === "python" && stripped.startsWith("#")) {
    const indent = esc.slice(0, esc.length - stripped.length);
    return `${indent}<span class="sy-comment">${stripped}</span>`;
  }
  if ((lang === "javascript" || lang === "java" || lang === "c") && stripped.startsWith("//")) {
    const indent = esc.slice(0, esc.length - stripped.length);
    return `${indent}<span class="sy-comment">${stripped}</span>`;
  }

  let h = esc;
  h = h.replace(/"([^"]*)"/g, `<span class="sy-string">"$1"</span>`);
  h = h.replace(/'([^']*)'/g, `<span class="sy-string">'$1'</span>`);

  const kwMap: Record<string, string> = {
    python: "def|while|if|elif|else|return|and|or|not|in|for|True|False|None|class|import|from|as|with|try|except|finally|raise|pass|break|continue",
    javascript: "function|const|let|var|while|if|else|return|for|true|false|null|undefined|class|import|export|from|new|typeof|instanceof|async|await|throw|try|catch|finally",
    java: "public|private|protected|static|void|int|String|boolean|double|float|long|char|class|new|return|if|else|while|for|break|continue|try|catch|finally|throw|extends|implements",
    c: "int|void|char|float|double|long|short|unsigned|return|if|else|while|for|break|continue|struct|typedef|sizeof|include|define|printf|scanf",
  };

  const kw = kwMap[lang] || kwMap["python"];
  h = h.replace(new RegExp(`\\b(${kw})\\b`, "g"), `<span class="sy-keyword">$1</span>`);

  const builtinMap: Record<string, string> = {
    python: "print|len|range|str|int|float|list|dict|tuple|set|type|input|sorted|enumerate|zip|map|filter",
    javascript: "console|Math|Array|Object|JSON|parseInt|parseFloat|isNaN|setTimeout|setInterval|Promise",
    java: "System|Arrays|Math|Integer|Double|String|StringBuilder|ArrayList|HashMap",
    c: "printf|scanf|malloc|free|sizeof|strlen|strcpy|strcmp|memset|memcpy",
  };

  const bi = builtinMap[lang] || "";
  if (bi) h = h.replace(new RegExp(`\\b(${bi})\\b`, "g"), `<span class="sy-builtin">$1</span>`);

  h = h.replace(/\b(\d+(?:\.\d+)?)\b/g, `<span class="sy-number">$1</span>`);
  return h;
}

/* ── Format value for display ───────────────────────────────────────────────── */
function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "None";
  if (typeof val === "boolean") return val ? "True" : "False";
  if (typeof val === "string") return `"${val}"`;
  if (Array.isArray(val)) return JSON.stringify(val);
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

/* ── Check if value is a reference type (shown in Objects column) ──────────── */
function isRefType(val: unknown): boolean {
  if (Array.isArray(val) || (typeof val === "object" && val !== null)) return true;
  // Detect Python function reference strings like '<function foo at 0x...>'
  if (typeof val === "string" && /^<function\s/.test(val)) return true;
  return false;
}

/* ── Props ───────────────────────────────────────────────────────────────────── */
interface Props {
  code: string;
  language: string;
  languageId: string;
  onClose: () => void;
}

/* ── Component ───────────────────────────────────────────────────────────────── */
export default function VisualizerOverlay({ code, language, languageId, onClose }: Props) {
  const [steps, setSteps] = useState<VisStep[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const codeRef = useRef<HTMLDivElement>(null);
  const arrowContainerRef = useRef<HTMLDivElement>(null);
  const [arrowLines, setArrowLines] = useState<
    { x1: number; y1: number; x2: number; y2: number }[]
  >([]);

  const lines = code.split("\n");
  const total = steps.length;
  const step = idx > 0 && idx <= total ? steps[idx - 1] : null;

  // Next step (for the "next line" arrow)
  const nextStep = idx < total ? steps[idx] : null;

  /* ── Fetch steps from custom engine ───────────────────────────────────── */
  const fetchSteps = useCallback(async () => {
    setLoading(true);
    setError("");
    setSteps([]);
    setIdx(0);
    try {
      const res = await fetch(`${API_BASE}/api/visualize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: languageId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Visualization failed");
      if (!data.steps || !Array.isArray(data.steps) || data.steps.length === 0) {
        throw new Error("No steps were generated. Try different code.");
      }
      setSteps(data.steps);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate visualization";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [code, languageId]);

  useEffect(() => { fetchSteps(); }, [fetchSteps]);

  // Auto-scroll active line into view
  useEffect(() => {
    if (!codeRef.current || !step || step.line < 0) return;
    const el = codeRef.current.querySelector(`[data-line="${step.line}"]`) as HTMLElement;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [step]);

  /* ── Calculate SVG arrow positions ──────────────────────────────────── */
  const calculateArrows = useCallback(() => {
    if (!arrowContainerRef.current || !step) {
      setArrowLines([]);
      return;
    }
    const container = arrowContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const dots = container.querySelectorAll<HTMLElement>("[data-ref-to]");

    // Group dots by their target name so we can stagger endpoints
    const targetGroups = new Map<string, HTMLElement[]>();
    dots.forEach((dot) => {
      const name = dot.getAttribute("data-ref-to")!;
      const target = container.querySelector<HTMLElement>(`[data-obj-name="${name}"]`);
      if (!target) return;
      if (!targetGroups.has(name)) targetGroups.set(name, []);
      targetGroups.get(name)!.push(dot);
    });

    const newLines: { x1: number; y1: number; x2: number; y2: number }[] = [];

    targetGroups.forEach((dotList, name) => {
      const target = container.querySelector<HTMLElement>(`[data-obj-name="${name}"]`);
      if (!target) return;

      const targetRect = target.getBoundingClientRect();
      const targetLeft = targetRect.left - containerRect.left;
      const targetH = targetRect.height;
      const count = dotList.length;

      dotList.forEach((dot, i) => {
        const dotRect = dot.getBoundingClientRect();

        // Stagger y2 along the target's left edge for multiple arrows
        const y2Offset = count === 1
          ? targetH * 0.5
          : 14 + ((targetH - 28) * i) / Math.max(count - 1, 1);

        newLines.push({
          x1: dotRect.right - containerRect.left + 4,
          y1: dotRect.top + dotRect.height / 2 - containerRect.top,
          x2: targetLeft,
          y2: targetRect.top - containerRect.top + y2Offset,
        });
      });
    });

    setArrowLines(newLines);
  }, [step, idx]);

  // Double rAF ensures DOM has fully painted before measuring
  useEffect(() => {
    let id1: number;
    let id2: number;
    id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(calculateArrows);
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [calculateArrows]);

  useEffect(() => {
    window.addEventListener("resize", calculateArrows);
    const panel = arrowContainerRef.current?.closest(`.${styles.rightPanel}`);
    if (panel) panel.addEventListener("scroll", calculateArrows);
    return () => {
      window.removeEventListener("resize", calculateArrows);
      if (panel) panel.removeEventListener("scroll", calculateArrows);
    };
  }, [calculateArrows]);

  const goNext = () => setIdx(i => Math.min(i + 1, total));
  const goPrev = () => setIdx(i => Math.max(i - 1, 1));
  const goStart = () => setIdx(1);
  const goEnd = () => setIdx(total);

  /* ── Build frames data ─────────────────────────────────────────────────── */
  const buildFrames = () => {
    if (!step) return [];

    const frames: { name: string; vars: Record<string, unknown> }[] = [];

    // Global frame
    const globalVars: Record<string, unknown> = {};
    if (step.globals && Object.keys(step.globals).length > 0) {
      for (const [k, v] of Object.entries(step.globals)) {
        globalVars[k] = v;
      }
    }

    // If in global scope, locals ARE globals
    if (step.func === "__global__" || step.func === "<module>") {
      for (const [k, v] of Object.entries(step.locals || {})) {
        globalVars[k] = v;
      }
      frames.push({ name: "Global frame", vars: globalVars });
    } else {
      // Show both global and function frame
      frames.push({ name: "Global frame", vars: globalVars });
      frames.push({ name: step.func, vars: step.locals || {} });
    }

    return frames;
  };

  /* ── Extract objects (arrays/lists/functions) for visual display ──── */
  const buildObjects = () => {
    if (!step) return [];
    const objs: { name: string; values: unknown[]; kind: string }[] = [];

    // From step.objects
    if (step.objects) {
      for (const obj of step.objects) {
        objs.push({ name: obj.name, values: obj.values, kind: obj.type || "list" });
      }
    }

    // Check all variables for arrays and function references
    const allVars = { ...(step.globals || {}), ...(step.locals || {}) };
    for (const [key, val] of Object.entries(allVars)) {
      if (objs.find(o => o.name === key)) continue;

      if (Array.isArray(val)) {
        objs.push({ name: key, values: val, kind: "list" });
      } else if (typeof val === "string" && /^<function\s/.test(val)) {
        // Extract function signature from '<function foo at 0x...>'
        const match = val.match(/^<function\s+(\S+)/);
        const funcName = match ? match[1] : key;
        objs.push({ name: key, values: [funcName], kind: "function" });
      }
    }

    return objs;
  };

  const frames = buildFrames();
  const objects = buildObjects();

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className={styles.overlayHeader}>
          <h2 className={styles.overlayTitle}>
            Codeoscope — {language} Visualizer
          </h2>
          <div className={styles.overlayActions}>
            <button className={styles.newTabBtn} onClick={fetchSteps}>
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
              <p className={styles.loadingText}>Tracing your code step by step…</p>
              <p className={styles.loadingHint}>Executing instrumented code via JDoodle</p>
            </div>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────── */}
        {error && !loading && (
          <div className={styles.errorOverlay}>
            <div className={styles.errorContent}>
              <p className={styles.errorIcon}>⚠️</p>
              <p className={styles.errorText}>{error}</p>
              <button className={styles.errorRetry} onClick={fetchSteps}>Try Again</button>
              <button className={styles.errorClose} onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {/* ── Main split ─────────────────────────────────────────────── */}
        {!loading && !error && (
          <div className={styles.splitArea}>

            {/* LEFT — Code + controls */}
            <div className={styles.leftPanel}>

              <div className={styles.codeScroll} ref={codeRef}>
                {lines.map((line, i) => {
                  const ln = i + 1;
                  const isCurrent = step && ln === step.line;
                  const isNext = nextStep && ln === nextStep.line;
                  return (
                    <div
                      key={i}
                      data-line={ln}
                      className={[
                        styles.codeLine,
                        isCurrent ? styles.lineCurrentBg : "",
                        isNext ? styles.lineNextBg : "",
                      ].join(" ")}
                    >
                      {/* Arrows */}
                      <span className={styles.lineArrow}>
                        {isCurrent ? "→" : isNext ? "→" : " "}
                      </span>
                      <span className={styles.lineNum}>{ln}</span>
                      <span
                        className={styles.lineText}
                        dangerouslySetInnerHTML={{ __html: highlightLine(line, languageId) || "\u00a0" }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className={styles.legend}>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.swatchBlue}`} />
                  line that just executed
                </span>
                <span className={styles.legendItem}>
                  <span className={`${styles.legendSwatch} ${styles.swatchAmber}`} />
                  next line to execute
                </span>
              </div>

              {/* Step info + slider */}
              <div className={styles.stepInfo}>
                Step {idx} of {total}
              </div>
              <input
                type="range"
                min={0}
                max={total}
                value={idx}
                onChange={e => setIdx(Number(e.target.value))}
                className={styles.slider}
              />

              {/* Controls */}
              <div className={styles.controls}>
                <button className={styles.ctrlBtn} onClick={goStart} disabled={idx <= 0}>&lt;&lt; First</button>
                <button className={styles.ctrlBtn} onClick={goPrev} disabled={idx <= 1}>&lt; Prev</button>
                <button className={`${styles.ctrlBtn} ${styles.ctrlBtnPrimary}`} onClick={goNext} disabled={idx >= total}>Next &gt;</button>
                <button className={styles.ctrlBtn} onClick={goEnd} disabled={idx >= total}>Last &gt;&gt;</button>
              </div>

              {/* Print output */}
              <div className={styles.codeOutputWrap}>
                <h4 className={styles.codeOutputTitle}>Print output</h4>
                <textarea
                  className={styles.codeOutputArea}
                  readOnly
                  value={step?.stdout ?? ""}
                  placeholder="Output will print here"
                />
              </div>

            </div>

            {/* Divider */}
            <div className={styles.splitDivider} />

            {/* RIGHT — Frames + Objects (Python Tutor style) */}
            <div className={styles.rightPanel}>
              {!step ? (
                <div className={styles.initState}>
                  <div className={styles.visTabs}>
                    <button className={`${styles.visTab} ${styles.visTabActive}`}>Frames</button>
                    <button className={styles.visTab}>Objects</button>
                  </div>
                  <p className={styles.initMsg}>
                    Click on &quot;Next &gt;&quot; to start visualizing your code.
                  </p>
                </div>
              ) : (
                <div className={styles.varsArea}>

                  {/* Two-column: Frames | Objects */}
                  <div className={styles.framesObjectsRow} ref={arrowContainerRef}>

                    {/* SVG arrow overlay */}
                    <svg className={styles.arrowSvg}>
                      <defs>
                        <marker
                          id="ref-arrowhead"
                          markerWidth="8"
                          markerHeight="6"
                          refX="7"
                          refY="3"
                          orient="auto"
                        >
                          <polygon points="0 0, 8 3, 0 6" fill="#6c9bd2" />
                        </marker>
                      </defs>
                      {arrowLines.map((line, i) => {
                        const dx = line.x2 - line.x1;
                        // Ensure a minimum horizontal offset so even short arrows curve
                        const offset = Math.max(dx * 0.4, 40);
                        return (
                          <path
                            key={`${idx}-${i}`}
                            d={`M ${line.x1} ${line.y1} C ${line.x1 + offset} ${line.y1}, ${line.x2 - offset} ${line.y2}, ${line.x2} ${line.y2}`}
                            fill="none"
                            stroke="#6c9bd2"
                            strokeWidth="1.8"
                            markerEnd="url(#ref-arrowhead)"
                          />
                        );
                      })}
                    </svg>

                    {/* FRAMES column */}
                    <div className={styles.framesColumn}>
                      <h3 className={styles.columnTitle}>Frames</h3>

                      {frames.map((frame, fi) => (
                        <div
                          key={fi}
                          className={`${styles.frameBlock} ${fi === frames.length - 1 ? styles.frameBlockActive : ""}`}
                        >
                          <div className={styles.frameTitle}>
                            {frame.name}
                          </div>
                          <table className={styles.varTable}>
                            <tbody>
                              {Object.entries(frame.vars).map(([k, v]) => (
                                <tr key={k} className={styles.varRow}>
                                  <td className={styles.varName}>{k}</td>
                                  <td className={styles.varVal}>
                                    {isRefType(v) ? (
                                      <span className={styles.refDot} data-ref-to={k} />
                                    ) : (
                                      formatValue(v)
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {Object.keys(frame.vars).length === 0 && (
                                <tr><td colSpan={2} className={styles.emptyFrame}>no variables</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      ))}

                      {/* Return value */}
                      {step.event === "return" && step.returnValue !== undefined && (
                        <div className={styles.returnBadge}>
                          Return value: <strong>{formatValue(step.returnValue)}</strong>
                        </div>
                      )}

                      {/* Error */}
                      {step.error && (
                        <div className={styles.errorBadge}>
                          ⚠️ {step.error}
                        </div>
                      )}
                    </div>

                    {/* OBJECTS column */}
                    <div className={styles.objectsColumn}>
                      <h3 className={styles.columnTitle}>Objects</h3>

                      {objects.length === 0 && (
                        <p className={styles.noObjects}>No compound objects yet</p>
                      )}

                      {objects.map((obj, oi) => (
                        <div key={oi} className={styles.objBlock} data-obj-name={obj.name}>
                          <div className={styles.objLabel}>
                            <span className={styles.objType}>{obj.kind}</span>
                            {obj.name}
                          </div>

                          {obj.kind === "function" ? (
                            /* Function object body */
                            <div className={styles.funcBody}>
                              {String(obj.values[0])}({/* params if available */})
                            </div>
                          ) : (
                            /* Array / list visualization */
                            <div className={styles.arrayViz}>
                              {/* Index row */}
                              <div className={styles.arrayRow}>
                                {obj.values.map((_, i) => (
                                  <div key={i} className={`${styles.arrayCell} ${styles.arrayCellIdx}`}>
                                    {i}
                                  </div>
                                ))}
                              </div>
                              {/* Value row */}
                              <div className={styles.arrayRow}>
                                {obj.values.map((v, i) => (
                                  <div key={i} className={styles.arrayCell}>
                                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                  </div>

                  {/* Explanation */}
                  <div className={styles.explanation}>
                    <span className={styles.explIcon}>💡</span>
                    <span>
                      Step {step.step}: Executing line {step.line}
                      {step.func !== "__global__" && step.func !== "<module>" && ` in ${step.func}()`}
                      {step.event === "call" && " — function called"}
                      {step.event === "return" && ` — returning ${formatValue(step.returnValue)}`}
                      {step.event === "exception" && ` — ⚠️ ${step.error}`}
                    </span>
                  </div>

                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
