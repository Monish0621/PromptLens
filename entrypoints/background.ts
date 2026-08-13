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
  let offscreenIdleTimer: any = null;
  const OFFSCREEN_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  function scheduleOffscreenIdleCleanup() {
    if (offscreenIdleTimer) clearTimeout(offscreenIdleTimer);
    offscreenIdleTimer = setTimeout(async () => {
      logger.info('Offscreen document idle timeout (5m) reached — closing offscreen context');
      await closeOffscreenDocument();
      offscreenIdleTimer = null;
    }, OFFSCREEN_IDLE_TIMEOUT_MS);
  }

  // Ensure the offscreen document is opened with a persistent set of reasons
  async function setupOffscreenDocument() {
    if (offscreenIdleTimer) {
      clearTimeout(offscreenIdleTimer);
      offscreenIdleTimer = null;
    }

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
      scheduleOffscreenIdleCleanup();
    } finally {
      offscreenPromise = null;
    }
  }

  // Close the offscreen document
  async function closeOffscreenDocument() {
    if (offscreenIdleTimer) {
      clearTimeout(offscreenIdleTimer);
      offscreenIdleTimer = null;
    }
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

  // ── Persistent AI Tab Registry ─────────────────────────────────────────────

  const AI_TAB_PATTERNS: Array<{ name: string; test: (url: URL) => boolean }> = [
    { name: 'ChatGPT',    test: u => u.hostname.endsWith('chatgpt.com') },
    { name: 'Claude',     test: u => u.hostname.endsWith('claude.ai') },
    { name: 'Gemini',     test: u => u.hostname === 'gemini.google.com' },
    { name: 'Grok',       test: u => u.hostname.endsWith('grok.com') || (u.hostname.endsWith('x.com') && u.pathname.startsWith('/i/grok')) },
    { name: 'Perplexity', test: u => u.hostname.endsWith('perplexity.ai') },
  ];

  interface RegisteredAiTab {
    tabId: number;
    windowId: number;
    name: string;
    provider: 'ChatGPT' | 'Claude' | 'Gemini' | 'Grok' | 'Perplexity';
    title: string;
    url: string;
    favIconUrl?: string;
    ready: boolean;
    timestamp: number;
  }

  class AiTabRegistryManager {
    private registry = new Map<number, RegisteredAiTab>();

    constructor() {
      this.init();
    }

    private async init() {
      // Restore cached registry state from local storage
      try {
        const res = await chrome.storage.local.get('aiTabRegistry');
        if (res.aiTabRegistry && Array.isArray(res.aiTabRegistry)) {
          for (const item of res.aiTabRegistry) {
            this.registry.set(item.tabId, item);
          }
        }
      } catch {}

      // Clear any stale pending injection from a previous extension lifecycle
      chrome.storage.local.remove('pendingInjection').catch(() => {});

      // Initial proactive scan of open tabs on background start
      await this.reScanAllTabs();

      // Listen for tab removal (closing tab)
      chrome.tabs.onRemoved.addListener((tabId: number) => {
        this.unregister(tabId, 'Tab Closed');
      });

      // Listen for tab URL/title updates & navigation
      chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
        if (tab.url) {
          this.evaluateTab(tab);
        }
      });

      // Listen for tab replacement
      chrome.tabs.onReplaced.addListener((addedTabId: number, removedTabId: number) => {
        this.unregister(removedTabId, 'Tab Replaced');
        chrome.tabs.get(addedTabId).then((tab: chrome.tabs.Tab) => {
          if (tab) this.evaluateTab(tab);
        }).catch(() => {});
      });
    }

    public async reScanAllTabs() {
      try {
        const tabs = await chrome.tabs.query({});
        const currentIds = new Set<number>();

        for (const tab of tabs) {
          if (!tab.id || !tab.url) continue;

          const matched = this.evaluateTab(tab);
          if (matched) {
            currentIds.add(tab.id);

            // Proactively re-inject content script to recover orphaned script instances after extension reload
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content-scripts/content.js']
              });
            } catch {}
          }
        }

        // Purge any stale tab not in chrome.tabs
        for (const [tabId] of this.registry) {
          if (!currentIds.has(tabId)) {
            this.registry.delete(tabId);
          }
        }
        this.syncStorage();
      } catch (err: any) {
        logger.warn('Failed to rebuild AI Tab Registry: ' + err.message);
      }
    }

    // In-memory cache for resolved favicon data URIs
    private faviconCache = new Map<string, string>();

    private uint8ArrayToBase64(bytes: Uint8Array): string {
      let binary = '';
      const len = bytes.byteLength;
      const chunkSize = 8192;
      for (let i = 0; i < len; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk as any);
      }
      return btoa(binary);
    }

    public async resolveFavIconAsDataUri(tab: { url?: string; favIconUrl?: string }): Promise<string | undefined> {
      if (!tab.url) return tab.favIconUrl;
      if (tab.favIconUrl && tab.favIconUrl.startsWith('data:')) {
        return tab.favIconUrl;
      }

      let domain = '';
      try {
        domain = new URL(tab.url).hostname;
      } catch {
        return tab.favIconUrl;
      }

      const cacheKey = tab.favIconUrl || domain;
      if (this.faviconCache.has(cacheKey)) {
        return this.faviconCache.get(cacheKey);
      }

      const candidateUrls: string[] = [];
      if (tab.favIconUrl && tab.favIconUrl.startsWith('http')) {
        candidateUrls.push(tab.favIconUrl);
      }
      if (domain) {
        candidateUrls.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
        candidateUrls.push(`https://${domain}/favicon.ico`);
      }

      for (const url of candidateUrls) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            const contentType = response.headers.get('content-type')?.split(';')[0].trim() || 'image/png';
            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength > 0) {
              const bytes = new Uint8Array(arrayBuffer);
              const b64 = this.uint8ArrayToBase64(bytes);
              const dataUri = `data:${contentType};base64,${b64}`;
              this.faviconCache.set(cacheKey, dataUri);
              return dataUri;
            }
          }
        } catch (err: any) {
          logger.debug(`resolveFavIconAsDataUri failed for ${url}: ${err.message}`);
        }
      }

      return tab.favIconUrl;
    }

    public evaluateTab(tab: chrome.tabs.Tab): RegisteredAiTab | null {
      if (!tab.id || !tab.windowId || !tab.url) return null;
      let urlObj: URL;
      try { urlObj = new URL(tab.url); } catch { return null; }

      const match = AI_TAB_PATTERNS.find(p => p.test(urlObj));
      if (match) {
        const existing = this.registry.get(tab.id);
        const registered: RegisteredAiTab = {
          tabId: tab.id,
          windowId: tab.windowId,
          provider: match.name as any,
          name: match.name,
          url: tab.url,
          title: tab.title || match.name,
          favIconUrl: tab.favIconUrl || existing?.favIconUrl,
          ready: true,
          timestamp: Date.now()
        };
        this.registry.set(tab.id, registered);
        this.syncStorage();

        // Asynchronously resolve raw favicon URL to base64 data URI
        this.resolveFavIconAsDataUri(tab).then(dataUri => {
          if (dataUri && dataUri !== registered.favIconUrl) {
            registered.favIconUrl = dataUri;
            this.registry.set(tab.id!, registered);
            this.syncStorage();
          }
        }).catch(() => {});

        logger.info(`AiTabRegistry: Evaluated & registered tab ${tab.id} (${match.name})`);
        return registered;
      } else {
        if (this.registry.has(tab.id)) {
          this.unregister(tab.id, 'Navigated away from AI domain');
        }
        return null;
      }
    }

    public registerFromMessage(senderTabId: number, senderWindowId: number, data: any) {
      if (!data?.url) {
        logger.warn(`AiTabRegistry: Rejected self-registration from tab ${senderTabId} - Missing URL`);
        return;
      }
      let urlObj: URL;
      try { urlObj = new URL(data.url); } catch { return; }

      const match = AI_TAB_PATTERNS.find(p => p.test(urlObj));
      if (!match) {
        logger.warn(`AiTabRegistry: Rejected self-registration from tab ${senderTabId} ("${data.url}") - Not a supported AI domain`);
        return;
      }

      const existing = this.registry.get(senderTabId);
      const provider = match.name as any;
      const updated: RegisteredAiTab = {
        tabId: senderTabId,
        windowId: senderWindowId,
        provider,
        name: provider,
        url: data.url,
        title: data.title || provider,
        favIconUrl: existing?.favIconUrl,
        ready: true,
        timestamp: Date.now()
      };
      this.registry.set(senderTabId, updated);
      this.syncStorage();
      logger.info(`AiTabRegistry: Self-registration validated & saved for tab ${senderTabId} (${provider})`);

      // Asynchronously refresh native Chrome tab properties and resolve favicon data URI
      chrome.tabs.get(senderTabId).then(async (tab: chrome.tabs.Tab) => {
        if (tab) {
          const resolvedFavicon = await this.resolveFavIconAsDataUri(tab);
          if (resolvedFavicon && resolvedFavicon !== updated.favIconUrl) {
            updated.favIconUrl = resolvedFavicon;
            this.registry.set(senderTabId, updated);
            this.syncStorage();
          }
        }
      }).catch(() => {});
    }

    public unregister(tabId: number, reason: string) {
      if (this.registry.has(tabId)) {
        this.registry.delete(tabId);
        this.syncStorage();
        logger.info(`AiTabRegistry: Unregistered tab ${tabId} Reason: [${reason}]`);
      }
    }

    public async getActiveCandidates(): Promise<RegisteredAiTab[]> {
      const candidates = Array.from(this.registry.values());
      const valid: RegisteredAiTab[] = [];

      for (const c of candidates) {
        try {
          const tab = await chrome.tabs.get(c.tabId);
          if (tab) {
            const resolvedFavicon = await this.resolveFavIconAsDataUri(tab);
            if (resolvedFavicon) {
              c.favIconUrl = resolvedFavicon;
            } else if (tab.favIconUrl) {
              c.favIconUrl = tab.favIconUrl;
            }
            valid.push(c);
          }
        } catch {
          this.unregister(c.tabId, 'Tab no longer exists');
        }
      }
      logger.info(`[BACKGROUND] Registry read: ${valid.length} active AI tabs found`);
      return valid;
    }

    private syncStorage() {
      const list = Array.from(this.registry.values());
      chrome.storage.local.set({ aiTabRegistry: list }).catch(() => {});
    }
  }

  const aiTabRegistry = new AiTabRegistryManager();

  /** Query registered AI tabs with zero latency */
  async function findSupportedAITabs(): Promise<RegisteredAiTab[]> {
    const candidates = await aiTabRegistry.getActiveCandidates();
    logger.info(`findSupportedAITabs: Registry returned ${candidates.length} active AI tab(s): ${candidates.map(t => t.name).join(', ') || 'none'}`);
    return candidates;
  }

  /**
   * Ensure overlay script is loaded in capture tab before sending SHOW_SHARE_SHEET
   */
  async function ensureOverlayScriptInTab(tabId: number): Promise<boolean> {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'PING_OVERLAY' });
      return true;
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-scripts/overlay.js']
        });
        logger.info(`ensureOverlayScriptInTab: Dynamically injected overlay.js into capture tab ${tabId}`);
        await new Promise(r => setTimeout(r, 100));
        return true;
      } catch (injErr: any) {
        logger.warn(`ensureOverlayScriptInTab failed for tab ${tabId}: ${injErr.message}`);
        return false;
      }
    }
  }

  /**
   * Ensure the content script is loaded in a tab.
   * Flow:
   * 1. PING existing content script
   * 2. If PING succeeds -> continue
   * 3. If PING fails -> attempt reinjection
   * 4. If reinjection fails -> return explicit reason
   */
  async function ensureContentScriptInTab(tabId: number): Promise<{ success: boolean; reason?: string }> {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      if (res && res.pong) {
        logger.info(`ensureContentScriptInTab: Content script PING succeeded for tab ${tabId}`);
        return { success: true };
      }
    } catch (pingErr: any) {
      logger.info(`ensureContentScriptInTab: Initial PING failed for tab ${tabId} (${pingErr.message}). Attempting reinjection fallback...`);
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/content.js']
      });
      await new Promise(r => setTimeout(r, 100));

      const verifyRes = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      if (verifyRes && verifyRes.pong) {
        logger.info(`ensureContentScriptInTab: Dynamically reinjected content script into tab ${tabId}`);
        return { success: true };
      }
      return { success: false, reason: 'Re-injected content script did not respond to PING verification' };
    } catch (injErr: any) {
      const reason = `Failed to inject content script into tab ${tabId}: ${injErr.message}`;
      logger.warn(`ensureContentScriptInTab: ${reason}`);
      return { success: false, reason };
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
  async function injectIntoTab(tab: RegisteredAiTab, payload: object): Promise<{ success: boolean; error?: string }> {
    const ready = await ensureContentScriptInTab(tab.tabId);
    if (!ready.success) {
      return { success: false, error: ready.reason || `Content script could not be loaded in ${tab.name} tab` };
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
    logger.info('[CAPTURE] Capture completed, reading AI Tab Registry...');
    const aiTabs = await findSupportedAITabs();

    logger.info(`[BACKGROUND] Registry read: ${aiTabs.length} AI tab(s) available for Share Sheet`);
    await chrome.storage.local.set({
      pendingInjection: {
        payload,
        captureTabId,
        candidates: aiTabs,
        timestamp: Date.now()
      }
    });
    await PipelineTracker.updateStep('Injection', 'PENDING', `${aiTabs.length} AI tab(s) available — select target in Share Sheet`);

    // Ensure overlay content script is ready in capture tab
    await ensureOverlayScriptInTab(captureTabId);

    // Display Share Sheet directly on the active capture tab
    try {
      logger.info(`[BACKGROUND] SHOW_SHARE_SHEET dispatched to capture tab ${captureTabId}`);
      await sendMessageToTab(captureTabId, {
        action: 'SHOW_SHARE_SHEET',
        payload,
        candidates: aiTabs
      });
      logger.info(`[BACKGROUND] SHOW_SHARE_SHEET successfully delivered to tab ${captureTabId}`);
      await PipelineTracker.updateStep('Injection', 'SUCCESS', 'Share Sheet displayed for target selection');
      await PipelineTracker.complete('SUCCESS');
    } catch (err: any) {
      logger.warn(`routeInjection: Could not send SHOW_SHARE_SHEET to capture tab ${captureTabId}: ${err.message}`);
      await PipelineTracker.updateStep('Injection', 'PENDING', 'Context saved to history — waiting for target selection in Share Sheet');
      await PipelineTracker.complete('SUCCESS');
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
      let history: HistoryItem[] = (result.captureHistory as HistoryItem[]) || [];
      
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
  chrome.commands.onCommand.addListener((command: string) => {
    logger.info(`Global hotkey command triggered: "${command}"`);
    if (command === 'visual-snip') {
      triggerOverlay('snip');
    } else if (command === 'ocr-snip') {
      triggerOverlay('ocr');
    }
  });

  // Handle extension installation & reload events to rebuild AI Tab Registry immediately
  chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
    logger.info(`[Startup] Extension ${details.reason} event detected. Triggering immediate AI Tab Registry rebuild...`);
    aiTabRegistry.reScanAllTabs();
  });

  // Main message router
  chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
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

    // 6. Register AI Tab message from content script
    if (message.action === 'REGISTER_AI_TAB' && sender.tab?.id && sender.tab?.windowId) {
      aiTabRegistry.registerFromMessage(sender.tab.id, sender.tab.windowId, message);
      sendResponse({ status: 'registered' });
      return false;
    }

    // 7. Unregister AI Tab message from content script
    if (message.action === 'UNREGISTER_AI_TAB' && sender.tab?.id) {
      aiTabRegistry.unregister(sender.tab.id, 'Content script unload');
      sendResponse({ status: 'unregistered' });
      return false;
    }

    // 6. Popup dispatching a pending injection to selected tabs
    if (message.action === 'DISPATCH_PENDING_INJECTION') {
      const { selectedTabIds, payload } = message;
      logger.info(`Message received: DISPATCH_PENDING_INJECTION to ${selectedTabIds.length} tab(s)`);

      (async () => {
        const stored = await chrome.storage.local.get('pendingInjection');
        const captureTabId = (stored.pendingInjection as any)?.captureTabId;

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
        const injectionId = 'inj-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        logger.info(`Background: Routing image snip (injectionId: ${injectionId}) to AI tab via routeInjection`);
        await routeInjection(
          { type: 'image', dataUrl: croppedDataUrl, id: item?.id, injectionId },
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
        const ocrInjectionId = 'inj-ocr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        logger.info(`Background: Routing OCR text (injectionId: ${ocrInjectionId}) to AI tab via routeInjection`);
        await routeInjection(
          { type: 'text', data: ocrText, id: item?.id, injectionId: ocrInjectionId },
          activeTab.id
        );
      }

      // Schedule offscreen document idle cleanup (reused across consecutive OCR requests)
      scheduleOffscreenIdleCleanup();

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

            const startTime = Date.now();
            const recState = { isRecording: true, startTime, tabId: tab.id };
            await chrome.storage.local.set({ recordingState: recState });

            // Ensure overlay script is injected before displaying floating recording controller
            if (tab.id) {
              ensureOverlayScriptInTab(tab.id)
                .then((loaded) => {
                  if (loaded && tab.id) {
                    sendMessageToTab(tab.id, {
                      action: 'SHOW_FLOATING_CONTROLLER',
                      startTime
                    }).catch((err) => {
                      logger.debug(`[Recording] SHOW_FLOATING_CONTROLLER delivery note: ${err.message}`);
                    });
                  }
                })
                .catch((err) => {
                  logger.debug(`[Recording] ensureOverlayScriptInTab note for floating controller: ${err.message}`);
                });
            }

            // Broadcast recording state to runtime (popup/dashboard)
            chrome.runtime.sendMessage({
              action: 'RECORDING_STATE_UPDATED',
              state: recState
            }).catch(() => {});

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
   * Helper to format recording duration into human-readable text for history metadata
   */
  function formatRecordingDuration(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins === 0) {
      return `${secs}s Recording`;
    }
    const ss = String(secs).padStart(2, '0');
    return `${mins}m ${ss}s Recording`;
  }

  /**
   * Terminate recording, save the result, and clean up offscreen contexts
   */
  async function stopTabRecording() {
    // Read active recordingState to hide floating controller and reset state
    const storedRec = await chrome.storage.local.get('recordingState');
    const recTabId = (storedRec.recordingState as any)?.tabId;
    const startTime = (storedRec.recordingState as any)?.startTime;

    if (recTabId) {
      sendMessageToTab(recTabId, { action: 'HIDE_FLOATING_CONTROLLER' }).catch(() => {});
    }

    const resetState = { isRecording: false, startTime: null, tabId: null };
    await chrome.storage.local.set({ recordingState: resetState });

    chrome.runtime.sendMessage({
      action: 'RECORDING_STATE_UPDATED',
      state: resetState
    }).catch(() => {});

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
    
    // Calculate actual recording duration for history metadata
    const elapsedSeconds = startTime ? Math.max(1, Math.round((Date.now() - startTime) / 1000)) : 1;
    const durationLabel = formatRecordingDuration(elapsedSeconds);

    // Save video to history with actual duration metadata
    const item = await saveToHistory('video', videoDataUrl, durationLabel);

    // Open existing Share Sheet for prompt routing (no auto-injection)
    const payload = {
      type: 'video',
      dataUrl: videoDataUrl,
      id: item?.id,
      textPreview: durationLabel,
      durationText: durationLabel
    };

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetTabId = activeTab?.id || recTabId;
      if (targetTabId) {
        logger.info(`Opening Share Sheet for recording payload on tab ${targetTabId}`);
        await routeInjection(payload, targetTabId);
      } else {
        logger.warn('No active tab resolved for Share Sheet display');
      }
    } catch (err: any) {
      logger.warn('Could not open Share Sheet for video clip: ' + err.message);
    }

    // Close offscreen document
    await closeOffscreenDocument();

    return item;
  }
});
