document.addEventListener('DOMContentLoaded', () => {
    const getComplexityOnlyButton = document.getElementById('getComplexityOnly');
    const explainComplexityButton = document.getElementById('explainComplexity');
    const getCodeFeedbackButton = document.getElementById('getCodeFeedback');
    const closeButton = document.getElementById('closeButton');
    const apiKeyMessageDiv = document.getElementById('apiKeyMessage');

    const timeComplexityValueEl = document.getElementById('timeComplexityValue');
    const spaceComplexityValueEl = document.getElementById('spaceComplexityValue');
    const complexityDirectOutputEl = document.getElementById('complexityDirectOutput');
    const resultsEl = document.getElementById('results'); // This is your general results/instruction area

    let geminiApiKey = null;
    let currentSelectedCodeFromPage = ""; // Stores text from page selection
    const MIN_CODE_LENGTH_FOR_SELECTION = 10; // Threshold to consider page selection too short

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

    chrome.runtime.sendMessage({ action: "getSelectedText" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("[Popup] Error requesting selected text from page:", chrome.runtime.lastError.message);
            currentSelectedCodeFromPage = "";
        } else if (response && typeof response.text !== 'undefined') {
            console.log("[Popup] Received initial selected text from page (first 100 chars):", response.text.substring(0, 100));
            currentSelectedCodeFromPage = response.text;
        } else {
            console.error("[Popup] Invalid response when requesting selected text from page.");
            currentSelectedCodeFromPage = "";
        }
        // The initial instructional message from HTML will remain unless explicitly changed here.
        // You could update a small part of it if code IS selected, but for now, let's keep HTML as master for initial view.
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "updateSelectedText") {
            console.log("[Popup] Received updated selected text from page (first 100 chars):", message.text.substring(0, 100));
            currentSelectedCodeFromPage = message.text;
            // The HTML instructions will likely be overwritten if an analysis is triggered after this.
            // If no analysis is triggered, the user still sees the instructions.
            sendResponse({status: "Popup updated page-selected text"});
            return true;
        }
    });

    closeButton.addEventListener('click', () => {
        window.close();
    });

    async function getCodeForAnalysis() {
        let codeToAnalyze = (currentSelectedCodeFromPage || "").trim();
        let source = "page selection"; // For logging

        if (codeToAnalyze.length < MIN_CODE_LENGTH_FOR_SELECTION) {
            console.log(`[Popup] Page selection is short or empty (${codeToAnalyze.length} chars). Attempting to read from clipboard.`);
            source = "clipboard"; // Tentatively
            try {
                const clipboardText = await navigator.clipboard.readText();
                if (clipboardText && clipboardText.trim() !== "") {
                    console.log("[Popup] Successfully read from clipboard (first 100 chars):", clipboardText.substring(0,100));
                    codeToAnalyze = clipboardText.trim();
                    // Update UI to indicate clipboard is being used for THIS analysis
                    resultsEl.innerHTML = '<p>Using code from clipboard for this analysis...</p>';
                    resultsEl.className = 'result-content'; // Reset class
                    resultsEl.style.display = 'block';
                    complexityDirectOutputEl.style.display = 'none';
                } else {
                    console.log("[Popup] Clipboard is empty or contains only whitespace. Using page selection (if any).");
                    source = "page selection (after empty clipboard)";
                }
            } catch (err) {
                console.error('[Popup] Failed to read clipboard contents:', err);
                // Error message will be shown if analysis proceeds with no code.
                // Update UI to indicate clipboard read error
                resultsEl.innerHTML = `<p>Failed to read from clipboard. Using page selection if available. Error: ${err.message}</p>`;
                resultsEl.className = 'result-content error';
                resultsEl.style.display = 'block';
                complexityDirectOutputEl.style.display = 'none';
                source = "page selection (after clipboard error)";
            }
        } else {
            console.log(`[Popup] Using code selected from page (${codeToAnalyze.length} chars).`);
        }
        console.log(`[Popup] Code For Analysis (Source: ${source}, Length: ${codeToAnalyze.length}):\n<<<<<<\n${codeToAnalyze.substring(0,500)}\n>>>>>>`); // Log more for debugging
        return codeToAnalyze;
    }

    async function callGeminiApi(code, promptType) {
        if (!geminiApiKey) {
            resultsEl.innerHTML = 'Gemini API Key is not set. Please set it in the extension options.';
            resultsEl.className = 'result-content error';
            resultsEl.style.display = 'block';
            complexityDirectOutputEl.style.display = 'none';
            return;
        }

        if (!code || code.trim() === "") {
            // Display the original instructional message if no code is found after trying page & clipboard
            resultsEl.innerHTML = `
                <p>Select the code on any webpage, then copy it (Ctrl+C for Windows/Linux or Cmd+C for Mac).</p>
                <p>Next, click this extension's icon and choose the appropriate analysis option for your usage.</p>
                <br>
                <p class="supported-sites-info">Works perfectly on platforms like LeetCode, GFG (GeeksforGeeks), CodeChef, Codeforces, etc.</p>
                <p style="color: red; font-weight: bold; margin-top: 10px;">No code found from page selection or clipboard for analysis.</p>
            `;
            resultsEl.className = 'result-content'; // Not necessarily an error state, but an info state
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

        let prompt;
        switch (promptType) {
            case 'complexityOnly':
                prompt = `Analyze the following code.
Return ONLY the Time Complexity in Big O notation, then on a NEW LINE, return ONLY the Space Complexity in Big O notation.
Also include the Recursion Stack Space Complexity if applicable (e.g., "Stack Space: O(...)").
Do NOT include "Time Complexity:", "Space Complexity:", or any other text, labels, or markdown.
Code:\n\n${code}`;
                break;
            case 'explainComplexity':
                prompt = `Analyze and explain the Time Complexity and Space Complexity of the following code. Provide the Big O notation for both Time and Space. Then, give a step-by-step explanation for how you arrived at these complexities. Format the explanation clearly using Markdown.\nCode:\n\n${code}`;
                break;
            case 'feedback':
                prompt = `Review the following code for quality. Suggest improvements regarding readability, efficiency, potential bugs, and best practices. Be specific and provide examples if possible. Format the response using Markdown.\nCode:\n\n${code}`;
                break;
            default:
                resultsEl.innerHTML = 'Invalid analysis type.';
                resultsEl.className = 'result-content error';
                resultsEl.style.display = 'block';
                return;
        }

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                resultsEl.innerHTML = `Error from Gemini API: ${errorData.error?.message || response.statusText}`;
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
        callGeminiApi(code, 'complexityOnly');
    });
    explainComplexityButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, 'explainComplexity');
    });
    getCodeFeedbackButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, 'feedback');
    });

    refreshUIStates(); 
});
