// backend/engines/traceEngine.js
// Custom Code Tracing Engine — NO AI, uses actual code execution
// Python  → sys.settrace() hook captures every line + variables
// JS     → injects __trace() calls after each statement
// Java   → injects System.out.println trace after each statement
// C      → injects printf trace after each statement
// C++    → injects printf trace after each statement
// All instrumented code is sent to Judge0 (self-hosted) for execution.
// Trace data is extracted from stdout and returned as structured JSON.

const axios = require('axios');

const JUDGE0_URL = 'http://localhost:2358/submissions?base64_encoded=false&wait=true';

// Judge0 Language IDs
const LANG_MAP = {
  python: 71,   // Python 3.8.1
  javascript: 63,   // Node.js 12.14.0
  java: 62,   // OpenJDK 14.0.1
  c: 50,   // GCC 9.2.0
  cpp: 54,   // GCC 9.2.0 (C++)
};

const MAX_STEPS = 60;

// ─── MARKERS ─────────────────────────────────────────────────────────────────
const TRACE_START = '===__CODEOSCOPE_TRACE_START__===';
const TRACE_END = '===__CODEOSCOPE_TRACE_END__===';

// ─── PYTHON INSTRUMENTOR ────────────────────────────────────────────────────
// Uses sys.settrace() — the official CPython debug hook.
// Fires a callback on every line, giving access to locals + line numbers.
// No modification to user code needed — we compile it separately.
function instrumentPython(userCode) {
  // Base64-encode user code so we don't have to worry about escaping
  const b64 = Buffer.from(userCode, 'utf-8').toString('base64');

  return `
import sys, json, base64, io, builtins

# ─── Setup ────────────────────────────────────────────────────────────────
_steps = []
_output_parts = []
_MAX = ${MAX_STEPS}
_orig_print = builtins.print

def _custom_print(*args, **kwargs):
    buf = io.StringIO()
    kw = dict(kwargs)
    kw['file'] = buf
    _orig_print(*args, **kw)
    _output_parts.append(buf.getvalue())

builtins.print = _custom_print

def _serialize(val, depth=0):
    if depth > 3:
        return str(val)
    try:
        if val is None:
            return None
        elif isinstance(val, bool):
            return val
        elif isinstance(val, (int, float)):
            return val
        elif isinstance(val, str):
            return val
        elif isinstance(val, (list, tuple)):
            return [_serialize(x, depth+1) for x in val[:50]]
        elif isinstance(val, dict):
            return {str(k): _serialize(v, depth+1) for k, v in list(val.items())[:20]}
        elif isinstance(val, set):
            return [_serialize(x, depth+1) for x in list(val)[:50]]
        else:
            return str(val)
    except:
        return str(val)

# ─── Trace function ──────────────────────────────────────────────────────
def _tracer(frame, event, arg):
    if len(_steps) >= _MAX:
        return None

    # Only trace user code (compiled with filename '__user__')
    if frame.f_code.co_filename != '__user__':
        return _tracer

    if event not in ('line', 'call', 'return'):
        return _tracer

    func_name = frame.f_code.co_name
    if func_name.startswith('_'):
        return _tracer

    # Capture local variables (skip private/internal)
    loc = {}
    for k, v in frame.f_locals.items():
        if not k.startswith('_') and k not in ('builtins', '__builtins__'):
            loc[k] = _serialize(v)

    step = {
        'step': len(_steps) + 1,
        'line': frame.f_lineno,
        'event': event,
        'func': func_name if func_name != '<module>' else '__global__',
        'locals': loc,
        'stdout': ''.join(_output_parts),
    }

    # For return events, capture return value
    if event == 'return' and arg is not None:
        step['returnValue'] = _serialize(arg)

    _steps.append(step)
    return _tracer

# ─── Execute user code with tracing ──────────────────────────────────────
_user_source = base64.b64decode('${b64}').decode('utf-8')
_user_code = compile(_user_source, '__user__', 'exec')

_user_globals = {'__builtins__': builtins, '__name__': '__main__'}

try:
    sys.settrace(_tracer)
    exec(_user_code, _user_globals)
except Exception as _e:
    _steps.append({
        'step': len(_steps) + 1,
        'line': -1,
        'event': 'exception',
        'func': '__global__',
        'locals': {},
        'stdout': ''.join(_output_parts),
        'error': str(_e),
    })
finally:
    sys.settrace(None)
    builtins.print = _orig_print

# ─── Output trace data ──────────────────────────────────────────────────
_orig_print('${TRACE_START}')
_orig_print(json.dumps(_steps))
_orig_print('${TRACE_END}')
`.trim();
}

// ─── CONTROL BLOCK NORMALIZER ────────────────────────────────────────────────
// Safely wraps single-statement if/else if/else/while/for blocks in { ... }
// so trace injections never separate 'if' from 'else' or break control structures.
function normalizeControlBlocks(userCode) {
  const lines = userCode.split('\n');
  const normalized = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    // Match single-line control statement without braces, e.g. "if (x) return y;" or "else x = 1;"
    const singleMatch = trimmed.match(/^((?:else\s+if|if|while|for)\s*\([^)]*\)|else)\s+(?!\{)(.+;?)$/);

    if (singleMatch) {
      const leadingSpace = line.slice(0, line.indexOf(trimmed[0]));
      const header = singleMatch[1];
      const body = singleMatch[2];
      line = `${leadingSpace}${header} { ${body} }`;
    } else {
      // Check multi-line control statement missing braces: header on line i, statement on line i+1
      const headerMatch = trimmed.match(/^((?:else\s+if|if|while|for)\s*\([^)]*\)|else)$/);
      if (headerMatch && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextTrimmed = nextLine.trim();
        if (nextTrimmed && !nextTrimmed.startsWith('{') && !nextTrimmed.startsWith('//')) {
          const leadingSpace = line.slice(0, line.indexOf(trimmed[0]));
          line = `${line} {`;
          lines[i + 1] = `${lines[i + 1]} }`;
        }
      }
    }

    normalized.push(line);
  }

  return normalized.join('\n');
}

// ─── JAVASCRIPT INSTRUMENTOR ────────────────────────────────────────────────
function instrumentJavaScript(userCode) {
  const normalizedCode = normalizeControlBlocks(userCode);
  const lines = normalizedCode.split('\n');
  const origLines = userCode.split('\n');

  // Extract declared variable names safely
  const varNames = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    const matches = trimmed.matchAll(/(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
    for (const m of matches) {
      if (m[1]) varNames.add(m[1]);
    }
    const funcMatch = trimmed.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (funcMatch) varNames.add(funcMatch[1]);
  }

  const varList = [...varNames];
  const captureVars = varList.map(v =>
    `try { if (typeof ${v} !== 'undefined') __vars["${v}"] = ${v}; } catch(e) {}`
  ).join('\n  ');

  let instrumented = `
var __steps = [];
var __output = [];
var __MAX = ${MAX_STEPS};
var __origLog = console.log;
console.log = function() {
  var args = Array.prototype.slice.call(arguments);
  __output.push(args.map(function(a){ return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' ') + '\\n');
};

function __trace(lineNum) {
  if (__steps.length >= __MAX) return;
  var __vars = {};
  ${captureVars}
  __steps.push({
    step: __steps.length + 1,
    line: lineNum,
    event: 'line',
    func: '__global__',
    locals: JSON.parse(JSON.stringify(__vars)),
    stdout: __output.join('')
  });
}
`;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = Math.min(i + 1, origLines.length);

    const skipPreTrace =
      !trimmed ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('}') ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('else') ||
      trimmed.startsWith('catch') ||
      trimmed.startsWith('finally') ||
      trimmed.startsWith('case ') ||
      trimmed.startsWith('default:') ||
      trimmed.startsWith('function ');

    if (!skipPreTrace) {
      instrumented += `__trace(${lineNum});\n`;
    }
    instrumented += line + '\n';
  }

  instrumented += `
console.log = __origLog;
console.log('${TRACE_START}');
console.log(JSON.stringify(__steps));
console.log('${TRACE_END}');
`;

  return instrumented;
}

// ─── JAVA INSTRUMENTOR ─────────────────────────────────────────────────────
function instrumentJava(userCode) {
  const normalizedCode = normalizeControlBlocks(userCode);
  let instrumented = normalizedCode;

  const helperCode = `
    static java.util.List<String> __steps = new java.util.ArrayList<>();
    static StringBuilder __output = new StringBuilder();
    static int __stepCount = 0;

    static void __trace(int line) {
      if (__stepCount >= ${MAX_STEPS}) return;
      __stepCount++;
      __steps.add("{\\"step\\":" + __stepCount + ",\\"line\\":" + line + ",\\"event\\":\\"line\\",\\"func\\":\\"main\\",\\"locals\\":{},\\"stdout\\":\\"\\"}");
    }

    static void __finishTrace() {
      System.out.println("${TRACE_START}");
      System.out.println("[" + String.join(",", __steps) + "]");
      System.out.println("${TRACE_END}");
    }
  `;

  const classMatch = instrumented.match(/(public\s+class\s+\w+\s*\{)/);
  if (classMatch) {
    instrumented = instrumented.replace(classMatch[1], classMatch[1] + helperCode);
  }

  const lines = instrumented.split('\n');
  const finalLines = [];
  let inMain = false;
  let mainBraceCount = 0;
  let mainEndIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.includes('static void main') || trimmed.includes('public static void main')) {
      inMain = true;
    }

    if (inMain) {
      for (const ch of trimmed) {
        if (ch === '{') mainBraceCount++;
        if (ch === '}') mainBraceCount--;
      }

      const skipPreTrace =
        !trimmed ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('}') ||
        trimmed.startsWith('{') ||
        trimmed.startsWith('else') ||
        trimmed.startsWith('catch') ||
        trimmed.startsWith('finally') ||
        trimmed.startsWith('case ') ||
        trimmed.startsWith('default:') ||
        trimmed.includes('static void main') ||
        trimmed.includes('public static void main') ||
        trimmed.includes('__trace') ||
        trimmed.includes('__steps') ||
        trimmed.includes('__output');

      if (!skipPreTrace) {
        finalLines.push(`      __trace(${i + 1});`);
      }
      finalLines.push(line);

      if (mainBraceCount === 0 && trimmed.includes('}')) {
        inMain = false;
        mainEndIndex = finalLines.length - 1;
      }
    } else {
      finalLines.push(line);
    }
  }

  if (mainEndIndex !== -1 && !finalLines.some(l => l.includes('__finishTrace();'))) {
    const targetLine = finalLines[mainEndIndex];
    if (targetLine.includes('main(') && targetLine.includes('}')) {
      const lastBraceIdx = targetLine.lastIndexOf('}');
      finalLines[mainEndIndex] = targetLine.slice(0, lastBraceIdx) + ' __finishTrace(); }';
    } else {
      finalLines.splice(mainEndIndex, 0, '      __finishTrace();');
    }
  }

  return finalLines.join('\n');
}

// ─── C & C++ INSTRUMENTORS ──────────────────────────────────────────────────
function instrumentC(userCode) {
  const normalizedCode = normalizeControlBlocks(userCode);
  let code = normalizedCode;
  if (!code.includes('#include <stdio.h>')) code = '#include <stdio.h>\n' + code;
  if (!code.includes('#include <string.h>')) code = '#include <string.h>\n' + code;

  const traceHeader = `
int __step_count = 0;
char __steps_buf[32768] = "[";
int __steps_first = 1;

void __trace(int line) {
  if (__step_count < ${MAX_STEPS}) {
    __step_count++;
    char __tmp[512];
    snprintf(__tmp, sizeof(__tmp), "%s{\\"step\\":%d,\\"line\\":%d,\\"event\\":\\"line\\",\\"func\\":\\"main\\",\\"locals\\":{},\\"stdout\\":\\"\\"}",
      __steps_first ? "" : ",", __step_count, line);
    strncat(__steps_buf, __tmp, sizeof(__steps_buf) - strlen(__steps_buf) - 1);
    __steps_first = 0;
  }
}

void __finish_trace() {
  strncat(__steps_buf, "]", sizeof(__steps_buf) - strlen(__steps_buf) - 1);
  printf("${TRACE_START}\\n");
  printf("%s\\n", __steps_buf);
  printf("${TRACE_END}\\n");
  fflush(stdout);
}
`;

  const mainIdx = code.indexOf('int main');
  if (mainIdx !== -1) {
    code = code.slice(0, mainIdx) + traceHeader + '\n' + code.slice(mainIdx);
  }

  const lines = code.split('\n');
  const finalLines = [];
  let inMain = false;
  let mainBraceCount = 0;
  let mainEndIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.includes('int main')) inMain = true;

    if (inMain) {
      for (const ch of trimmed) {
        if (ch === '{') mainBraceCount++;
        if (ch === '}') mainBraceCount--;
      }

      if (trimmed.startsWith('return')) {
        finalLines.push('  __finish_trace();');
      }

      const skipPreTrace =
        !trimmed ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('}') ||
        trimmed.startsWith('{') ||
        trimmed.startsWith('else') ||
        trimmed.startsWith('return') ||
        trimmed.startsWith('case ') ||
        trimmed.startsWith('default:') ||
        trimmed.includes('int main') ||
        trimmed.includes('__trace') ||
        trimmed.includes('__steps') ||
        trimmed.includes('__finish');

      if (!skipPreTrace) {
        finalLines.push(`  __trace(${i + 1});`);
      }
      finalLines.push(line);

      if (mainBraceCount === 0 && trimmed.includes('}')) {
        inMain = false;
        mainEndIndex = finalLines.length - 1;
      }
    } else {
      finalLines.push(line);
    }
  }

  if (mainEndIndex !== -1 && !finalLines.some(l => l.includes('__finish_trace();'))) {
    const targetLine = finalLines[mainEndIndex];
    if (targetLine.includes('int main') && targetLine.includes('}')) {
      const lastBraceIdx = targetLine.lastIndexOf('}');
      finalLines[mainEndIndex] = targetLine.slice(0, lastBraceIdx) + ' __finish_trace(); }';
    } else {
      finalLines.splice(mainEndIndex, 0, '  __finish_trace();');
    }
  }

  return finalLines.join('\n');
}

function instrumentCpp(userCode) {
  let code = userCode;
  if (!code.includes('#include <iostream>')) code = '#include <iostream>\n' + code;
  if (!code.includes('#include <string>')) code = '#include <string>\n' + code;

  return instrumentC(code);
}

// ─── MAIN: Instrument + Execute + Parse ─────────────────────────────────────
async function traceCode(code, language, stdin) {
  const langConfig = LANG_MAP[language];
  if (!langConfig) throw new Error(`Unsupported language: ${language}`);

  // Step 1: Instrument code
  let instrumentedCode;
  switch (language) {
    case 'python': instrumentedCode = instrumentPython(code); break;
    case 'javascript': instrumentedCode = instrumentJavaScript(code); break;
    case 'java': instrumentedCode = instrumentJava(code); break;
    case 'c': instrumentedCode = instrumentC(code); break;
    case 'cpp': instrumentedCode = instrumentCpp(code); break;
    default: throw new Error(`No tracer for ${language}`);
  }

  // Step 2: Send to Judge0 (self-hosted, unlimited — no token limits)
  let response;
  try {
    response = await axios.post(JUDGE0_URL, {
      source_code: instrumentedCode,
      language_id: LANG_MAP[language],
      stdin: stdin || '',
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  } catch (connErr) {
    if (connErr.code === 'ECONNREFUSED') {
      throw new Error('Judge0 is not running. Open a terminal in the judge0 folder and run: docker-compose up -d');
    }
    throw connErr;
  }

  // Judge0 returns stdout, stderr, and compile_output separately
  const stdout = response.data.stdout || '';
  const stderr = response.data.stderr || '';
  const compileOutput = response.data.compile_output || '';

  // Combine stdout + stderr for trace extraction (trace output might land in either stream)
  const fullOutput = stdout + '\n' + stderr;

  // Step 3: Extract trace JSON from output
  const traceStartIdx = fullOutput.indexOf(TRACE_START);
  const traceEndIdx = fullOutput.indexOf(TRACE_END);

  if (traceStartIdx === -1 || traceEndIdx === -1) {
    // No trace markers — execution failed due to syntax/compile/runtime error
    const rawError = compileOutput || stderr || stdout || (response.data.status ? response.data.status.description : '') || response.data.message || '';
    throw new Error(
      rawError ? rawError.trim() : 'Tracing failed — code has a syntax, compilation, or runtime error.'
    );
  }

  const traceJson = fullOutput.substring(traceStartIdx + TRACE_START.length, traceEndIdx).trim();

  let steps;
  try {
    steps = JSON.parse(traceJson);
  } catch (e) {
    throw new Error('Failed to parse trace output: ' + e.message);
  }

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('No execution steps were captured');
  }

  // Step 4: Post-process steps for the frontend
  const processedSteps = steps.map((s, i) => {
    // Build the "frames" structure (like Python Tutor)
    const frames = [];

    // If we're in a function (not global), create a function frame
    if (s.func && s.func !== '__global__' && s.func !== '<module>') {
      frames.push({
        name: s.func,
        locals: s.locals || {},
      });
    }

    // Separate globals from locals for Python
    // For Python, locals in __global__ ARE the globals
    let globals = {};
    let locals = s.locals || {};

    if (language === 'python' && s.func === '__global__') {
      globals = { ...locals };
      locals = {};
    }

    // Extract arrays/lists from variables for visual rendering
    const objects = [];
    const allVars = { ...globals, ...locals };
    for (const [key, val] of Object.entries(allVars)) {
      if (Array.isArray(val)) {
        objects.push({ name: key, values: val, type: 'list' });
      }
    }

    return {
      step: s.step,
      line: s.line,
      event: s.event || 'line',
      func: s.func || '__global__',
      globals: globals,
      locals: locals,
      objects: objects,
      stdout: s.stdout || '',
      returnValue: s.returnValue,
      error: s.error,
    };
  });

  return { steps: processedSteps };
}

module.exports = { traceCode };
