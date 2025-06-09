/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const EXPIRY_OPTIONS = {
  '1h': { label: '1 Hour', duration: 1 * 60 * 60 * 1000 },
  '24h': { label: '24 Hours', duration: 24 * 60 * 60 * 1000 },
  '7d': { label: '7 Days', duration: 7 * 24 * 60 * 60 * 1000 },
  'never': { label: 'Never', duration: Infinity },
};
const DEFAULT_EXPIRY_KEY = '24h';
const QR_READER_ELEMENT_ID = "qr-reader-section";
const GEMINI_MODEL_NAME = 'gemini-2.5-flash-preview-04-17';

type ViewMode = 'create' | 'view' | 'scan';

interface PasteData {
  text: string;
  createdAt: number;
  expiresAt: number;
  shortCode: string;
}

// Helper function to safely parse JSON
const safeJsonParse = (jsonString: string): any | null => {
  try {
    let cleanJsonString = jsonString.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = cleanJsonString.match(fenceRegex);
    if (match && match[2]) {
      cleanJsonString = match[2].trim();
    }
    return JSON.parse(cleanJsonString);
  } catch (e) {
    console.error("Failed to parse JSON:", e, "Original string:", jsonString);
    return null;
  }
};


const App = () => {
  const [inputText, setInputText] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [generatedShortCode, setGeneratedShortCode] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('create');
  const [contentToView, setContentToView] = useState('');
  const [isLoading, setIsLoading] = useState(true); // Initial loading for URL check
  const [isProcessing, setIsProcessing] = useState(false); // For API calls
  const [selectedExpiry, setSelectedExpiry] = useState(DEFAULT_EXPIRY_KEY);
  const [manualCodeInput, setManualCodeInput] = useState('');

  const html5QrCodeScannerRef = useRef<Html5Qrcode | null>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);

  useEffect(() => {
    // Initialize Gemini AI Client
    // API Key MUST be in environment variable process.env.API_KEY
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set. Gemini features will not work.");
        showToast("Configuration error: API Key missing. App may not function correctly.", 5000);
        // Potentially disable features or show a more permanent error message
    }
    aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY! });


    const storedDarkMode = localStorage.getItem('quickpaste_darkMode');
    if (storedDarkMode) {
      setIsDarkMode(storedDarkMode === 'true');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const contentId = urlParams.get('id');

    if (contentId) {
      setViewMode('view');
      loadContentById(contentId);
    } else {
      setViewMode('create');
      setIsLoading(false); // No content to load initially
    }
  }, []);


  const showToast = (message: string, duration = 3000) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), duration);
  };

  const generateRandomShortCode = (length = 6) => {
    return Math.random().toString(36).substring(2, 2 + length);
  };

  const loadContentById = async (contentId: string) => {
    if (!aiRef.current) {
        showToast("Gemini AI client not initialized. Cannot load content.", 4000);
        setContentToView('Error: AI service not available.');
        setIsLoading(false);
        return;
    }
    setIsLoading(true);
    setIsProcessing(true);
    setContentToView(''); // Clear previous content

    const prompt = `System: You are a data retrieval assistant.
    Retrieve the JSON data object associated with the key "${contentId}".
    The data object should have fields: "text", "createdAt", "expiresAt", "shortCode".
    If found, return ONLY the raw JSON string of the data object.
    If not found or if the key is invalid, respond with the exact string "NOT_FOUND".
    Key: ${contentId}`;

    try {
      const response: GenerateContentResponse = await aiRef.current.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: prompt,
      });

      const responseText = response.text.trim();

      if (responseText === "NOT_FOUND") {
        setContentToView('Content not found or may have expired.');
        showToast('Content not found.', 3000);
      } else {
        const data: PasteData | null = safeJsonParse(responseText) as PasteData | null;
        if (data && data.text && data.shortCode === contentId) {
          const isExpired = data.expiresAt !== Infinity && Date.now() > data.expiresAt;
          if (isExpired) {
            setContentToView('This content has expired.');
            showToast('Content has expired.', 3000);
          } else {
            setContentToView(data.text);
          }
        } else {
          setContentToView('Failed to retrieve or parse content. The format might be incorrect or the content is unavailable.');
          showToast('Error retrieving content data.', 3000);
        }
      }
    } catch (error) {
      console.error('Error loading content via Gemini:', error);
      setContentToView('Error loading content. Please try again.');
      showToast('An error occurred while fetching content.', 3000);
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
    }
  };


  useEffect(() => {
    document.body.className = isDarkMode ? 'dark-mode' : '';
    localStorage.setItem('quickpaste_darkMode', String(isDarkMode));
  }, [isDarkMode]);

  const handleGenerateLink = async () => {
    if (!inputText.trim()) {
      showToast('Please paste some content first.');
      return;
    }
    if (!aiRef.current) {
        showToast("Gemini AI client not initialized. Cannot generate link.", 4000);
        return;
    }

    setIsProcessing(true);
    setGeneratedUrl('');
    setGeneratedShortCode('');

    const shortCode = generateRandomShortCode();
    const expiryDuration = EXPIRY_OPTIONS[selectedExpiry].duration;
    const expiresAt = expiryDuration === Infinity ? Infinity : Date.now() + expiryDuration;

    const dataToStore: PasteData = {
      text: inputText,
      createdAt: Date.now(),
      expiresAt: expiresAt,
      shortCode: shortCode,
    };

    const jsonDataString = JSON.stringify(dataToStore);
    const prompt = `System: You are a data storage assistant.
    Store the following JSON data object. Associate it with the key "${shortCode}".
    The data object has fields: "text", "createdAt", "expiresAt", "shortCode".
    Respond with the exact string "STORED OK" if you understand and have processed this request.
    Do not add any other commentary.
    Key: ${shortCode}
    Data: ${jsonDataString}`;

    try {
      const response: GenerateContentResponse = await aiRef.current.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: prompt,
      });

      // We expect "STORED OK" or similar. The actual storage is conceptual.
      if (response.text && response.text.includes("STORED OK")) {
        const newUrl = `${window.location.origin}${window.location.pathname}?id=${shortCode}`;
        setGeneratedUrl(newUrl);
        setGeneratedShortCode(shortCode);
        showToast('Link generated successfully!');
      } else {
        throw new Error("Gemini did not confirm storage. Response: " + response.text);
      }
    } catch (error) {
      console.error('Error saving to Gemini (simulated):', error);
      showToast('Failed to generate link. Could not save data. Please try again.', 4000);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyFullUrl = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl)
      .then(() => showToast('Full URL copied to clipboard!'))
      .catch(() => showToast('Failed to copy full URL.'));
  };

  const handleCopyShortCode = () => {
    if (!generatedShortCode) return;
    navigator.clipboard.writeText(generatedShortCode)
      .then(() => showToast('Short Code copied to clipboard!'))
      .catch(() => showToast('Failed to copy Short Code.'));
  };

  const handleOpenUrl = () => {
    if (!generatedUrl) return;
    window.open(generatedUrl, '_blank');
  };

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const handleCreateNew = () => {
    stopQrScanner();
    setViewMode('create');
    setInputText('');
    setGeneratedUrl('');
    setGeneratedShortCode('');
    setContentToView('');
    setManualCodeInput('');
    setIsLoading(false); // No initial loading needed for create view
    if (window.location.search) {
     window.history.pushState({}, '', window.location.pathname);
    }
  };

  const qrCodeSuccessCallback = (decodedText: string, decodedResult: any) => {
    console.log(`Scan result: ${decodedText}`, decodedResult);
    stopQrScanner();
    try {
      const url = new URL(decodedText);
      const contentId = url.searchParams.get('id');
      if (contentId && (url.origin + url.pathname === window.location.origin + window.location.pathname)) {
        showToast(`QR Code scanned! Loading content for ID: ${contentId}`);
        setViewMode('view');
        loadContentById(contentId);
        window.history.pushState({}, '', `${window.location.pathname}?id=${contentId}`);
      } else {
        showToast('Scanned QR code is not a valid QuickPaste link for this site.', 3000);
        setViewMode('create');
      }
    } catch (e) {
      showToast('Invalid QR code content. Not a valid URL.', 3000);
      setViewMode('create');
    }
  };

  const qrCodeErrorCallback = (errorMessage: string) => {
    // console.warn(`QR_SCAN_ERROR: ${errorMessage}`);
  };

  const startQrScanner = async () => {
    if (html5QrCodeScannerRef.current && html5QrCodeScannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
        console.log("Scanner already running.");
        return;
    }
    setViewMode('scan');
    setIsLoading(false); // Not loading content, but setting up scanner

    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (permissionStatus.state === 'denied') {
          showToast("Camera permission is denied. Please enable it in your browser settings to scan QR codes.", 4000);
          setViewMode('create');
          return;
        }
      } catch (e) {
        console.warn("Could not query camera permission status:", e);
      }
    }

    setTimeout(() => {
        const qrReaderElement = document.getElementById(QR_READER_ELEMENT_ID);
        if (!qrReaderElement) {
            console.error("QR Reader element not found in DOM for scanner initialization.");
            showToast("Could not initialize QR scanner display.", 3000);
            setViewMode('create');
            return;
        }
        qrReaderElement.innerHTML = '';

        const newScanner = new Html5Qrcode(QR_READER_ELEMENT_ID);
        html5QrCodeScannerRef.current = newScanner;
        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

        Html5Qrcode.getCameras().then(cameras => {
            if (cameras && cameras.length) {
                newScanner.start(
                    { facingMode: "environment" },
                    config,
                    qrCodeSuccessCallback,
                    qrCodeErrorCallback
                ).catch(err => {
                    console.error("Error starting QR scanner:", err);
                    showToast("Failed to start QR scanner. Camera might be busy.", 4000);
                    setViewMode('create');
                });
            } else {
                showToast("No cameras found on this device.", 3000);
                setViewMode('create');
            }
        }).catch(err => {
            console.error("Error getting cameras:", err);
            const errString = String(err).toLowerCase();
            if (errString.includes('permission denied') || errString.includes('permission dismissed') || errString.includes('notallowederror')) {
                 showToast("Camera access denied. Please grant permission to scan QR codes.", 4000);
            } else {
                 showToast("Could not access camera. Ensure it's not in use.", 4000);
            }
            setViewMode('create');
        });
    }, 0);
  };

  const stopQrScanner = () => {
    if (html5QrCodeScannerRef.current) {
      try {
        const scannerState = html5QrCodeScannerRef.current.getState();
        if (scannerState === Html5QrcodeScannerState.SCANNING || scannerState === Html5QrcodeScannerState.PAUSED) {
           html5QrCodeScannerRef.current.stop().then(() => {
            if (html5QrCodeScannerRef.current) html5QrCodeScannerRef.current.clear();
          }).catch(err => {
            if (html5QrCodeScannerRef.current) html5QrCodeScannerRef.current.clear();
          });
        } else if (scannerState === Html5QrcodeScannerState.NOT_STARTED) {
            if (html5QrCodeScannerRef.current) html5QrCodeScannerRef.current.clear();
        }
      } catch (e) {
        const qrElement = document.getElementById(QR_READER_ELEMENT_ID);
        if (qrElement) qrElement.innerHTML = '';
      }
      html5QrCodeScannerRef.current = null;
    }
  };

  const handleLoadFromCode = () => {
    const code = manualCodeInput.trim();
    if (!code) {
        showToast("Please enter a code.", 3000);
        return;
    }
    window.history.pushState({}, '', `${window.location.pathname}?id=${code}`);
    setViewMode('view');
    loadContentById(code);
  };

  useEffect(() => {
    return () => {
      stopQrScanner();
    };
  }, []);

  useEffect(() => {
    // If the view mode is no longer 'scan' (i.e., it's 'create' or 'view'),
    // and the scanner is currently running, stop it.
    if ((viewMode === 'create' || viewMode === 'view') &&
        html5QrCodeScannerRef.current &&
        html5QrCodeScannerRef.current.getState &&
        html5QrCodeScannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
      stopQrScanner();
    }
  }, [viewMode]);


  if (isLoading && viewMode === 'view') { // Show full page loader only when initially loading content for 'view' mode
    return <div className="loading-spinner" aria-label="Loading content..."></div>;
  }

  return (
    <div className="container">
      <header>
        <h1>QuickPaste</h1>
        <div className="header-actions">
          <button onClick={toggleDarkMode} className="theme-toggle" aria-label="Toggle dark mode" title="Toggle Dark Mode">
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {viewMode === 'create' && (
        <main>
          <p className="tagline">Instantly share text across devices.</p>

          <section className="create-paste-section" aria-labelledby="create-paste-heading">
            <h2 id="create-paste-heading" className="section-heading">Create a New Paste</h2>
            <div className="input-area">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste your content here..."
                aria-label="Content to share"
                disabled={isProcessing}
              />
            </div>

            <div className="options-area">
              <label htmlFor="expiry-select">Link expires in:</label>
              <select
                id="expiry-select"
                value={selectedExpiry}
                onChange={(e) => setSelectedExpiry(e.target.value)}
                aria-label="Link expiry time"
                disabled={isProcessing}
              >
                {Object.entries(EXPIRY_OPTIONS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <button 
                onClick={handleGenerateLink} 
                className="action-button generate-button"
                disabled={isProcessing}
            >
              {isProcessing ? 'Generating...' : 'Generate Link & Code'}
            </button>

            {generatedUrl && !isProcessing && (
              <div className="generated-url-area">
                <h3>Your Link & Code:</h3>
                <div>
                  <p><strong>Short Code (for manual typing):</strong></p>
                  <div className="code-box" aria-live="polite">{generatedShortCode}</div>
                  <button onClick={handleCopyShortCode} className="secondary-button copy-code-button">Copy Code</button>
                </div>
                <div style={{marginTop: '15px'}}>
                  <p><strong>Full URL (for QR codes/direct sharing):</strong></p>
                  <div className="url-box" aria-live="polite">{generatedUrl}</div>
                  <div className="url-actions">
                    <button onClick={handleCopyFullUrl} className="secondary-button">Copy Full URL</button>
                    <button onClick={handleOpenUrl} className="secondary-button">Open Link</button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <hr className="section-divider" />

          <section className="retrieve-paste-section" aria-labelledby="retrieve-paste-heading">
            <h2 id="retrieve-paste-heading" className="section-heading">Open an Existing Paste</h2>
            <div className="manual-code-input-area">
              <label htmlFor="manual-code">Enter Code:</label>
              <div className="input-group">
                <input
                  type="text"
                  id="manual-code"
                  value={manualCodeInput}
                  onChange={(e) => setManualCodeInput(e.target.value)}
                  placeholder="e.g. abc123"
                  aria-label="Enter short code to load paste"
                  disabled={isProcessing}
                />
                <button onClick={handleLoadFromCode} className="secondary-button" disabled={isProcessing || !manualCodeInput.trim()}>Load</button>
              </div>
            </div>
             <p className="or-divider">OR</p>
            <button
              onClick={startQrScanner}
              className="action-button scan-qr-main-button"
              aria-label="Scan QR Code to open paste"
              disabled={isProcessing || viewMode === 'scan'}
            >
              📷 Scan QR Code
            </button>
          </section>

        </main>
      )}

      {viewMode === 'view' && (
        <main className="view-content-area">
          <h2>Pasted Content:</h2>
          {isProcessing ? (
             <div className="loading-spinner" aria-label="Loading content..."></div>
          ) : (
            <pre className="content-display" aria-live="polite">{contentToView}</pre>
          )}
          <button onClick={handleCreateNew} className="action-button" disabled={isProcessing}>
            Create or Open Another Paste
          </button>
        </main>
      )}

      {viewMode === 'scan' && (
        <main className="scan-area">
          <h2>Scan QR Code</h2>
          <p>Point your camera at a QuickPaste QR code.</p>
          <div id={QR_READER_ELEMENT_ID} style={{ width: '100%', maxWidth: '400px', margin: '20px auto' }}></div>
          <button onClick={handleCreateNew} className="secondary-button cancel-scan-button">
            Cancel Scan
          </button>
        </main>
      )}


      {toastMessage && (
        <div className="toast" role="alert" aria-live="assertive">
          {toastMessage}
        </div>
      )}
      <footer>
        <p><strong>Important Note:</strong> QuickPaste uses the Gemini API to simulate a backend for cross-device sharing.
        This is a demonstration and <strong>not a production-ready database</strong>. Data persistence, security, and availability are not guaranteed as in a traditional backend.
        Ensure your <code>API_KEY</code> environment variable is set up for Gemini API features to work.</p>
        <p>Do not use for sensitive information.</p>
      </footer>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
