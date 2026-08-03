'use strict';

/**
 * testComplexity.js — Verification tests for the professional complexity engine.
 * Run: node backend/engines/testComplexity.js
 */

const { analyzeComplexity } = require('./complexityEngine');

let passed = 0;
let failed = 0;

function test(name, code, lang, expectedTime, expectedSpace) {
  const result = analyzeComplexity(code, lang);
  const timePassed  = result.timeComplexity === expectedTime;
  const spacePassed = !expectedSpace || result.spaceComplexity === expectedSpace;
  const ok = timePassed && spacePassed;

  if (ok) {
    console.log(`  ✅ ${name}: Time=${result.timeComplexity} Space=${result.spaceComplexity}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    if (!timePassed) console.log(`     Time: expected ${expectedTime}, got ${result.timeComplexity}`);
    if (!spacePassed) console.log(`     Space: expected ${expectedSpace}, got ${result.spaceComplexity}`);
    console.log(`     Explanation:\n${result.explanation.split('\n').map(l => '       ' + l).join('\n')}`);
    failed++;
  }
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log(' Complexity Engine — 10 Algorithm Verification Tests');
console.log('═══════════════════════════════════════════════════════════\n');

// ── 1. Binary Search (iterative) ─────────────────────────────────────────────
test('Binary Search (iterative)', `
def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
`, 'python', 'O(log n)', 'O(1)');

// ── 2. Two-Pointer (Two Sum sorted) ─────────────────────────────────────────
test('Two-Pointer (Two Sum)', `
def two_sum_sorted(arr, target):
    left, right = 0, len(arr) - 1
    while left < right:
        s = arr[left] + arr[right]
        if s == target:
            return [left, right]
        elif s < target:
            left += 1
        else:
            right -= 1
    return []
`, 'python', 'O(n)', 'O(1)');

// ── 3. Merge Sort ────────────────────────────────────────────────────────────
test('Merge Sort', `
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)

def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result
`, 'python', 'O(n log n)', 'O(n)');

// ── 4. N-Queens Backtracking ─────────────────────────────────────────────────
test('N-Queens Backtracking', `
def solve_queens(board, col, n):
    if col >= n:
        return True
    for row in range(n):
        if is_safe(board, row, col, n):
            board[row] = col
            if solve_queens(board, col + 1, n):
                return True
            board[row] = 0
    return False
`, 'python', 'O(n!)', 'O(n)');

// ── 5. 0/1 Knapsack DP ──────────────────────────────────────────────────────
test('0/1 Knapsack DP', `
def knapsack(weights, values, W, n):
    dp = [[0] * (W + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for w in range(1, W + 1):
            if weights[i-1] <= w:
                dp[i][w] = max(dp[i-1][w], values[i-1] + dp[i-1][w - weights[i-1]])
            else:
                dp[i][w] = dp[i-1][w]
    return dp[n][W]
`, 'python', 'O(n×m)', 'O(n²)');

// ── 6. BFS on adjacency list ─────────────────────────────────────────────────
test('BFS Graph Traversal', `
from collections import deque

def bfs(graph, start):
    visited = set()
    queue = deque([start])
    visited.add(start)
    while queue:
        node = queue.popleft()
        for neighbor in graph[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    return visited
`, 'python', 'O(V+E)', 'O(n)');

// ── 7. Fibonacci naive recursion ─────────────────────────────────────────────
test('Fibonacci Naive Recursion', `
def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)
`, 'python', 'O(2^n)', 'O(n)');

// ── 8. Fibonacci DP ──────────────────────────────────────────────────────────
test('Fibonacci DP', `
def fib_dp(n):
    dp = [0] * (n + 1)
    dp[1] = 1
    for i in range(2, n + 1):
        dp[i] = dp[i-1] + dp[i-2]
    return dp[n]
`, 'python', 'O(n)', 'O(n)');

// ── 9. Dijkstra with heapq ──────────────────────────────────────────────────
test('Dijkstra (heapq)', `
import heapq

def dijkstra(graph, start):
    dist = {}
    heap = [(0, start)]
    while heap:
        d, node = heapq.heappop(heap)
        if node in dist:
            continue
        dist[node] = d
        for neighbor, weight in graph[node]:
            if neighbor not in dist:
                heapq.heappush(heap, (d + weight, neighbor))
    return dist
`, 'python', 'O(n log n)');

// ── 10. Quick Sort ───────────────────────────────────────────────────────────
test('Quick Sort', `
function quickSort(arr, lo, hi) {
  if (lo < hi) {
    const pivot = partition(arr, lo, hi);
    quickSort(arr, lo, pivot - 1);
    quickSort(arr, pivot + 1, hi);
  }
}

function partition(arr, lo, hi) {
  const pivot = arr[hi];
  let i = lo - 1;
  for (let j = lo; j < hi; j++) {
    if (arr[j] <= pivot) {
      i++;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  [arr[i + 1], arr[hi]] = [arr[hi], arr[i + 1]];
  return i + 1;
}
`, 'javascript', 'O(n²)');

console.log(`\n═══════════════════════════════════════════════════════════`);
console.log(` Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`═══════════════════════════════════════════════════════════\n`);

if (failed > 0) {
  process.exit(1);
}
