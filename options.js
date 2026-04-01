document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('modelSelect');
  const saveButton = document.getElementById('saveKey');
  const statusDiv = document.getElementById('status');
  const themeToggleButton = document.getElementById('themeToggle');
  const modelCards = document.querySelectorAll('.model-card');

  // Apply saved theme
  chrome.storage.local.get(['theme'], (result) => {
    document.documentElement.setAttribute('data-theme', result.theme || 'dark');
  });

  themeToggleButton.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    chrome.storage.local.set({ theme: next });
  });

  // Model card selection
  function selectModelCard(value) {
    modelCards.forEach(card => {
      card.classList.toggle('selected', card.dataset.value === value);
      card.querySelector('input[type="radio"]').checked = card.dataset.value === value;
    });
    modelSelect.value = value;
  }

  modelCards.forEach(card => {
    card.addEventListener('click', () => {
      selectModelCard(card.dataset.value);
    });
  });

  // Load saved settings
  chrome.storage.local.get(['geminiApiKey', 'geminiModel'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.geminiModel) {
      modelSelect.value = result.geminiModel;
      selectModelCard(result.geminiModel);
    }
  });

  // Save settings
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

    chrome.storage.local.set({
      geminiApiKey: apiKey,
      geminiModel: modelSelect.value
    }, () => {
      showStatus('Settings saved successfully!', 'success');
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
