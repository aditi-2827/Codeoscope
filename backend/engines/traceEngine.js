// backend/engines/traceEngine.js
// Custom Code Tracing Engine — NO AI, uses actual code execution
//
// Python  → sys.settrace() hook captures every line + variables
// JS     → injects __trace() calls after each statement
// Java   → injects System.out.println trace after each statement
// C      → injects printf trace after each statement
// C++    → injects printf trace after each statement
//
// All instrumented code is sent to Judge0 (self-hosted, unlimited) for execution.
// Trace data is extracted from stdout and returned as structured JSON.

const axios = require('axios');

const JUDGE0_URL = 'http://localhost:2358/submissions?base64_encoded=false&wait=true';

// Judge0 Language IDs
const LANG_MAP = {
  python:     71,   // Python 3.8.1
  javascript: 63,   // Node.js 12.14.0
  java:       62,   // OpenJDK 14.0.1
  c:          50,   // GCC 9.2.0
  cpp:        54,   // GCC 9.2.0 (C++)
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

// ─── JAVASCRIPT INSTRUMENTOR ────────────────────────────────────────────────
// Regex-based: finds all variable declarations and injects trace calls.
function instrumentJavaScript(userCode) {
  const lines = userCode.split('\n');

  // First pass: find all declared variable names
  const varNames = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    // Match: let x, const x, var x (with or without assignment)
    const declMatch = trimmed.match(/(?:let|const|var)\s+(\w+)/g);
    if (declMatch) {
      for (const m of declMatch) {
        const name = m.replace(/(?:let|const|var)\\s+/, '');
        varNames.add(name);
      }
    }
    // Match: function foo(
    const funcMatch = trimmed.match(/function\s+(\w+)/);
    if (funcMatch) varNames.add(funcMatch[1]);
  }

  const varList = [...varNames];

  // Build the trace capture expression
  const captureVars = varList.map(v =>
    `try { __vars["${v}"] = typeof ${v} !== 'undefined' ? ${v} : undefined; } catch(e) {}`
  ).join('; ');

  // Build instrumented code
  let instrumented = `
var __steps = [];
var __output = [];
var __MAX = ${MAX_STEPS};
var __origLog = console.log;
console.log = function() {
  var args = Array.prototype.slice.call(arguments);
  __output.push(args.join(' ') + '\\n');
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

  // Second pass: inject __trace() after each executable line
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const lineNum = i + 1;

    // Skip empty, comments, lone braces
    if (!trimmed || trimmed.startsWith('//') || trimmed === '{' || trimmed === '}' || trimmed === '});') {
      instrumented += lines[i] + '\\n';
      continue;
    }

    instrumented += lines[i] + '\\n';
    // Don't inject after lines ending with { (block openers) or that are function declarations
    if (!trimmed.endsWith('{') && !trimmed.endsWith(',') && !trimmed.startsWith('function ')) {
      instrumented += `__trace(${lineNum});\\n`;
    }
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
  const lines = userCode.split('\n');

  // Find variable declarations
  const varNames = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    // Match: int x, String x, double x, etc.
    const declMatch = trimmed.match(/(?:int|long|float|double|char|boolean|String|int\[\]|String\[\])\s+(\w+)/g);
    if (declMatch) {
      for (const m of declMatch) {
        const parts = m.split(/\s+/);
        if (parts.length >= 2) varNames.add(parts[parts.length - 1]);
      }
    }
  }

  const varList = [...varNames];

  // Build trace string builder for each variable
  const traceVarCode = varList.map(v => {
    return `
      try {
        sb.append("\\"${v}\\":");
        if (${v} instanceof int[]) sb.append(java.util.Arrays.toString(${v}));
        else sb.append("\\"" + ${v} + "\\"");
        sb.append(",");
      } catch (Exception e) {}`;
  }).join('\\n');

  // Inject trace method into Main class
  let instrumented = userCode;

  // Find the class body and inject trace infrastructure
  const classMatch = instrumented.match(/(public\s+class\s+\w+\s*\{)/);
  if (classMatch) {
    const traceMethod = `
    static java.util.List<String> __steps = new java.util.ArrayList<>();
    static StringBuilder __output = new StringBuilder();
    static int __stepCount = 0;
    static void __trace(int line) {
      if (__stepCount >= ${MAX_STEPS}) return;
      __stepCount++;
      StringBuilder sb = new StringBuilder();
      sb.append("{\\"step\\":" + __stepCount + ",\\"line\\":" + line + ",\\"event\\":\\"line\\",\\"func\\":\\"main\\",\\"locals\\":{");
      ${traceVarCode}
      if (sb.charAt(sb.length()-1) == ',') sb.setLength(sb.length()-1);
      sb.append("},\\"stdout\\":\\"" + __output.toString().replace("\\"", "\\\\\\\\\\"").replace("\\n", "\\\\\\\\n") + "\\"}");
      __steps.add(sb.toString());
    }
    `;
    instrumented = instrumented.replace(classMatch[1], classMatch[1] + traceMethod);
  }

  // Inject trace calls after executable lines inside main method
  const resultLines = instrumented.split('\n');
  let inMain = false;
  let braceCount = 0;
  const finalLines = [];

  for (let i = 0; i < resultLines.length; i++) {
    const trimmed = resultLines[i].trim();
    finalLines.push(resultLines[i]);

    if (trimmed.includes('static void main') || trimmed.includes('public static void main')) {
      inMain = true;
    }

    if (inMain) {
      for (const ch of trimmed) {
        if (ch === '{') braceCount++;
        if (ch === '}') braceCount--;
      }
      if (braceCount <= 0) inMain = false;

      if (trimmed.endsWith(';') && !trimmed.startsWith('//') && !trimmed.includes('__trace') && !trimmed.includes('__steps') && !trimmed.includes('__output')) {
        finalLines.push(`      __trace(${i + 1});`);
      }
    }
  }

  // Add trace output before the closing of the class
  const lastBrace = finalLines.lastIndexOf('}');
  if (lastBrace > 0) {
    // Find end of main method — add print before last }
    const mainEndIdx = finalLines.length - 1;
    // Insert before the last closing brace of main
    for (let i = finalLines.length - 1; i >= 0; i--) {
      if (finalLines[i].trim() === '}') {
        finalLines.splice(i, 0, `
    System.out.println("${TRACE_START}");
    System.out.println("[" + String.join(",", __steps) + "]");
    System.out.println("${TRACE_END}");
`);
        break;
      }
    }
  }

  return finalLines.join('\n');
}

// ─── C INSTRUMENTOR ─────────────────────────────────────────────────────────
function instrumentC(userCode) {
  const lines = userCode.split('\n');

  // Find variable declarations
  const varNames = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Match: int x, float x, char x, double x (simple declarations)
    const match = trimmed.match(/^(int|float|double|char|long)\s+(\w+)/);
    if (match && !trimmed.includes('(')) {
      varNames.push({ name: match[2], type: match[1] });
    }
    // Match: int arr[]
    const arrMatch = trimmed.match(/^(int|float|double|char)\s+(\w+)\s*\[/);
    if (arrMatch) {
      varNames.push({ name: arrMatch[2], type: arrMatch[1] + '[]' });
    }
  }

  // Build printf for each variable
  const printVars = varNames.map(v => {
    if (v.type.includes('[]')) return '';  // Skip arrays for simplicity
    const fmt = v.type === 'int' || v.type === 'long' ? '%d' :
      v.type === 'float' || v.type === 'double' ? '%f' :
        v.type === 'char' ? '%c' : '%d';
    return `printf("\\"${v.name}\\":\\"${fmt}\\",", ${v.name});`;
  }).filter(Boolean).join(' ');

  // Add stdio.h if not present
  let code = userCode;
  if (!code.includes('#include <stdio.h>')) {
    code = '#include <stdio.h>\\n' + code;
  }
  if (!code.includes('#include <string.h>')) {
    code = '#include <string.h>\\n' + code;
  }

  // Add trace globals and function
  const traceFunc = `
int __step_count = 0;
char __output_buf[4096] = "";
char __steps_buf[32768] = "[";
int __steps_first = 1;

#define __TRACE(line) do { \\
  if (__step_count < ${MAX_STEPS}) { \\
    __step_count++; \\
    char __tmp[1024]; \\
    snprintf(__tmp, sizeof(__tmp), "%s{\\"step\\":%d,\\"line\\":%d,\\"event\\":\\"line\\",\\"func\\":\\"main\\",\\"locals\\":{", \\
      __steps_first ? "" : ",", __step_count, line); \\
    strncat(__steps_buf, __tmp, sizeof(__steps_buf)-strlen(__steps_buf)-1); \\
    ${printVars ? `char __vartmp[512]; snprintf(__vartmp, sizeof(__vartmp), "${varNames.filter(v => !v.type.includes('[]')).map(v => `\\"${v.name}\\":\\"${v.type === 'int' || v.type === 'long' ? '%d' : v.type === 'float' || v.type === 'double' ? '%f' : '%c'}\\"`).join(',')}", ${varNames.filter(v => !v.type.includes('[]')).map(v => v.name).join(', ')}); strncat(__steps_buf, __vartmp, sizeof(__steps_buf)-strlen(__steps_buf)-1);` : ''} \\
    strncat(__steps_buf, "},\\"stdout\\":\\"\\"}", sizeof(__steps_buf)-strlen(__steps_buf)-1); \\
    __steps_first = 0; \\
  } \\
} while(0)
`;

  // Insert trace function after includes, before main
  const mainIdx = code.indexOf('int main');
  if (mainIdx > 0) {
    code = code.slice(0, mainIdx) + traceFunc + '\n' + code.slice(mainIdx);
  }

  // Inject __TRACE() after executable lines in main
  const resultLines = code.split('\n');
  let inMain = false;
  let braceCount = 0;
  const finalLines = [];

  for (let i = 0; i < resultLines.length; i++) {
    const trimmed = resultLines[i].trim();
    finalLines.push(resultLines[i]);

    if (trimmed.includes('int main')) inMain = true;

    if (inMain) {
      for (const ch of trimmed) {
        if (ch === '{') braceCount++;
        if (ch === '}') braceCount--;
      }
      if (braceCount <= 0 && inMain && trimmed === '}') inMain = false;

      if (trimmed.endsWith(';') && !trimmed.startsWith('//') && !trimmed.startsWith('#') &&
        !trimmed.includes('__TRACE') && !trimmed.includes('__step') && !trimmed.includes('__output') && !trimmed.includes('__steps')) {
        finalLines.push(`  __TRACE(${i + 1});`);
      }
    }
  }

  // Before return 0 or end of main, add output
  const retIdx = finalLines.findIndex(l => l.trim().startsWith('return'));
  if (retIdx > 0) {
    finalLines.splice(retIdx, 0,
      `  strncat(__steps_buf, "]", sizeof(__steps_buf)-strlen(__steps_buf)-1);`,
      `  printf("${TRACE_START}\\n");`,
      `  printf("%s\\n", __steps_buf);`,
      `  printf("${TRACE_END}\\n");`
    );
  }

  return finalLines.join('\n');
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
    default: throw new Error(`No tracer for ${language}`);
  }

  // Step 2: Send to Judge0 (self-hosted, unlimited — no token limits)
  let response;
  try {
    response = await axios.post(JUDGE0_URL, {
      source_code: instrumentedCode,
      language_id: LANG_MAP[language],
      stdin:       stdin || '',
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

  // Judge0 returns stdout and stderr separately
  // Compile errors go to compile_output, runtime errors to stderr
  const stdout        = response.data.stdout        || '';
  const stderr        = response.data.stderr        || '';
  const compileOutput = response.data.compile_output || '';
  const output = stdout || compileOutput || stderr;

  // Step 3: Extract trace JSON from output
  const traceStartIdx = output.indexOf(TRACE_START);
  const traceEndIdx = output.indexOf(TRACE_END);

  if (traceStartIdx === -1 || traceEndIdx === -1) {
    // No trace markers — execution probably failed
    throw new Error(
      output.includes('Error') || output.includes('error') || output.includes('Traceback')
        ? `Code execution error:\n${output}`
        : 'Tracing failed — no trace data in output. Code may have a runtime error.'
    );
  }

  const traceJson = output.substring(traceStartIdx + TRACE_START.length, traceEndIdx).trim();

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
