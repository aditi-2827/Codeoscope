'use strict';

/**
 * complexityEngine.js — Professional Static Complexity Analyzer
 *
 * Architecture:
 *   Layer 1: AST-based structural parser → Control Flow Tree (CFT)
 *   Layer 2: Library complexity database (70+ operations)
 *   Layer 3: Algorithm pattern recognition (12+ patterns)
 *   Layer 4: Recursion analysis + Master Theorem
 *   Layer 5: Human-readable explanation generator
 *
 * Supports: Python, JavaScript, Java, C
 * Zero external dependencies. Zero API calls.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLEXITY ALGEBRA
// ═══════════════════════════════════════════════════════════════════════════════

const CX_ORDER = [
  'O(1)', 'O(log n)', 'O(√n)', 'O(n)', 'O(n log n)',
  'O(n²)', 'O(n² log n)', 'O(n³)', 'O(2^n)', 'O(n!)',
];

function cxRank(c) {
  const i = CX_ORDER.indexOf(c);
  return i >= 0 ? i : CX_ORDER.length;
}

function cxMax(...args) {
  return args.reduce((a, b) => cxRank(a) >= cxRank(b) ? a : b, 'O(1)');
}

function cxMul(a, b) {
  if (a === 'O(1)') return b;
  if (b === 'O(1)') return a;
  const MUL = {
    'O(log n)|O(log n)': 'O(log n)',
    'O(log n)|O(n)': 'O(n log n)', 'O(n)|O(log n)': 'O(n log n)',
    'O(n)|O(n)': 'O(n²)',
    'O(n)|O(n log n)': 'O(n² log n)', 'O(n log n)|O(n)': 'O(n² log n)',
    'O(n²)|O(n)': 'O(n³)', 'O(n)|O(n²)': 'O(n³)',
    'O(n²)|O(log n)': 'O(n² log n)', 'O(log n)|O(n²)': 'O(n² log n)',
    'O(n log n)|O(log n)': 'O(n log n)', 'O(log n)|O(n log n)': 'O(n log n)',
    'O(n log n)|O(n log n)': 'O(n² log n)',
  };
  return MUL[`${a}|${b}`] || cxMax(a, b);
}

function depthToCx(d) {
  if (d <= 0) return 'O(1)';
  if (d === 1) return 'O(n)';
  if (d === 2) return 'O(n²)';
  if (d === 3) return 'O(n³)';
  return `O(n^${d})`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1 — AST-BASED STRUCTURAL PARSER  (Control Flow Tree)
// ═══════════════════════════════════════════════════════════════════════════════

// Node constructors
const N = {
  Program:      (body)                                     => ({ type: 'Program', body }),
  FunctionDef:  (name, params, body, startLine)            => ({ type: 'FunctionDef', name, params, body, startLine }),
  ForLoop:      (iterVar, iterTarget, loopType, body, raw) => ({ type: 'ForLoop', iterVar, iterTarget, loopType, body, raw }),
  WhileLoop:    (condition, body, raw)                     => ({ type: 'WhileLoop', condition, body, raw }),
  DoWhile:      (condition, body, raw)                     => ({ type: 'DoWhile', condition, body, raw }),
  If:           (condition, body, elseBody)                => ({ type: 'If', condition, body, elseBody }),
  Return:       (value)                                    => ({ type: 'Return', value }),
  Assignment:   (target, value)                            => ({ type: 'Assignment', target, value }),
  FuncCall:     (name, object, args, raw)                  => ({ type: 'FuncCall', name, object, args, raw }),
  Statement:    (raw, lineNum)                             => ({ type: 'Statement', raw, lineNum }),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].replace(/\t/g, '    ').length : 0;
}

function isBlankOrComment(line, lang) {
  const t = line.trim();
  if (!t) return true;
  if (lang === 'python' && t.startsWith('#')) return true;
  if (lang !== 'python' && (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*'))) return true;
  return false;
}

// ── Extract function calls from a raw line ───────────────────────────────────

function extractCalls(line) {
  const calls = [];
  // Match: obj.method(args) or func(args)
  const re = /(?:(\w+)\.)?(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(line))) {
    calls.push({ object: m[1] || null, name: m[2], raw: m[0] });
  }
  return calls;
}

// ── Python parser ────────────────────────────────────────────────────────────

function parsePython(lines) {
  function parseBlock(startIdx, parentIndent) {
    const nodes = [];
    let i = startIdx;

    while (i < lines.length) {
      const line = lines[i];
      const t = line.trim();
      const ind = getIndent(line);

      if (!t || t.startsWith('#')) { i++; continue; }
      if (ind <= parentIndent && i > startIdx) break;

      // Function def
      const funcMatch = t.match(/^def\s+(\w+)\s*\(([^)]*)\)\s*:/);
      if (funcMatch) {
        const bodyStart = i + 1;
        const body = parseBlock(bodyStart, ind);
        const bodyEnd = findBlockEnd(bodyStart, ind);
        nodes.push(N.FunctionDef(funcMatch[1], parseParams(funcMatch[2]), body, i + 1));
        i = bodyEnd;
        continue;
      }

      // For loop
      const forMatch = t.match(/^for\s+(\w+)\s+in\s+(.+)\s*:/);
      if (forMatch) {
        const loopType = classifyPythonIter(forMatch[2]);
        const body = parseBlock(i + 1, ind);
        const bodyEnd = findBlockEnd(i + 1, ind);
        nodes.push(N.ForLoop(forMatch[1], forMatch[2], loopType, body, t));
        i = bodyEnd;
        continue;
      }

      // While loop
      const whileMatch = t.match(/^while\s+(.+)\s*:/);
      if (whileMatch) {
        const body = parseBlock(i + 1, ind);
        const bodyEnd = findBlockEnd(i + 1, ind);
        nodes.push(N.WhileLoop(whileMatch[1], body, t));
        i = bodyEnd;
        continue;
      }

      // If / elif / else
      const ifMatch = t.match(/^(if|elif)\s+(.+)\s*:/);
      if (ifMatch) {
        const body = parseBlock(i + 1, ind);
        const bodyEnd = findBlockEnd(i + 1, ind);
        let elseBody = [];
        // Check for elif/else at same indent
        if (bodyEnd < lines.length) {
          const nextT = lines[bodyEnd].trim();
          if (nextT.startsWith('elif ') || nextT.startsWith('else:') || nextT === 'else:') {
            // Parse else/elif as part of elseBody
            const elseNodes = parseBlock(bodyEnd, parentIndent);
            elseBody = elseNodes;
          }
        }
        // Extract function calls from the condition (e.g. `if solve_queens(...)`)
        for (const c of extractCalls(ifMatch[2])) {
          nodes.push(N.FuncCall(c.name, c.object, [], c.raw));
        }
        nodes.push(N.If(ifMatch[2], body, elseBody));
        i = bodyEnd;
        continue;
      }
      if (t.startsWith('else:') || t === 'else:') {
        const body = parseBlock(i + 1, ind);
        const bodyEnd = findBlockEnd(i + 1, ind);
        // Attach as standalone nodes (gets merged with preceding If's elseBody in parent)
        body.forEach(n => nodes.push(n));
        i = bodyEnd;
        continue;
      }

      // Return — also extract function calls from the return expression
      const retMatch = t.match(/^return\s*(.*)/);
      if (retMatch) {
        nodes.push(N.Return(retMatch[1] || ''));
        for (const c of extractCalls(retMatch[1] || '')) {
          nodes.push(N.FuncCall(c.name, c.object, [], c.raw));
        }
        i++;
        continue;
      }

      // Assignment
      const assMatch = t.match(/^(\w+)\s*=\s*(.+)/);
      if (assMatch && !t.includes('==')) {
        nodes.push(N.Assignment(assMatch[1], assMatch[2]));
        // Also extract any function calls in the RHS
        for (const c of extractCalls(assMatch[2])) {
          nodes.push(N.FuncCall(c.name, c.object, [], c.raw));
        }
        i++;
        continue;
      }

      // General statement — extract function calls
      const calls = extractCalls(t);
      if (calls.length > 0) {
        for (const c of calls) {
          nodes.push(N.FuncCall(c.name, c.object, [], c.raw));
        }
      }
      nodes.push(N.Statement(t, i + 1));
      i++;
    }

    return nodes;
  }

  function findBlockEnd(startIdx, parentIndent) {
    let i = startIdx;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || t.startsWith('#')) { i++; continue; }
      if (getIndent(lines[i]) <= parentIndent) return i;
      i++;
    }
    return i;
  }

  function classifyPythonIter(target) {
    if (/^range\s*\(/.test(target)) return 'range';
    return 'collection';
  }

  function parseParams(raw) {
    return raw.split(',').map(p => p.trim().split('=')[0].split(':')[0].trim()).filter(Boolean);
  }

  return N.Program(parseBlock(0, -1));
}

// ── Brace-language parser (JS, Java, C) ──────────────────────────────────────

function parseBraceLang(lines, lang) {
  // Tokenize into a flat list with line numbers, then build tree from braces
  function parseBlock(startIdx, endIdx) {
    const nodes = [];
    let i = startIdx;

    while (i <= endIdx && i < lines.length) {
      const line = lines[i];
      const t = line.trim();

      if (isBlankOrComment(line, lang)) { i++; continue; }

      // ── Function definition ────────────────────────────────────────
      const funcMatch = matchFuncDef(t, lang);
      if (funcMatch) {
        const braceStart = findOpenBrace(i);
        if (braceStart >= 0) {
          const braceEnd = findMatchingBrace(braceStart);
          const params = parseParams(funcMatch.params);
          const body = parseBlock(braceStart + 1, braceEnd - 1);
          nodes.push(N.FunctionDef(funcMatch.name, params, body, i + 1));
          i = braceEnd + 1;
          continue;
        }
      }

      // ── For loop ───────────────────────────────────────────────────
      const forMatch = matchForLoop(t, lang);
      if (forMatch) {
        const braceStart = findOpenBrace(i);
        if (braceStart >= 0) {
          const braceEnd = findMatchingBrace(braceStart);
          const body = parseBlock(braceStart + 1, braceEnd - 1);
          nodes.push(N.ForLoop(forMatch.iterVar, forMatch.iterTarget, forMatch.loopType, body, t));
          i = braceEnd + 1;
          continue;
        }
      }

      // ── Implicit loop (forEach, map, etc.) ─────────────────────────
      const iterMatch = matchIteratorCall(t, lang);
      if (iterMatch) {
        // Treat as a loop node with an inline body
        const braceStart = findOpenBrace(i);
        if (braceStart >= 0) {
          const braceEnd = findMatchingBrace(braceStart);
          const body = parseBlock(braceStart + 1, braceEnd - 1);
          nodes.push(N.ForLoop('_item', iterMatch.collection, 'iterator', body, t));
          i = braceEnd + 1;
          continue;
        }
        // Single-line iterator (no braces found on same construct)
        nodes.push(N.ForLoop('_item', iterMatch.collection, 'iterator', [], t));
        nodes.push(N.FuncCall(iterMatch.method, iterMatch.collection, [], t));
        i++;
        continue;
      }

      // ── While loop ─────────────────────────────────────────────────
      const whileMatch = t.match(/^while\s*\((.+)\)\s*\{?/);
      if (whileMatch) {
        const braceStart = findOpenBrace(i);
        if (braceStart >= 0) {
          const braceEnd = findMatchingBrace(braceStart);
          const body = parseBlock(braceStart + 1, braceEnd - 1);
          nodes.push(N.WhileLoop(whileMatch[1], body, t));
          i = braceEnd + 1;
          continue;
        }
      }

      // ── Do-while ───────────────────────────────────────────────────
      if (/^do\s*\{?/.test(t)) {
        const braceStart = findOpenBrace(i);
        if (braceStart >= 0) {
          const braceEnd = findMatchingBrace(braceStart);
          const body = parseBlock(braceStart + 1, braceEnd - 1);
          // Find the while(cond) after the closing brace
          let cond = '';
          if (braceEnd + 1 < lines.length) {
            const condMatch = lines[braceEnd + 1]?.trim().match(/^while\s*\((.+)\)/);
            if (condMatch) cond = condMatch[1];
          }
          nodes.push(N.DoWhile(cond, body, t));
          i = braceEnd + 2;
          continue;
        }
      }

      // ── If / else if / else ────────────────────────────────────────
      const ifMatch = t.match(/^(?:else\s+)?if\s*\((.+)\)\s*\{?/);
      if (ifMatch) {
        const braceStart = findOpenBrace(i);
        if (braceStart >= 0) {
          const braceEnd = findMatchingBrace(braceStart);
          const body = parseBlock(braceStart + 1, braceEnd - 1);
          let elseBody = [];
          // Check for else/else if
          if (braceEnd + 1 <= endIdx && braceEnd + 1 < lines.length) {
            const nextT = lines[braceEnd + 1]?.trim() || '';
            if (nextT.startsWith('else')) {
              elseBody = parseBlock(braceEnd + 1, endIdx);
            }
          }
          nodes.push(N.If(ifMatch[1], body, elseBody));
          i = braceEnd + 1;
          continue;
        }
      }
      if (/^else\s*\{/.test(t)) {
        const braceStart = findOpenBrace(i);
        if (braceStart >= 0) {
          const braceEnd = findMatchingBrace(braceStart);
          const body = parseBlock(braceStart + 1, braceEnd - 1);
          body.forEach(n => nodes.push(n));
          i = braceEnd + 1;
          continue;
        }
      }

      // ── Return ─────────────────────────────────────────────────────
      const retMatch = t.match(/^return\s*(.*);?/);
      if (retMatch) {
        nodes.push(N.Return(retMatch[1].replace(/;$/, '') || ''));
        // Also extract calls from return expression
        for (const c of extractCalls(retMatch[1])) {
          nodes.push(N.FuncCall(c.name, c.object, [], c.raw));
        }
        i++;
        continue;
      }

      // ── General: extract function calls + assignments ──────────────
      const assMatch = t.match(/^(?:(?:int|long|float|double|char|boolean|String|var|let|const|auto)\s+)?(\w+)\s*=\s*(.+);?$/);
      if (assMatch && !t.includes('==') && !t.includes('!=')) {
        nodes.push(N.Assignment(assMatch[1], assMatch[2]));
      }

      const calls = extractCalls(t);
      for (const c of calls) {
        nodes.push(N.FuncCall(c.name, c.object, [], c.raw));
      }

      if (t !== '{' && t !== '}' && t !== '};' && !t.startsWith('import ') && !t.startsWith('#include') && !t.startsWith('package ') && !t.startsWith('using ')) {
        nodes.push(N.Statement(t, i + 1));
      }
      i++;
    }

    return nodes;
  }

  // ── Brace matching ─────────────────────────────────────────────────────────

  function findOpenBrace(fromLine) {
    for (let i = fromLine; i < Math.min(fromLine + 3, lines.length); i++) {
      if (lines[i].includes('{')) return i;
    }
    return -1;
  }

  function findMatchingBrace(openLine) {
    let depth = 0;
    let started = false;
    for (let i = openLine; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') { depth++; started = true; }
        if (ch === '}') depth--;
        if (started && depth === 0) return i;
      }
    }
    return lines.length - 1;
  }

  // ── Language-specific matchers ─────────────────────────────────────────────

  function matchFuncDef(t, lang) {
    if (lang === 'javascript') {
      let m = t.match(/^(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
      if (m) return { name: m[1], params: m[2] };
      m = t.match(/^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function\s*\(([^)]*)\)|(?:\(([^)]*)\)|(\w+))\s*=>)/);
      if (m) return { name: m[1], params: m[2] || m[3] || m[4] || '' };
      // Standalone function call that looks like a definition (e.g. in test code)
      // Also handle: function name(params) without preceding keywords
    }
    if (lang === 'java') {
      const m = t.match(/^(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)*[\w<>\[\]]+\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+\w+\s*)?\{?$/);
      if (m && m[1] !== 'if' && m[1] !== 'while' && m[1] !== 'for' && m[1] !== 'switch') return { name: m[1], params: m[2] };
    }
    if (lang === 'c') {
      const m = t.match(/^(?:static\s+)?(?:(?:unsigned|signed|const|long|short|extern|inline)\s+)*(?:int|void|char|float|double|long|short|size_t|bool|_Bool)\s+\*?\s*(\w+)\s*\(([^)]*)\)\s*\{?$/);
      if (m) return { name: m[1], params: m[2] };
    }
    return null;
  }

  function matchForLoop(t, lang) {
    // C-style for(init; cond; update)
    const cFor = t.match(/^for\s*\(\s*(?:(?:int|let|var|auto|size_t)\s+)?(\w+)\s*=\s*([^;]*)\s*;\s*([^;]*)\s*;\s*([^)]*)\)\s*\{?/);
    if (cFor) {
      const iterVar = cFor[1];
      const hasHalving = /\/\s*2|>>\s*1/.test(cFor[4]) || /\/\s*2|>>\s*1/.test(cFor[3]);
      const hasMul     = /\*\s*2|<<\s*1/.test(cFor[4]);
      let loopType = 'index';
      if (hasHalving || hasMul) loopType = 'logarithmic';
      return { iterVar, iterTarget: cFor[3], loopType };
    }
    // Java enhanced for / JS for...of / for...in
    if (lang === 'javascript') {
      const m = t.match(/^for\s*\(\s*(?:const|let|var)\s+(\w+)\s+(?:of|in)\s+(.+)\)\s*\{?/);
      if (m) return { iterVar: m[1], iterTarget: m[2], loopType: 'collection' };
    }
    if (lang === 'java') {
      const m = t.match(/^for\s*\(\s*(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*:\s*(.+)\)\s*\{?/);
      if (m) return { iterVar: m[1], iterTarget: m[2], loopType: 'collection' };
    }
    return null;
  }

  function matchIteratorCall(t, lang) {
    if (lang === 'javascript') {
      const m = t.match(/(\w+)\.(forEach|map|filter|reduce|flatMap|some|every|find|findIndex)\s*\(/);
      if (m) return { collection: m[1], method: m[2] };
    }
    if (lang === 'java') {
      const m = t.match(/(\w+)\.(forEach|stream)\s*\(/);
      if (m) return { collection: m[1], method: m[2] };
    }
    return null;
  }

  function parseParams(raw) {
    return raw.split(',').map(p => {
      const parts = p.trim().split(/\s+/);
      return parts[parts.length - 1]?.replace(/[[\]&*]/g, '') || '';
    }).filter(Boolean);
  }

  return N.Program(parseBlock(0, lines.length - 1));
}

// ── Top-level parser dispatcher ──────────────────────────────────────────────

function parseCode(code, lang) {
  const lines = code.split('\n');
  if (lang === 'python') return parsePython(lines);
  return parseBraceLang(lines, lang);
}

// ── Extract function definitions from CFT ────────────────────────────────────

function extractFunctions(cft) {
  const funcs = [];
  const topLevel = [];

  for (const node of cft.body) {
    if (node.type === 'FunctionDef') {
      funcs.push(node);
    } else {
      topLevel.push(node);
    }
  }

  // If there's meaningful top-level code, wrap it as <main>
  const hasCode = topLevel.some(n => n.type !== 'Statement' || !/^(import |from |#include|package |using )/.test(n.raw));
  if (hasCode || funcs.length === 0) {
    funcs.push(N.FunctionDef('<main>', [], topLevel, 0));
  }

  return funcs;
}


// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 2 — LIBRARY COMPLEXITY DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

const LIB_DB = {
  // ── Python ────────────────────────────────────────────────────────────────
  // list methods
  'append':       { time: 'O(1)',       space: 'O(1)',  note: 'amortized O(1) list append' },
  'extend':       { time: 'O(k)',       space: 'O(1)',  note: 'extend by k elements' },
  'insert':       { time: 'O(n)',       space: 'O(1)',  note: 'shifts elements right' },
  'pop':          { time: 'O(1)',       space: 'O(1)',  note: 'pop from end' },  // pop(0) is O(n) but detected by arg
  'remove':       { time: 'O(n)',       space: 'O(1)',  note: 'linear scan to find element' },
  'index':        { time: 'O(n)',       space: 'O(1)',  note: 'linear search' },
  'count':        { time: 'O(n)',       space: 'O(1)',  note: 'full scan' },
  'reverse':      { time: 'O(n)',       space: 'O(1)',  note: 'in-place reverse' },
  'copy':         { time: 'O(n)',       space: 'O(n)',  note: 'shallow copy' },
  'sort':         { time: 'O(n log n)', space: 'O(n)',  note: 'Timsort' },
  'sorted':       { time: 'O(n log n)', space: 'O(n)',  note: 'returns new sorted list' },
  'len':          { time: 'O(1)',       space: 'O(1)',  note: 'stored attribute' },
  'min':          { time: 'O(n)',       space: 'O(1)',  note: 'linear scan' },
  'max':          { time: 'O(n)',       space: 'O(1)',  note: 'linear scan' },
  'sum':          { time: 'O(n)',       space: 'O(1)',  note: 'linear accumulation' },

  // dict / set
  'get':          { time: 'O(1)',       space: 'O(1)',  note: 'hash table lookup (avg)' },
  'add':          { time: 'O(1)',       space: 'O(1)',  note: 'hash set insertion (avg)' },
  'discard':      { time: 'O(1)',       space: 'O(1)',  note: 'hash set removal (avg)' },
  'update':       { time: 'O(k)',       space: 'O(1)',  note: 'merge k items' },
  'keys':         { time: 'O(1)',       space: 'O(1)',  note: 'view object (no copy)' },
  'values':       { time: 'O(1)',       space: 'O(1)',  note: 'view object' },
  'items':        { time: 'O(1)',       space: 'O(1)',  note: 'view object' },

  // heapq
  'heappush':     { time: 'O(log n)',   space: 'O(1)',  note: 'sift up in binary heap' },
  'heappop':      { time: 'O(log n)',   space: 'O(1)',  note: 'sift down in binary heap' },
  'heapify':      { time: 'O(n)',       space: 'O(1)',  note: 'Floyd heap construction' },
  'heapreplace':  { time: 'O(log n)',   space: 'O(1)',  note: 'pop + push in one operation' },
  'nlargest':     { time: 'O(n log k)', space: 'O(k)',  note: 'maintains k-element heap' },
  'nsmallest':    { time: 'O(n log k)', space: 'O(k)',  note: 'maintains k-element heap' },

  // deque
  'appendleft':   { time: 'O(1)',       space: 'O(1)',  note: 'doubly-linked deque' },
  'popleft':      { time: 'O(1)',       space: 'O(1)',  note: 'doubly-linked deque' },

  // bisect
  'bisect_left':  { time: 'O(log n)',   space: 'O(1)',  note: 'binary search' },
  'bisect_right': { time: 'O(log n)',   space: 'O(1)',  note: 'binary search' },
  'insort':       { time: 'O(n)',       space: 'O(1)',  note: 'O(log n) search + O(n) insert' },
  'insort_left':  { time: 'O(n)',       space: 'O(1)',  note: 'O(log n) search + O(n) insert' },

  // ── JavaScript ────────────────────────────────────────────────────────────
  'push':         { time: 'O(1)',       space: 'O(1)',  note: 'amortized' },
  'shift':        { time: 'O(n)',       space: 'O(1)',  note: 'shifts all elements' },
  'unshift':      { time: 'O(n)',       space: 'O(1)',  note: 'shifts all elements' },
  'splice':       { time: 'O(n)',       space: 'O(1)',  note: 'may shift elements' },
  'slice':        { time: 'O(k)',       space: 'O(k)',  note: 'copies k elements' },
  'concat':       { time: 'O(n)',       space: 'O(n)',  note: 'creates new array' },
  'includes':     { time: 'O(n)',       space: 'O(1)',  note: 'linear scan' },
  'indexOf':      { time: 'O(n)',       space: 'O(1)',  note: 'linear scan' },
  'find':         { time: 'O(n)',       space: 'O(1)',  note: 'linear scan' },
  'findIndex':    { time: 'O(n)',       space: 'O(1)',  note: 'linear scan' },
  'forEach':      { time: 'O(n)',       space: 'O(1)',  note: 'iterates all elements' },
  'map':          { time: 'O(n)',       space: 'O(n)',  note: 'creates new array' },
  'filter':       { time: 'O(n)',       space: 'O(n)',  note: 'creates new array' },
  'reduce':       { time: 'O(n)',       space: 'O(1)',  note: 'single accumulator' },
  'flatMap':      { time: 'O(n)',       space: 'O(n)',  note: 'map + flatten' },
  'some':         { time: 'O(n)',       space: 'O(1)',  note: 'short-circuits' },
  'every':        { time: 'O(n)',       space: 'O(1)',  note: 'short-circuits' },
  'flat':         { time: 'O(n)',       space: 'O(n)',  note: 'flattens array' },
  'fill':         { time: 'O(n)',       space: 'O(1)',  note: 'fills range' },
  'has':          { time: 'O(1)',       space: 'O(1)',  note: 'hash table (Set/Map)' },
  'set':          { time: 'O(1)',       space: 'O(1)',  note: 'hash table (Map.set)' },
  'delete':       { time: 'O(1)',       space: 'O(1)',  note: 'hash table' },

  // ── Java ──────────────────────────────────────────────────────────────────
  'put':          { time: 'O(1)',       space: 'O(1)',  note: 'HashMap avg' },
  'containsKey':  { time: 'O(1)',       space: 'O(1)',  note: 'HashMap avg' },
  'containsValue':{ time: 'O(n)',       space: 'O(1)',  note: 'linear scan' },
  'contains':     { time: 'O(1)',       space: 'O(1)',  note: 'HashSet avg' },
  'offer':        { time: 'O(log n)',   space: 'O(1)',  note: 'PriorityQueue heap insert' },
  'poll':         { time: 'O(log n)',   space: 'O(1)',  note: 'PriorityQueue heap extract' },
  'peek':         { time: 'O(1)',       space: 'O(1)',  note: 'top of heap/queue' },
  'size':         { time: 'O(1)',       space: 'O(1)',  note: 'stored count' },
  'isEmpty':      { time: 'O(1)',       space: 'O(1)',  note: 'stored count' },
  'toString':     { time: 'O(n)',       space: 'O(n)',  note: 'string construction' },
  'substring':    { time: 'O(n)',       space: 'O(n)',  note: 'Java string copy' },
  'charAt':       { time: 'O(1)',       space: 'O(1)',  note: 'direct index' },
  'equals':       { time: 'O(n)',       space: 'O(1)',  note: 'character comparison' },

  // ── C stdlib ──────────────────────────────────────────────────────────────
  'qsort':        { time: 'O(n log n)', space: 'O(log n)', note: 'quicksort (avg)' },
  'bsearch':      { time: 'O(log n)',   space: 'O(1)',  note: 'binary search' },
  'malloc':       { time: 'O(1)',       space: 'O(n)',  note: 'heap allocation' },
  'calloc':       { time: 'O(n)',       space: 'O(n)',  note: 'zeroed allocation' },
  'realloc':      { time: 'O(n)',       space: 'O(n)',  note: 'may copy' },
  'memcpy':       { time: 'O(n)',       space: 'O(1)',  note: 'byte copy' },
  'memset':       { time: 'O(n)',       space: 'O(1)',  note: 'byte fill' },
  'strlen':       { time: 'O(n)',       space: 'O(1)',  note: 'scan for null terminator' },
  'strcmp':        { time: 'O(n)',       space: 'O(1)',  note: 'character comparison' },
  'strcpy':       { time: 'O(n)',       space: 'O(1)',  note: 'byte copy' },
  'printf':       { time: 'O(n)',       space: 'O(1)',  note: 'format + output' },
};

// Special: compound calls with known costs
const COMPOUND_CALLS = {
  'Arrays.sort':       { time: 'O(n log n)', space: 'O(n)',     note: 'dual-pivot quicksort' },
  'Collections.sort':  { time: 'O(n log n)', space: 'O(n)',     note: 'Timsort' },
  'Arrays.binarySearch':{ time: 'O(log n)',  space: 'O(1)',     note: 'binary search' },
  'Math.floor':        { time: 'O(1)',       space: 'O(1)',     note: 'arithmetic' },
  'Math.max':          { time: 'O(1)',       space: 'O(1)',     note: 'comparison' },
  'Math.min':          { time: 'O(1)',       space: 'O(1)',     note: 'comparison' },
  'Math.abs':          { time: 'O(1)',       space: 'O(1)',     note: 'arithmetic' },
  'Math.sqrt':         { time: 'O(1)',       space: 'O(1)',     note: 'arithmetic' },
  'Math.log':          { time: 'O(1)',       space: 'O(1)',     note: 'arithmetic' },
  'System.out.println':{ time: 'O(n)',       space: 'O(1)',     note: 'output' },
  'console.log':       { time: 'O(1)',       space: 'O(1)',     note: 'output' },
  'JSON.stringify':    { time: 'O(n)',       space: 'O(n)',     note: 'serialization' },
  'JSON.parse':        { time: 'O(n)',       space: 'O(n)',     note: 'parsing' },
  'Object.keys':       { time: 'O(n)',       space: 'O(n)',     note: 'collects all keys' },
  'Object.values':     { time: 'O(n)',       space: 'O(n)',     note: 'collects all values' },
  'Object.entries':    { time: 'O(n)',       space: 'O(n)',     note: 'collects all entries' },
  'String.fromCharCode':{ time: 'O(1)',      space: 'O(1)',     note: 'single char' },
};

function lookupCallCost(callNode) {
  // Try compound name first (e.g. Arrays.sort)
  if (callNode.object) {
    const compound = `${callNode.object}.${callNode.name}`;
    if (COMPOUND_CALLS[compound]) return COMPOUND_CALLS[compound];
  }
  // Then simple name
  if (LIB_DB[callNode.name]) return LIB_DB[callNode.name];
  // Unknown → O(1) by default (user-defined simple function)
  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 3 — ALGORITHM PATTERN RECOGNITION
// ═══════════════════════════════════════════════════════════════════════════════

function detectPatterns(funcNode, code) {
  const bodyText = flattenToText(funcNode.body);
  const found = [];

  // ── Binary Search ──────────────────────────────────────────────────────
  const hasMid   = /mid\s*=/.test(bodyText);
  const hasHalf  = /\/\s*2|>>\s*1|\/\/\s*2/.test(bodyText);
  const hasLR    = /\b(left|right|lo|hi|low|high|start|end)\b/i.test(bodyText);
  const hasWhile = hasNodeType(funcNode.body, 'WhileLoop');
  if (hasMid && hasHalf && hasLR && hasWhile) {
    found.push({
      name: 'Binary Search', time: 'O(log n)', space: 'O(1)',
      detail: 'while loop with left/right pointers → mid = (l+r)/2 → halves search space each iteration',
    });
  }

  // ── Two-pointer ────────────────────────────────────────────────────────
  if (!found.find(p => p.name === 'Binary Search') && hasLR) {
    const hasConverge = /\+\+|--|(\+=\s*1)|(-=\s*1)/.test(bodyText);
    const hasOneLoop  = countNodeType(funcNode.body, 'WhileLoop') + countNodeType(funcNode.body, 'ForLoop') === 1;
    if (hasConverge && hasOneLoop) {
      found.push({
        name: 'Two-Pointer', time: 'O(n)', space: 'O(1)',
        detail: 'two index pointers converging → each element visited at most once',
      });
    }
  }

  // ── Sliding Window ─────────────────────────────────────────────────────
  if (/window|window_sum|win_|wsize|maxLen|minLen/i.test(bodyText)) {
    const hasExpand = /\+\+|(\+=\s*1)/.test(bodyText);
    if (hasExpand && (hasWhile || hasNodeType(funcNode.body, 'ForLoop'))) {
      found.push({
        name: 'Sliding Window', time: 'O(n)', space: 'O(1)',
        detail: 'window expands/contracts over input → each element enters and leaves once',
      });
    }
  }

  // ── BFS ────────────────────────────────────────────────────────────────
  const hasBFS = /\b(queue|Queue|deque|Deque)\b/.test(bodyText) || (/\bpopleft\b/.test(bodyText));
  const hasVisited = /\bvisited\b/i.test(bodyText);
  if (hasBFS && hasVisited && (hasWhile || hasNodeType(funcNode.body, 'ForLoop'))) {
    found.push({
      name: 'BFS (Breadth-First Search)', time: 'O(V+E)', space: 'O(V)',
      detail: 'queue + visited set → processes each vertex once, each edge once',
    });
  }

  // ── DFS ────────────────────────────────────────────────────────────────
  const hasDFS = /\b(stack|dfs|DFS)\b/.test(bodyText) || /\bvisited\b/i.test(bodyText);
  const hasDFSRecurse = countSelfCalls(funcNode.body, funcNode.name) > 0;
  if ((hasDFS || hasDFSRecurse) && hasVisited && !hasBFS) {
    found.push({
      name: 'DFS (Depth-First Search)', time: 'O(V+E)', space: 'O(V)',
      detail: 'recursive/stack traversal + visited set → explores each vertex once',
    });
  }

  // ── 1D Dynamic Programming ────────────────────────────────────────────
  const has1DDP = /\bdp\s*\[/i.test(bodyText) && !(/\bdp\s*\[\s*\w+\s*\]\s*\[/i.test(bodyText));
  if (has1DDP && hasNodeType(funcNode.body, 'ForLoop')) {
    found.push({
      name: '1D Dynamic Programming', time: 'O(n)', space: 'O(n)',
      detail: 'dp[i] array filled in a single loop → each state computed once',
    });
  }

  // ── 2D Dynamic Programming ────────────────────────────────────────────
  const has2DDP = /\bdp\s*\[\s*\w+\s*\]\s*\[/i.test(bodyText);
  const hasNested = hasNestedLoops(funcNode.body);
  if (has2DDP && hasNested) {
    found.push({
      name: '2D Dynamic Programming', time: 'O(n×m)', space: 'O(n×m)',
      detail: 'dp[i][j] table filled in nested loops → each cell computed once',
    });
  }

  // ── Backtracking ───────────────────────────────────────────────────────
  const hasUndo = /\.pop\s*\(|= 0\b|= false|= -1|= None|= null/i.test(bodyText);
  const hasSelfCall = countSelfCalls(funcNode.body, funcNode.name) > 0;
  if (hasUndo && hasSelfCall && hasNodeType(funcNode.body, 'ForLoop')) {
    found.push({
      name: 'Backtracking', time: 'O(n!)', space: 'O(n)',
      detail: 'recursive with loop + undo step → explores permutations/combinations',
    });
  }

  // ── Merge Sort ─────────────────────────────────────────────────────────
  if (/merge/i.test(funcNode.name) || (/\bmid\b/.test(bodyText) && hasSelfCall && /left|right/i.test(bodyText) && hasHalf)) {
    if (hasSelfCall) {
      found.push({
        name: 'Merge Sort / Divide & Conquer', time: 'O(n log n)', space: 'O(n)',
        detail: 'recursively splits in half + O(n) merge step → T(n) = 2T(n/2) + O(n)',
      });
    }
  }

  // ── Quick Sort ─────────────────────────────────────────────────────────
  if (/pivot|partition/i.test(bodyText) && hasSelfCall) {
    found.push({
      name: 'Quick Sort', time: 'O(n log n)', space: 'O(log n)',
      detail: 'recursive partitioning around pivot → O(n log n) average, O(n²) worst',
    });
  }

  // ── Topological Sort ───────────────────────────────────────────────────
  if (/in_?degree|indegree|topological/i.test(bodyText)) {
    found.push({
      name: 'Topological Sort', time: 'O(V+E)', space: 'O(V)',
      detail: 'Kahn algorithm or DFS-based → processes each vertex and edge once',
    });
  }

  // ── Matrix / Grid Traversal ────────────────────────────────────────────
  if (/\brows\b|\bcols\b|\bgrid\b|\bmatrix\b|\bboard\b/i.test(bodyText) && hasNested) {
    if (!found.find(p => p.name.includes('DP'))) {
      found.push({
        name: 'Matrix Traversal', time: 'O(n×m)', space: 'O(1)',
        detail: 'nested loops over 2D grid → visits each cell',
      });
    }
  }

  // ── Sorting call ───────────────────────────────────────────────────────
  const hasSortCall = /\.sort\s*\(|sorted\s*\(|Arrays\.sort|Collections\.sort|qsort\s*\(/.test(bodyText);
  if (hasSortCall && !found.find(p => p.name.includes('Sort'))) {
    found.push({
      name: 'Sorting (library call)', time: 'O(n log n)', space: 'O(n)',
      detail: 'comparison-based sort → Ω(n log n) lower bound',
    });
  }

  return found;
}

// ── CFT traversal helpers ────────────────────────────────────────────────────

function flattenToText(nodes) {
  let text = '';
  for (const n of nodes) {
    if (n.raw) text += ' ' + n.raw;
    if (n.type === 'Assignment') text += ' ' + n.target + ' = ' + (n.value || '');
    if (n.type === 'FuncCall') text += ' ' + (n.object ? n.object + '.' : '') + n.name + '(';
    if (n.condition) text += ' ' + n.condition;
    if (n.value && n.type !== 'Assignment') text += ' ' + n.value;
    if (n.iterTarget) text += ' ' + n.iterTarget;
    if (n.name && n.type === 'FunctionDef') text += ' def ' + n.name;
    if (n.body) text += ' ' + flattenToText(n.body);
    if (n.elseBody) text += ' ' + flattenToText(n.elseBody);
  }
  return text;
}

function hasNodeType(nodes, type) {
  for (const n of nodes) {
    if (n.type === type) return true;
    if (n.body && hasNodeType(n.body, type)) return true;
    if (n.elseBody && hasNodeType(n.elseBody, type)) return true;
  }
  return false;
}

function countNodeType(nodes, type) {
  let c = 0;
  for (const n of nodes) {
    if (n.type === type) c++;
    if (n.body) c += countNodeType(n.body, type);
    if (n.elseBody) c += countNodeType(n.elseBody, type);
  }
  return c;
}

function hasNestedLoops(nodes) {
  for (const n of nodes) {
    if (n.type === 'ForLoop' || n.type === 'WhileLoop' || n.type === 'DoWhile') {
      if (n.body && (hasNodeType(n.body, 'ForLoop') || hasNodeType(n.body, 'WhileLoop') || hasNodeType(n.body, 'DoWhile'))) {
        return true;
      }
    }
    if (n.body && hasNestedLoops(n.body)) return true;
    if (n.elseBody && hasNestedLoops(n.elseBody)) return true;
  }
  return false;
}


// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 4 — RECURSION ANALYSIS + MASTER THEOREM
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeRecursion(funcNode, allFuncs) {
  if (funcNode.name === '<main>') return { is: false };

  // Count self-calls in body
  const selfCalls = countSelfCalls(funcNode.body, funcNode.name);
  if (selfCalls === 0) return { is: false };

  const bodyText = flattenToText(funcNode.body);

  // ── Determine 'b' (shrink factor) ──────────────────────────────────────
  let b = null;
  let shrinkType = 'unknown';

  // Check for halving FIRST (must appear in recursive call args like func(n/2))
  if (/\/\s*2|>>\s*1|\/\/\s*2/.test(bodyText)) {
    b = 2;
    shrinkType = 'halving';
  } else if (/\/\s*3/.test(bodyText)) {
    b = 3;
    shrinkType = 'thirding';
  } else if (/\bsqrt\b|Math\.sqrt|\*\*\s*0\.5/.test(bodyText)) {
    b = 'sqrt';
    shrinkType = 'square-root';
  } else if (/n\s*-\s*1|[-]\s*1\b|\bn\s*-\s*1\b/.test(bodyText)) {
    b = null;  // linear shrink (not divide)
    shrinkType = 'linear';
  } else if (/n\s*-\s*2|[-]\s*2\b/.test(bodyText)) {
    b = null;
    shrinkType = 'linear-2';
  }

  // ── Determine 'a' (branching factor) ───────────────────────────────────
  const a = selfCalls;

  // ── Determine 'd' (non-recursive work per level) ───────────────────────
  let workPerLevel = 'O(1)';
  const workDetails = [];

  // Check for loops at the function's top level (not inside recursion)
  const topLoopDepth = getMaxLoopDepth(funcNode.body, funcNode.name);
  if (topLoopDepth > 0) {
    workPerLevel = depthToCx(topLoopDepth);
    workDetails.push(`${topLoopDepth}-deep loop → ${workPerLevel} work per recursive call`);
  }

  // Check for expensive library calls
  for (const n of funcNode.body) {
    if (n.type === 'FuncCall' && n.name !== funcNode.name) {
      const cost = lookupCallCost(n);
      if (cost && cxRank(cost.time) > cxRank('O(1)')) {
        workPerLevel = cxMax(workPerLevel, cost.time);
        workDetails.push(`${n.object ? n.object + '.' : ''}${n.name}() → ${cost.time} (${cost.note})`);
      }
    }
  }

  // ── Compute complexity via Master Theorem or direct mapping ────────────
  let time = 'O(n)';
  let recurrence = '';
  let theorem = '';

  if (shrinkType === 'halving' && b === 2) {
    // T(n) = aT(n/2) + O(n^d) — Master Theorem applicable
    const d = cxToExponent(workPerLevel);
    const logba = Math.log(a) / Math.log(b);

    recurrence = `T(n) = ${a}T(n/${b}) + ${workPerLevel}`;

    if (d < logba) {
      // Case 1
      time = `O(n^${logba.toFixed(logba % 1 === 0 ? 0 : 2)})`;
      if (logba === 1) time = 'O(n)';
      if (logba === 2) time = 'O(n²)';
      theorem = `Master Theorem Case 1: d=${d} < log_${b}(${a})=${logba.toFixed(2)} → ${time}`;
    } else if (Math.abs(d - logba) < 0.01) {
      // Case 2
      if (d === 0) { time = 'O(log n)'; }
      else if (d === 1) { time = 'O(n log n)'; }
      else { time = `O(n^${d} log n)`; }
      theorem = `Master Theorem Case 2: d=${d} = log_${b}(${a}) → ${time}`;
    } else {
      // Case 3
      time = workPerLevel;
      theorem = `Master Theorem Case 3: d=${d} > log_${b}(${a})=${logba.toFixed(2)} → ${time}`;
    }
  } else if (shrinkType === 'linear' || shrinkType === 'linear-2') {
    // T(n) = aT(n-1) + work — direct mapping
    recurrence = `T(n) = ${a}T(n-1) + ${workPerLevel}`;

    if (a === 1) {
      // T(n) = T(n-1) + f(n)
      if (workPerLevel === 'O(1)') { time = 'O(n)'; theorem = 'Linear recursion: T(n-1) + O(1) → O(n)'; }
      else if (workPerLevel === 'O(n)') { time = 'O(n²)'; theorem = 'Linear recursion: T(n-1) + O(n) → O(n²)'; }
      else if (workPerLevel === 'O(n²)') { time = 'O(n³)'; theorem = 'Linear recursion: T(n-1) + O(n²) → O(n³)'; }
      else { time = cxMul('O(n)', workPerLevel); theorem = `Linear recursion × work per level → ${time}`; }
    } else if (a === 2) {
      time = 'O(2^n)';
      recurrence = `T(n) = 2T(n-1) + ${workPerLevel}`;
      theorem = 'Branching recursion: 2T(n-1) → O(2^n) (exponential tree)';
    } else {
      time = 'O(2^n)';
      theorem = `${a}-way branching recursion → exponential`;
    }
  } else if (shrinkType === 'unknown') {
    // Fallback: can't determine shrink pattern
    if (a >= 2) {
      time = 'O(2^n)';
      theorem = `${a} recursive calls with unknown shrink → assume exponential`;
    } else {
      time = 'O(n)';
      theorem = 'Single recursive call with unknown shrink → assume O(n)';
    }
  }

  // ── Check for factorial-like: loop from 0..n × recurse ────────────────
  const hasLoopWithRecurse = funcNode.body.some(n => {
    if (n.type !== 'ForLoop' && n.type !== 'WhileLoop') return false;
    return n.body && n.body.some(inner => inner.type === 'FuncCall' && inner.name === funcNode.name);
  });
  if (hasLoopWithRecurse && (shrinkType === 'linear' || shrinkType === 'unknown')) {
    time = 'O(n!)';
    recurrence = `T(n) = n × T(n-1) + ${workPerLevel}`;
    theorem = 'Loop × recursion: n × T(n-1) → O(n!) (factorial/permutation)';
  }

  return {
    is: true,
    a,
    b,
    shrinkType,
    selfCalls,
    workPerLevel,
    workDetails,
    time,
    recurrence,
    theorem,
  };
}

function countSelfCalls(nodes, funcName) {
  let count = 0;
  for (const n of nodes) {
    if (n.type === 'FuncCall' && n.name === funcName) count++;
    if (n.body) count += countSelfCalls(n.body, funcName);
    if (n.elseBody) count += countSelfCalls(n.elseBody, funcName);
  }
  return count;
}

function getMaxLoopDepth(nodes, skipFuncName) {
  let max = 0;
  function walk(ns, depth) {
    for (const n of ns) {
      // Skip recursive calls' bodies
      if (n.type === 'FuncCall' && n.name === skipFuncName) continue;
      const isLoop = n.type === 'ForLoop' || n.type === 'WhileLoop' || n.type === 'DoWhile';
      const nextDepth = isLoop ? depth + 1 : depth;
      if (nextDepth > max) max = nextDepth;
      if (n.body) walk(n.body, nextDepth);
      if (n.elseBody) walk(n.elseBody, depth);
    }
  }
  walk(nodes, 0);
  return max;
}

function cxToExponent(cx) {
  if (cx === 'O(1)') return 0;
  if (cx === 'O(log n)') return 0;  // sub-polynomial
  if (cx === 'O(n)') return 1;
  if (cx === 'O(n log n)') return 1;
  if (cx === 'O(n²)') return 2;
  if (cx === 'O(n³)') return 3;
  return 1;
}


// ═══════════════════════════════════════════════════════════════════════════════
// CORE ANALYSIS — Walk CFT, compute per-function complexity
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeFunction(funcNode, allFuncs, code) {
  // ── Loop depth (from AST) ──────────────────────────────────────────────
  const loopDepth = getMaxLoopDepth(funcNode.body, null);

  // ── Library call costs ─────────────────────────────────────────────────
  const libCalls = [];
  let maxLibTime  = 'O(1)';
  let maxLibSpace = 'O(1)';
  walkCalls(funcNode.body, (call) => {
    const cost = lookupCallCost(call);
    if (cost) {
      libCalls.push({ call, cost });
      maxLibTime = cxMax(maxLibTime, cost.time);
      maxLibSpace = cxMax(maxLibSpace, cost.space);
    }
  });

  // Cost of expensive library calls INSIDE loops
  let loopLibTime = 'O(1)';
  walkLoopBodies(funcNode.body, 1, (callNode, depth) => {
    const cost = lookupCallCost(callNode);
    if (cost) {
      const combined = cxMul(depthToCx(depth), cost.time);
      loopLibTime = cxMax(loopLibTime, combined);
    }
  });

  // ── Pattern recognition ────────────────────────────────────────────────
  const patterns = detectPatterns(funcNode, code);

  // ── Recursion analysis ─────────────────────────────────────────────────
  const rec = analyzeRecursion(funcNode, allFuncs);

  // ── Space complexity ───────────────────────────────────────────────────
  const bodyText = flattenToText(funcNode.body);
  let space = 'O(1)';
  const spaceReasons = [];

  // 2D arrays
  if (/\[\s*\[|\[\s*\]\s*\*|new\s+\w+\s*\[\s*\w+\s*\]\s*\[|Array\(.*\)\.fill\(.*Array|dp\s*\[\s*\w+\s*\]\s*\[/i.test(bodyText)) {
    space = cxMax(space, 'O(n²)');
    spaceReasons.push('2D array/matrix allocation → O(n²)');
  }
  // 1D arrays — require assignment/allocation context, not just bare []
  else if (/=\s*\[\s*\]|\[\s*0\s*\].*\*|list\s*\(|\.append|new\s+Array|new\s+ArrayList|malloc\s*\(|dp\s*\[|result\s*=|\w+\s*=\s*\[/i.test(bodyText)) {
    space = cxMax(space, 'O(n)');
    spaceReasons.push('array/list allocation → O(n)');
  }

  // Hash maps / sets
  if (/dict\s*\(|\{.*:|\bset\s*\(|defaultdict|Counter\s*\(|new\s+HashMap|new\s+HashSet|new\s+Map|new\s+Set/i.test(bodyText)) {
    space = cxMax(space, 'O(n)');
    spaceReasons.push('hash map/set allocation → O(n)');
  }

  // Library call space
  if (cxRank(maxLibSpace) > cxRank('O(1)')) {
    space = cxMax(space, maxLibSpace);
    const expensiveLib = libCalls.find(lc => cxRank(lc.cost.space) > cxRank('O(1)'));
    if (expensiveLib) {
      spaceReasons.push(`${expensiveLib.call.name}() → ${expensiveLib.cost.space} (${expensiveLib.cost.note})`);
    }
  }

  // Recursion stack
  if (rec.is) {
    if (rec.shrinkType === 'halving') {
      space = cxMax(space, 'O(log n)');
      spaceReasons.push('recursive stack (halving) → O(log n)');
    } else {
      space = cxMax(space, 'O(n)');
      spaceReasons.push('recursive call stack → O(n)');
    }
  }

  if (spaceReasons.length === 0) spaceReasons.push('only fixed-size variables → O(1)');

  // ── Determine time complexity (priority: pattern > recursion > loops+libs) ─
  let time = depthToCx(loopDepth);
  let reason = '';
  let details = [];

  // Pattern override (highest confidence — overrides naive loop-depth)
  if (patterns.length > 0) {
    const best = patterns[0]; // First pattern detected
    // Patterns OVERRIDE the naive loop-depth estimation because they know
    // the loop's actual iteration count (e.g. binary search while loop = O(log n), not O(n))
    time = best.time;
    reason = `Recognized as: ${best.name}`;
    details.push(best.detail);
  }

  // Recursion analysis (adds recurrence details; only overrides time if no pattern was detected)
  if (rec.is) {
    details.push(`Recurrence: ${rec.recurrence}`);
    details.push(rec.theorem);
    if (rec.workDetails.length > 0) {
      details.push(...rec.workDetails);
    }

    // Only override time if no higher-confidence pattern was detected
    if (patterns.length === 0) {
      const recTime = rec.time;
      if (cxRank(recTime) >= cxRank(time) || rec.time === 'O(n!)' || rec.time === 'O(2^n)') {
        time = recTime;
        reason = `Recursive: ${rec.theorem}`;
      }
    } else {
      reason = reason + ' + Recursive';
    }
  }

  // Library call cost inside loops
  if (cxRank(loopLibTime) > cxRank(time)) {
    time = loopLibTime;
    reason = reason || 'Loop × library call dominates';
    const expLib = libCalls.find(lc => cxRank(lc.cost.time) > cxRank('O(1)'));
    if (expLib) {
      details.push(`${expLib.call.name}() costs ${expLib.cost.time} per call (${expLib.cost.note})`);
    }
  }

  // Default reason from loop depth
  if (!reason) {
    if (loopDepth === 0) {
      reason = 'no loops or recursion → constant time';
    } else if (loopDepth === 1) {
      reason = 'single loop over input → O(n)';
    } else {
      reason = `${loopDepth} levels of nested loops → ${time}`;
    }
  }

  // Log-loop detection (for loops like for(i=n; i>0; i/=2))
  const hasLogLoop = funcNode.body.some(n =>
    (n.type === 'ForLoop' && n.loopType === 'logarithmic') ||
    (n.type === 'WhileLoop' && /\/\s*2|>>\s*1|\*\s*2|<<\s*1/.test(n.condition))
  );
  if (hasLogLoop && loopDepth <= 1 && !rec.is) {
    time = 'O(log n)';
    reason = 'loop variable halves/doubles each iteration → logarithmic';
  }

  return {
    name: funcNode.name,
    time,
    space,
    spaceReasons,
    loopDepth,
    rec,
    patterns,
    reason,
    details,
    libCalls: libCalls.map(lc => ({
      name: (lc.call.object ? lc.call.object + '.' : '') + lc.call.name,
      time: lc.cost.time,
      note: lc.cost.note,
    })),
  };
}

function walkCalls(nodes, visitor) {
  for (const n of nodes) {
    if (n.type === 'FuncCall') visitor(n);
    if (n.body) walkCalls(n.body, visitor);
    if (n.elseBody) walkCalls(n.elseBody, visitor);
  }
}

function walkLoopBodies(nodes, depth, visitor) {
  for (const n of nodes) {
    const isLoop = n.type === 'ForLoop' || n.type === 'WhileLoop' || n.type === 'DoWhile';
    if (isLoop && n.body) {
      for (const child of n.body) {
        if (child.type === 'FuncCall') visitor(child, depth);
      }
      walkLoopBodies(n.body, depth + 1, visitor);
    } else {
      if (n.body) walkLoopBodies(n.body, depth, visitor);
    }
    if (n.elseBody) walkLoopBodies(n.elseBody, depth, visitor);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 5 — HUMAN-READABLE EXPLANATION GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

function buildExplanation(funcResults, overallTime, overallSpace) {
  const parts = [];

  for (const r of funcResults) {
    const label = r.name === '<main>' ? 'Main code' : `Function \`${r.name}()\``;
    const lines = [];

    // Opening line
    lines.push(`${label}: **${r.time}**`);

    // Pattern
    if (r.patterns.length > 0) {
      for (const p of r.patterns) {
        lines.push(`├─ ${p.name} → ${p.detail}`);
      }
    }

    // Recursion details
    if (r.rec.is) {
      lines.push(`├─ Recurrence: ${r.rec.recurrence}`);
      lines.push(`├─ ${r.rec.theorem}`);
      if (r.rec.workDetails.length > 0) {
        for (const wd of r.rec.workDetails) {
          lines.push(`│  └─ ${wd}`);
        }
      }
    }

    // Loop info
    if (r.loopDepth > 0 && !r.rec.is) {
      lines.push(`├─ ${r.loopDepth} level${r.loopDepth > 1 ? 's' : ''} of loop nesting`);
    }

    // Library calls (notable ones only)
    const notable = r.libCalls.filter(lc => cxRank(lc.time) > cxRank('O(1)'));
    if (notable.length > 0) {
      for (const lc of notable.slice(0, 3)) {
        lines.push(`├─ ${lc.name}() → ${lc.time} (${lc.note})`);
      }
    }

    // Reason
    lines.push(`└─ ${r.reason}`);

    parts.push(lines.join('\n'));
  }

  // Space section
  const allSpaceReasons = [...new Set(funcResults.flatMap(r => r.spaceReasons))];
  parts.push(`\n📦 Space: ${overallSpace}\n${allSpaceReasons.map(r => `├─ ${r}`).join('\n')}`);

  parts.push(`\nOverall → Time: ${overallTime} | Space: ${overallSpace}`);

  return parts.join('\n\n');
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT — analyzeComplexity(code, language)
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeComplexity(code, language) {
  const lang = language.toLowerCase();

  // Layer 1: Parse to Control Flow Tree
  const cft = parseCode(code, lang);

  // Extract functions
  const funcs = extractFunctions(cft);

  // Analyze each function (Layers 2–4)
  const results = funcs.map(fn => analyzeFunction(fn, funcs, code));

  // Overall = worst across all functions
  let timeAll  = 'O(1)';
  let spaceAll = 'O(1)';
  for (const r of results) {
    timeAll  = cxMax(timeAll, r.time);
    spaceAll = cxMax(spaceAll, r.space);
  }

  // Cross-function composition: if funcA calls funcB inside a loop, multiply
  for (const fA of funcs) {
    const rA = results.find(r => r.name === fA.name);
    if (!rA) continue;

    walkLoopBodies(fA.body, 1, (callNode, depth) => {
      const callee = results.find(r => r.name === callNode.name);
      if (callee && callee.name !== fA.name && callee.name !== '<main>') {
        const combined = cxMul(depthToCx(depth), callee.time);
        if (cxRank(combined) > cxRank(timeAll)) {
          timeAll = combined;
        }
      }
    });
  }

  // Best / Average / Worst cases
  let best = timeAll;
  const hasBinarySearch = results.some(r => r.patterns.find(p => p.name === 'Binary Search'));
  const hasSorting      = results.some(r => r.patterns.find(p => p.name.includes('Sort')));
  const hasBacktrack    = results.some(r => r.patterns.find(p => p.name === 'Backtracking'));

  if (hasBinarySearch) best = 'O(1)';
  else if (hasSorting) best = 'O(n)';
  else if (hasBacktrack) best = 'O(n)';
  else if (cxRank(best) > cxRank('O(1)')) best = 'O(1)';

  let average = timeAll;
  // Quick sort has O(n²) worst but O(n log n) average
  if (results.some(r => r.patterns.find(p => p.name === 'Quick Sort'))) {
    average = 'O(n log n)';
    if (timeAll === 'O(n log n)') timeAll = 'O(n²)'; // worst case for quicksort
  }

  // Breakdown table
  const breakdown = results
    .filter(r => r.name !== '<main>' || results.length === 1)
    .map(r => ({
      section: r.name === '<main>' ? 'main code' : `${r.name}()`,
      complexity: r.time,
      reason: r.reason,
    }));

  // Layer 5: Explanation
  const explanation = buildExplanation(results, timeAll, spaceAll);

  return {
    timeComplexity:  timeAll,
    spaceComplexity: spaceAll,
    bestCase:        best,
    averageCase:     average,
    worstCase:       timeAll,
    explanation,
    breakdown,
  };
}

module.exports = { analyzeComplexity };
