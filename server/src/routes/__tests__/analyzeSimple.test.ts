/**
 * Unit tests for the safeParseSimpleAnalysis defensive helper in analyzeSimple.ts.
 *
 * These tests run entirely in-process — no HTTP server or Gemini API needed.
 * They cover the full validation/degradation matrix promised in the plan:
 *   1. Valid complete payload → all fields pass through
 *   2. Missing complexity   → omitted gracefully (empty strings)
 *   3. Missing exampleTrace on recursive function → trace omitted
 *   4. Unknown pattern      → normalised to "Unclassified"
 *   5. Malformed JSON (null) → empty functions array
 *   6. Non-recursive fn with exampleTrace → trace must be dropped
 *   7. exampleTrace entries with empty call strings → filtered out
 *   8. role normalisation   → anything other than 'helper' → 'main'
 */

import { describe, it, expect } from 'vitest';
import { safeParseSimpleAnalysis, VALID_PATTERNS } from '../analyzeSimple.js';

// ── helpers ─────────────────────────────────────────────────────────────────

const validFn = () => ({
  name: 'backtrack',
  params: 'start: int, current: List[int], k: int',
  returnType: 'None',
  isRecursive: true,
  role: 'helper',
  pattern: 'Backtracking',
  complexity: { time: 'O(C(n,k))', space: 'O(k)' },
  explanation: 'Recursively builds combinations by picking numbers starting from `start`.',
  exampleTrace: [
    { call: 'backtrack(1, [], 3)' },
    { call: 'backtrack(2, [1], 2)' },
    { call: 'backtrack(3, [1,2], 1)' },
  ],
});

// ── 1. Valid complete payload ────────────────────────────────────────────────

describe('safeParseSimpleAnalysis', () => {
  it('passes through a fully valid payload unchanged', () => {
    const fn = validFn();
    const result = safeParseSimpleAnalysis({ functions: [fn] });

    expect(result.functions).toHaveLength(1);
    const f = result.functions[0];
    expect(f.name).toBe('backtrack');
    expect(f.params).toBe('start: int, current: List[int], k: int');
    expect(f.returnType).toBe('None');
    expect(f.isRecursive).toBe(true);
    expect(f.role).toBe('helper');
    expect(f.pattern).toBe('Backtracking');
    expect(f.complexity.time).toBe('O(C(n,k))');
    expect(f.complexity.space).toBe('O(k)');
    expect(f.explanation).toBeTruthy();
    expect(f.exampleTrace).toHaveLength(3);
    expect(f.exampleTrace![0].call).toBe('backtrack(1, [], 3)');
  });

  // ── 2. Missing complexity ──────────────────────────────────────────────────

  it('degrades gracefully when complexity is missing', () => {
    const fn = validFn();
    delete (fn as Record<string, unknown>).complexity;
    const result = safeParseSimpleAnalysis({ functions: [fn] });

    expect(result.functions[0].complexity).toEqual({ time: '', space: '' });
  });

  it('degrades gracefully when complexity fields are wrong type', () => {
    const fn = { ...validFn(), complexity: { time: 42, space: null } };
    const result = safeParseSimpleAnalysis({ functions: [fn] });

    expect(result.functions[0].complexity).toEqual({ time: '', space: '' });
  });

  // ── 3. Missing exampleTrace on recursive function ─────────────────────────

  it('omits exampleTrace when isRecursive but trace is missing', () => {
    const fn = validFn();
    delete (fn as Record<string, unknown>).exampleTrace;
    const result = safeParseSimpleAnalysis({ functions: [fn] });

    expect(result.functions[0].exampleTrace).toBeUndefined();
  });

  // ── 4. Unknown pattern → Unclassified ─────────────────────────────────────

  it('normalises an unknown pattern to "Unclassified"', () => {
    const fn = { ...validFn(), pattern: 'MagicSort' };
    const result = safeParseSimpleAnalysis({ functions: [fn] });

    expect(result.functions[0].pattern).toBe('Unclassified');
  });

  it('accepts every pattern in the fixed taxonomy', () => {
    for (const p of VALID_PATTERNS) {
      const fn = { ...validFn(), pattern: p };
      const result = safeParseSimpleAnalysis({ functions: [fn] });
      expect(result.functions[0].pattern).toBe(p);
    }
  });

  // ── 5. Malformed / null raw input ─────────────────────────────────────────

  it('returns empty functions array for null input', () => {
    expect(safeParseSimpleAnalysis(null).functions).toHaveLength(0);
  });

  it('returns empty functions array for a non-object input', () => {
    expect(safeParseSimpleAnalysis('bad string').functions).toHaveLength(0);
  });

  it('returns empty functions array when functions key is missing', () => {
    expect(safeParseSimpleAnalysis({}).functions).toHaveLength(0);
  });

  it('returns empty functions array when functions is not an array', () => {
    expect(safeParseSimpleAnalysis({ functions: 'oops' }).functions).toHaveLength(0);
  });

  // ── 6. Non-recursive fn with exampleTrace → trace dropped ─────────────────

  it('drops exampleTrace when isRecursive is false even if Gemini included one', () => {
    const fn = { ...validFn(), isRecursive: false };
    const result = safeParseSimpleAnalysis({ functions: [fn] });

    expect(result.functions[0].isRecursive).toBe(false);
    expect(result.functions[0].exampleTrace).toBeUndefined();
  });

  // ── 7. exampleTrace entries with empty call strings filtered ──────────────

  it('filters out trace entries where call is empty', () => {
    const fn = {
      ...validFn(),
      exampleTrace: [
        { call: 'backtrack(1, [], 3)' },
        { call: '' },                   // should be removed
        { call: 'backtrack(2, [1], 2)' },
      ],
    };
    const result = safeParseSimpleAnalysis({ functions: [fn] });

    expect(result.functions[0].exampleTrace).toHaveLength(2);
  });

  // ── 8. role normalisation ─────────────────────────────────────────────────

  it('normalises unexpected role values to "main"', () => {
    const fn = { ...validFn(), role: 'wrapper' };
    const result = safeParseSimpleAnalysis({ functions: [fn] });

    expect(result.functions[0].role).toBe('main');
  });

  it('accepts role "helper" correctly', () => {
    const fn = { ...validFn(), role: 'helper' };
    const result = safeParseSimpleAnalysis({ functions: [fn] });

    expect(result.functions[0].role).toBe('helper');
  });

  // ── 9. Multiple functions in one payload ──────────────────────────────────

  it('processes multiple function entries correctly', () => {
    const main = { ...validFn(), name: 'combinationSum3', role: 'main', isRecursive: false };
    delete (main as Record<string, unknown>).exampleTrace;
    const helper = validFn();

    const result = safeParseSimpleAnalysis({ functions: [main, helper] });

    expect(result.functions).toHaveLength(2);
    expect(result.functions[0].role).toBe('main');
    expect(result.functions[1].role).toBe('helper');
    expect(result.functions[0].exampleTrace).toBeUndefined();
    expect(result.functions[1].exampleTrace).toHaveLength(3);
  });
});
