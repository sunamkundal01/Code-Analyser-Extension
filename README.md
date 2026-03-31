# Code Analyzer (Gemini) - Chrome Extension

A Chrome extension that analyzes code snippets for **time/space complexity** and **code quality** using Google's Gemini API. Built for developers who practice on platforms like **LeetCode**, **GeeksforGeeks**, and **CodeChef**.

---

## Features

| Feature | Description |
|---------|-------------|
| **Get Complexity (TC & SC)** | Instant Big O notation for time and space complexity |
| **Explain Complexity** | Step-by-step breakdown of how complexity is derived |
| **Code Feedback** | Actionable tips on readability, efficiency, and best practices |
| **Extra Test Cases** | Auto-generated Easy, Medium, and Hard test cases |
| **Alternative Approaches** | Compare brute force to optimal solutions with trade-offs |
| **Get Hints** | Interview-style hints without revealing the solution |
| **Live Code Extraction** | Automatically detects code from Monaco, Ace, and CodeMirror editors |
| **Manual Code Input** | Paste any code snippet for analysis |
| **Complexity Graphs** | Visual canvas-based graphs for time and space complexity |
| **Dark / Light Mode** | Toggle between themes with one click |
| **Right-Click Analysis** | Select code on any page and analyze via context menu |

---

## Installation

1. **Download** or clone this repository:
   ```
   git clone https://github.com/sunamkundal01/Code-Analyser-Extension.git
   ```

2. Open **Chrome** and go to `chrome://extensions`

3. Enable **Developer Mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the project folder

5. The extension icon will appear in your toolbar. Pin it for easy access.

---

## How to Use

### Step 1 - Set up your API Key (one-time)

1. Click the extension icon to open the side panel
2. Click **Edit API Key** and paste your Gemini API key
3. Click **Save Key**

> Don't have a key? Get one free from [Google AI Studio](https://aistudio.google.com/apikey)

### Step 2 - Open a coding platform

Navigate to any supported site (**LeetCode**, **GeeksforGeeks**, **CodeChef**) or any page with code. The extension automatically extracts code from the page.

### Step 3 - Analyze

Click any of the six analysis buttons:

- **Get Complexity (TC & SC)** - Quick O-notation results with visual graphs
- **Explain Complexity** - Detailed breakdown with per-loop/per-recursion analysis
- **Code Feedback** - Issues and improvement suggestions
- **Extra Test Cases** - 3 test cases at Easy / Medium / Hard levels
- **Alternative Approaches** - Multiple approaches ranked from brute force to optimal
- **Get Hints** - Nudges without spoiling the answer

### Other ways to analyze

- **Paste Code** - Click "Paste Code" to manually input a code snippet
- **Right-Click** - Select code on any page, right-click, and choose "Analyze Selected Code"
- **Keyboard Shortcut** - Press `Ctrl+Shift+E` (Mac: `Cmd+Shift+E`) to open the extension

### Step 4 - Copy & Use

Click the **Copy** button on any result to copy it to your clipboard.

---

## Get Your Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **Create API Key**
4. Copy the key and paste it into the extension

The extension supports three Gemini models (configurable in Settings):

| Model | Best for |
|-------|----------|
| **Gemini 2.5 Flash** (default) | Fast responses, lower cost |
| **Gemini 2.5 Pro** | More detailed and accurate analysis |
| **Gemini 2.0 Flash** | Legacy, lighter model |

---

## Supported Platforms

The extension auto-extracts code from editors on:

- **LeetCode** (Monaco Editor)
- **GeeksforGeeks** (Ace Editor)
- **CodeChef** (CodeMirror / Ace Editor)
- Any page with `<pre>`, `<code>`, or standard code editor elements

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "API Key not set" | Open the side panel and save your key via **Edit API Key**, or go to the extension's Options page |
| No code detected | Click **Refresh Preview** or use **Paste Code** to input manually |
| API errors / rate limits | Check your key is valid. Free tier has usage limits - check [Google AI Studio](https://aistudio.google.com/) |
| Extension not opening | Make sure you're not on a `chrome://` or `edge://` internal page |

---

## Tech Stack

- **Chrome Extension Manifest V3**
- **Gemini API** (generativelanguage.googleapis.com)
- **marked.js** for Markdown rendering
- **Canvas API** for complexity graphs
- **Chrome Storage API** for settings persistence

---

## Project Structure

```
Code-Analyser-Extension/
  manifest.json        # Extension configuration
  background.js        # Code extraction engine & live polling
  popup.html           # Side panel UI
  popup.css            # Styling with dark/light theme support
  popup.js             # UI logic, API calls, graph rendering
  options.html         # Settings page
  options.js           # Settings save/load
  marked.min.js        # Markdown parser library
  icon.png             # Extension icon
```

---

## Contact

Made by **Sunam**

- Email: [kundalsunam@gmail.com](mailto:kundalsunam@gmail.com)
- GitHub: [github.com/sunamkundal01/Code-Analyser-Extension](https://github.com/sunamkundal01/Code-Analyser-Extension)
- LinkedIn: [linkedin.com/in/sunamkundal](https://in.linkedin.com/in/sunamkundal)

---

## License

This project is open source. Feel free to fork, modify, and use it.
