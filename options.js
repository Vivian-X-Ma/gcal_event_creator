// Get DOM elements
const apiKeyInput = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');

// Load saved API key when page opens
document.addEventListener('DOMContentLoaded', async () => {
  const result = await chrome.storage.sync.get(['groqApiKey']);
  
  if (result.groqApiKey) {
    apiKeyInput.value = result.groqApiKey;
  }
});

// Save button click handler
saveBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }
  
  // Validate that it looks like a Groq API key
  if (!apiKey.startsWith('gsk_')) {
    showStatus('Invalid API key format. Groq keys start with "gsk_"', 'error');
    return;
  }
  
  try {
    // Save to chrome storage
    await chrome.storage.sync.set({ groqApiKey: apiKey });
    showStatus('Settings saved successfully!', 'success');
    
    // Clear success message after 2 seconds
    setTimeout(() => {
      statusDiv.className = 'status';
      statusDiv.textContent = '';
    }, 2000);
    
  } catch (error) {
    showStatus('Error saving settings: ' + error.message, 'error');
  }
});

// Show status message
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
}