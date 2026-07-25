import { createLogger } from '../utils/logger';

const logger = createLogger('Overlay');

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    if ((window as any).__llmContextCaptureOverlayLoaded) {
      console.log('LLM Context Capture overlay script already loaded, skipping registration.');
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
    let isDragging = false;

    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
        logger.info('Message received: SHOW_SHARE_SHEET');
        renderShareSheet(message.payload, message.candidates);
        sendResponse({ status: 'displayed' });
        return false;
      }
    });

    let shareSheetHost: HTMLDivElement | null = null;

    /**
     * Render the Share Sheet floating panel in the top-right corner of the webpage
     * Matches the exact visual design of the extension popup header + destination selector.
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
          gap: 14px;
          user-select: none;
          animation: slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1);
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
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #1e293b;
          padding-bottom: 12px;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .logo-box {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #4f46e5;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
          flex-shrink: 0;
        }
        .sparkle-icon {
          width: 18px;
          height: 18px;
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
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .selector-card {
          border: 1px solid rgba(99, 102, 241, 0.3);
          background: rgba(30, 27, 75, 0.3);
          border-radius: 12px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
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
          font-size: 12px;
          font-weight: 700;
          color: #e2e8f0;
        }
        .send-icon {
          width: 14px;
          height: 14px;
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
          max-height: 200px;
          overflow-y: auto;
        }
        .candidate-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
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
        }
        .favicon {
          width: 16px;
          height: 16px;
          border-radius: 3px;
          flex-shrink: 0;
          object-fit: contain;
        }
        .info {
          flex: 1;
          min-width: 0;
        }
        .name {
          font-size: 12px;
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
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .btn-cancel {
          background: #1e293b;
          color: #94a3b8;
          border: 1px solid #334155;
          width: 80px;
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
        .btn-send:hover {
          background: #4338ca;
        }
        .btn-send:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          box-shadow: none;
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
              <div class="app-title">LLM Context Capture</div>
              <div class="app-subtitle">Select Destination</div>
            </div>
          </div>
          <div class="badge">Share Sheet</div>
        </div>

        <div class="selector-card">
          <div class="selector-header">
            <div class="selector-title">
              <svg class="send-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
              </svg>
              <span>Send Capture To</span>
            </div>
            <button class="close-icon-btn" id="closeBtn">&times;</button>
          </div>

          <div class="candidates-list" id="candidatesList"></div>

          <div class="actions">
            <button class="btn btn-cancel" id="cancelBtn">Cancel</button>
            <button class="btn btn-send" id="sendBtn"></button>
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
        candidates.forEach(c => {
          const item = document.createElement('label');
          const isSelected = selectedIds.has(c.tabId);
          item.className = `candidate-item ${isSelected ? 'selected' : ''}`;

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

      // Handlers
      cancelBtn.onclick = cleanupShareSheet;
      closeBtn.onclick = cleanupShareSheet;

      // Close when clicking outside the panel
      const handleOutsideClick = (e: MouseEvent) => {
        if (shareSheetHost && !e.composedPath().includes(panel)) {
          cleanupShareSheet();
        }
      };

      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') cleanupShareSheet();
      };

      setTimeout(() => {
        window.addEventListener('click', handleOutsideClick);
        window.addEventListener('keydown', handleKey);
      }, 50);

      sendBtn.onclick = async () => {
        if (selectedIds.size === 0) return;
        sendBtn.disabled = true;
        sendBtn.innerHTML = `<span class="spinner"></span> Injecting…`;

        try {
          const response = await chrome.runtime.sendMessage({
            action: 'DISPATCH_PENDING_INJECTION',
            selectedTabIds: Array.from(selectedIds),
            payload
          });
          logger.info(`Share Sheet injection dispatched: response=${JSON.stringify(response)}`);
        } catch (err: any) {
          logger.error('Share Sheet dispatch error: ' + err.message);
        } finally {
          window.removeEventListener('click', handleOutsideClick);
          window.removeEventListener('keydown', handleKey);
          cleanupShareSheet();
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
        logger.info(`Selection completed: x=${x}, y=${y}, width=${w}, height=${h}`);
        logger.info('Overlay ➔ Background: Sending REGION_SELECTED');
        chrome.runtime.sendMessage({
          action: 'REGION_SELECTED',
          mode,
          coords: {
            x,
            y,
            width: w,
            height: h,
            devicePixelRatio: window.devicePixelRatio || 1
          }
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
  }
});
