document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('saveKey');
  const statusDiv = document.getElementById('status');

  // Load saved API key
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });

  // Save API key
  saveButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showStatus('Please enter an API Key', 'error');
      return;
    }

    if (!/^[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
      showStatus('Invalid API key format. Check your key and try again.', 'error');
      return;
    }

    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
      showStatus('API Key saved successfully!', 'success');
    });
  });

  function showStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = type;
    
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = '';
    }, 3000);
  }
});
