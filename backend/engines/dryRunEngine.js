'use strict';

/**
 * dryRunEngine.js
 *
 * Virtual Dry-Run Engine — follows the 8 interview dry-run steps:
 *   1. Initialize variables
 *   2. Step through code line by line
 *   3. Track control flow (loops, conditionals, function calls)
 *   4. Maintain call stack (for recursive algorithms like 4-Queens, DP)
 *   5. Note intermediate results
 *   6. Accumulate stdout output
 *   7. Highlight variable changes per step
 *   8. Auto-generate explanation with → arrows
 *
 * Zero AI — uses traceEngine (real execution via JDoodle) for accuracy.
 * Works with complex algorithms: backtracking, DP, recursion, sorting, BFS/DFS.
 *
 * Output format per step:
 * {
 *   step:        number,               // 1-indexed
 *   line:        number,               // source line number
 *   event:       'line'|'call'|'return'|'exception',
 *   code:        string,               // source snippet at this line
 *   variables:   Record<string,string>, // all visible vars (serialized)
 *   callStack:   { func, line }[],     // current call stack (deepest last)
 *   output:      string,               // accumulated stdout up to this step
 *   explanation: string,               // auto-generated with → arrows
 *   returnValue: string|undefined,
 *   error:       string|undefined,
 * }
 */

const { traceCode } = require('./traceEngine');

const MAX_STEPS = 60;

// ── Value serializer ─────────────────────────────────────────────────────────

function serializeVal(val, depth) {
  depth = depth || 0;
  if (val === null || val === undefined) return 'None';
  if (typeof val === 'boolean')          return val ? 'True' : 'False';
  if (typeof val === 'number')           return String(val);
  if (typeof val === 'string')           return '"' + val + '"';
  if (depth > 1)                         return '…';

  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    // Detect 2D array (array of arrays) — common in DP and board problems
    const is2D = val.every(v => Array.isArray(v));
    if (is2D) {
      const rows = val.slice(0, 6).map(row =>
        '[' + row.slice(0, 8).map(v => serializeVal(v, depth + 1)).join(', ') +
        (row.length > 8 ? ', …' : '') + ']'
      );
      return '[' + rows.join(', ') + (val.length > 6 ? ', …' : '') + ']';
    }
    if (val.length > 15)
      return '[' + val.slice(0, 15).map(v => serializeVal(v, depth + 1)).join(', ') + ', …]';
    return '[' + val.map(v => serializeVal(v, depth + 1)).join(', ') + ']';
  }

  if (typeof val === 'object') {
    const entries = Object.entries(val).slice(0, 8);
    if (entries.length === 0) return '{}';
    const inner = entries.map(function(pair) {
      return pair[0] + ': ' + serializeVal(pair[1], depth + 1);
    }).join(', ');
    return '{' + inner + (Object.keys(val).length > 8 ? ', …' : '') + '}';
  }

  return String(val);
}

// ── Explanation generator ────────────────────────────────────────────────────

function generateExplanation(step, prevStep, callStackSnapshot, codeLine) {
  var vars   = Object.assign({}, step.globals  || {}, step.locals  || {});
  var pVars  = Object.assign({}, (prevStep && prevStep.globals) || {}, (prevStep && prevStep.locals) || {});
  var depth  = callStackSnapshot.length;
  var strip  = (codeLine || '').trim();

  // What variables changed since the last step
  var changed = [];
  Object.keys(vars).forEach(function(k) {
    if (k.startsWith('_')) return;
    if (JSON.stringify(pVars[k]) !== JSON.stringify(vars[k])) {
      changed.push(k + ' → ' + serializeVal(vars[k]));
    }
  });
  var changeSuffix = changed.length ? '  ·  ' + changed.slice(0, 4).join(', ') : '';
  var depthStr     = depth > 0 ? ' [depth ' + depth + ']' : '';

  switch (step.event) {
    case 'call': {
      var args = Object.entries(step.locals || {})
        .filter(function(pair) { return !pair[0].startsWith('_'); })
        .map(function(pair) { return pair[0] + '=' + serializeVal(pair[1]); })
        .join(', ');
      return '→ Enter ' + step.func + '(' + args + ')' + depthStr;
    }

    case 'return': {
      var ret = step.returnValue !== undefined ? serializeVal(step.returnValue) : 'None';
      return '← ' + step.func + '() returns ' + ret + depthStr;
    }

    case 'exception':
      return '⚠️ ' + (step.error || 'Exception');

    default: {
      // line event — generate context-aware explanation
      if (/^(if|elif|else\b|while|for)\b/.test(strip))
        return 'Check: ' + strip.slice(0, 60) + changeSuffix;
      if (/^return\b/.test(strip))
        return 'Return statement' + changeSuffix;
      if (/^(print|console\.log|System\.out|printf)\b/.test(strip))
        return 'Output → ' + ((step.stdout || '').split('\n').filter(Boolean).pop() || strip.slice(0, 40));
      if (changed.length)
        return strip.slice(0, 50) + changeSuffix;
      return 'Execute: ' + strip.slice(0, 60);
    }
  }
}


// ── Main entry ────────────────────────────────────────────────────────────────

async function buildDryRunData(code, language, stdin) {
  // Step 1: Execute code with full tracing (via JDoodle)
  var traceResult = await traceCode(code, language, stdin || '');
  var rawSteps    = traceResult.steps;

  var srcLines  = code.split('\n');
  var callStack = [];   // mutable stack of { func, line }
  var dryRun    = [];
  var limited   = rawSteps.slice(0, MAX_STEPS);

  for (var i = 0; i < limited.length; i++) {
    var s    = limited[i];
    var prev = i > 0 ? limited[i - 1] : null;

    // Step 4: Maintain call stack — push on 'call', before capturing snapshot
    if (s.event === 'call') {
      callStack.push({ func: s.func, line: s.line });
    }

    // Step 2: Get code snippet for this line
    var codeLine = (s.line > 0 && s.line <= srcLines.length)
      ? srcLines[s.line - 1].trim()
      : '';

    // Step 3: Merge all visible variables, filter internals
    var rawVars   = Object.assign({}, s.globals || {}, s.locals || {});
    var variables = {};
    Object.keys(rawVars).forEach(function(k) {
      if (!k.startsWith('_') && k !== 'builtins' && k !== '__builtins__') {
        variables[k] = serializeVal(rawVars[k]);
      }
    });

    // Step 8: Auto-generate explanation with → arrows
    var explanation = generateExplanation(s, prev, callStack.slice(), codeLine);

    // Build the dry-run step record
    dryRun.push({
      step:        dryRun.length + 1,
      line:        s.line,
      event:       s.event || 'line',
      code:        codeLine,
      variables:   variables,
      callStack:   callStack.map(function(f) { return { func: f.func, line: f.line }; }),
      output:      s.stdout || '',
      explanation: explanation,
      returnValue: s.returnValue !== undefined ? serializeVal(s.returnValue) : undefined,
      error:       s.error,
    });

    // Pop call stack AFTER capturing the return step snapshot
    if (s.event === 'return' && callStack.length > 0) {
      callStack.pop();
    }
  }

  return { dryRun: dryRun };
}

module.exports = { buildDryRunData };
