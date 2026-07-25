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
    });

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
