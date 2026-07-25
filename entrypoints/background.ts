import { createLogger, PipelineTracker } from '../utils/logger';

const logger = createLogger('Background');

interface Coords {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

interface HistoryItem {
  id: string;
  type: 'image' | 'text' | 'video';
  dataUrl: string;
  textPreview?: string;
  timestamp: number;
}

export default defineBackground(() => {
  logger.info('Service Worker Startup: background service worker main execution thread started');

  chrome.runtime.onSuspend.addListener(() => {
    logger.warn('Service Worker Suspend: chrome.runtime.onSuspend fired');
  });

  chrome.runtime.onSuspendCanceled.addListener(() => {
    logger.info('Service Worker Suspend: chrome.runtime.onSuspendCanceled fired');
  });

  let offscreenPromise: Promise<void> | null = null;

  // Ensure the offscreen document is opened with a persistent set of reasons
  async function setupOffscreenDocument() {
    if (offscreenPromise) {
      logger.debug('Awaiting existing offscreen document creation promise');
      return offscreenPromise;
    }

    logger.debug('Initializing setupOffscreenDocument');
    offscreenPromise = (async () => {
      const offscreenUrl = chrome.runtime.getURL('/offscreen.html');
      
      try {
        const contexts = await (chrome.runtime as any).getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT']
        });
        if (contexts.length > 0) {
          logger.debug('Offscreen document is already open');
          return;
        }
      } catch (err) {
        logger.warn('getContexts failed or not supported: ' + (err as Error).message);
      }

      logger.info('Opening new Offscreen Document context');
      await chrome.offscreen.createDocument({
        url: offscreenUrl,
        reasons: [
          chrome.offscreen.Reason.DOM_PARSER,
          chrome.offscreen.Reason.WORKERS,
          chrome.offscreen.Reason.BLOBS,
          chrome.offscreen.Reason.CLIPBOARD,
          chrome.offscreen.Reason.USER_MEDIA,
          chrome.offscreen.Reason.AUDIO_PLAYBACK
        ],
        justification: 'Required for client-side processing of screenshot crops, local OCR, and recording tab streams.'
      });
    })();

    try {
      await offscreenPromise;
      logger.info('Offscreen: setupOffscreenDocument completed creation');
    } finally {
      offscreenPromise = null;
    }
  }

  // Close the offscreen document
  async function closeOffscreenDocument() {
    logger.debug('Requesting offscreen document shutdown');
    try {
      const contexts = await (chrome.runtime as any).getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });
      if (contexts.length > 0) {
        await chrome.offscreen.closeDocument();
        logger.info('Closed offscreen document');
      } else {
        logger.debug('Offscreen document was already closed');
      }
    } catch (err: any) {
      logger.warn('Error closing offscreen document: ' + err.message);
    }
  }

  // Send message to offscreen with retries to resolve loader race conditions
  async function sendMessageToOffscreen(message: any, retries = 5, delay = 150): Promise<any> {
    logger.debug(`Sending message to offscreen: action=${message.action} (retries=${retries})`);
    for (let i = 0; i < retries; i++) {
      try {
        const response = await chrome.runtime.sendMessage(message);
        if (response !== undefined) {
          logger.debug(`Offscreen message response received for action=${message.action}`);
          return response;
        }
      } catch (err: any) {
        logger.warn(`Attempt ${i + 1} to send message to offscreen failed: ${err.message}. Retrying...`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    throw new Error(`Failed to communicate with offscreen document after ${retries} attempts.`);
  }

  // Send message to content script with retries to resolve script load delays
  async function sendMessageToTab(tabId: number, message: any, retries = 5, delay = 100): Promise<any> {
    logger.debug(`Sending message to tab ID ${tabId}: action=${message.action} (retries=${retries})`);
    for (let i = 0; i < retries; i++) {
      try {
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (err: any) {
        logger.warn(`Attempt ${i + 1} to send message to content script failed: ${err.message}. Retrying...`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    throw new Error(`Failed to communicate with tab content script after ${retries} attempts.`);
  }

  // ── Supported AI tab discovery ─────────────────────────────────────────────

  const AI_TAB_PATTERNS: Array<{ name: string; test: (url: URL) => boolean }> = [
    { name: 'ChatGPT',    test: u => u.hostname.endsWith('chatgpt.com') },
    { name: 'Claude',     test: u => u.hostname.endsWith('claude.ai') },
    { name: 'Gemini',     test: u => u.hostname === 'gemini.google.com' },
    { name: 'Grok',       test: u => u.hostname.endsWith('grok.com') || (u.hostname.endsWith('x.com') && u.pathname.startsWith('/i/grok')) },
    { name: 'Perplexity', test: u => u.hostname.endsWith('perplexity.ai') },
  ];

  interface AiTab {
    tabId: number;
    windowId: number;
    name: string;
    title: string;
    url: string;
    favIconUrl?: string;
  }

  /** Query all open browser tabs and return those on supported AI domains. */
  async function findSupportedAITabs(): Promise<AiTab[]> {
    const allTabs = await chrome.tabs.query({});
    const results: AiTab[] = [];
    for (const tab of allTabs) {
      if (!tab.id || !tab.windowId || !tab.url) continue;
      let parsed: URL;
      try { parsed = new URL(tab.url); } catch { continue; }
      const match = AI_TAB_PATTERNS.find(p => p.test(parsed));
      if (match) {
        results.push({
          tabId: tab.id,
          windowId: tab.windowId,
          name: match.name,
          title: tab.title || match.name,
          url: tab.url,
          favIconUrl: tab.favIconUrl,
        });
      }
    }
    logger.info(`findSupportedAITabs: Found ${results.length} supported AI tab(s): ${results.map(t => t.name).join(', ') || 'none'}`);
    return results;
  }

  /**
   * Ensure the content script is loaded in a tab, injecting it dynamically if needed.
   * Returns true if the script is ready to receive messages.
   */
  async function ensureContentScriptInTab(tabId: number): Promise<boolean> {
    try {
      // Ping the content script — if it responds, it is loaded
      await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      return true;
    } catch {
      // Not loaded yet — inject dynamically
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-scripts/content.js']
        });
        logger.info(`ensureContentScriptInTab: Dynamically injected content script into tab ${tabId}`);
        // Brief pause to let the script register its message listener
        await new Promise(r => setTimeout(r, 200));
        return true;
      } catch (injErr: any) {
        logger.warn(`ensureContentScriptInTab: Could not inject content script into tab ${tabId}: ${injErr.message}`);
        return false;
      }
    }
  }

  /**
   * Restore focus to the original tab from which screenshot/capture was initiated
   */
  async function restoreCaptureTabFocus(captureTabId: number) {
    if (!captureTabId) return;
    try {
      const tab = await chrome.tabs.get(captureTabId);
      if (tab && tab.id) {
        logger.info(`Restoring focus to original capture tab ID: ${tab.id}`);
        await chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
      }
    } catch (err: any) {
      logger.warn(`Could not restore focus to capture tab ${captureTabId}: ${err.message}`);
    }
  }

  /**
   * Inject a payload into a specific AI tab:
   * 1. Try background injection first WITHOUT tab switching
   * 2. If background injection fails, temporarily activate target tab for retry
   * Returns { success, error? }
   */
  async function injectIntoTab(tab: AiTab, payload: object): Promise<{ success: boolean; error?: string }> {
    const ready = await ensureContentScriptInTab(tab.tabId);
    if (!ready) {
      return { success: false, error: `Content script could not be loaded in ${tab.name} tab` };
    }

    // Step 1: FIRST attempt injection WITHOUT activating/switching tabs
    logger.info(`injectIntoTab: Step 1 - Attempting background injection without tab switch in ${tab.name} (tab ${tab.tabId})`);
    try {
      const bgResponse = await sendMessageToTab(tab.tabId, {
        action: 'INJECT_PAYLOAD',
        payload
      }, 2, 50); // Fast initial background probe
      if (bgResponse && bgResponse.success) {
        logger.info(`injectIntoTab: Background injection SUCCEEDED in ${tab.name} (tab ${tab.tabId}) without switching tabs!`);
        return { success: true };
      }
      logger.info(`injectIntoTab: Background injection did not resolve editor in ${tab.name}. Falling back to tab activation retry...`);
    } catch (bgErr: any) {
      logger.info(`injectIntoTab: Background injection probe failed: ${bgErr.message}. Falling back to tab activation retry...`);
    }

    // Step 2: ONLY if activation is required, temporarily activate target tab
    logger.info(`injectIntoTab: Step 2 - Temporarily activating tab ${tab.tabId} (${tab.name}) for injection retry`);
    try {
      await chrome.tabs.update(tab.tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (focusErr: any) {
      logger.warn(`injectIntoTab: Could not focus tab ${tab.tabId}: ${focusErr.message}`);
    }

    try {
      const activeResponse = await sendMessageToTab(tab.tabId, {
        action: 'INJECT_PAYLOAD',
        payload
      });
      if (activeResponse && activeResponse.success) {
        logger.info(`injectIntoTab: Active tab injection succeeded in ${tab.name} (tab ${tab.tabId})`);
        return { success: true };
      }
      const err = activeResponse?.error || 'Editor not resolved';
      logger.warn(`injectIntoTab: Active tab injection failed in ${tab.name}: ${err}`);
      return { success: false, error: err };
    } catch (err: any) {
      logger.error(`injectIntoTab: Active tab injection message error for ${tab.name}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Route an injection payload to the correct AI tab(s):
   * - 0 tabs → fail pipeline with 'No supported AI tab found.'
   * - 1+ tabs → store pendingInjection + open popup for consistent user selection UX
   */
  async function routeInjection(
    payload: object,
    captureTabId: number
  ): Promise<void> {
    const aiTabs = await findSupportedAITabs();

    if (aiTabs.length === 0) {
      const msg = 'No supported AI tab found. Open ChatGPT, Claude, Gemini, Grok, or Perplexity in another tab.';
      logger.warn(`routeInjection: ${msg}`);
      await PipelineTracker.updateStep('Injection', 'FAIL', msg);
      await PipelineTracker.complete('FAIL', msg);
      return;
    }

    // Always defer to popup selector (1 or more AI tabs) for consistent UX
    logger.info(`routeInjection: ${aiTabs.length} AI tab(s) detected — storing pendingInjection & opening popup selector`);
    await chrome.storage.local.set({
      pendingInjection: {
        payload,
        captureTabId,
        candidates: aiTabs,
        timestamp: Date.now()
      }
    });
    await PipelineTracker.updateStep('Injection', 'PENDING', `${aiTabs.length} AI tab(s) available — select target in popup`);

    // Notify popup if already open; otherwise Chrome will show the badge
    chrome.runtime.sendMessage({ action: 'PENDING_INJECTION_READY', candidates: aiTabs }).catch(() => {});

    // Open the popup so the user can select
    try {
      await (chrome.action as any).openPopup();
    } catch {
      logger.warn('routeInjection: chrome.action.openPopup() unavailable; user must open popup manually.');
    }
  }

  // Trigger selection overlay in the active tab with dynamic content script inject fallback
  async function triggerOverlay(mode: 'snip' | 'ocr') {
    logger.debug(`Triggering overlay in mode: "${mode}"`);
    const steps = mode === 'snip' 
      ? ['Overlay', 'Coordinates', 'Capture', 'Crop', 'Clipboard', 'Injection']
      : ['Overlay', 'Coordinates', 'Capture', 'Crop', 'OCR Engine', 'Clipboard', 'Injection'];
    
    await PipelineTracker.start(mode === 'snip' ? 'Visual Snip' : 'OCR Code', steps);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        logger.warn('No active tab found to inject overlay');
        await PipelineTracker.updateStep('Overlay', 'FAIL', 'No active browser tab found');
        await PipelineTracker.complete('FAIL', 'No active tab');
        return;
      }

      // Check for restricted URLs before proceeding
      const url = tab.url || '';
      const restricted = [
        'chrome://',
        'chrome-extension://',
        'https://chromewebstore.google.com',
        'about:',
        'edge://'
      ];
      if (restricted.some(prefix => url.startsWith(prefix))) {
        logger.warn(`Overlay injection blocked for restricted security URL: "${url}"`);
        await PipelineTracker.updateStep('Overlay', 'FAIL', 'Restricted security page (chrome:// or WebStore)');
        await PipelineTracker.complete('FAIL', 'Restricted page context');
        return;
      }

      try {
        await sendMessageToTab(tab.id, {
          action: 'ACTIVATE_OVERLAY',
          mode
        });
        await PipelineTracker.updateStep('Overlay', 'SUCCESS');
      } catch (err) {
        logger.info('Content script overlay not loaded yet. Attempting dynamic script injection...');
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content-scripts/overlay.js']
          });
          logger.info('Dynamic overlay content script injection successful');
          await sendMessageToTab(tab.id, {
            action: 'ACTIVATE_OVERLAY',
            mode
          });
          await PipelineTracker.updateStep('Overlay', 'SUCCESS');
        } catch (injectErr: any) {
          logger.error('Failed to dynamically inject overlay content script', injectErr);
          await PipelineTracker.updateStep('Overlay', 'FAIL', injectErr.message || 'Script injection error');
          await PipelineTracker.complete('FAIL', 'Failed overlay script load');
        }
      }
    } catch (err: any) {
      logger.error('Failed overlay trigger workflow', err);
      await PipelineTracker.updateStep('Overlay', 'FAIL', err.message);
      await PipelineTracker.complete('FAIL', err.message);
    }
  }

  // Save a captured item into chrome.storage.session history
  async function saveToHistory(type: 'image' | 'text' | 'video', dataUrl: string, textPreview?: string) {
    logger.debug(`Saving capture item to history session: type=${type}`);
    try {
      const result = await chrome.storage.session.get('captureHistory');
      let history: HistoryItem[] = result.captureHistory || [];
      
      const newItem: HistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        dataUrl,
        textPreview,
        timestamp: Date.now()
      };

      // Keep only the latest 10 items
      history.unshift(newItem);
      if (history.length > 10) {
        history = history.slice(0, 10);
      }

      await chrome.storage.session.set({ captureHistory: history });
      logger.info(`Session history updated: ${history.length} items present`);
      
      // Broadcast updates to popup UI if open
      chrome.runtime.sendMessage({
        action: 'HISTORY_UPDATED',
        history
      }).catch(() => {
        // Ignore if popup dashboard is closed
      });

      return newItem;
    } catch (err: any) {
      logger.error('Failed to update session history storage', err);
    }
  }

  // Handle global extension commands (hotkeys)
  chrome.commands.onCommand.addListener((command) => {
    logger.info(`Global hotkey command triggered: "${command}"`);
    if (command === 'visual-snip') {
      triggerOverlay('snip');
    } else if (command === 'ocr-snip') {
      triggerOverlay('ocr');
    }
  });

  // Main message router
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 1. Coordinates received from Overlay Content Script
    if (message.action === 'REGION_SELECTED') {
      logger.info('Message received: REGION_SELECTED');
      logger.info('Message handled: Initiating handleRegionSelected processing flow');
      handleRegionSelected(message.mode, message.coords, sender.tab)
        .then(() => {
          logger.info('Response sent: REGION_SELECTED success');
          sendResponse({ success: true });
        })
        .catch(err => {
          logger.error('Region processing sequence halted', err);
          logger.info('Response sent: REGION_SELECTED error');
          sendResponse({ success: false, error: err.message });
        });
      return true; // Keep message channel open
    }

    // 2. Start tab recording command from Popup Dashboard
    if (message.action === 'START_TAB_RECORDING') {
      logger.info('Message received: START_TAB_RECORDING');
      logger.info('Message handled: Starting pipeline tracker and tab media capture');
      PipelineTracker.start('Tab Recording', ['Stream', 'Recording', 'Compilation', 'Injection']);
      startTabRecording()
        .then(() => {
          logger.info('Response sent: START_TAB_RECORDING success');
          sendResponse({ success: true });
        })
        .catch(err => {
          logger.error('Tab recording start pipeline failed', err);
          logger.info('Response sent: START_TAB_RECORDING error');
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    // 3. Stop tab recording command from Popup Dashboard
    if (message.action === 'STOP_TAB_RECORDING') {
      logger.info('Message received: STOP_TAB_RECORDING');
      logger.info('Message handled: Stop recording, compile chunks, and save to history');
      stopTabRecording()
        .then(item => {
          logger.info('Response sent: STOP_TAB_RECORDING success');
          sendResponse({ success: true, item });
        })
        .catch(err => {
          logger.error('Tab recording stop pipeline failed', err);
          logger.info('Response sent: STOP_TAB_RECORDING error');
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    // 4. Trigger overlay manually (from popup dashboard)
    if (message.action === 'TRIGGER_OVERLAY') {
      logger.info(`Message received: TRIGGER_OVERLAY (mode="${message.mode}")`);
      logger.info('Message handled: Dispatching activation overlay triggers to host window');
      triggerOverlay(message.mode)
        .then(() => {
          logger.info('Response sent: TRIGGER_OVERLAY success');
          sendResponse({ success: true });
        })
        .catch(err => {
          logger.error('Failed manual overlay trigger request', err);
          logger.info('Response sent: TRIGGER_OVERLAY error');
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    // 5. Handle limits reached in offscreen
    if (message.action === 'RECORDING_LIMIT_REACHED') {
      logger.warn('Offscreen signaled MediaRecorder limit hit (15s limit reached)');
      chrome.runtime.sendMessage({ action: 'RECORDING_AUTO_STOPPED' }).catch(() => {});
    }

    // 6. Popup dispatching a pending injection to selected tabs
    if (message.action === 'DISPATCH_PENDING_INJECTION') {
      const { selectedTabIds, payload } = message;
      logger.info(`Message received: DISPATCH_PENDING_INJECTION to ${selectedTabIds.length} tab(s)`);

      (async () => {
        const stored = await chrome.storage.local.get('pendingInjection');
        const captureTabId = stored.pendingInjection?.captureTabId;

        // Re-fetch candidate metadata so we have windowId for focus
        const allTabs = await findSupportedAITabs();
        const tabMap = new Map(allTabs.map(t => [t.tabId, t]));
        const results: Record<number, { success: boolean; error?: string }> = {};

        for (const tabId of selectedTabIds) {
          const tab = tabMap.get(tabId);
          if (!tab) {
            results[tabId] = { success: false, error: 'Tab no longer open' };
            continue;
          }
          results[tabId] = await injectIntoTab(tab, payload);
        }

        // Restore focus to the original capture tab
        if (captureTabId) {
          await restoreCaptureTabFocus(captureTabId);
        }

        // Clear pending state
        await chrome.storage.local.remove('pendingInjection');

        const anySuccess = Object.values(results).some(r => r.success);
        if (anySuccess) {
          await PipelineTracker.updateStep('Injection', 'SUCCESS');
          await PipelineTracker.complete('SUCCESS');
        } else {
          await PipelineTracker.updateStep('Injection', 'FAIL', 'Injection failed for selected tab(s)');
          await PipelineTracker.complete('FAIL', 'Injection failed for selected tab(s)');
        }

        logger.info(`DISPATCH_PENDING_INJECTION results: ${JSON.stringify(results)}`);
        sendResponse({ success: anySuccess, results });
      })();
      return true; // keep channel open for async response
    }
  });

  /**
   * Capture full tab viewport, send to offscreen document to crop, and process (OCR / Inject)
   */
  async function handleRegionSelected(
    mode: 'snip' | 'ocr',
    coords: Coords,
    activeTab?: chrome.tabs.Tab
  ) {
    logger.info(`handleRegionSelected initiated: mode=${mode}, coords=${JSON.stringify(coords)}`);
    if (!activeTab || !activeTab.id || !activeTab.windowId) {
      const err = new Error('No active tab context available');
      logger.error(`No active tab context available: aborting`, err);
      await PipelineTracker.updateStep('Coordinates', 'FAIL', err.message);
      await PipelineTracker.complete('FAIL', err.message);
      throw err;
    }

    try {
      await PipelineTracker.updateStep('Coordinates', 'SUCCESS');

      // 1. Capture visible tab viewport
      logger.info('Background ➔ Capture: Triggering chrome.tabs.captureVisibleTab...');
      let viewportDataUrl = '';
      try {
        viewportDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' });
        logger.info('Capture ➔ Background: Viewport captured successfully');
        await PipelineTracker.updateStep('Capture', 'SUCCESS');
      } catch (err: any) {
        logger.error(`Capture FAILED: ${err.message}. Sender: Background, Receiver: Tabs API`, err);
        await PipelineTracker.updateStep('Capture', 'FAIL', err.message);
        throw err;
      }

      // 2. Initialize Offscreen Document
      logger.info('Background ➔ Offscreen: setupOffscreenDocument triggered');
      await setupOffscreenDocument();

      // 3. Request offscreen to crop screenshot
      logger.info('Background ➔ Offscreen: Dispatching CROP_SCREENSHOT action to offscreen');
      let cropResponse: any = null;
      try {
        cropResponse = await sendMessageToOffscreen({
          target: 'offscreen',
          action: 'CROP_SCREENSHOT',
          dataUrl: viewportDataUrl,
          coords
        });
        if (!cropResponse || !cropResponse.success) {
          throw new Error(cropResponse?.error || 'Failed to crop image in offscreen document');
        }
        logger.info('Offscreen ➔ Background: Crop completed successfully');
        await PipelineTracker.updateStep('Crop', 'SUCCESS');
      } catch (err: any) {
        logger.error(`Crop FAILED: ${err.message}. Sender: Background, Receiver: Offscreen. Action: CROP_SCREENSHOT`, err);
        await PipelineTracker.updateStep('Crop', 'FAIL', err.message);
        throw err;
      }

      const croppedDataUrl = cropResponse.croppedDataUrl;

      if (mode === 'snip') {
        // Save diagnostic screenshot stats for Developer Panel UI
        chrome.storage.local.set({
          lastScreenshot: {
            width: coords.width,
            height: coords.height,
            size: croppedDataUrl.length
          }
        }).catch(() => {});

        // Store image in session storage history
        const item = await saveToHistory('image', croppedDataUrl);

        // Focus tab/window so content script has permission to write to clipboard
        try {
          logger.info('Focusing target tab and browser window to satisfy clipboard write gestures');
          await chrome.tabs.update(activeTab.id, { active: true });
          if (activeTab.windowId) {
            await chrome.windows.update(activeTab.windowId, { focused: true });
          }
        } catch (focusErr: any) {
          logger.warn(`Could not focus active tab/window: ${focusErr.message}`);
        }

        // Execute clipboard write via Tab content script context
        logger.info('Background ➔ Content: Requesting content script to write PNG image to system clipboard');
        let clipboardSuccess = false;
        try {
          const clipResponse = await sendMessageToTab(activeTab.id, {
            action: 'WRITE_CLIPBOARD',
            type: 'image',
            data: croppedDataUrl
          });
          clipboardSuccess = !!(clipResponse && clipResponse.success);
          if (clipboardSuccess) {
            logger.info('Content ➔ Background: Clipboard image write successful');
          } else {
            logger.warn(`Content ➔ Background: Clipboard image write failed: ${clipResponse?.error || 'Unknown content error'}`);
          }
        } catch (clipErr: any) {
          logger.error(`Clipboard Message FAILED: ${clipErr.message}. Sender: Background, Receiver: Content Script. Action: WRITE_CLIPBOARD`, clipErr);
        }

        if (clipboardSuccess) {
          await PipelineTracker.updateStep('Clipboard', 'SUCCESS');
        } else {
          await PipelineTracker.updateStep('Clipboard', 'FAIL', 'Focused tab clipboard write failed.');
        }
        
        // Route image into the correct AI tab (auto or popup-selected)
        logger.info('Background: Routing image snip to AI tab via routeInjection');
        await routeInjection(
          { type: 'image', dataUrl: croppedDataUrl, id: item?.id },
          activeTab.id
        );

      } else if (mode === 'ocr') {
        // Request offscreen to perform OCR
        logger.info('Background ➔ Offscreen: Dispatching RUN_OCR action to offscreen');
        let ocrResponse: any = null;
        try {
          ocrResponse = await sendMessageToOffscreen({
            target: 'offscreen',
            action: 'RUN_OCR',
            croppedDataUrl
          });
          if (!ocrResponse || !ocrResponse.success) {
            throw new Error(ocrResponse?.error || 'Failed to perform OCR in offscreen document');
          }
          logger.info('Offscreen ➔ Background: OCR execution succeeded');
          await PipelineTracker.updateStep('OCR Engine', 'SUCCESS');
        } catch (err: any) {
          logger.error(`OCR FAILED: ${err.message}. Sender: Background, Receiver: Offscreen. Action: RUN_OCR`, err);
          await PipelineTracker.updateStep('OCR Engine', 'FAIL', err.message);
          throw err;
        }

        const ocrText = ocrResponse.text;
        logger.info('Background Received Result: OCR text resolved');

        // Save diagnostic OCR stats for Developer Panel UI
        chrome.storage.local.set({
          ocrStatus: {
            loaded: true,
            lang: 'eng',
            lastTime: new Date().toLocaleTimeString()
          }
        }).catch(() => {});

        // Save OCR text to history
        const item = await saveToHistory('text', ocrText, ocrText.slice(0, 100));

        // Focus tab/window so content script has permission to write to clipboard
        try {
          logger.info('Focusing target tab and browser window to satisfy clipboard write gestures');
          await chrome.tabs.update(activeTab.id, { active: true });
          if (activeTab.windowId) {
            await chrome.windows.update(activeTab.windowId, { focused: true });
          }
        } catch (focusErr: any) {
          logger.warn(`Could not focus active tab/window: ${focusErr.message}`);
        }

        // Execute clipboard write via Tab content script context
        logger.info('Background ➔ Content: Requesting content script to write OCR text to system clipboard');
        let clipboardSuccess = false;
        try {
          const clipResponse = await sendMessageToTab(activeTab.id, {
            action: 'WRITE_CLIPBOARD',
            type: 'text',
            data: ocrText
          });
          clipboardSuccess = !!(clipResponse && clipResponse.success);
          if (clipboardSuccess) {
            logger.info('Content ➔ Background: Clipboard text write successful');
          } else {
            logger.warn(`Content ➔ Background: Clipboard text write failed: ${clipResponse?.error || 'Unknown content error'}`);
          }
        } catch (clipErr: any) {
          logger.error(`Clipboard Message FAILED: ${clipErr.message}. Sender: Background, Receiver: Content Script. Action: WRITE_CLIPBOARD`, clipErr);
        }

        if (clipboardSuccess) {
          await PipelineTracker.updateStep('Clipboard', 'SUCCESS');
        } else {
          await PipelineTracker.updateStep('Clipboard', 'FAIL', 'Focused tab clipboard write failed.');
        }

        // Route OCR text into the correct AI tab (auto or popup-selected)
        logger.info('Background: Routing OCR text to AI tab via routeInjection');
        await routeInjection(
          { type: 'text', data: ocrText, id: item?.id },
          activeTab.id
        );
      }

      // Clean up offscreen document since we are done with image operations
      logger.info('Background ➔ Offscreen: Requesting offscreen document shutdown');
      await closeOffscreenDocument();
      logger.info('Offscreen document closed successfully');

    } catch (pipelineErr: any) {
      logger.error(`Pipeline selected region crop flow crashed: ${pipelineErr.message}`, pipelineErr);
      await closeOffscreenDocument();
      throw pipelineErr;
    }
  }

  /**
   * Capture tab audio/video using chrome.tabCapture and offscreen MediaRecorder
   */
  async function startTabRecording() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      const err = new Error('No active tab found to record');
      await PipelineTracker.updateStep('Stream', 'FAIL', err.message);
      await PipelineTracker.complete('FAIL', err.message);
      throw err;
    }

    // Check for restricted URLs before capturing
    const url = tab.url || '';
    const restricted = [
      'chrome://',
      'chrome-extension://',
      'https://chromewebstore.google.com',
      'about:',
      'edge://'
    ];
    if (restricted.some(prefix => url.startsWith(prefix))) {
      const err = new Error('Chrome restricts video recording of internal system pages.');
      await PipelineTracker.updateStep('Stream', 'FAIL', err.message);
      await PipelineTracker.complete('FAIL', err.message);
      throw err;
    }

    // 1. Get media stream ID from active tab
    return new Promise<void>((resolve, reject) => {
      logger.debug(`Requesting mediaStreamId for tab ID: ${tab.id}`);
      (chrome.tabCapture as any).getMediaStreamId({ targetTabId: tab.id }, async (streamId: string) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || 'tabCapture failed';
          logger.error('getMediaStreamId failed', chrome.runtime.lastError);
          await PipelineTracker.updateStep('Stream', 'FAIL', errMsg);
          await PipelineTracker.complete('FAIL', errMsg);
          return reject(new Error(errMsg));
        }

        try {
          await PipelineTracker.updateStep('Stream', 'SUCCESS');

          // 2. Setup Offscreen Document
          await setupOffscreenDocument();

          // 3. Direct offscreen document to capture the stream and record it
          logger.debug('Dispatching START_RECORDING action to offscreen');
          const response = await sendMessageToOffscreen({
            target: 'offscreen',
            action: 'START_RECORDING',
            streamId
          });

          if (response && response.success) {
            logger.info('Tab Capture session recording has started in offscreen');
            await PipelineTracker.updateStep('Recording', 'SUCCESS');
            resolve();
          } else {
            const detail = response?.error || 'Failed to initiate recording inside offscreen document';
            await PipelineTracker.updateStep('Recording', 'FAIL', detail);
            await PipelineTracker.complete('FAIL', detail);
            reject(new Error(detail));
          }
        } catch (err: any) {
          await PipelineTracker.updateStep('Recording', 'FAIL', err.message);
          await PipelineTracker.complete('FAIL', err.message);
          reject(err);
        }
      });
    });
  }

  /**
   * Terminate recording, save the result, and clean up offscreen contexts
   */
  async function stopTabRecording() {
    // Ensure offscreen document is active
    await setupOffscreenDocument();

    logger.debug('Dispatching STOP_RECORDING action to offscreen');
    let response: any = null;
    try {
      response = await sendMessageToOffscreen({
        target: 'offscreen',
        action: 'STOP_RECORDING'
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to stop recording inside offscreen document');
      }
      await PipelineTracker.updateStep('Compilation', 'SUCCESS');
    } catch (err: any) {
      await PipelineTracker.updateStep('Compilation', 'FAIL', err.message);
      await PipelineTracker.complete('FAIL', err.message);
      await closeOffscreenDocument();
      throw err;
    }

    const videoDataUrl = response.videoDataUrl;
    logger.debug('Received video compilation WebM from offscreen');
    
    // Save video to history
    const item = await saveToHistory('video', videoDataUrl, 'Temporary 15s Tab Video Clip');

    // Inject video into target tab DOM if supported
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        logger.info('Sending INJECT_PAYLOAD to content script for tab video');
        const injectResponse = await sendMessageToTab(tab.id, {
          action: 'INJECT_PAYLOAD',
          payload: {
            type: 'video',
            dataUrl: videoDataUrl,
            id: item?.id
          }
        });

        if (injectResponse && injectResponse.success) {
          await PipelineTracker.updateStep('Injection', 'SUCCESS');
          await PipelineTracker.complete('SUCCESS');
        } else {
          const detail = injectResponse?.error || 'Target editor prompt not resolved or inactive';
          await PipelineTracker.updateStep('Injection', 'FAIL', detail);
          await PipelineTracker.complete('FAIL', detail);
        }
      } else {
        throw new Error('No active tab resolved for final injection');
      }
    } catch (err: any) {
      logger.warn('Could not inject video clip to active page: ' + err.message);
      await PipelineTracker.updateStep('Injection', 'FAIL', err.message);
      await PipelineTracker.complete('FAIL', err.message);
    }

    // Close offscreen document
    await closeOffscreenDocument();

    return item;
  }
});
