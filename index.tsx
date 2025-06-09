/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

const EXPIRY_OPTIONS = {
  '1h': { label: '1 Hour', duration: 1 * 60 * 60 * 1000 },
  '24h': { label: '24 Hours', duration: 24 * 60 * 60 * 1000 },
  '7d': { label: '7 Days', duration: 7 * 24 * 60 * 60 * 1000 },
  'never': { label: 'Never', duration: Infinity },
};
const DEFAULT_EXPIRY_KEY = '24h';

const App = () => {
  const [inputText, setInputText] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [viewMode, setViewMode] = useState('create'); // 'create' or 'view'
  const [contentToView, setContentToView] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedExpiry, setSelectedExpiry] = useState(DEFAULT_EXPIRY_KEY);

  const showToast = (message, duration = 3000) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), duration);
  };

  const generateShortCode = (length = 6) => {
    return Math.random().toString(36).substring(2, 2 + length);
  };

  useEffect(() => {
    // Load dark mode preference
    const storedDarkMode = localStorage.getItem('quickpaste_darkMode');
    if (storedDarkMode) {
      setIsDarkMode(storedDarkMode === 'true');
    }

    // Check URL for content ID
    const urlParams = new URLSearchParams(window.location.search);
    const contentId = urlParams.get('id');

    if (contentId) {
      setViewMode('view');
      try {
        const storedItem = localStorage.getItem(`quickpaste_${contentId}`);
        if (storedItem) {
          const data = JSON.parse(storedItem);
          const isExpired = data.expiresAt !== Infinity && Date.now() > data.expiresAt;
          if (isExpired) {
            setContentToView('This content has expired or was not found.');
            localStorage.removeItem(`quickpaste_${contentId}`); // Clean up
          } else {
            setContentToView(data.text);
          }
        } else {
          setContentToView('Content not found.');
        }
      } catch (error) {
        console.error('Error loading content:', error);
        setContentToView('Error loading content.');
      }
    } else {
      setViewMode('create');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    document.body.className = isDarkMode ? 'dark-mode' : '';
    localStorage.setItem('quickpaste_darkMode', String(isDarkMode));
  }, [isDarkMode]);

  const handleGenerateLink = () => {
    if (!inputText.trim()) {
      showToast('Please paste some content first.');
      return;
    }

    const shortCode = generateShortCode();
    const expiryDuration = EXPIRY_OPTIONS[selectedExpiry].duration;
    const expiresAt = expiryDuration === Infinity ? Infinity : Date.now() + expiryDuration;

    const dataToStore = {
      text: inputText,
      createdAt: Date.now(),
      expiresAt: expiresAt,
    };

    try {
      localStorage.setItem(`quickpaste_${shortCode}`, JSON.stringify(dataToStore));
      const newUrl = `${window.location.origin}${window.location.pathname}?id=${shortCode}`;
      setGeneratedUrl(newUrl);
      showToast('Link generated successfully!');
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      showToast('Failed to generate link. Storage might be full.');
    }
  };

  const handleCopyUrl = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl)
      .then(() => showToast('URL copied to clipboard!'))
      .catch(() => showToast('Failed to copy URL.'));
  };

  const handleOpenUrl = () => {
    if (!generatedUrl) return;
    window.open(generatedUrl, '_blank');
  };

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const handleCreateNew = () => {
    setViewMode('create');
    setInputText('');
    setGeneratedUrl('');
    setContentToView('');
    window.history.pushState({}, '', window.location.pathname); // Clear URL params
  };

  if (isLoading) {
    return <div className="loading-spinner"></div>; // Basic loading indicator
  }

  return (
    <div className="container">
      <header>
        <h1>QuickPaste</h1>
        <button onClick={toggleDarkMode} className="theme-toggle" aria-label="Toggle dark mode">
          {isDarkMode ? '☀️' : '🌙'}
        </button>
      </header>

      {viewMode === 'create' ? (
        <main>
          <p className="tagline">Instantly share text across devices.</p>
          <div className="input-area">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste your content here..."
              aria-label="Content to share"
            />
          </div>

          <div className="options-area">
            <label htmlFor="expiry-select">Link expires in:</label>
            <select 
              id="expiry-select" 
              value={selectedExpiry} 
              onChange={(e) => setSelectedExpiry(e.target.value)}
              aria-label="Link expiry time"
            >
              {Object.entries(EXPIRY_OPTIONS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <button onClick={handleGenerateLink} className="action-button generate-button">
            Generate Link
          </button>

          {generatedUrl && (
            <div className="generated-url-area">
              <p>Your short link:</p>
              <div className="url-box" aria-live="polite">{generatedUrl}</div>
              <div className="url-actions">
                <button onClick={handleCopyUrl} className="secondary-button">Copy URL</button>
                <button onClick={handleOpenUrl} className="secondary-button">Open Link</button>
              </div>
            </div>
          )}
        </main>
      ) : (
        <main className="view-content-area">
          <h2>Pasted Content:</h2>
          <pre className="content-display">{contentToView}</pre>
          <button onClick={handleCreateNew} className="action-button">
            Create New Paste
          </button>
        </main>
      )}

      {toastMessage && (
        <div className="toast" role="alert" aria-live="assertive">
          {toastMessage}
        </div>
      )}
      <footer>
        <p>Note: Content is stored in your browser's local storage and is not accessible on other devices unless you share the link and open it in the same browser. For true cross-device sharing, a backend service is required.</p>
      </footer>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
