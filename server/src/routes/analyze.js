const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { code, nodeLabel, nodeType, language } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "code" field' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'Gemini API key not configured. Add GEMINI_API_KEY to server/.env',
        mock: true,
        analysis: generateMockAnalysis(nodeLabel, nodeType, code)
      });
    }

    console.log(`[Analyze] Node: "${nodeLabel}" (${nodeType}), Language: ${language}`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = buildPrompt(code, nodeLabel, nodeType, language);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log(`[Analyze] Gemini response length: ${text.length} chars`);

    res.json({
      success: true,
      nodeLabel,
      nodeType,
      language,
      analysis: text
    });
  } catch (err) {
    console.error('[Analyze Error]', err);

    // If Gemini fails, return a mock response so the UI still works
    const { nodeLabel, nodeType, code } = req.body;
    res.status(200).json({
      success: true,
      mock: true,
      analysis: generateMockAnalysis(nodeLabel, nodeType, code),
      warning: 'Gemini API error — showing mock analysis: ' + err.message
    });
  }
});

function buildPrompt(code, nodeLabel, nodeType, language) {
  return `You are an expert software architect and algorithm analyst. Analyze the following ${language} ${nodeType} named \`${nodeLabel}\`.

Provide a structured analysis with these exact sections:

## ⏱ Time Complexity
State the Big-O time complexity with justification. Be specific (e.g., O(n log n) due to the binary search within the loop).

## 💾 Space Complexity
State the Big-O space complexity with justification. Include stack space for recursive calls if applicable.

## 🔍 Code Quality Analysis
Identify any code smells, anti-patterns, or potential bugs. Rate overall quality: Excellent / Good / Needs Improvement / Poor.

## 🛠 Refactoring Suggestions
Provide 2-4 specific, actionable improvements with brief code snippets where helpful.

## 🎯 Summary
A one-paragraph plain-English summary of what this ${nodeType} does and its role in the overall architecture.

---
**Code to analyze:**
\`\`\`${language}
${code.slice(0, 3000)}
\`\`\`

Keep your response focused and developer-friendly. Use markdown formatting.`;
}

function generateMockAnalysis(nodeLabel, nodeType, code) {
  const lines = (code || '').split('\n').length;
  return `## ⏱ Time Complexity
**O(n)** — This ${nodeType} iterates through the input linearly based on visible loop structures in the code (${lines} lines analyzed).

## 💾 Space Complexity
**O(1)** — No additional data structures are allocated proportional to input size in the visible code block.

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
