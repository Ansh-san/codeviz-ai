import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

const router = express.Router();

// ── Model Selection ─────────────────────────────────────────────────────────
// Mirrors the same primary/fallback strategy as analyze.ts.
// ⚠️  Do NOT use gemini-2.0-flash — shut down June 1, 2026 (HTTP 404).
const GEMINI_MODEL         = process.env.GEMINI_MODEL         || 'gemini-3.6-flash';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash';

// ── DSA Pattern taxonomy (fixed 15 strings + Unclassified) ──────────────────
export const VALID_PATTERNS = new Set([
  'Two Pointers',
  'Sliding Window',
  'Backtracking',
  'DFS',
  'BFS',
  'Dynamic Programming',
  'Binary Search',
  'Greedy',
  'Divide & Conquer',
  'Hash Map/Set',
  'Union Find',
  'Recursion',
  'Sorting',
  'Brute Force',
  'Unclassified',
]);

// ── Types ───────────────────────────────────────────────────────────────────

export interface TraceStep {
  call: string;
}

export interface FunctionAnalysis {
  name: string;
  params: string;
  returnType: string;
  isRecursive: boolean;
  role: 'main' | 'helper';
  pattern: string;
  complexity: {
    time: string;
    space: string;
  };
  explanation: string;
  exampleTrace?: TraceStep[];
}

export interface SimpleAnalysisResult {
  functions: FunctionAnalysis[];
}

interface SimpleAnalyzeRequestBody {
  code?: string;
  language?: string;
}

// ── Defensive parser ────────────────────────────────────────────────────────

/**
 * Validates and sanitises the raw object Gemini returns.
 * Any missing or malformed field is omitted or replaced with a safe default
 * so the route never throws from bad Gemini output.
 */
export function safeParseSimpleAnalysis(raw: unknown): SimpleAnalysisResult {
  const fallback: SimpleAnalysisResult = { functions: [] };

  if (!raw || typeof raw !== 'object') return fallback;

  const obj = raw as Record<string, unknown>;
  const fns = Array.isArray(obj.functions) ? obj.functions : [];

  const functions: FunctionAnalysis[] = fns
    .filter((f): f is Record<string, unknown> => f !== null && typeof f === 'object')
    .map((f) => {
      const name        = typeof f.name       === 'string' ? f.name.trim()      : 'unknown';
      const params      = typeof f.params     === 'string' ? f.params.trim()    : '';
      const returnType  = typeof f.returnType === 'string' ? f.returnType.trim(): '';
      const isRecursive = typeof f.isRecursive === 'boolean' ? f.isRecursive    : false;
      const role        = f.role === 'helper'               ? 'helper' as const : 'main' as const;
      const explanation = typeof f.explanation === 'string' ? f.explanation.trim() : '';

      // ── Pattern — normalise to taxonomy or "Unclassified"
      const rawPattern = typeof f.pattern === 'string' ? f.pattern.trim() : '';
      const pattern    = VALID_PATTERNS.has(rawPattern) ? rawPattern : 'Unclassified';

      // ── Complexity — degrade gracefully if object shape is wrong
      let complexity: FunctionAnalysis['complexity'] = { time: '', space: '' };
      if (f.complexity && typeof f.complexity === 'object') {
        const c = f.complexity as Record<string, unknown>;
        complexity = {
          time:  typeof c.time  === 'string' ? c.time.trim()  : '',
          space: typeof c.space === 'string' ? c.space.trim() : '',
        };
      }

      // ── exampleTrace — only include when isRecursive AND trace is valid
      let exampleTrace: TraceStep[] | undefined;
      if (isRecursive && Array.isArray(f.exampleTrace)) {
        const steps = (f.exampleTrace as unknown[])
          .filter((s): s is Record<string, unknown> => s !== null && typeof s === 'object')
          .map((s) => ({ call: typeof s.call === 'string' ? s.call.trim() : '' }))
          .filter((s) => s.call.length > 0)
          .slice(0, 4); // cap at 4 levels
        if (steps.length > 0) exampleTrace = steps;
      }

      const fn: FunctionAnalysis = {
        name, params, returnType, isRecursive, role, pattern, complexity, explanation,
      };
      if (exampleTrace) fn.exampleTrace = exampleTrace;
      return fn;
    });

  return { functions };
}

// ── Gemini prompt ────────────────────────────────────────────────────────────

function buildSimplePrompt(code: string, language: string): string {
  const patternList = [...VALID_PATTERNS].join(' | ');
  return `You are an expert competitive-programming coach. Analyse this ${language} snippet.

Return ONLY a valid JSON object — no markdown fences, no explanation outside JSON.

Schema:
{
  "functions": [
    {
      "name": "<function name>",
      "params": "<param list as string, e.g. 'k: int, n: int'>",
      "returnType": "<return type as string, e.g. 'List[List[int]]'>",
      "isRecursive": <true|false>,
      "role": "<'main' | 'helper'>",
      "pattern": "<one of: ${patternList}>",
      "complexity": { "time": "<e.g. O(k * C(n,k))>", "space": "<e.g. O(k)>" },
      "explanation": "<2-3 sentences plain-English how it works>",
      "exampleTrace": [            // ONLY include when isRecursive is true
        { "call": "<e.g. backtrack(1, [], 3)>" },
        { "call": "<e.g. backtrack(2, [1], 2)>" },
        { "call": "<e.g. backtrack(3, [1,2], 1)>" }
      ]
    }
  ]
}

Rules:
- Include one entry per top-level or nested function (max 3 total).
- The outermost / wrapper function has role "main"; a nested helper has role "helper".
- If the snippet has a single function, the array has one entry with role "main".
- exampleTrace must have 2–3 items with plausible argument values illustrating recursion depth. Use concrete sample values matching the function's parameter types.
- Do not include exampleTrace when isRecursive is false.
- pattern must be exactly one string from the allowed list — default to "Unclassified" if unsure.
- If you cannot determine params/returnType, use an empty string "".

Code:
\`\`\`${language}
${code.slice(0, 4000)}
\`\`\``;
}

// ── Mock fallback ────────────────────────────────────────────────────────────

function buildMockResult(code: string): SimpleAnalysisResult {
  const fnMatch = code.match(/def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\S+))?/);
  const name       = fnMatch?.[1] ?? 'solution';
  const params     = fnMatch?.[2] ?? '';
  const returnType = fnMatch?.[3] ?? '';
  return {
    functions: [{
      name,
      params,
      returnType,
      isRecursive: false,
      role: 'main',
      pattern: 'Unclassified',
      complexity: { time: 'O(n)', space: 'O(1)' },
      explanation: 'Add your GEMINI_API_KEY to server/.env to get real AI-powered analysis.',
    }]
  };
}

// ── Route handler ────────────────────────────────────────────────────────────

router.post('/', async (req: Request<object, object, SimpleAnalyzeRequestBody>, res: Response) => {
  try {
    const { code, language = 'python' } = req.body;

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return res.status(400).json({ error: 'Missing or invalid "code" field' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log('[AnalyzeSimple] No API key — returning mock');
      return res.json({
        success: true,
        mock: true,
        result: buildMockResult(code),
      });
    }

    console.log(`[AnalyzeSimple] Language: ${language}, Model: ${GEMINI_MODEL}`);

    const ai     = new GoogleGenAI({ apiKey });
    const prompt = buildSimplePrompt(code, language);

    // ── Try primary model; fall back on error ──────────────────────────────
    let text = '';
    let modelUsed = GEMINI_MODEL;
    try {
      const result = await ai.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
      text = result.text ?? '';
    } catch (primaryErr) {
      const primaryError = primaryErr as Error;
      console.warn(
        `[AnalyzeSimple] Primary model "${GEMINI_MODEL}" failed (${primaryError.message}); ` +
        `retrying with fallback "${GEMINI_FALLBACK_MODEL}"`
      );
      modelUsed = GEMINI_FALLBACK_MODEL;
      const fallbackResult = await ai.models.generateContent({
        model: GEMINI_FALLBACK_MODEL,
        contents: prompt,
      });
      text = fallbackResult.text ?? '';
    }

    console.log(`[AnalyzeSimple] Gemini response (model=${modelUsed}): ${text.length} chars`);

    // ── Parse Gemini JSON response defensively ─────────────────────────────
    let rawParsed: unknown = null;
    try {
      // Strip optional markdown code fences Gemini sometimes includes
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      rawParsed = JSON.parse(cleaned);
    } catch {
      console.warn('[AnalyzeSimple] JSON parse failed — using empty result');
      rawParsed = null;
    }

    const result = safeParseSimpleAnalysis(rawParsed);

    // If Gemini returned nothing usable, fall back to mock rather than empty UI
    if (result.functions.length === 0) {
      return res.json({ success: true, mock: true, result: buildMockResult(code), modelUsed });
    }

    return res.json({ success: true, result, modelUsed });
  } catch (err) {
    const error = err as Error;
    console.error('[AnalyzeSimple Error]', error);
    const { code } = req.body as SimpleAnalyzeRequestBody;
    return res.status(200).json({
      success: true,
      mock: true,
      result: buildMockResult(code ?? ''),
      warning: 'Gemini API error — showing mock result: ' + error.message,
    });
  }
});

export default router;
