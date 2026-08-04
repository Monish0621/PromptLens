import { createLogger } from '../utils/logger';

const logger = createLogger('Overlay');

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: false,
  main() {
    if (window.top !== window.self) {
      return; // Restrict overlay to top-level window context only
    }

    if ((window as any).__llmContextCaptureOverlayLoaded) {
      logger.info('PromptLens overlay script already loaded, skipping registration.');
      return;
    }
    (window as any).__llmContextCaptureOverlayLoaded = true;

    let isOverlayActive = false;
    let mode: 'snip' | 'ocr' = 'snip';
    let overlayDiv: HTMLDivElement | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let startX = 0;
    let startY = 0;

    function showProcessingToast(message: string) {
      const toast = document.createElement('div');
      toast.style.position = 'fixed';
      toast.style.top = '20px';
      toast.style.right = '20px';
      toast.style.zIndex = '999999999';
      toast.style.background = 'rgba(15, 23, 42, 0.92)';
      toast.style.color = '#f8fafc';
      toast.style.padding = '10px 16px';
      toast.style.borderRadius = '10px';
      toast.style.fontSize = '13px';
      toast.style.fontWeight = '600';
      toast.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      toast.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)';
      toast.style.display = 'flex';
      toast.style.alignItems = 'center';
      toast.style.gap = '10px';
      toast.style.backdropFilter = 'blur(12px)';
      toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';

      const spinner = document.createElement('div');
      spinner.style.width = '14px';
      spinner.style.height = '14px';
      spinner.style.border = '2px solid rgba(255,255,255,0.2)';
      spinner.style.borderTopColor = '#38bdf8';
      spinner.style.borderRadius = '50%';
      spinner.style.animation = 'promptlens-spin 0.8s linear infinite';

      const styleTag = document.createElement('style');
      styleTag.textContent = `@keyframes promptlens-spin { to { transform: rotate(360deg); } }`;
      document.head.appendChild(styleTag);

      const textNode = document.createElement('span');
      textNode.textContent = message;

      toast.appendChild(spinner);
      toast.appendChild(textNode);
      document.body.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-8px)';
        setTimeout(() => toast.remove(), 250);
      }, 1800);
    }
    let isDragging = false;

    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      if (message.action === 'PING_OVERLAY') {
        sendResponse({ pong: true });
        return false;
      }

      if (message.action === 'ACTIVATE_OVERLAY') {
        logger.info(`Message received: ACTIVATE_OVERLAY (mode="${message.mode || 'snip'}")`);
        if (isOverlayActive) {
          cleanup();
        }
        mode = message.mode || 'snip';
        logger.info(`Message handled: Initializing selection overlay for "${mode}"`);
        initOverlay();
        sendResponse({ status: 'activated' });
        return false;
      }

      if (message.action === 'WRITE_CLIPBOARD') {
        logger.info('Message received: WRITE_CLIPBOARD');
        const { type, data } = message;
        logger.info(`Message handled: Writing ${type} to clipboard in focused page context`);

        const writePromise = type === 'text'
          ? (async () => {
              logger.debug('WRITE_CLIPBOARD ➔ System: Invoking navigator.clipboard.writeText...');
              await navigator.clipboard.writeText(data);
            })()
          : (async () => {
              logger.debug('WRITE_CLIPBOARD: Fetching image dataUrl...');
              const res = await fetch(data);
              logger.debug('WRITE_CLIPBOARD: Reading data as blob...');
              const blob = await res.blob();
              logger.info(`WRITE_CLIPBOARD: Created PNG blob - Size: ${blob.size} bytes, MIME: ${blob.type}`);
              logger.debug('WRITE_CLIPBOARD: Creating ClipboardItem...');
              const item = new ClipboardItem({ [blob.type]: blob });
              logger.debug('WRITE_CLIPBOARD ➔ System: Invoking navigator.clipboard.write...');
              await navigator.clipboard.write([item]);
            })();

        writePromise
          .then(() => {
            logger.info(`Response sent: WRITE_CLIPBOARD SUCCESS for type="${type}"`);
            sendResponse({ success: true });
          })
          .catch((err: any) => {
            logger.error(`WRITE_CLIPBOARD FAILED: ${err.message}. Sender: Content Script, Receiver: Clipboard API`, err);
            sendResponse({ success: false, error: err.message || err });
          });
        return true; // keep channel open for async write promise
      }

      if (message.action === 'SHOW_SHARE_SHEET') {
        logger.info('[CONTENT] Message received: SHOW_SHARE_SHEET');
        renderShareSheet(message.payload, message.candidates);
        sendResponse({ status: 'displayed' });
        return false;
      }

      if (message.action === 'SHOW_FLOATING_CONTROLLER') {
        logger.info('[CONTENT] Message received: SHOW_FLOATING_CONTROLLER');
        initFloatingController(message.startTime || Date.now());
        sendResponse({ status: 'displayed' });
        return false;
      }

      if (message.action === 'HIDE_FLOATING_CONTROLLER') {
        logger.info('[CONTENT] Message received: HIDE_FLOATING_CONTROLLER');
        cleanupFloatingController();
        sendResponse({ status: 'hidden' });
        return false;
      }
    });

    // Check on startup if recording is currently active for this tab/session
    try {
      chrome.storage.local.get('recordingState').then((res) => {
        const rec = (res.recordingState as any);
        if (rec?.isRecording && rec?.startTime) {
          initFloatingController(rec.startTime);
        }
      }).catch(() => {});
    } catch (err) {
      // Ignore errors on non-extension contexts
    }

    let shareSheetHost: HTMLDivElement | null = null;

    /**
     * Render the Share Sheet floating panel in the top-right corner of the webpage
     * Polished for Milestone 1: Compact preview, smooth motion, success feedback, and keyboard accessibility.
     */
    function renderShareSheet(payload: any, candidates: Array<{ tabId: number; name: string; title: string; favIconUrl?: string }>) {
      cleanupShareSheet();

      shareSheetHost = document.createElement('div');
      shareSheetHost.id = 'llm-sharesheet-host';
      shareSheetHost.style.position = 'fixed';
      shareSheetHost.style.zIndex = '2147483647';
      shareSheetHost.style.top = '20px';
      shareSheetHost.style.right = '20px';
      shareSheetHost.style.pointerEvents = 'auto';

      const shadow = shareSheetHost.attachShadow({ mode: 'open' });

      // Pre-select all candidate AI tabs
      const selectedIds = new Set<number>(candidates.map(c => c.tabId));

      const style = document.createElement('style');
      style.textContent = `
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        *:focus-visible {
          outline: 2px solid #818cf8 !important;
          outline-offset: 2px !important;
        }
        .sharesheet-panel {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 16px;
          width: 360px;
          max-width: calc(100vw - 40px);
          padding: 16px;
          box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(99, 102, 241, 0.2);
          color: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 12px;
          user-select: none;
          animation: slideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .sharesheet-panel.exiting {
          animation: slideOutRight 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes slideInRight {
          from {
            transform: translateX(120%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes slideOutRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(120%);
            opacity: 0;
          }
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #1e293b;
          padding-bottom: 10px;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .logo-box {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: #4f46e5;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
          flex-shrink: 0;
        }
        .sparkle-icon {
          width: 16px;
          height: 16px;
          color: #e0e7ff;
        }
        .title-container {
          display: flex;
          flex-direction: column;
        }
        .app-title {
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.2;
          letter-spacing: 0.01em;
        }
        .app-subtitle {
          font-size: 10px;
          color: #94a3b8;
          margin-top: 1px;
        }
        .badge {
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 9px;
          font-weight: 600;
          background: rgba(99, 102, 241, 0.15);
          color: #818cf8;
          border: 1px solid rgba(99, 102, 241, 0.3);
        }

        /* Capture Preview Box Styling */
        .preview-container {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 10px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .preview-badge {
          font-size: 10px;
          font-weight: 700;
          color: #818cf8;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .preview-thumb-box {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 6px;
        }
        .preview-img {
          width: 56px;
          height: 48px;
          object-fit: cover;
          border-radius: 6px;
          border: 1px solid #334155;
          background: #000000;
          flex-shrink: 0;
        }
        .preview-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .preview-meta-title {
          font-size: 11px;
          font-weight: 600;
          color: #f8fafc;
        }
        .preview-meta-sub {
          font-size: 9px;
          color: #94a3b8;
          font-family: monospace;
        }
        .ocr-preview-box {
          position: relative;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 8px 10px;
          max-height: 70px;
          overflow: hidden;
        }
        .ocr-text {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 10.5px;
          line-height: 1.45;
          color: #e2e8f0;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .ocr-fade {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 24px;
          background: linear-gradient(to bottom, transparent, #0f172a);
          pointer-events: none;
        }

        .selector-card {
          border: 1px solid rgba(99, 102, 241, 0.3);
          background: rgba(30, 27, 75, 0.3);
          border-radius: 12px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .selector-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .selector-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          font-weight: 700;
          color: #e2e8f0;
        }
        .send-icon {
          width: 13px;
          height: 13px;
          color: #818cf8;
        }
        .close-icon-btn {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 4px;
          transition: color 0.15s;
        }
        .close-icon-btn:hover {
          color: #f8fafc;
        }
        .candidates-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 180px;
          overflow-y: auto;
        }
        .candidate-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 10px;
          border-radius: 8px;
          border: 1px solid rgba(51, 65, 85, 0.6);
          background: rgba(30, 41, 59, 0.4);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .candidate-item:hover {
          border-color: #475569;
          background: #1e293b;
        }
        .candidate-item.selected {
          border-color: rgba(99, 102, 241, 0.5);
          background: rgba(99, 102, 241, 0.15);
        }
        .checkbox {
          width: 14px;
          height: 14px;
          accent-color: #6366f1;
          cursor: pointer;
          flex-shrink: 0;
          transition: transform 0.15s ease;
        }
        .checkbox:active {
          transform: scale(0.9);
        }
        .favicon {
          width: 15px;
          height: 15px;
          border-radius: 3px;
          flex-shrink: 0;
          object-fit: contain;
        }
        .info {
          flex: 1;
          min-width: 0;
        }
        .name {
          font-size: 11.5px;
          font-weight: 600;
          color: #f8fafc;
        }
        .tab-title {
          font-size: 9px;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 2px;
        }
        .btn {
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .btn:active:not(:disabled) {
          transform: scale(0.97);
        }
        .btn-cancel {
          background: #1e293b;
          color: #94a3b8;
          border: 1px solid #334155;
          width: 76px;
        }
        .btn-cancel:hover {
          background: #334155;
          color: #f8fafc;
        }
        .btn-send {
          flex: 1;
          background: #4f46e5;
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
        }
        .btn-send:hover:not(:disabled) {
          background: #4338ca;
        }
        .btn-send:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }
        .btn-send.btn-success {
          background: #10b981 !important;
          color: #ffffff !important;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3) !important;
        }
        .spinner {
          width: 12px;
          height: 12px;
          border: 2px solid #ffffff;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;

      const panel = document.createElement('div');
      panel.className = 'sharesheet-panel';

      // Build Capture Preview Section (PART 1)
      let previewHtml = '';
      if (payload?.type === 'image' && payload?.dataUrl) {
        const w = payload.width || 1920;
        const h = payload.height || 1080;
        previewHtml = `
          <div class="preview-container">
            <div class="preview-badge">📷 Screenshot Preview</div>
            <div class="preview-thumb-box">
              <img src="${payload.dataUrl}" class="preview-img" alt="Capture preview" />
              <div class="preview-meta">
                <div class="preview-meta-title">${w} × ${h}</div>
                <div class="preview-meta-sub">Captured just now</div>
              </div>
            </div>
          </div>
        `;
      } else if (payload?.type === 'text' && (payload?.data || payload?.textPreview)) {
        const rawText = (payload.data || payload.textPreview || '').trim();
        const firstLines = rawText.split('\n').slice(0, 4).join('\n');
        previewHtml = `
          <div class="preview-container">
            <div class="preview-badge">📄 OCR Preview</div>
            <div class="ocr-preview-box">
              <pre class="ocr-text">${escapeHtml(firstLines)}</pre>
              <div class="ocr-fade"></div>
            </div>
          </div>
        `;
      } else if (payload?.type === 'video') {
        const title = payload.durationText || payload.textPreview || 'Tab Video Clip';
        previewHtml = `
          <div class="preview-container">
            <div class="preview-badge">🎥 Tab Recording</div>
            <div class="preview-thumb-box">
              <div class="preview-meta">
                <div class="preview-meta-title">${escapeHtml(title)}</div>
                <div class="preview-meta-sub">Recorded just now</div>
              </div>
            </div>
          </div>
        `;
      }

      function escapeHtml(text: string) {
        return text.replace(/[&<>"']/g, m => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[m] || m));
      }

      // Header matching Extension Popup Top Section
      panel.innerHTML = `
        <div class="header">
          <div class="header-left">
            <div class="logo-box">
              <svg class="sparkle-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
              </svg>
            </div>
            <div class="title-container">
              <div class="app-title">Prompt<span style="margin-left: 2.5px;">Lens</span></div>
              <div class="app-subtitle">Select Destination</div>
            </div>
          </div>
          <div class="badge">Share Sheet</div>
        </div>

        ${previewHtml}

        <div class="selector-card">
          <div class="selector-header">
            <div class="selector-title">
              <svg class="send-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
              </svg>
              <span>Send Capture To</span>
            </div>
            <button class="close-icon-btn" id="closeBtn" aria-label="Close Share Sheet">&times;</button>
          </div>

          <div class="candidates-list" id="candidatesList"></div>

          <div class="actions">
            <button class="btn btn-cancel" id="cancelBtn" tabIndex="0">Cancel</button>
            <button class="btn btn-send" id="sendBtn" tabIndex="0"></button>
          </div>
        </div>
      `;

      const listEl = panel.querySelector('#candidatesList')!;
      const sendBtn = panel.querySelector('#sendBtn') as HTMLButtonElement;
      const cancelBtn = panel.querySelector('#cancelBtn') as HTMLButtonElement;
      const closeBtn = panel.querySelector('#closeBtn') as HTMLButtonElement;

      function updateSendButtonText() {
        const count = selectedIds.size;
        sendBtn.textContent = count === 0 ? 'Select target' : `Inject into ${count} tab${count > 1 ? 's' : ''}`;
        sendBtn.disabled = count === 0;
      }

      function renderCandidates() {
        listEl.innerHTML = '';
        if (candidates.length === 0) {
          listEl.innerHTML = `
            <div style="padding: 12px; font-size: 11px; color: #94a3b8; text-align: center; background: #1e293b50; border-radius: 8px; font-weight: 500;">
              No active AI tabs found (ChatGPT, Claude, Gemini, etc.). Context saved to History.
            </div>
          `;
          updateSendButtonText();
          return;
        }
        candidates.forEach(c => {
          const item = document.createElement('label');
          const isSelected = selectedIds.has(c.tabId);
          item.className = `candidate-item ${isSelected ? 'selected' : ''}`;
          item.tabIndex = 0;

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'checkbox';
          cb.checked = isSelected;

          cb.addEventListener('change', () => {
            if (cb.checked) {
              selectedIds.add(c.tabId);
            } else {
              selectedIds.delete(c.tabId);
            }
            item.className = `candidate-item ${cb.checked ? 'selected' : ''}`;
            updateSendButtonText();
          });

          // Keyboard space to toggle
          item.addEventListener('keydown', (e) => {
            if (e.key === ' ') {
              e.preventDefault();
              cb.checked = !cb.checked;
              cb.dispatchEvent(new Event('change'));
            }
          });

          const iconHtml = c.favIconUrl
            ? `<img class="favicon" src="${c.favIconUrl}" alt="" />`
            : `<svg class="favicon" fill="none" stroke="#818cf8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z"/></svg>`;

          item.appendChild(cb);
          item.insertAdjacentHTML('beforeend', `
            ${iconHtml}
            <div class="info">
              <div class="name">${c.name}</div>
              <div class="tab-title">${c.title || c.name}</div>
            </div>
          `);

          listEl.appendChild(item);
        });
        updateSendButtonText();
      }

      renderCandidates();

      function closeWithAnimation() {
        panel.classList.add('exiting');
        chrome.storage.local.remove('pendingInjection').catch(e => console.error(e));
        setTimeout(cleanupShareSheet, 200);
      }

      // Handlers
      cancelBtn.onclick = closeWithAnimation;
      closeBtn.onclick = closeWithAnimation;

      // Close when clicking outside the panel
      const handleOutsideClick = (e: MouseEvent) => {
        if (shareSheetHost && !e.composedPath().includes(panel)) {
          closeWithAnimation();
        }
      };

      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeWithAnimation();
        }
        if (e.key === 'Enter' && selectedIds.size > 0 && !sendBtn.disabled) {
          sendBtn.click();
        }
      };

      setTimeout(() => {
        window.addEventListener('click', handleOutsideClick);
        window.addEventListener('keydown', handleKey);
      }, 50);

      sendBtn.onclick = async () => {
        if (selectedIds.size === 0) return;
        sendBtn.disabled = true;
        sendBtn.innerHTML = `<span class="spinner"></span> Sending...`;

        try {
          const response = await chrome.runtime.sendMessage({
            action: 'DISPATCH_PENDING_INJECTION',
            selectedTabIds: Array.from(selectedIds),
            payload
          });
          logger.info(`Share Sheet injection dispatched: response=${JSON.stringify(response)}`);
          
          // Remove event listeners and trigger immediate exit animation
          window.removeEventListener('click', handleOutsideClick);
          window.removeEventListener('keydown', handleKey);
          closeWithAnimation();
        } catch (err: any) {
          logger.error('Share Sheet dispatch error: ' + err.message);
          sendBtn.disabled = false;
          updateSendButtonText();
        }
      };

      shadow.appendChild(style);
      shadow.appendChild(panel);
      document.body.appendChild(shareSheetHost);
    }

    function cleanupShareSheet() {
      if (shareSheetHost) {
        shareSheetHost.remove();
        shareSheetHost = null;
      }
    }

    function initOverlay() {
      isOverlayActive = true;

      // Create container
      overlayDiv = document.createElement('div');
      overlayDiv.id = 'llm-capture-overlay-container';
      overlayDiv.style.position = 'fixed';
      overlayDiv.style.top = '0';
      overlayDiv.style.left = '0';
      overlayDiv.style.width = '100vw';
      overlayDiv.style.height = '100vh';
      overlayDiv.style.zIndex = '999999999';
      overlayDiv.style.cursor = 'crosshair';
      overlayDiv.style.userSelect = 'none';
      overlayDiv.style.webkitUserSelect = 'none';

      // Create canvas
      canvas = document.createElement('canvas');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';

      ctx = canvas.getContext('2d');
      overlayDiv.appendChild(canvas);
      document.body.appendChild(overlayDiv);

      // Initial draw
      drawOverlay(0, 0, 0, 0);

      // Event listeners
      overlayDiv.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('resize', onResize);
    }

    function drawOverlay(x: number, y: number, w: number, h: number) {
      if (!ctx || !canvas) return;

      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw semi-transparent background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)'; // Sleek slate-900 transparent overlay
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (w > 0 && h > 0) {
        // Hollow out the selection box
        ctx.clearRect(x, y, w, h);

        // Draw nice accent border
        ctx.strokeStyle = '#6366f1'; // Indigo-500
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.strokeRect(x, y, w, h);

        // Add visual corner handles
        ctx.fillStyle = '#6366f1';
        const handleSize = 6;
        ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
        ctx.fillRect(x + w - handleSize/2, y - handleSize/2, handleSize, handleSize);
        ctx.fillRect(x - handleSize/2, y + h - handleSize/2, handleSize, handleSize);
        ctx.fillRect(x + w - handleSize/2, y + h - handleSize/2, handleSize, handleSize);

        // Draw selection dimensions & mode badge
        const badgeText = `${mode.toUpperCase()} Snip: ${w} × ${h}`;
        ctx.font = 'bold 12px sans-serif';
        const textWidth = ctx.measureText(badgeText).width;
        const badgeWidth = textWidth + 16;
        const badgeHeight = 24;
        
        // Position badge above or below the crop selection
        let badgeY = y - badgeHeight - 8;
        if (badgeY < 10) {
          badgeY = y + h + 8;
        }
        let badgeX = Math.max(8, Math.min(x, canvas.width - badgeWidth - 8));

        // Draw badge background
        ctx.fillStyle = '#1e1b4b'; // Indigo-950
        ctx.strokeStyle = '#818cf8'; // Indigo-400
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4);
        ctx.fill();
        ctx.stroke();

        // Draw badge text
        ctx.fillStyle = '#e0e7ff'; // Indigo-100
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, badgeX + 8, badgeY + badgeHeight / 2);
      } else {
        // Draw instructions in the center of the screen
        const instruction = 'Drag a box to capture. Press Esc to cancel.';
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.fillText(instruction, canvas.width / 2, canvas.height / 2);
      }
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return; // Only left click
      startX = e.clientX;
      startY = e.clientY;
      isDragging = true;
    }

    function onMouseMove(e: MouseEvent) {
      if (!isDragging) return;
      const currentX = e.clientX;
      const currentY = e.clientY;

      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(startX - currentX);
      const h = Math.abs(startY - currentY);

      drawOverlay(x, y, w, h);
    }

    function onMouseUp(e: MouseEvent) {
      if (!isDragging) return;
      isDragging = false;

      const currentX = e.clientX;
      const currentY = e.clientY;

      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(startX - currentX);
      const h = Math.abs(startY - currentY);

      cleanup();

      if (w > 5 && h > 5) {
        const coords = {
          x,
          y,
          width: w,
          height: h,
          devicePixelRatio: window.devicePixelRatio || 1
        };

        logger.info(`Selection completed: x=${x}, y=${y}, width=${w}, height=${h}`);
        logger.info('Overlay ➔ Background: Sending REGION_SELECTED');
        if (mode === 'ocr') {
          showProcessingToast('Extracting text with local OCR...');
        }
        chrome.runtime.sendMessage({
          action: 'REGION_SELECTED',
          mode,
          coords
        });
      } else {
        logger.warn('Selection box too small, cancelled');
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        logger.info('Overlay selection cancelled via ESC key');
        cleanup();
      }
    }

    function onResize() {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        drawOverlay(0, 0, 0, 0);
      }
    }

    function cleanup() {
      isOverlayActive = false;
      isDragging = false;

      if (overlayDiv) {
        overlayDiv.removeEventListener('mousedown', onMouseDown);
        overlayDiv.remove();
        overlayDiv = null;
      }

      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);

      canvas = null;
      ctx = null;
    }

    let floatingControllerDiv: HTMLDivElement | null = null;
    let floatingTimerInterval: number | null = null;

    function formatElapsedTimer(seconds: number): string {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const mm = String(mins).padStart(2, '0');
      const ss = String(secs).padStart(2, '0');
      return `${mm}:${ss}`;
    }

    function initFloatingController(startTime: number) {
      if (floatingControllerDiv) {
        cleanupFloatingController();
      }

      const savedTop = sessionStorage.getItem('pl_rec_widget_top') || '20px';
      const savedLeft = sessionStorage.getItem('pl_rec_widget_left') || `${Math.max(20, window.innerWidth - 200)}px`;

      const widget = document.createElement('div');
      widget.id = 'promptlens-recording-controller';
      widget.setAttribute('role', 'region');
      widget.setAttribute('aria-label', 'PromptLens Recording Controller');

      Object.assign(widget.style, {
        position: 'fixed',
        top: savedTop,
        left: savedLeft,
        zIndex: '2147483647',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 14px',
        backgroundColor: '#0F172A',
        color: '#F8FAFC',
        border: '1px solid #1E293B',
        borderRadius: '24px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        fontWeight: '600',
        userSelect: 'none',
        cursor: 'grab',
        transition: 'box-shadow 0.2s ease, opacity 0.2s ease',
      });

      widget.innerHTML = `
        <style>
          #promptlens-recording-controller:hover {
            border-color: #334155 !important;
            box-shadow: 0 12px 28px -5px rgba(0, 0, 0, 0.6) !important;
          }
          .pl-rec-dot {
            width: 10px;
            height: 10px;
            background-color: #EF4444;
            border-radius: 50%;
            animation: pl-pulse 1.5s infinite ease-in-out;
            flex-shrink: 0;
          }
          @keyframes pl-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.85); }
          }
          .pl-rec-timer {
            font-family: 'JetBrains Mono', monospace, ui-monospace, monospace;
            font-size: 13px;
            color: #F8FAFC;
            letter-spacing: 0.5px;
            min-width: 42px;
          }
          .pl-rec-stop-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            background: #EF4444;
            color: #FFFFFF;
            border: none;
            border-radius: 12px;
            padding: 4px 10px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            transition: background-color 0.15s ease, transform 0.1s ease;
          }
          .pl-rec-stop-btn:hover {
            background-color: #DC2626;
            transform: scale(1.03);
          }
          .pl-rec-stop-btn:focus-visible {
            outline: 2px solid #60A5FA;
            outline-offset: 2px;
          }
          .pl-rec-stop-icon {
            width: 8px;
            height: 8px;
            background-color: #FFFFFF;
            border-radius: 1px;
          }
        </style>
        <div class="pl-rec-dot"></div>
        <div class="pl-rec-timer" id="pl-timer-text">00:00</div>
        <button class="pl-rec-stop-btn" id="pl-stop-btn" aria-label="Stop Recording" tabIndex="0">
          <div class="pl-rec-stop-icon"></div>
          <span>STOP</span>
        </button>
      `;

      document.body.appendChild(widget);
      floatingControllerDiv = widget;

      const timerTextEl = widget.querySelector('#pl-timer-text');
      const updateTimer = () => {
        const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
        if (timerTextEl) {
          timerTextEl.textContent = formatElapsedTimer(elapsed);
        }
      };
      updateTimer();
      floatingTimerInterval = window.setInterval(updateTimer, 1000);

      const stopBtn = widget.querySelector('#pl-stop-btn');
      if (stopBtn) {
        stopBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          logger.info('[Overlay] Stop clicked from floating recording controller');
          chrome.runtime.sendMessage({ action: 'STOP_TAB_RECORDING' });
        });
        stopBtn.addEventListener('keydown', (e: any) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            logger.info('[Overlay] Stop triggered via keyboard from floating recording controller');
            chrome.runtime.sendMessage({ action: 'STOP_TAB_RECORDING' });
          }
        });
      }

      let isDraggingWidget = false;
      let dragOffsetX = 0;
      let dragOffsetY = 0;

      widget.addEventListener('mousedown', (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('.pl-rec-stop-btn')) return;
        if (e.button !== 0) return;

        isDraggingWidget = true;
        widget.style.cursor = 'grabbing';
        dragOffsetX = e.clientX - widget.getBoundingClientRect().left;
        dragOffsetY = e.clientY - widget.getBoundingClientRect().top;
        e.preventDefault();
      });

      const onWidgetMouseMove = (e: MouseEvent) => {
        if (!isDraggingWidget || !floatingControllerDiv) return;

        let newLeft = e.clientX - dragOffsetX;
        let newTop = e.clientY - dragOffsetY;

        const maxLeft = window.innerWidth - floatingControllerDiv.offsetWidth - 10;
        const maxTop = window.innerHeight - floatingControllerDiv.offsetHeight - 10;
        newLeft = Math.max(10, Math.min(newLeft, maxLeft));
        newTop = Math.max(10, Math.min(newTop, maxTop));

        floatingControllerDiv.style.left = `${newLeft}px`;
        floatingControllerDiv.style.top = `${newTop}px`;

        sessionStorage.setItem('pl_rec_widget_left', `${newLeft}px`);
        sessionStorage.setItem('pl_rec_widget_top', `${newTop}px`);
      };

      const onWidgetMouseUp = () => {
        if (isDraggingWidget) {
          isDraggingWidget = false;
          if (floatingControllerDiv) {
            floatingControllerDiv.style.cursor = 'grab';
          }
        }
      };

      window.addEventListener('mousemove', onWidgetMouseMove);
      window.addEventListener('mouseup', onWidgetMouseUp);
    }

    function cleanupFloatingController() {
      if (floatingTimerInterval) {
        clearInterval(floatingTimerInterval);
        floatingTimerInterval = null;
      }
      if (floatingControllerDiv) {
        floatingControllerDiv.remove();
        floatingControllerDiv = null;
      }
    }
  }
});
