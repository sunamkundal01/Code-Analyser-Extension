document.addEventListener('DOMContentLoaded', () => {
    const GEMINI_MODEL = 'gemini-2.5-flash';
    const NON_CODE_PATTERNS = [
        /it seems the code you intended to provide is missing/i,
        /please provide the python code/i,
        /general principles for complexity analysis/i,
        /error from gemini api/i,
        /to analyze the time complexity and space complexity/i
    ];
    const CODE_HINT_PATTERNS = [
        /\b(function|def|class|return|if|else|elif|for|while|switch|case|try|catch|finally|const|let|var|public|private|static|void|async|await|import|from)\b/,
        /[{}[\];]/,
        /=>/,
        /<\/?[a-z][^>]*>/i,
        /^[ \t]*[#/]{1,2}.+/m
    ];
    const getComplexityOnlyButton = document.getElementById('getComplexityOnly');
    const explainComplexityButton = document.getElementById('explainComplexity');
    const getCodeFeedbackButton = document.getElementById('getCodeFeedback');
    const getExtraTestCasesButton = document.getElementById('getExtraTestCases');
    const getAlternateApproachesButton = document.getElementById('getAlternateApproaches');
    const getHintsButton = document.getElementById('getHints');
    const closeButton = document.getElementById('closeButton');
    const refreshCodePreviewButton = document.getElementById('refreshCodePreview');
    const toggleExtractedCodeButton = document.getElementById('toggleExtractedCode');
    const toggleApiKeyEditorButton = document.getElementById('toggleApiKeyEditor');
    const saveApiKeyInlineButton = document.getElementById('saveApiKeyInline');
    const apiKeyMessageDiv = document.getElementById('apiKeyMessage');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiKeyEditorStatusEl = document.getElementById('apiKeyEditorStatus');
    const extractedCodePreviewEl = document.getElementById('extractedCodePreview');

    const timeComplexityValueEl = document.getElementById('timeComplexityValue');
    const spaceComplexityValueEl = document.getElementById('spaceComplexityValue');
    const complexityDirectOutputEl = document.getElementById('complexityDirectOutput');
    const resultsEl = document.getElementById('results'); // This is your general results/instruction area

    let geminiApiKey = null;
    let currentCodeFromDom = "";
    let currentProblemContext = "";
    let isApiKeyEditorVisible = false;
    let isExtractedCodeVisible = false;
    const MIN_CODE_LENGTH = 10;
    const MIN_CONTEXT_LENGTH = 40;

    function refreshUIStates() {

        //The !! (double exclamation mark) is a common JavaScript idiom that converts any value to its corresponding boolean value (true or false).
        //geminiApiKey could be null, undefined, an empty string, or a string containing the API key.
        //The expression !!geminiApiKey will be:
    //    true if geminiApiKey is any "truthy" value (for example, a non-empty string containing an API key).
    //   false if geminiApiKey is "falsy" (for example, null, undefined, "" (empty string), 0, or false).
        const hasApiKey = !!geminiApiKey;
        getComplexityOnlyButton.disabled = !hasApiKey;
        explainComplexityButton.disabled = !hasApiKey;
        getCodeFeedbackButton.disabled = !hasApiKey;
        getExtraTestCasesButton.disabled = !hasApiKey;
        getAlternateApproachesButton.disabled = !hasApiKey;
        getHintsButton.disabled = !hasApiKey;
        apiKeyInput.value = geminiApiKey || "";

        if (!hasApiKey) {
            apiKeyMessageDiv.innerHTML = `API Key not set. Please <a href="#" id="optionsLink">set it in options</a>.`;
            const optionsLink = document.getElementById('optionsLink');
            if (optionsLink) {
                optionsLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    chrome.runtime.openOptionsPage();
                });
            }
        } else {
            apiKeyMessageDiv.textContent = 'API Key loaded. Ready to analyze.';
        }

        apiKeyInput.style.display = isApiKeyEditorVisible ? 'block' : 'none';
        saveApiKeyInlineButton.style.display = isApiKeyEditorVisible ? 'inline-block' : 'none';
        toggleApiKeyEditorButton.textContent = isApiKeyEditorVisible ? 'Hide API Key Editor' : 'Edit API Key';
        extractedCodePreviewEl.classList.toggle('is-collapsed', !isExtractedCodeVisible);
        toggleExtractedCodeButton.textContent = isExtractedCodeVisible ? 'Hide Code' : 'Show Code';
    }
    
    // Initial message is set in HTML. Ensure the correct div is visible.
    resultsEl.style.display = 'block'; 
    complexityDirectOutputEl.style.display = 'none';

    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            geminiApiKey = result.geminiApiKey;
            console.log("[Popup] API Key loaded.");
        } else {
            console.log("[Popup] API Key not found in storage.");
        }
        refreshUIStates();
    });

    chrome.runtime.sendMessage({ action: "getExtractedCode" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("[Popup] Error requesting extracted code from page:", chrome.runtime.lastError.message);
            currentCodeFromDom = "";
            updateExtractedCodePreview("");
        } else if (response && typeof response.text !== 'undefined') {
            console.log("[Popup] Received extracted code from page DOM (first 100 chars):", response.text.substring(0, 100));
            currentCodeFromDom = response.text;
            currentProblemContext = response.problemContext || "";
            updateExtractedCodePreview(currentCodeFromDom);
        } else {
            console.error("[Popup] Invalid response when requesting extracted code from page.");
            currentCodeFromDom = "";
            updateExtractedCodePreview("");
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "updateExtractedCode") {
            console.log("[Popup] Received updated extracted code from page (first 100 chars):", message.text.substring(0, 100));
            currentCodeFromDom = message.text;
            currentProblemContext = message.problemContext || currentProblemContext;
            updateExtractedCodePreview(currentCodeFromDom);
            sendResponse({status: "Popup updated page DOM code"});
            return true;
        }
    });

    closeButton.addEventListener('click', () => {
        window.close();
    });

    toggleExtractedCodeButton.addEventListener('click', () => {
        isExtractedCodeVisible = !isExtractedCodeVisible;
        refreshUIStates();
    });

    toggleApiKeyEditorButton.addEventListener('click', () => {
        isApiKeyEditorVisible = !isApiKeyEditorVisible;
        apiKeyEditorStatusEl.textContent = '';
        apiKeyEditorStatusEl.className = 'api-key-editor-status';
        refreshUIStates();
        if (isApiKeyEditorVisible) {
            apiKeyInput.focus();
            apiKeyInput.select();
        }
    });

    saveApiKeyInlineButton.addEventListener('click', () => {
        const nextApiKey = apiKeyInput.value.trim();
        if (!nextApiKey) {
            showApiKeyEditorStatus('Please enter an API key.', 'error');
            return;
        }

        saveApiKeyInlineButton.disabled = true;
        chrome.storage.local.set({ geminiApiKey: nextApiKey }, () => {
            saveApiKeyInlineButton.disabled = false;
            geminiApiKey = nextApiKey;
            showApiKeyEditorStatus('API key updated.', 'success');
            refreshUIStates();
        });
    });

    refreshCodePreviewButton.addEventListener('click', async () => {
        refreshCodePreviewButton.disabled = true;
        refreshCodePreviewButton.textContent = 'Refreshing...';
        await refreshCodeFromPageDom();
        refreshCodePreviewButton.disabled = false;
        refreshCodePreviewButton.textContent = 'Refresh Preview';
    });

    function updateExtractedCodePreview(code) {
        if (code && code.trim()) {
            extractedCodePreviewEl.textContent = code;
        } else {
            extractedCodePreviewEl.textContent = 'No code extracted from the live page DOM yet.';
        }
    }

    function showApiKeyEditorStatus(message, type) {
        apiKeyEditorStatusEl.textContent = message;
        apiKeyEditorStatusEl.className = `api-key-editor-status ${type || ''}`.trim();
    }

    function isLikelyCode(text) {
        const trimmed = (text || "").trim();
        if (!trimmed) {
            return false;
        }

        if (NON_CODE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
            return false;
        }

        const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
        const hasCodeHint = CODE_HINT_PATTERNS.some((pattern) => pattern.test(trimmed));
        const hasIndentedStructure = lines.some((line) => /^[ \t]{2,}\S+/.test(line));
        const hasMultipleLines = lines.length >= 2;
        const hasOperatorPattern = /(\+=|-=|\*=|\/=|==|!=|<=|>=|&&|\|\||:=|[=<>+\-*/%])/m.test(trimmed);
        const hasCallPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)/m.test(trimmed);
        const hasStatementEnding = lines.some((line) => /[;{}:]$/.test(line));

        return hasCodeHint || (hasMultipleLines && hasIndentedStructure && (hasOperatorPattern || hasCallPattern || hasStatementEnding));
    }

    async function refreshCodeFromPageDom() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "refreshExtractedCode" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("[Popup] Error refreshing extracted code from page:", chrome.runtime.lastError.message);
                    currentCodeFromDom = "";
                    resolve("");
                    return;
                }

                const refreshedCode = response && typeof response.text !== 'undefined' ? response.text : "";
                currentCodeFromDom = refreshedCode;
                currentProblemContext = response && typeof response.problemContext === 'string' ? response.problemContext : "";
                console.log("[Popup] Refreshed extracted code from page DOM (first 100 chars):", refreshedCode.substring(0, 100));
                updateExtractedCodePreview(refreshedCode);
                resolve(refreshedCode);
            });
        });
    }

    async function getCodeForAnalysis() {
        let codeToAnalyze = (await refreshCodeFromPageDom() || currentCodeFromDom || "").trim();
        let source = "page DOM";

        if (!isLikelyCode(codeToAnalyze) || codeToAnalyze.length < MIN_CODE_LENGTH) {
            console.log(`[Popup] No valid code extracted from DOM (${codeToAnalyze.length} chars).`);
            codeToAnalyze = "";
            source = "no valid DOM code found";
        } else {
            console.log(`[Popup] Using code extracted from page DOM (${codeToAnalyze.length} chars).`);
        }
        console.log(`[Popup] Code For Analysis (Source: ${source}, Length: ${codeToAnalyze.length}):\n<<<<<<\n${codeToAnalyze.substring(0,500)}\n>>>>>>`); // Log more for debugging
        return codeToAnalyze;
    }

    function getProblemContextForAnalysis() {
        const context = (currentProblemContext || '').trim();
        if (context.length >= MIN_CONTEXT_LENGTH) {
            return context;
        }
        return '';
    }

    function buildPrompt(code, problemContext, promptType) {
        const codeSection = code ? `Current Code:\n\n${code}` : 'Current Code:\n\nNo code was extracted.';
        const contextSection = problemContext
            ? `Problem Context:\n\n${problemContext}`
            : 'Problem Context:\n\nNo structured problem statement was extracted from the page.';

        switch (promptType) {
            case 'complexityOnly':
                return `Analyze the following code.
Return ONLY the Time Complexity in Big O notation, then on a NEW LINE, return ONLY the Space Complexity in Big O notation.
Also include the Recursion Stack Space Complexity if applicable (e.g., "Stack Space: O(...)").
Do NOT include "Time Complexity:", "Space Complexity:", or any other text, labels, or markdown.
Code:\n\n${code}`;
            case 'explainComplexity':
                return `Analyze and explain the Time Complexity and Space Complexity of the following code. Provide the Big O notation for both Time and Space. Then, give a step-by-step explanation for how you arrived at these complexities. Format the explanation clearly using Markdown.\nCode:\n\n${code}`;
            case 'feedback':
                return `Review the following code for quality. Suggest improvements regarding readability, efficiency, potential bugs, and best practices. Be specific and provide examples if possible. Format the response using Markdown.\nCode:\n\n${code}`;
            case 'extraTestCases':
                return `Using the problem context below, generate additional test cases for this coding problem.

Requirements:
- Use the same style as the platform question.
- Prefer edge cases, boundary cases, tricky corner cases, and one or two normal sanity cases.
- If the problem uses input/output formatting, preserve that exact formatting.
- For each extra test case, provide a short one-line reason why it is useful.
- Do not provide code.
- Format the answer clearly in Markdown.

${contextSection}

${codeSection}`;
            case 'alternateApproaches':
                return `Using the problem context and current code below, provide alternate approaches from worst to better.

Requirements:
- Give only a concise overview of each approach.
- Order them from brute force or weaker approach toward the better or optimal approach.
- For each approach, mention the key idea and expected time/space complexity.
- Do not provide a full implementation unless absolutely necessary.
- Format the answer clearly in Markdown.

${contextSection}

${codeSection}`;
            case 'hints':
                return `Act like an interviewer helping a candidate who is stuck.

Using the problem context and current code below, provide only hints that help the candidate move forward.

Requirements:
- Do not reveal the full solution.
- Give progressive hints: start subtle, then get slightly more direct.
- Focus on the key observation, useful decomposition, data structure choices, and edge cases.
- If the current code suggests a likely mistake or missing idea, hint at it without rewriting the full answer.
- Format the answer clearly in Markdown.

${contextSection}

${codeSection}`;
            default:
                return '';
        }
    }

    async function callGeminiApi(code, problemContext, promptType) {
        if (!geminiApiKey) {
            resultsEl.innerHTML = 'Gemini API Key is not set. Please set it in the extension options.';
            resultsEl.className = 'result-content error';
            resultsEl.style.display = 'block';
            complexityDirectOutputEl.style.display = 'none';
            return;
        }

        const needsProblemContext = ['extraTestCases', 'alternateApproaches', 'hints'].includes(promptType);
        if (needsProblemContext && !problemContext) {
            resultsEl.innerHTML = `
                <p>Problem context could not be extracted from the current page.</p>
                <p>Open the problem page with the full statement, constraints, and examples visible, then click <strong>Refresh Preview</strong>.</p>
            `;
            resultsEl.className = 'result-content error';
            resultsEl.style.display = 'block';
            complexityDirectOutputEl.style.display = 'none';
            return;
        }

        if (!code || code.trim() === "") {
            resultsEl.innerHTML = `
                <p>Open a webpage that contains code, then click this extension's icon.</p>
                <p>The extension will extract code directly from the page DOM and analyze it.</p>
                <br>
                <p class="supported-sites-info">Works perfectly on platforms like LeetCode, GFG (GeeksforGeeks), CodeChef, Codeforces, etc.</p>
                <p style="color: red; font-weight: bold; margin-top: 10px;">No valid code block was found in the page DOM for analysis.</p>
            `;
            resultsEl.className = 'result-content';
            resultsEl.style.display = 'block';
            complexityDirectOutputEl.style.display = 'none';
            return;
        }
        
        // Prepare UI for loading
        timeComplexityValueEl.textContent = '';
        spaceComplexityValueEl.textContent = '';
        resultsEl.innerHTML = 'Analyzing...'; 
        resultsEl.className = 'result-content loading';
        resultsEl.style.display = 'block';
        complexityDirectOutputEl.style.display = 'none';

        const prompt = buildPrompt(code, problemContext, promptType);
        if (!prompt) {
            resultsEl.innerHTML = 'Invalid analysis type.';
            resultsEl.className = 'result-content error';
            resultsEl.style.display = 'block';
            return;
        }

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${geminiApiKey}`;
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                resultsEl.innerHTML = `Error from Gemini API (${GEMINI_MODEL}): ${errorData.error?.message || response.statusText}`;
                resultsEl.className = 'result-content error';
                resultsEl.style.display = 'block';
                return;
            }

            const data = await response.json();
            resultsEl.className = 'result-content'; // Reset class from loading/error

            if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                let rawText = data.candidates[0].content.parts[0].text.trim();
                if (promptType === 'complexityOnly') {
                    const lines = rawText.split('\n');
                    timeComplexityValueEl.textContent = lines[0] ? lines[0].trim() : "N/A";
                    spaceComplexityValueEl.textContent = lines[1] ? lines[1].trim() : "N/A";
                    if (lines.length > 2) { // If a third line exists (e.g. for stack space)
                       spaceComplexityValueEl.textContent += ` (${lines[2].trim()})`;
                    }
                    complexityDirectOutputEl.style.display = 'block';
                    resultsEl.style.display = 'none'; 
                } else {
                    resultsEl.innerHTML = marked.parse(rawText);
                    resultsEl.style.display = 'block';
                    complexityDirectOutputEl.style.display = 'none';
                }
            } else if (data.promptFeedback && data.promptFeedback.blockReason) {
                resultsEl.innerHTML = `Blocked by API: ${data.promptFeedback.blockReason.reason || 'Unknown'}. ${data.promptFeedback.blockReason.message || ''}`;
                resultsEl.className = 'result-content error';
                resultsEl.style.display = 'block';
            } else {
                resultsEl.innerHTML = 'Could not parse response from Gemini API. Unexpected structure.';
                resultsEl.className = 'result-content error';
                resultsEl.style.display = 'block';
            }
        } catch (error) {
            resultsEl.innerHTML = `Failed to connect to Gemini API: ${error.message}`;
            resultsEl.className = 'result-content error';
            resultsEl.style.display = 'block';
        }
    }

    getComplexityOnlyButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, getProblemContextForAnalysis(), 'complexityOnly');
    });
    explainComplexityButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, getProblemContextForAnalysis(), 'explainComplexity');
    });
    getCodeFeedbackButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, getProblemContextForAnalysis(), 'feedback');
    });
    getExtraTestCasesButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, getProblemContextForAnalysis(), 'extraTestCases');
    });
    getAlternateApproachesButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, getProblemContextForAnalysis(), 'alternateApproaches');
    });
    getHintsButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, getProblemContextForAnalysis(), 'hints');
    });

    refreshUIStates(); 
});
