const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { code, nodeLabel, nodeType, language, mode = 'tech' } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "code" field' });
    }

    // Validate mode parameter
    const analysisMode = mode === 'layman' ? 'layman' : 'tech';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'Gemini API key not configured. Add GEMINI_API_KEY to server/.env',
        mock: true,
        mode: analysisMode,
        analysis: generateMockAnalysis(nodeLabel, nodeType, code, analysisMode)
      });
    }

    console.log(`[Analyze] Node: "${nodeLabel}" (${nodeType}), Language: ${language}, Mode: ${analysisMode}`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = analysisMode === 'layman'
      ? buildLaymanPrompt(code, nodeLabel, nodeType, language)
      : buildTechPrompt(code, nodeLabel, nodeType, language);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log(`[Analyze] Gemini response (${analysisMode}): ${text.length} chars`);

    res.json({
      success: true,
      nodeLabel,
      nodeType,
      language,
      mode: analysisMode,
      analysis: text
    });
  } catch (err) {
    console.error('[Analyze Error]', err);

    // If Gemini fails, return a mock response so the UI still works
    const { nodeLabel, nodeType, code, mode = 'tech' } = req.body;
    const analysisMode = mode === 'layman' ? 'layman' : 'tech';
    res.status(200).json({
      success: true,
      mock: true,
      mode: analysisMode,
      analysis: generateMockAnalysis(nodeLabel, nodeType, code, analysisMode),
      warning: 'Gemini API error — showing mock analysis: ' + err.message
    });
  }
});

// ─── Technical Prompt ──────────────────────────────────────────────────────────
function buildTechPrompt(code, nodeLabel, nodeType, language) {
  return `You are an expert software architect and algorithm analyst. Analyze the following ${language} ${nodeType} named \`${nodeLabel}\`.

Provide a structured analysis with these exact sections:

## ⏱ Time Complexity
State the Big-O time complexity with justification. Be specific (e.g., O(n log n) due to the binary search within the loop). Include amortized analysis where relevant.

## 💾 Space Complexity
State the Big-O space complexity with justification. Include stack space for recursive calls if applicable. Note any heap allocations, temporary data structures, or memoization tables.

## 🧬 AST & Structural Invariants
Identify key structural patterns in the code: loop nesting depth, branching factor, recursion type (tail, mutual, etc.), and any invariants the code relies on (sorted input, non-null, etc.).

## 🔍 Code Quality Analysis
Identify any code smells, anti-patterns, or potential bugs. Rate overall quality: Excellent / Good / Needs Improvement / Poor. Note memory leak risks and thread-safety concerns.

## 🛠 Refactoring Suggestions
Provide 2-4 specific, actionable improvements with brief code snippets where helpful. Focus on performance optimizations, design pattern opportunities, and reducing cognitive complexity.

## 🎯 Summary
A one-paragraph technical summary of what this ${nodeType} does, its computational characteristics, and its role in the overall architecture.

---
**Code to analyze:**
\`\`\`${language}
${code.slice(0, 3000)}
\`\`\`

Keep your response focused, precise, and developer-friendly. Use markdown formatting. Prefer exact Big-O notation with LaTeX-style formatting where helpful.`;
}

// ─── Layman / Plain English Prompt ─────────────────────────────────────────────
function buildLaymanPrompt(code, nodeLabel, nodeType, language) {
  return `You are a friendly coding mentor who explains programming concepts to beginners using vivid real-world analogies. Analyze the following ${language} ${nodeType} named \`${nodeLabel}\`.

Your audience has NO programming experience. Avoid jargon completely. Use these exact sections:

## 🌍 What Does This Do? (Real-World Analogy)
Explain what this code does using a clear, relatable real-world analogy. For example:
- If it's a search algorithm → compare it to looking for a word in a dictionary
- If it's a loop → compare it to checking every item on a grocery list
- If it's a class → compare it to a blueprint for building houses
- If it uses caching → compare it to writing answers on a sticky note
Pick the MOST fitting analogy for this specific code.

## 🚶 Step-by-Step Walkthrough
Walk through the code's logic in plain English, step by step, as if narrating a story. Use numbered steps. Reference your analogy to keep it intuitive. No code terms — say "it checks each item one by one" instead of "it iterates over the array."

## ⚡ Why Is This Approach Smart (or Not)?
Explain in everyday terms whether this solution is fast or slow, and WHY. Use comparisons like:
- "This is like reading every page of a book vs. using the table of contents"
- "Imagine sorting a deck of cards by comparing every pair vs. splitting into piles"

## 🎯 One-Line Summary
A single, memorable sentence a non-programmer could repeat to someone else to explain what this code does.

---
**Code to explain:**
\`\`\`${language}
${code.slice(0, 3000)}
\`\`\`

Keep your response warm, encouraging, and jargon-free. Use emojis sparingly for friendliness. Write as if explaining to a curious 12-year-old.`;
}

// ─── Mock Analysis ─────────────────────────────────────────────────────────────
function generateMockAnalysis(nodeLabel, nodeType, code, mode = 'tech') {
  const lines = (code || '').split('\n').length;

  if (mode === 'layman') {
    return `## 🌍 What Does This Do? (Real-World Analogy)
Think of \`${nodeLabel || 'this code'}\` like a **recipe in a cookbook**. Just like a recipe tells you step by step how to make a dish — what ingredients to gather, what to mix first, and when to put it in the oven — this ${nodeType} tells the computer step by step what to do with the information it receives.

## 🚶 Step-by-Step Walkthrough
1. First, it receives some information (like getting handed a list of ingredients)
2. Then it processes that information one piece at a time (like following each step in the recipe)
3. Finally, it produces a result (like the finished dish coming out of the oven!)

This code is ${lines} lines long — about as long as a simple cookie recipe 🍪

## ⚡ Why Is This Approach Smart (or Not)?
This approach goes through things **one at a time**, like checking every single book on a shelf to find the one you want. It gets the job done, but for a really big bookshelf, it might take a while!

## 🎯 One-Line Summary
\`${nodeLabel || 'This code'}\` is like a step-by-step recipe that processes information and gives back a result.

> ⚠️ **Mock Analysis** — Add your \`GEMINI_API_KEY\` to \`server/.env\` to get real AI-powered explanations!`;
  }

  return `## ⏱ Time Complexity
**O(n)** — This ${nodeType} iterates through the input linearly based on visible loop structures in the code (${lines} lines analyzed).

## 💾 Space Complexity
**O(1)** — No additional data structures are allocated proportional to input size in the visible code block.

## 🧬 AST & Structural Invariants
- Loop nesting depth: 1 (linear scan)
- No recursion detected in the visible block
- Assumes non-null input values

## 🔍 Code Quality Analysis
**Quality: Good** — The code is reasonably structured. Consider adding type hints and docstrings for better maintainability.

## 🛠 Refactoring Suggestions
1. **Add type annotations** — Improve IDE support and catch type errors early
2. **Extract magic numbers** — Replace any literal constants with named constants
3. **Add input validation** — Check edge cases (empty input, None values)
4. **Consider early returns** — Reduce nesting by returning early on guard clauses

## 🎯 Summary
\`${nodeLabel || 'This function'}\` appears to be a ${nodeType} that performs a core operation in the codebase. Add your **GEMINI_API_KEY** to \`server/.env\` to get real AI-powered analysis with specific insights tailored to your actual implementation.

> ⚠️ **Mock Analysis** — Configure your Gemini API key for real analysis`;
}

module.exports = router;
