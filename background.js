// background.js
let lastExtractedCode = "";
let lastSourceTabId = null;
let lastProblemContext = "";

// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("[Background] Error setting side panel behavior:", error));

// ─── Context Menu ───
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "analyzeSelection",
    title: "Analyze Selected Code",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "analyzeSelection" && info.selectionText) {
    // Open side panel first, then send the selected text
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (e) {
      // Side panel might already be open
    }
    // Small delay to let the side panel initialize
    setTimeout(() => {
      chrome.runtime.sendMessage({
        action: "analyzeFromContextMenu",
        text: info.selectionText
      }).catch(() => {});
    }, 500);
  }
});

async function getPageAnalysisData(preferredTabId = null) {
  try {
    let activeTab = null;

    if (preferredTabId) {
      activeTab = await chrome.tabs.get(preferredTabId);
    } else {
      const currentWindow = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
      if (!currentWindow) {
        console.log("[Background] No normal window found to get code from.");
        return { code: "", problemContext: "" };
      }
      [activeTab] = await chrome.tabs.query({ active: true, windowId: currentWindow.id });
    }

    console.log("[Background] activeTab:", activeTab?.id, "url:", activeTab?.url);

    const tabUrl = activeTab?.url || '';
    if (!activeTab || tabUrl.startsWith('chrome://') || tabUrl.startsWith('chrome-extension://') || tabUrl.startsWith('https://chrome.google.com/webstore')) {
      console.log("[Background] Active tab is not a webpage or no active tab found. URL:", tabUrl);
      return { code: "", problemContext: "" };
    }
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      world: 'MAIN',
      func: () => {
        function normalizeText(text) {
          return (text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r\n/g, '\n')
            .trim();
        }

        function normalizeLineText(text) {
          return (text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r\n/g, '\n')
            .replace(/\n/g, '');
        }

        function isLikelyCode(text) {
          const trimmed = normalizeText(text);
          if (!trimmed) {
            return false;
          }

          const codeSignals = [
            /\b(function|def|class|return|if|else|elif|for|while|switch|case|try|catch|finally|const|let|var|public|private|static|void|async|await|import|from)\b/,
            /[{}[\];]/,
            /=>/,
            /\b[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)/,
            /(\+=|-=|\*=|\/=|==|!=|<=|>=|&&|\|\||:=|[=<>+\-*/%])/,
            /^[ \t]*[#/]{1,2}.+/m
          ];

          const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
          const multiLine = lines.length >= 2;
          const hasSignal = codeSignals.some((pattern) => pattern.test(trimmed));
          const hasStructuredLines = lines.some((line) => /[;{}:]$/.test(line));

          return hasSignal || (multiLine && hasStructuredLines);
        }

        function scoreCandidate(text, bonus = 0) {
          let score = Math.min(text.length, 4000) + bonus;
          if (text.split('\n').length > 4) {
            score += 500;
          }
          return score;
        }

        function collapseBlankLines(text) {
          return normalizeText(text).replace(/\n{3,}/g, '\n\n');
        }

        function decodeHtmlEntities(text) {
          if (!text) {
            return '';
          }
          const textarea = document.createElement('textarea');
          textarea.innerHTML = text;
          return textarea.value;
        }

        function scoreContext(text) {
          let score = Math.min(text.length, 12000);
          const lowered = text.toLowerCase();
          if (/constraints?/.test(lowered)) {
            score += 1800;
          }
          if (/example|sample input|sample output|test case/.test(lowered)) {
            score += 1600;
          }
          if (/input format|output format/.test(lowered)) {
            score += 900;
          }
          return score;
        }

        function extractFromMonacoModels() {
          try {
            const monacoApi = window.monaco && window.monaco.editor;
            if (!monacoApi || typeof monacoApi.getModels !== 'function') {
              return [];
            }

            const models = monacoApi.getModels();
            return models.map((model) => {
              const value = typeof model.getValue === 'function' ? normalizeText(model.getValue()) : '';
              if (!isLikelyCode(value)) {
                return null;
              }

              let bonus = 6000;
              const uri = typeof model.uri?.toString === 'function' ? model.uri.toString() : '';
              if (uri.includes('model')) {
                bonus += 500;
              }
              if (uri.includes('/usr/src/codes/') || uri.includes('Solution.java')) {
                bonus += 1200;
              }
              if (uri.includes('file:///') || uri.includes('solution')) {
                bonus += 400;
              }

              return {
                text: value,
                score: scoreCandidate(value, bonus)
              };
            }).filter(Boolean);
          } catch (error) {
            return [];
          }
        }

        function extractFromAceEditors() {
          try {
            const editorRoots = Array.from(document.querySelectorAll('.ace_editor'));
            return editorRoots.map((root) => {
              let editor = root.env && root.env.editor;

              if (!editor && window.ace && typeof window.ace.edit === 'function') {
                try {
                  editor = window.ace.edit(root);
                } catch (error) {
                  editor = null;
                }
              }

              if (!editor && root.id && window.ace && typeof window.ace.edit === 'function') {
                try {
                  editor = window.ace.edit(root.id);
                } catch (error) {
                  editor = null;
                }
              }

              let value = '';
              if (editor && typeof editor.getValue === 'function') {
                value = normalizeText(editor.getValue());
              } else if (editor && typeof editor.getSession === 'function') {
                const session = editor.getSession();
                if (session && typeof session.getValue === 'function') {
                  value = normalizeText(session.getValue());
                } else if (session && session.doc && typeof session.doc.getAllLines === 'function') {
                  value = normalizeText(session.doc.getAllLines().join('\n'));
                }
              }

              if (!isLikelyCode(value)) {
                return null;
              }

              return {
                text: value,
                score: scoreCandidate(value, 5800)
              };
            }).filter(Boolean);
          } catch (error) {
            return [];
          }
        }

        function removeLeadingLineNumbers(text) {
          const lines = text.split('\n');
          let index = 1;
          let numericPrefixCount = 0;

          while (numericPrefixCount < lines.length && lines[numericPrefixCount].trim() === String(index)) {
            numericPrefixCount += 1;
            index += 1;
          }

          if (numericPrefixCount >= 3) {
            return normalizeText(lines.slice(numericPrefixCount).join('\n'));
          }

          return text;
        }

        function collectCandidates(root, options = {}) {
          const {
            respectVisibility = true,
            includeSelection = true
          } = options;

          const candidateSelectors = [
            'pre',
            'code',
            'pre code',
            '[class*="language-"]',
            '[class*="code"]',
            '[class*="CodeMirror"]',
            '[class*="monaco"]',
            '[class*="highlight"]',
            '[data-language]',
            '[data-lang]'
          ];

          function isVisible(element) {
            if (!respectVisibility || !element || !window.getComputedStyle) {
              return true;
            }
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return false;
            }
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }

          function getTextFromElement(element) {
            if (!element) {
              return '';
            }
            return normalizeText(element.innerText || element.textContent || '');
          }

          function extractLines(container, lineSelector) {
            if (!container) {
              return '';
            }

            const lines = Array.from(container.querySelectorAll(lineSelector))
              .map((line) => normalizeLineText(line.innerText || line.textContent || ''));

            return normalizeText(lines.join('\n'));
          }

          function extractMonacoCode() {
            const containers = Array.from(root.querySelectorAll('.monaco-editor .view-lines, .view-lines.monaco-mouse-cursor-text'));
            return containers.map((container) => {
              const code = extractLines(container, '.view-line');
              if (!isLikelyCode(code)) {
                return null;
              }
              let bonus = container.closest('.monaco-editor') ? 3500 : 2500;
              const monacoRoot = container.closest('.monaco-editor');
              const dataUri = monacoRoot?.getAttribute('data-uri') || '';
              if (dataUri.includes('/usr/src/codes/') || dataUri.includes('Solution.java')) {
                bonus += 1200;
              }
              if (container.closest('codingninjas-monaco-code-editor, ngx-monaco-editor, .code-editor-parent-container')) {
                bonus += 800;
              }
              if (container.closest('.hr-monaco-editor, .hr-monaco-editor-parent, .hr-monaco-base-editor, .hr-monaco-editor-wrapper')) {
                bonus += 900;
              }
              return { text: code, score: scoreCandidate(code, bonus) };
            }).filter(Boolean);
          }

          function extractCodeMirrorCode() {
            const containers = Array.from(root.querySelectorAll('.cm-editor, .CodeMirror'));
            return containers.map((container) => {
              const code = container.matches('.cm-editor')
                ? extractLines(container, '.cm-line')
                : extractLines(container, '.CodeMirror-line, .CodeMirror-code > div');
              if (!isLikelyCode(code)) {
                return null;
              }
              return { text: code, score: scoreCandidate(code, 2200) };
            }).filter(Boolean);
          }

          function extractAceCode() {
            const containers = Array.from(root.querySelectorAll('.ace_editor'));
            return containers.map((container) => {
              const code = extractLines(container, '.ace_line');
              if (!isLikelyCode(code)) {
                return null;
              }
              return { text: code, score: scoreCandidate(code, 2000) };
            }).filter(Boolean);
          }

          function findCodeContainer(node) {
            let current = node instanceof Element ? node : node?.parentElement;
            while (current) {
              if (
                current.matches?.('pre, code, pre code, [class*="language-"], [class*="code"], [class*="CodeMirror"], [class*="monaco"], [class*="highlight"], [data-language], [data-lang]')
              ) {
                return current;
              }
              current = current.parentElement;
            }
            return null;
          }

          const seen = new Set();
          const candidates = [];

          if (includeSelection && root === document) {
            const selection = window.getSelection();
            const selectedText = normalizeText(selection ? selection.toString() : '');
            const selectedContainer = selection && selection.rangeCount > 0
              ? findCodeContainer(selection.getRangeAt(0).commonAncestorContainer)
              : null;
            const selectedContainerText = getTextFromElement(selectedContainer);

            if (isLikelyCode(selectedContainerText)) {
              candidates.push({ text: selectedContainerText, score: scoreCandidate(selectedContainerText, 4000) });
              seen.add(selectedContainerText);
            }

            if (isLikelyCode(selectedText) && !seen.has(selectedText)) {
              candidates.push({ text: selectedText, score: scoreCandidate(selectedText, 3200) });
              seen.add(selectedText);
            }
          }

          [
            ...extractMonacoCode(),
            ...extractCodeMirrorCode(),
            ...extractAceCode()
          ].forEach((candidate) => {
            if (!candidate.text || seen.has(candidate.text)) {
              return;
            }
            seen.add(candidate.text);
            candidates.push(candidate);
          });

          candidateSelectors.forEach((selector) => {
            root.querySelectorAll(selector).forEach((element) => {
              if (!isVisible(element)) {
                return;
              }
              const text = removeLeadingLineNumbers(getTextFromElement(element));
              if (!isLikelyCode(text) || seen.has(text)) {
                return;
              }

              seen.add(text);

              let bonus = 0;
              if (element.matches('pre, pre code')) {
                bonus += 1200;
              }
              if (element.matches('[class*="monaco"], [class*="CodeMirror"]')) {
                bonus += 1000;
              }
              if (element.matches('[class*="language-"], [data-language], [data-lang]')) {
                bonus += 600;
              }

              candidates.push({ text, score: scoreCandidate(text, bonus) });
            });
          });

          candidates.sort((a, b) => b.score - a.score);
          return candidates;
        }

        function buildSectionText(title, elements) {
          const chunks = elements
            .map((element) => collapseBlankLines(element.innerText || element.textContent || ''))
            .filter(Boolean);

          if (!chunks.length) {
            return '';
          }

          return `${title}:\n${chunks.join('\n\n')}`;
        }

        function tryParseJson(value) {
          if (!value || typeof value !== 'string') {
            return null;
          }
          try {
            return JSON.parse(value);
          } catch (error) {
            return null;
          }
        }

        function extractLeetCodeQuestionData(root) {
          const scripts = Array.from(root.querySelectorAll('script'));

          for (const script of scripts) {
            const text = script.textContent || '';
            if (!text.includes('"question"') || !text.includes('"exampleTestcaseList"')) {
              continue;
            }

            const questionMatch = text.match(/"question"\s*:\s*(\{.*?"exampleTestcaseList"\s*:\s*\[[\s\S]*?\]\s*\})\s*,\s*"dataUpdateCount"/);
            if (!questionMatch) {
              continue;
            }

            const question = tryParseJson(questionMatch[1]);
            if (!question || !question.content) {
              continue;
            }

            const parser = new DOMParser();
            const contentDoc = parser.parseFromString(decodeHtmlEntities(question.content), 'text/html');
            const contentText = collapseBlankLines(contentDoc.body?.innerText || contentDoc.body?.textContent || '');
            const exampleTestcaseList = Array.isArray(question.exampleTestcaseList)
              ? question.exampleTestcaseList.map((item, index) => `Example Test Case ${index + 1}:\n${normalizeText(item)}`).join('\n\n')
              : '';
            const hints = Array.isArray(question.hints) && question.hints.length
              ? `Platform Hints:\n${question.hints.map((item, index) => `${index + 1}. ${normalizeText(item)}`).join('\n')}`
              : '';

            const sections = [
              question.title ? `Problem Title:\n${normalizeText(question.title)}` : '',
              contentText ? `Problem Description:\n${contentText}` : '',
              exampleTestcaseList ? `Example Test Cases:\n${exampleTestcaseList}` : '',
              hints
            ].filter(Boolean);

            const combined = collapseBlankLines(sections.join('\n\n'));
            if (combined) {
              return [{ text: combined, score: scoreContext(combined) + 5000 }];
            }
          }

          return [];
        }

        function collectProblemContext(root) {
          const leetCodeQuestionData = extractLeetCodeQuestionData(root);
          if (leetCodeQuestionData.length) {
            return leetCodeQuestionData;
          }

          const sections = [];
          const seen = new Set();
          const titleSelectors = [
            '[data-cy="question-title"]',
            '[class*="question-title"]',
            '.coding_desc_container h3',
            '.problem-statement h1',
            '.problem-statement h2',
            '.problem-title',
            '.challenge_problem_statement h1',
            '.challenge-name',
            'h1'
          ];
          const descriptionSelectors = [
            '[data-track-load="description_content"]',
            '[data-cy="question-content"]',
            '[class*="question-content"]',
            '[class*="description-content"]',
            '.elfjS',
            '.coding_desc_container',
            '.problem-statement',
            '.challenge_problem_statement',
            '.problem-description',
            '[class*="problem-statement"]',
            '[class*="problemStatement"]',
            'main'
          ];
          const constraintSelectors = [
            '[class*="constraint"]',
            '[id*="constraint"]',
            'section',
            'main'
          ];
          const exampleSelectors = [
            '.example-block',
            'strong.example',
            '[class*="example"]',
            '[id*="example"]',
            '[class*="sample"]',
            '[id*="sample"]',
            '.challenge_sample_input',
            '.challenge_sample_output',
            'pre'
          ];

          titleSelectors.forEach((selector) => {
            const element = root.querySelector(selector);
            const title = collapseBlankLines(element?.innerText || element?.textContent || '');
            if (title && title.length <= 200) {
              sections.push(`Problem Title:\n${title}`);
            }
          });

          function pushSection(title, selectors, matcher) {
            const items = [];
            selectors.forEach((selector) => {
              root.querySelectorAll(selector).forEach((element) => {
                const text = collapseBlankLines(element.innerText || element.textContent || '');
                if (!text || text.length < 20 || seen.has(text)) {
                  return;
                }
                if (matcher && !matcher(text, element)) {
                  return;
                }
                seen.add(text);
                items.push(element);
              });
            });

            const sectionText = buildSectionText(title, items);
            if (sectionText) {
              sections.push(sectionText);
            }
          }

          pushSection('Problem Description', descriptionSelectors, (text) => {
            const lowered = text.toLowerCase();
            if (text.length < 80) {
              return false;
            }
            return /example|constraint|input|output|given|return|task|problem/.test(lowered);
          });

          pushSection('Constraints', constraintSelectors, (text) => /constraint|1 <=|0 <=|n <=|time limit|memory limit/i.test(text));
          pushSection('Examples And Test Cases', exampleSelectors, (text) => /example|sample|input|output|explanation|test case/i.test(text));

          const context = collapseBlankLines(sections.join('\n\n'));
          return context ? [{ text: context, score: scoreContext(context) }] : [];
        }

        const monacoModelCandidates = extractFromMonacoModels();
        const aceEditorCandidates = extractFromAceEditors();
        const liveCandidates = collectCandidates(document, { respectVisibility: true, includeSelection: true });
        const parsedDoc = new DOMParser().parseFromString(document.documentElement.outerHTML, 'text/html');
        const snapshotCandidates = collectCandidates(parsedDoc, { respectVisibility: false, includeSelection: false });
        const liveProblemContexts = collectProblemContext(document);
        const snapshotProblemContexts = collectProblemContext(parsedDoc);
        const bestCandidate = monacoModelCandidates[0] || aceEditorCandidates[0] || liveCandidates[0] || snapshotCandidates[0] || null;
        const bestProblemContext = liveProblemContexts[0] || snapshotProblemContexts[0] || null;

        return {
          code: bestCandidate?.text || '',
          problemContext: bestProblemContext?.text || ''
        };
      },
    });
    if (injectionResults && injectionResults[0] && injectionResults[0].result) {
      return {
        code: injectionResults[0].result.code || "",
        problemContext: injectionResults[0].result.problemContext || ""
      };
    }
    return { code: "", problemContext: "" };
  } catch (e) {
    console.error("[Background] Error getting selected text in background:", e);
    return { code: "", problemContext: "" };
  }
}


// Notify the side panel with fresh code
function notifySidePanel() {
  chrome.runtime.sendMessage({
    action: "updateExtractedCode",
    text: lastExtractedCode,
    problemContext: lastProblemContext
  }).catch(() => {
    // Side panel may not be open — ignore
  });
}

// Extract code when the active tab changes or updates, so side panel always has fresh data
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  lastSourceTabId = activeInfo.tabId;
  const pageData = await getPageAnalysisData(activeInfo.tabId);
  lastExtractedCode = pageData.code || "";
  lastProblemContext = pageData.problemContext || "";
  console.log("[Background] Tab activated. Extracted code (first 100 chars):", lastExtractedCode.substring(0, 100));
  notifySidePanel();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    lastSourceTabId = tabId;
    const pageData = await getPageAnalysisData(tabId);
    lastExtractedCode = pageData.code || "";
    lastProblemContext = pageData.problemContext || "";
    console.log("[Background] Tab updated. Extracted code (first 100 chars):", lastExtractedCode.substring(0, 100));
    notifySidePanel();
  }
});

// Live code polling — detect editor changes every 5 seconds and push to side panel
let pollingInterval = null;

function startCodePolling() {
  if (pollingInterval) return;
  pollingInterval = setInterval(async () => {
    if (!lastSourceTabId) return;
    try {
      const tab = await chrome.tabs.get(lastSourceTabId);
      if (!tab || !tab.active) return;
      const tabUrl = tab.url || '';
      if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('chrome-extension://')) return;

      const pageData = await getPageAnalysisData(lastSourceTabId);
      const newCode = pageData.code || "";
      if (newCode && newCode !== lastExtractedCode) {
        lastExtractedCode = newCode;
        lastProblemContext = pageData.problemContext || lastProblemContext;
        console.log("[Background] Live poll: code changed (first 100 chars):", lastExtractedCode.substring(0, 100));
        notifySidePanel();
      }
    } catch (e) {
      // Tab may have been closed — ignore
    }
  }, 5000);
}

startCodePolling();

// Message listener for popup to request selected text
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getExtractedCode" || message.action === "refreshExtractedCode") {
    (async () => {
      try {
        // Find the active tab in the last focused normal browser window
        const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
        let tab = null;

        // Try last focused window first
        const focusedWindow = windows.find(w => w.focused);
        if (focusedWindow) {
          const tabs = await chrome.tabs.query({ active: true, windowId: focusedWindow.id });
          tab = tabs[0];
        }

        // Fallback: try any normal window
        if (!tab) {
          for (const win of windows) {
            const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
            if (tabs[0]) {
              tab = tabs[0];
              break;
            }
          }
        }

        // Fallback: use lastSourceTabId if we have one
        if (!tab && lastSourceTabId) {
          try {
            tab = await chrome.tabs.get(lastSourceTabId);
          } catch (e) {
            // tab might have been closed
          }
        }

        if (tab) {
          console.log("[Background] Found tab for extraction:", tab.id, "URL:", tab.url);
          lastSourceTabId = tab.id;
          const pageData = await getPageAnalysisData(tab.id);
          lastExtractedCode = pageData.code || "";
          lastProblemContext = pageData.problemContext || "";
          console.log("[Background] Extracted code from tab", tab.id, "(first 100 chars):", lastExtractedCode.substring(0, 100));
        } else {
          console.log("[Background] No active tab found for code extraction.");
        }
      } catch (e) {
        console.error("[Background] Error extracting code:", e);
      }
      sendResponse({ text: lastExtractedCode, problemContext: lastProblemContext });
    })();
    return true;
  }
  if (message.action === "updateExtractedCode") {
     console.log("[Background] Received 'updateExtractedCode' from popup, new text:", message.text.substring(0,100));
     lastExtractedCode = message.text;
     sendResponse({status: "Background received updated code"});
     return true;
  }
});
