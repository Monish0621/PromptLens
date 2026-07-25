/**
 * DOM Input Selectors and Injection Engines for target AI sites
 */
import { createLogger } from './logger';

const logger = createLogger('Injectors');

// Helper to convert base64 image data URL to a File object
export async function dataURLtoFile(dataUrl: string, filename: string): Promise<File> {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

// Helper to recursively query elements inside open Shadow Roots
function deepQuerySelector(selector: string, root: Document | Element | ShadowRoot = document): HTMLElement | null {
  const el = (root as any).querySelector?.(selector);
  if (el) return el as HTMLElement;

  const allElements = (root as any).querySelectorAll?.('*') || [];
  for (const child of Array.from(allElements)) {
    const shadowRoot = (child as any).shadowRoot;
    if (shadowRoot) {
      const found = deepQuerySelector(selector, shadowRoot);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Discover a ready LLM input editor using a hybrid poll + MutationObserver race.
 *
 * Both strategies start simultaneously. Whichever finds a valid editor first wins.
 * The other is immediately cancelled. The resolved editor is guaranteed to be returned
 * exactly once — no duplicate injections.
 *
 * Readiness criteria (ALL must pass):
 *   ✓ exists in light DOM or any open shadow root (deepQuerySelector)
 *   ✓ isConnected === true
 *   ✓ getBoundingClientRect() width > 0 && height > 0  (visible, not hidden)
 *   ✓ tagName is TEXTAREA / INPUT, or contenteditable="true"
 *   ✓ not disabled
 *   ✓ not readonly
 */
export function waitForLLMInputElement(
  maxWaitMs = 3000,
  intervalMs = 150
): Promise<HTMLElement> {
  const currentUrl = window.location.href;
  logger.info(`[Inject] Starting editor discovery on: "${currentUrl}"`);

  const selectors = [
    // ChatGPT
    'textarea#prompt-textarea',
    '#prompt-textarea',
    'div[id="prompt-textarea"]',
    // Claude
    '.ProseMirror[contenteditable="true"]',
    '.ProseMirror',
    // Gemini
    'rich-textarea div[contenteditable="true"]',
    'rich-textarea div',
    'rich-textarea p',
    '.ql-editor[contenteditable="true"]',
    // Grok
    'textarea[placeholder*="Grok"]',
    'textarea[placeholder*="message"]',
    // Perplexity
    'textarea[placeholder*="Ask"]',
    'textarea[placeholder*="anything"]',
    '#perplexity-search-bar',
    // General targets
    'div[contenteditable="true"]',
    'textarea',
    '[role="textbox"]',
    '[contenteditable="true"]'
  ];

  /**
   * Test whether an element satisfies all readiness conditions.
   * Returns the element if ready, null otherwise.
   */
  function checkElement(el: HTMLElement): HTMLElement | null {
    if (!el.isConnected) return null;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const tag = el.tagName;
    const isEditable =
      tag === 'TEXTAREA' ||
      tag === 'INPUT' ||
      el.getAttribute('contenteditable') === 'true';
    if (!isEditable) return null;

    // Reject disabled / readonly fields
    if ((el as HTMLInputElement).disabled) return null;
    if ((el as HTMLInputElement).readOnly) return null;

    return el;
  }

  /**
   * Run one full scan across all selectors + active-element fallback.
   * Returns the first ready element found, or null.
   */
  function scanNow(): HTMLElement | null {
    for (const selector of selectors) {
      const el = deepQuerySelector(selector);
      if (el && checkElement(el)) return el;
    }

    // Active element fallback — only when nothing else matched
    const activeEl = document.activeElement as HTMLElement;
    if (activeEl && activeEl !== document.body && checkElement(activeEl)) {
      return activeEl;
    }

    return null;
  }

  /**
   * Generate detailed diagnostic report for Issue 5 troubleshooting
   */
  function generateDiagnosticReport(): string {
    const reports: string[] = [];
    for (const selector of selectors) {
      const el = deepQuerySelector(selector);
      if (!el) {
        reports.push(` - ${selector}: Not found in DOM or Shadow DOM`);
      } else {
        const isConnected = el.isConnected;
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        const tag = el.tagName.toLowerCase();
        const isEditable = tag === 'textarea' || tag === 'input' || el.getAttribute('contenteditable') === 'true';
        const isDisabled = !!(el as HTMLInputElement).disabled;
        const isReadOnly = !!(el as HTMLInputElement).readOnly;

        const reasons: string[] = [];
        if (!isConnected) reasons.push('disconnected from DOM');
        if (!isVisible) reasons.push(`zero rect area (${rect.width}x${rect.height})`);
        if (!isEditable) reasons.push(`non-editable tag <${tag}>`);
        if (isDisabled) reasons.push('disabled');
        if (isReadOnly) reasons.push('readOnly');

        reports.push(` - ${selector}: Matched <${tag}> but REJECTED -> Reasons: [${reasons.join(', ') || 'none'}]`);
      }
    }

    const activeEl = document.activeElement as HTMLElement;
    const activeTag = activeEl ? activeEl.tagName.toLowerCase() : 'none';
    const activeEditable = activeEl ? (activeTag === 'textarea' || activeTag === 'input' || activeEl.getAttribute('contenteditable') === 'true') : false;

    return `Editor not resolved on URL: "${currentUrl}".\n` +
      `Editor Readiness Audit:\n` +
      `Active Document Element: <${activeTag}> (editable: ${activeEditable})\n` +
      `Selector Analysis:\n` + reports.join('\n');
  }

  return new Promise<HTMLElement>((resolve, reject) => {
    let resolved = false;   // shared flag — only the first winner proceeds
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    // ── Cleanup: called exactly once on success, timeout, or exception ────────
    function cleanup() {
      if (pollTimer !== null) { clearTimeout(pollTimer); pollTimer = null; }
      if (deadlineTimer !== null) { clearTimeout(deadlineTimer); deadlineTimer = null; }
      if (observer !== null) { observer.disconnect(); observer = null; logger.debug('[Inject] Observer disconnected'); }
    }

    // ── Shared resolution: guarantees exactly-once semantics ─────────────────
    function win(el: HTMLElement, source: 'poll' | 'observer') {
      if (resolved) return;
      resolved = true;
      cleanup();
      logger.info(`[Inject] ${source === 'poll' ? 'Poll' : 'MutationObserver'} found editor — <${el.tagName.toLowerCase()}>`);
      resolve(el);
    }

    // ── Polling path: runs every intervalMs ───────────────────────────────────
    function poll() {
      if (resolved) return;
      const el = scanNow();
      if (el) {
        win(el, 'poll');
        return;
      }
      pollTimer = setTimeout(poll, intervalMs);
    }

    // ── MutationObserver path: fires on any DOM structural change ─────────────
    // We use a debounce flag so rapid mutation bursts (e.g. React reconciler)
    // only trigger one scan per animation frame.
    let observerPending = false;
    observer = new MutationObserver(() => {
      if (resolved || observerPending) return;
      observerPending = true;
      // requestAnimationFrame ensures the DOM has settled before we scan
      requestAnimationFrame(() => {
        observerPending = false;
        if (resolved) return;
        const el = scanNow();
        if (el) win(el, 'observer');
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      // Filter to only attributes that affect visibility / editability
      attributeFilter: ['style', 'class', 'hidden', 'disabled', 'readonly', 'contenteditable']
    });

    // ── Deadline: hard timeout ────────────────────────────────────────────────
    deadlineTimer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      const errorMessage = generateDiagnosticReport();
      logger.error(errorMessage);
      reject(new Error(errorMessage));
    }, maxWaitMs);

    // ── Start both strategies immediately ─────────────────────────────────────
    // Run one synchronous scan first — handles the case where the editor is
    // already present when injection begins (most common on stable pages).
    const immediate = scanNow();
    if (immediate) {
      win(immediate, 'poll');
      return;
    }

    // Not immediately present — start polling and observer concurrently
    pollTimer = setTimeout(poll, intervalMs);
  });
}


/**
 * Trigger hidden file inputs on the page by simulating programmatic change event.
 * Extremely robust fallback for ChatGPT, Claude, and Gemini file uploads.
 */
function triggerHiddenFileInput(file: File): boolean {
  logger.debug('Attempting Hidden File Input detection...');
  const fileInputs = document.querySelectorAll('input[type="file"]');
  logger.debug(`Found ${fileInputs.length} potential file inputs on page`);
  
  for (const input of Array.from(fileInputs)) {
    const fileInput = input as HTMLInputElement;
    const accept = fileInput.getAttribute('accept') || '';
    
    // Check if input accepts images or is a catch-all upload
    if (accept === '' || accept.includes('image') || accept.includes('video') || accept.includes('*')) {
      try {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        
        // Dispatch React/Vue native state change event
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        logger.info(`Successfully injected file via hidden input field: accept="${accept}"`);
        return true;
      } catch (err: any) {
        logger.warn('Programmatic file input assignment failed: ' + err.message);
      }
    }
  }
  return false;
}

/**
 * Tiered Injection Engine for Images (Screenshots / Videos)
 */
export async function injectImageToLLM(dataUrl: string, isVideo = false): Promise<boolean> {
  const fileType = isVideo ? 'video/webm' : 'image/png';
  const timestamp = Date.now();
  const randStr = Math.random().toString(36).substring(2, 7);
  const filename = isVideo ? `recording-${timestamp}-${randStr}.webm` : `snip-${timestamp}-${randStr}.png`;
  
  try {
    logger.debug(`Initing file injection: fileType=${fileType}, filename=${filename}`);
    const file = await dataURLtoFile(dataUrl, filename);

    // Save injection status update
    chrome.storage.local.set({
      injectionStatus: {
        targetDetected: false,
        method: 'None'
      }
    }).catch(() => {});

    // Write to clipboard as background backup
    await writeBlobToClipboard(file);

    // Try hidden file input selector first (extremely robust on ChatGPT / Claude)
    logger.info('Image Injection Stage 0: Checking hidden input file handlers...');
    if (triggerHiddenFileInput(file)) {
      logger.info('Stage 0 SUCCESS: Injected file via hidden input field');
      chrome.storage.local.set({
        injectionStatus: {
          targetDetected: true,
          method: 'Hidden File Input Trigger'
        }
      }).catch(() => {});
      return true;
    }

    logger.info('Stage 0 failed: Waiting for active target chat editor prompt input...');
    const inputEl = await waitForLLMInputElement();

    logger.info(`Active prompt input resolved: <${inputEl.tagName.toLowerCase()}>. Applying focus...`);
    inputEl.focus();
    // Yield one microtask so the focus event fully propagates before we dispatch synthetic events
    await new Promise(resolve => setTimeout(resolve, 0));

    // Stage 1: Simulated Paste Event
    logger.info('Image Injection fallback Stage 1: Dispatching Simulated ClipboardEvent("paste")...');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });

    const pasteDispatched = inputEl.dispatchEvent(pasteEvent);
    if (pasteDispatched) {
      logger.info('Stage 1 SUCCESS: Dispatched ClipboardEvent("paste") successfully');
      chrome.storage.local.set({
        injectionStatus: {
          targetDetected: true,
          method: 'ClipboardEvent Paste Emulation'
        }
      }).catch(() => {});
      return true;
    }

    // Stage 2: Native clipboard paste trigger fallback
    logger.info('Image Injection fallback Stage 2: Executing document.execCommand("paste")...');
    document.execCommand('paste');
    logger.info('Stage 2 EXECUTED: Dispatched native paste event');
    chrome.storage.local.set({
      injectionStatus: {
        targetDetected: true,
        method: 'execCommand("paste")'
      }
    }).catch(() => {});
    return true;

  } catch (err: any) {
    logger.error(`File injection failed: ${err.message}`, err);
    throw err;
  }
}

/**
 * Tiered Injection Engine for Text / OCR Results
 */
export async function injectTextToLLM(text: string): Promise<boolean> {
  try {
    logger.info('Initing text/OCR injection pipeline...');

    // Save injection status update
    chrome.storage.local.set({
      injectionStatus: {
        targetDetected: false,
        method: 'None'
      }
    }).catch(() => {});

    // Write text to clipboard as background backup
    try {
      logger.debug('Text Injection Stage 0: Writing text to clipboard backup...');
      await navigator.clipboard.writeText(text);
      logger.info('Stage 0 SUCCESS: Written OCR text payload to clipboard successfully');
    } catch (clipErr: any) {
      logger.warn(`Stage 0 warning: Clipboard text write backup failed inside content script: ${clipErr.message}`);
    }

    logger.info('Waiting for active target chat editor prompt input...');
    const inputEl = await waitForLLMInputElement();

    logger.info(`Active prompt input resolved: <${inputEl.tagName.toLowerCase()}>. Applying focus...`);
    inputEl.focus();
    // Yield one microtask so the focus event fully propagates before we dispatch synthetic events
    await new Promise(resolve => setTimeout(resolve, 0));

    // Stage 1: Simulated Paste Event
    logger.info('Text Injection fallback Stage 1: Dispatching Simulated ClipboardEvent("paste")...');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(text, 'text/plain');
    
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });

    inputEl.dispatchEvent(pasteEvent);
    logger.info('Stage 1 EXECUTED: Dispatched text ClipboardEvent("paste")');

    // Stage 2: document.execCommand("insertText") (extremely robust on ProseMirror / contenteditable)
    logger.info('Text Injection fallback Stage 2: Executing document.execCommand("insertText")...');
    const execSuccess = document.execCommand('insertText', false, text);
    if (execSuccess) {
      logger.info('Stage 2 SUCCESS: Inserted text via document.execCommand("insertText")');
      chrome.storage.local.set({
        injectionStatus: {
          targetDetected: true,
          method: 'document.execCommand("insertText")'
        }
      }).catch(() => {});
      return true;
    }

    // Stage 3: Direct React State Value Setter & Input Dispatch Mutations
    logger.info('Text Injection fallback Stage 3: Direct DOM mutation & Synthetic Event Dispatch...');
    const isContentEditable = inputEl.getAttribute('contenteditable') === 'true' || inputEl.tagName !== 'TEXTAREA';

    if (isContentEditable) {
      // Append text directly
      inputEl.textContent = (inputEl.textContent || '') + text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const textarea = inputEl as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      const newVal = val.substring(0, start) + text + val.substring(end);
      
      const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeValueSetter) {
        nativeValueSetter.call(textarea, newVal);
      } else {
        textarea.value = newVal;
      }
      
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    logger.info('Stage 3 SUCCESS: Inserted text via DOM state mutation');
    chrome.storage.local.set({
      injectionStatus: {
        targetDetected: true,
        method: 'Synthetic DOM Mutation'
      }
    }).catch(() => {});
    return true;

  } catch (err: any) {
    logger.error(`Text injection failed: ${err.message}`, err);
    throw err;
  }
}

/**
 * Utility to write files/blobs to user system clipboard
 */
async function writeBlobToClipboard(file: File): Promise<void> {
  try {
    window.focus(); // Enforce tab/window focus
    const item = new ClipboardItem({ [file.type]: file });
    await navigator.clipboard.write([item]);
    logger.debug('Copied file blob to page clipboard backup successfully');
  } catch (err: any) {
    logger.warn('Clipboard write fallback inside content script rejected: ' + err.message);
  }
}
