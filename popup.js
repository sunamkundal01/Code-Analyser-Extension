
document.addEventListener('DOMContentLoaded', () => {
    // Apply saved theme immediately to prevent flash
    chrome.storage.local.get(['theme'], (result) => {
        document.documentElement.setAttribute('data-theme', result.theme || 'dark');
    });

    const DEFAULT_MODEL = 'gemini-2.5-flash';
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
    const resultsEl = document.getElementById('results');

    const tcGraphCanvas = document.getElementById('tcGraph');
    const scGraphCanvas = document.getElementById('scGraph');
    const tcGraphLabel = document.getElementById('tcGraphLabel');
    const scGraphLabel = document.getElementById('scGraphLabel');
    const copyResultsButton = document.getElementById('copyResults');
    const copyComplexityButton = document.getElementById('copyComplexity');
    const analysisAnimationEl = document.getElementById('analysisAnimation');
    const analysisStatusTextEl = document.getElementById('analysisStatusText');
    const animCodeBody = document.getElementById('animCodeBody');

    // Manual code input elements
    const toggleManualCodeButton = document.getElementById('toggleManualCode');
    const clearManualCodeButton = document.getElementById('clearManualCode');
    const manualCodeInput = document.getElementById('manualCodeInput');

    const themeToggleButton = document.getElementById('themeToggle');
    const settingsButton = document.getElementById('settingsButton');
    const allActionButtons = document.querySelectorAll('.action-button');

    let geminiApiKey = null;
    let geminiModel = DEFAULT_MODEL;
    let currentCodeFromDom = "";
    let currentProblemContext = "";
    let isApiKeyEditorVisible = false;
    let isExtractedCodeVisible = false;
    let isManualCodeVisible = false;
    let isAnalyzing = false;
    let lastPromptType = null;
    let lastCode = null;
    let lastProblemCtx = null;
    const MIN_CODE_LENGTH = 10;
    const MIN_CONTEXT_LENGTH = 40;

    const ANALYSIS_STATUS_MESSAGES = [
        "Analyzing your code...",
        "Parsing code structure...",
        "Evaluating complexity...",
        "Checking patterns...",
        "Almost there...",
    ];

    // ─── Complexity Graph Drawing ───
    const COMPLEXITY_ORDER = [
        { label: 'O(1)',       fn: () => 1 },
        { label: 'O(log n)',   fn: (n) => Math.log2(Math.max(n, 1)) },
        { label: 'O(n)',       fn: (n) => n },
        { label: 'O(n log n)', fn: (n) => n * Math.log2(Math.max(n, 1)) },
        { label: 'O(n²)',      fn: (n) => n * n },
        { label: 'O(n³)',      fn: (n) => n * n * n },
        { label: 'O(2ⁿ)',      fn: (n) => Math.pow(2, n) },
        { label: 'O(n!)',      fn: (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; } },
    ];

    function parseComplexity(text) {
        if (!text) return null;
        const s = text.toLowerCase().replace(/\s+/g, '').replace(/\u00b2/g, '²').replace(/\u00b3/g, '³');
        if (s.includes('o(1)') || s.includes('o(constant)')) return 'O(1)';
        if (s.includes('o(logn)') || s.includes('o(log(n))')) return 'O(log n)';
        if (s.includes('o(nlogn)') || s.includes('o(nlog(n))') || s.includes('o(n*logn)')) return 'O(n log n)';
        if (s.includes('o(n³)') || s.includes('o(n^3)')) return 'O(n³)';
        if (s.includes('o(n²)') || s.includes('o(n^2)')) return 'O(n²)';
        if (s.includes('o(2^n)') || s.includes('o(2ⁿ)') || s.includes('o(2n)')) return 'O(2ⁿ)';
        if (s.includes('o(n!)')) return 'O(n!)';
        if (s.includes('o(n)')) return 'O(n)';
        if (/o\([a-z]\*[a-z]\)/.test(s)) return 'O(n)';
        return null;
    }

    function drawComplexityGraph(canvas, highlightLabel, accentColor) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const W = rect.width || 280;
        const H = rect.height || 160;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const pad = { top: 12, right: 12, bottom: 28, left: 36 };
        const gw = W - pad.left - pad.right;
        const gh = H - pad.top - pad.bottom;

        ctx.clearRect(0, 0, W, H);

        const highlightIdx = COMPLEXITY_ORDER.findIndex(c => c.label === highlightLabel);
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';

        ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = pad.top + (gh / 4) * i;
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(pad.left + gw, y);
            ctx.stroke();
        }

        const nMax = 12;
        const nPoints = 50;

        const capIdx = Math.min(highlightIdx + 2, COMPLEXITY_ORDER.length - 1);
        const visibleComplexities = COMPLEXITY_ORDER.slice(0, Math.max(capIdx + 1, 4));

        let rawMax = 0;
        visibleComplexities.forEach(c => {
            const val = c.fn(nMax);
            if (isFinite(val) && val > rawMax) rawMax = val;
        });
        if (rawMax === 0) rawMax = 1;
        const logMax = Math.log(rawMax + 1);

        function toY(val) {
            if (!isFinite(val) || val < 0) val = rawMax;
            val = Math.min(val, rawMax);
            return pad.top + gh - (Math.log(val + 1) / logMax) * gh;
        }

        const labelPositions = [];
        visibleComplexities.forEach((c) => {
            const isHighlight = highlightIdx >= 0 && c.label === highlightLabel;
            ctx.beginPath();
            ctx.lineWidth = isHighlight ? 2.5 : 1.2;
            ctx.strokeStyle = isHighlight ? accentColor : (isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)');

            if (isHighlight) {
                ctx.shadowColor = accentColor;
                ctx.shadowBlur = 8;
            } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }

            for (let i = 0; i <= nPoints; i++) {
                const n = (i / nPoints) * nMax;
                const val = c.fn(n);
                const x = pad.left + (i / nPoints) * gw;
                const y = toY(val);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;

            let ly = toY(c.fn(nMax)) - 3;
            ly = Math.max(ly, pad.top + 8);
            const minGap = 11;
            for (const prev of labelPositions) {
                if (Math.abs(ly - prev) < minGap) {
                    ly = prev - minGap;
                }
            }
            ly = Math.max(ly, pad.top + 4);
            labelPositions.push(ly);

            ctx.font = `${isHighlight ? '600' : '400'} ${isHighlight ? '9px' : '8px'} Inter, sans-serif`;
            ctx.fillStyle = isHighlight ? accentColor : (isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)');
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText(c.label, pad.left + gw - 2, ly);
        });

        if (highlightIdx >= 0) {
            const c = COMPLEXITY_ORDER[highlightIdx];
            ctx.beginPath();
            for (let i = 0; i <= nPoints; i++) {
                const n = (i / nPoints) * nMax;
                const x = pad.left + (i / nPoints) * gw;
                const y = toY(c.fn(n));
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.lineTo(pad.left + gw, pad.top + gh);
            ctx.lineTo(pad.left, pad.top + gh);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + gh);
            grad.addColorStop(0, accentColor.replace(')', ', 0.15)').replace('rgb', 'rgba'));
            grad.addColorStop(1, accentColor.replace(')', ', 0.02)').replace('rgb', 'rgba'));
            ctx.fillStyle = grad;
            ctx.fill();
        }

        ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, pad.top);
        ctx.lineTo(pad.left, pad.top + gh);
        ctx.lineTo(pad.left + gw, pad.top + gh);
        ctx.stroke();

        ctx.fillStyle = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.3)';
        ctx.font = '400 8px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('Input Size (n)', pad.left + gw / 2, pad.top + gh + 14);

        ctx.save();
        ctx.translate(10, pad.top + gh / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Operations', 0, 0);
        ctx.restore();

        const ratingColors = ['#34d399', '#34d399', '#60a5fa', '#fb923c', '#f87171', '#f87171', '#ef4444', '#ef4444'];
        if (highlightIdx >= 0) {
            const barY = pad.top + gh + 4;
            const barH = 3;
            const segW = gw / COMPLEXITY_ORDER.length;
            COMPLEXITY_ORDER.forEach((_, i) => {
                ctx.fillStyle = i === highlightIdx
                    ? ratingColors[i]
                    : (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)');
                const rx = pad.left + i * segW + 1;
                ctx.fillRect(rx, barY, segW - 2, barH);
            });
        }
    }

    function renderComplexityGraphs(tcText, scText) {
        try {
            const tc = parseComplexity(tcText);
            const sc = parseComplexity(scText);

            tcGraphLabel.textContent = tc || tcText || '—';
            scGraphLabel.textContent = sc || scText || '—';

            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            const blueAccent = isLight ? 'rgb(37, 99, 235)' : 'rgb(96, 165, 250)';
            const greenAccent = isLight ? 'rgb(5, 150, 105)' : 'rgb(52, 211, 153)';
            drawComplexityGraph(tcGraphCanvas, tc, blueAccent);
            drawComplexityGraph(scGraphCanvas, sc, greenAccent);
        } catch (e) {
            console.error("[Popup] Error rendering complexity graphs:", e);
        }
    }

    // ─── Analysis Animation ───
    let statusRotationInterval = null;

    // Basic syntax highlight keywords for the animation
    const HIGHLIGHT_KEYWORDS = new Set([
        'function','def','class','return','if','else','elif','for','while',
        'switch','case','try','catch','finally','const','let','var','public',
        'private','static','void','async','await','import','from','new',
        'int','float','double','char','string','bool','boolean','long',
        'struct','enum','interface','extends','implements','throw','throws',
        'break','continue','do','in','of','with','yield','lambda','pass',
        'self','this','null','None','true','false','True','False','println',
        'printf','cout','cin','include','using','namespace','template','typedef'
    ]);

    function highlightCodeLine(text) {
        // Escape HTML
        const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        // Highlight keywords, strings, numbers, and comments
        return escaped
            .replace(/(\/\/.*$|#.*$)/gm, '<span class="anim-comment">$1</span>')
            .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span class="anim-str">$1</span>')
            .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="anim-num">$1</span>')
            .replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="anim-fn">$1</span>')
            .replace(new RegExp('\\b(' + Array.from(HIGHLIGHT_KEYWORDS).join('|') + ')\\b', 'g'), '<span class="anim-kw">$1</span>');
    }

    function buildAnimCodeLines(code) {
        const MAX_LINES = 7;
        const lines = (code || '').split('\n').slice(0, MAX_LINES);
        // Remove existing code lines (keep the scan-line)
        const scanLine = animCodeBody.querySelector('.anim-scan-line');
        animCodeBody.innerHTML = '';

        lines.forEach((line, i) => {
            const div = document.createElement('div');
            div.className = 'anim-line';
            div.style.setProperty('--i', i);
            const ln = `<span class="anim-ln">${i + 1}</span>`;
            div.innerHTML = ln + highlightCodeLine(line);
            animCodeBody.appendChild(div);
        });

        // Re-add scan line
        const newScan = document.createElement('div');
        newScan.className = 'anim-scan-line';
        animCodeBody.appendChild(newScan);
    }

    function showAnalysisAnimation(promptType, code) {
        const labels = {
            complexityOnly: "Calculating complexity...",
            explainComplexity: "Analyzing complexity in detail...",
            feedback: "Reviewing code quality...",
            extraTestCases: "Generating test cases...",
            alternateApproaches: "Finding alternate approaches...",
            hints: "Preparing hints...",
        };
        analysisStatusTextEl.textContent = labels[promptType] || "Analyzing your code...";
        buildAnimCodeLines(code);
        // Override the inline !important to show
        analysisAnimationEl.style.cssText = 'display: flex;';
        resultsEl.style.display = 'none';
        complexityDirectOutputEl.style.display = 'none';
        copyResultsButton.style.display = 'none';

        // Rotate status messages
        let msgIndex = 0;
        clearInterval(statusRotationInterval);
        statusRotationInterval = setInterval(() => {
            msgIndex = (msgIndex + 1) % ANALYSIS_STATUS_MESSAGES.length;
            analysisStatusTextEl.textContent = ANALYSIS_STATUS_MESSAGES[msgIndex];
        }, 3000);
    }

    function hideAnalysisAnimation() {
        analysisAnimationEl.style.cssText = 'display: none !important;';
        clearInterval(statusRotationInterval);
    }

    // ─── Button State Management ───
    function setAnalyzingState(activeButton) {
        isAnalyzing = true;
        allActionButtons.forEach(btn => {
            btn.disabled = true;
            btn.classList.remove('is-active');
        });
        if (activeButton) {
            activeButton.classList.add('is-active');
        }
    }

    function clearAnalyzingState() {
        isAnalyzing = false;
        const hasApiKey = !!geminiApiKey;
        allActionButtons.forEach(btn => {
            btn.disabled = !hasApiKey;
            btn.classList.remove('is-active');
        });
    }

    function refreshUIStates() {
        const hasApiKey = !!geminiApiKey;
        if (!isAnalyzing) {
            allActionButtons.forEach(btn => {
                btn.disabled = !hasApiKey;
            });
        }
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
        manualCodeInput.classList.toggle('is-collapsed', !isManualCodeVisible);
        toggleManualCodeButton.textContent = isManualCodeVisible ? 'Hide' : 'Paste Code';
        clearManualCodeButton.style.display = isManualCodeVisible ? 'inline-block' : 'none';
    }

    // Initial state
    resultsEl.style.display = 'block';
    complexityDirectOutputEl.style.display = 'none';

    chrome.storage.local.get(['geminiApiKey', 'geminiModel'], (result) => {
        if (result.geminiApiKey) {
            geminiApiKey = result.geminiApiKey;
            console.log("[Popup] API Key loaded.");
        } else {
            console.log("[Popup] API Key not found in storage.");
        }
        if (result.geminiModel) {
            geminiModel = result.geminiModel;
            console.log("[Popup] Model loaded:", geminiModel);
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

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.action === "updateExtractedCode") {
            console.log("[Popup] Received updated extracted code from page (first 100 chars):", message.text.substring(0, 100));
            currentCodeFromDom = message.text;
            currentProblemContext = message.problemContext || currentProblemContext;
            updateExtractedCodePreview(currentCodeFromDom);
            sendResponse({status: "Popup updated page DOM code"});
            return true;
        }
        // Handle context menu trigger from background
        if (message.action === "analyzeFromContextMenu") {
            const code = message.text || "";
            if (code.trim()) {
                manualCodeInput.value = code;
                callGeminiApi(code, getProblemContextForAnalysis(), 'explainComplexity', explainComplexityButton);
            }
            sendResponse({status: "ok"});
            return true;
        }
    });

    toggleExtractedCodeButton.addEventListener('click', () => {
        isExtractedCodeVisible = !isExtractedCodeVisible;
        refreshUIStates();
    });

    toggleManualCodeButton.addEventListener('click', () => {
        isManualCodeVisible = !isManualCodeVisible;
        refreshUIStates();
        if (isManualCodeVisible) {
            manualCodeInput.focus();
        }
    });

    clearManualCodeButton.addEventListener('click', () => {
        manualCodeInput.value = '';
        manualCodeInput.focus();
    });

    // ─── Theme Toggle ───
    settingsButton.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    themeToggleButton.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        chrome.storage.local.set({ theme: next });
        // Re-render complexity graphs if visible
        if (complexityDirectOutputEl.style.display !== 'none') {
            const tc = timeComplexityValueEl.textContent;
            const sc = spaceComplexityValueEl.textContent;
            if (tc || sc) renderComplexityGraphs(tc, sc);
        }
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
        if (!/^[A-Za-z0-9_-]{20,}$/.test(nextApiKey)) {
            showApiKeyEditorStatus('Invalid API key format.', 'error');
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

    // ─── Copy Handlers ───
    function handleCopy(button, textGetter) {
        const text = textGetter();
        if (!text.trim()) return;
        navigator.clipboard.writeText(text).then(() => {
            button.textContent = 'Copied!';
            button.classList.add('copied');
            setTimeout(() => {
                button.textContent = 'Copy';
                button.classList.remove('copied');
            }, 1500);
        }).catch(e => console.error("[Popup] Copy failed:", e));
    }

    copyResultsButton.addEventListener('click', () => {
        handleCopy(copyResultsButton, () => resultsEl.innerText || resultsEl.textContent || '');
    });

    copyComplexityButton.addEventListener('click', () => {
        handleCopy(copyComplexityButton, () => {
            const tc = timeComplexityValueEl.textContent || 'N/A';
            const sc = spaceComplexityValueEl.textContent || 'N/A';
            return `Time Complexity: ${tc}\nSpace Complexity: ${sc}`;
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
            extractedCodePreviewEl.textContent = 'No code extracted from the live page DOM yet. Use "Paste Code" to input manually.';
        }
    }

    function showApiKeyEditorStatus(message, type) {
        apiKeyEditorStatusEl.textContent = message;
        apiKeyEditorStatusEl.className = `api-key-editor-status ${type || ''}`.trim();
    }

    function isLikelyCode(text) {
        const trimmed = (text || "").trim();
        if (!trimmed) return false;

        if (NON_CODE_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;

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
        // Prefer manual input if provided
        const manualCode = (manualCodeInput.value || "").trim();
        if (manualCode.length >= MIN_CODE_LENGTH && isLikelyCode(manualCode)) {
            console.log(`[Popup] Using manually pasted code (${manualCode.length} chars).`);
            return manualCode;
        }

        let codeToAnalyze = (await refreshCodeFromPageDom() || currentCodeFromDom || "").trim();

        if (!isLikelyCode(codeToAnalyze) || codeToAnalyze.length < MIN_CODE_LENGTH) {
            console.log(`[Popup] No valid code extracted from DOM (${codeToAnalyze.length} chars).`);
            codeToAnalyze = "";
        } else {
            console.log(`[Popup] Using code extracted from page DOM (${codeToAnalyze.length} chars).`);
        }
        return codeToAnalyze;
    }

    function getProblemContextForAnalysis() {
        const context = (currentProblemContext || '').trim();
        if (context.length >= MIN_CONTEXT_LENGTH) return context;
        return '';
    }

    function buildPrompt(code, problemContext, promptType) {
        const codeSection = code ? `Current Code:\n\n${code}` : 'Current Code:\n\nNo code was extracted.';
        const contextSection = problemContext
            ? `Problem Context:\n\n${problemContext}`
            : 'Problem Context:\n\nNo structured problem statement was extracted from the page.';

        const FORMAT_RULES = `
Formatting rules (STRICTLY follow):
- Be concise. No filler text, no long paragraphs.
- Use bullet points for every piece of information.
- Use bold (**text**) for key terms and values.
- Use inline code (\`code\`) for variable names, functions, and expressions.
- Keep each bullet to 1-2 lines max.
- Use Markdown headings (##, ###) to separate sections.`;

        switch (promptType) {
            case 'complexityOnly':
                return `Analyze the following code.
Return ONLY the Time Complexity in Big O notation, then on a NEW LINE, return ONLY the Space Complexity in Big O notation.
Also include the Recursion Stack Space Complexity if applicable (e.g., "Stack Space: O(...)").
Do NOT include "Time Complexity:", "Space Complexity:", or any other text, labels, or markdown.
Code:\n\n${code}`;
            case 'explainComplexity':
                return `Analyze the Time and Space Complexity of this code.
${FORMAT_RULES}

Structure your response as:
## Complexity
- **Time:** O(...) — one-line reason
- **Space:** O(...) — one-line reason
- **Stack Space:** O(...) (only if recursion is used)

## Breakdown
- Bullet each loop/recursion/data structure and its contribution to complexity.
- No more than 5-6 bullets total.

Code:\n\n${code}`;
            case 'feedback':
                return `You are an experienced interviewer reviewing a candidate's code. Evaluate it for quality as it would appear in a coding interview.
${FORMAT_RULES}

Structure your response EXACTLY as follows:

## Code Quality Score: X/10

(Replace X with a score from 1-10 based on these interview criteria:
- **Clarity & Readability** — clean variable names, logical structure, easy to follow
- **Correctness** — handles edge cases, no bugs
- **Efficiency** — optimal or near-optimal approach
- **Code Style** — consistent formatting, proper indentation, no unnecessary code
- **Best Practices** — idiomatic patterns, no anti-patterns, proper use of language features)

Show a one-line breakdown: e.g. "Clarity: 8 | Correctness: 9 | Efficiency: 7 | Style: 8 | Best Practices: 7"

## Verdict
- If the code scores 8 or above: Start with a genuine appreciation like "Great job! This is clean, well-structured code." and highlight what the candidate did well.
- If the code scores 5-7: Acknowledge the working solution but point out key areas to improve.
- If the code scores below 5: Be constructive — note what works and what needs significant improvement.

## Issues (if any)
- Bullet each problem: what's wrong and a one-line fix.
- Skip this section entirely if there are no issues.

## Improvements (if any)
- Bullet each suggestion: what to improve and why (efficiency, readability, best practice).
- Skip this section entirely if the code is already excellent.

Keep it to 4-6 bullets total across Issues and Improvements. No generic advice. Only mention what applies to this specific code.

Code:\n\n${code}`;
            case 'extraTestCases':
                return `Generate exactly 3 extra test cases for this problem at three difficulty levels: Easy, Medium, and Hard.

CRITICAL — MATCH THE PROBLEM'S EXACT INPUT/OUTPUT FORMAT:
1. First, carefully study the "Sample Input" and "Sample Output" sections from the problem statement below.
2. Your generated test cases MUST follow the EXACT SAME format — same number of lines, same ordering of values (e.g., if the problem gives T, then N, then the array on separate lines, you must do the same).
3. Do NOT invent your own format. Do NOT use variable names like "ARR = [...]" or "grid = [...]" — just raw values line by line, exactly as the problem's sample input/output shows.
4. Include ALL required fields (like T, N, array values, etc.) — do not skip any.

You MUST format each test case EXACTLY like this Markdown template:

---

### Test Case 1 — Easy — *(short reason)*

**Input:**
\`\`\`
(raw input here, matching the problem's Sample Input format exactly)
\`\`\`

**Output:**
\`\`\`
(raw output here, matching the problem's Sample Output format exactly)
\`\`\`

**Explanation:**
- Brief step-by-step (2-3 bullets max)

---

### Test Case 2 — Medium — *(short reason)*

(same structure)

---

### Test Case 3 — Hard — *(short reason)*

(same structure)

---

Rules:
- Exactly 3 test cases. No more, no less.
- Easy: simple/small input, base case, or minimal valid input.
- Medium: moderate size, includes edge cases like duplicates, negatives, or mixed values.
- Hard: larger input, worst-case performance, boundary limits, or tricky corner cases.
- The input/output format must be IDENTICAL to the problem's own sample input/output — copy the structure line-for-line.
- Keep explanations short: 2-3 bullet points max per test case.
- No code solutions. No extra commentary outside the template.
- Separate each test case with a horizontal rule (---).

${contextSection}

${codeSection}`;
            case 'alternateApproaches':
                return `List alternate approaches for this problem, ordered from brute force to optimal.
${FORMAT_RULES}

Structure each approach as:
### Approach N: Name
- **Idea:** one-line key insight
- **Time:** O(...) | **Space:** O(...)
- **Trade-off:** one-line pro/con (optional, only if notable)

Requirements:
- 3-4 approaches max.
- No full implementations. Pseudocode only if absolutely necessary (max 3 lines).
- Highlight which approach the current code uses.

${contextSection}

${codeSection}`;
            case 'hints':
                return `You are a strict technical interviewer. Your job is to evaluate the candidate's code and either congratulate them or give hints — never give the solution.

${contextSection}

${codeSection}

Instructions:
1. First, silently evaluate: does the current code correctly and completely solve the problem?
   - Consider correctness, edge cases, and whether it would pass all test cases.

2. If the code is CORRECT and complete:
   - Respond ONLY with a short congratulatory message like: "Your code looks correct! Great job solving this problem."
   - Do NOT add hints, suggestions, or improvements.

3. If the code is INCORRECT, INCOMPLETE, or the candidate is clearly stuck:
   - Give ONLY bullet-point hints like a real interviewer would.
   - NEVER write or suggest actual code.
   - NEVER reveal the full solution or algorithm directly.
   - Structure hints from subtle to more direct:

### Hint 1
- (A subtle nudge — point toward the key observation or what they might be missing conceptually)

### Hint 2
- (More direct — hint at the right data structure, technique, or approach to use)

### Hint 3
- (Almost there — hint at the specific step or fix needed, without writing the code)

Rules:
- Hints in bullet points only. No paragraphs.
- Max 1 bullet per hint.
- Never write code. Never give the answer outright.`;
            default:
                return '';
        }
    }

    function scrollToResults() {
        const target = complexityDirectOutputEl.style.display !== 'none'
            ? complexityDirectOutputEl
            : resultsEl;
        setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    }

    function showErrorWithRetry(message) {
        resultsEl.innerHTML = `
            <p>${message}</p>
            <button class="retry-button" id="retryButton" type="button">Retry Analysis</button>
        `;
        resultsEl.className = 'result-content error fade-in';
        resultsEl.style.display = 'block';
        complexityDirectOutputEl.style.display = 'none';

        const retryBtn = document.getElementById('retryButton');
        if (retryBtn && lastPromptType && lastCode !== null) {
            retryBtn.addEventListener('click', () => {
                const activeBtn = document.querySelector(`.action-button[data-action="${lastPromptType}"]`);
                callGeminiApi(lastCode, lastProblemCtx, lastPromptType, activeBtn);
            });
        }
    }

    async function callGeminiApi(code, problemContext, promptType, activeButton) {
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
                <p>No valid code block was found for analysis.</p>
                <p>Try using <strong>Paste Code</strong> to input your code manually, or open a coding platform and click <strong>Refresh Preview</strong>.</p>
            `;
            resultsEl.className = 'result-content error';
            resultsEl.style.display = 'block';
            complexityDirectOutputEl.style.display = 'none';
            return;
        }

        // Save for retry
        lastPromptType = promptType;
        lastCode = code;
        lastProblemCtx = problemContext;

        // Prepare UI for loading
        setAnalyzingState(activeButton);
        showAnalysisAnimation(promptType, code);
        timeComplexityValueEl.textContent = '';
        spaceComplexityValueEl.textContent = '';
        copyResultsButton.style.display = 'none';

        const prompt = buildPrompt(code, problemContext, promptType);
        if (!prompt) {
            hideAnalysisAnimation();
            clearAnalyzingState();
            resultsEl.innerHTML = 'Invalid analysis type.';
            resultsEl.className = 'result-content error';
            resultsEl.style.display = 'block';
            return;
        }

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': geminiApiKey
                },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            hideAnalysisAnimation();
            clearAnalyzingState();

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 429) {
                    showErrorWithRetry('API rate limit exceeded. Please wait a minute and try again.');
                } else {
                    showErrorWithRetry(`Error from Gemini API (${geminiModel}): ${errorData.error?.message || response.statusText}`);
                }
                return;
            }

            const data = await response.json();
            resultsEl.className = 'result-content fade-in';

            if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                let rawText = data.candidates[0].content.parts[0].text.trim();
                if (promptType === 'complexityOnly') {
                    const lines = rawText.split('\n');
                    const tcVal = lines[0] ? lines[0].trim() : "N/A";
                    let scVal = lines[1] ? lines[1].trim() : "N/A";
                    if (lines.length > 2) {
                       scVal += ` (${lines[2].trim()})`;
                    }
                    timeComplexityValueEl.textContent = tcVal;
                    spaceComplexityValueEl.textContent = scVal;
                    complexityDirectOutputEl.style.display = 'block';
                    complexityDirectOutputEl.classList.add('fade-in');
                    resultsEl.style.display = 'none';
                    renderComplexityGraphs(tcVal, scVal);
                } else {
                    resultsEl.innerHTML = marked.parse(rawText);
                    resultsEl.style.display = 'block';
                    complexityDirectOutputEl.style.display = 'none';
                    copyResultsButton.style.display = 'block';
                }
                scrollToResults();
            } else if (data.promptFeedback && data.promptFeedback.blockReason) {
                showErrorWithRetry(`Blocked by API: ${data.promptFeedback.blockReason.reason || 'Unknown'}. ${data.promptFeedback.blockReason.message || ''}`);
            } else {
                showErrorWithRetry('Could not parse response from Gemini API. Unexpected structure.');
            }
        } catch (error) {
            clearTimeout(timeout);
            hideAnalysisAnimation();
            clearAnalyzingState();
            if (error.name === 'AbortError') {
                showErrorWithRetry('Request timed out after 30 seconds. Check your connection and try again.');
            } else {
                showErrorWithRetry(`Failed to connect to Gemini API: ${error.message}`);
            }
        }
    }

    // ─── Action Button Handlers ───
    getComplexityOnlyButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, getProblemContextForAnalysis(), 'complexityOnly', getComplexityOnlyButton);
    });
    explainComplexityButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, getProblemContextForAnalysis(), 'explainComplexity', explainComplexityButton);
    });
    getCodeFeedbackButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, getProblemContextForAnalysis(), 'feedback', getCodeFeedbackButton);
    });
    getExtraTestCasesButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, getProblemContextForAnalysis(), 'extraTestCases', getExtraTestCasesButton);
    });
    getAlternateApproachesButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, getProblemContextForAnalysis(), 'alternateApproaches', getAlternateApproachesButton);
    });
    getHintsButton.addEventListener('click', async () => {
        const code = await getCodeForAnalysis();
        callGeminiApi(code, getProblemContextForAnalysis(), 'hints', getHintsButton);
    });

    refreshUIStates();
});
