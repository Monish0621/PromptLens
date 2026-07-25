import { createWorker } from 'tesseract.js';
import { createLogger } from '../../utils/logger';

const logger = createLogger('Offscreen');

window.addEventListener('unload', () => {
  logger.warn('Offscreen: window unload event fired');
});

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let mediaStream: MediaStream | null = null;
let recordingTimeout: number | null = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.action === 'CROP_SCREENSHOT') {
    logger.debug('Received CROP_SCREENSHOT action');
    handleCrop(message.dataUrl, message.coords)
      .then((croppedDataUrl) => {
        sendResponse({ success: true, croppedDataUrl });
      })
      .catch(err => {
        logger.error('Crop failed', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.action === 'RUN_OCR') {
    logger.info('RUN_OCR message received');
    handleOcr(message.croppedDataUrl)
      .then((text) => {
        sendResponse({ success: true, text });
      })
      .catch(err => {
        logger.error('OCR failed. Stack trace:\n' + (err.stack || err.message || err));
        sendResponse({ success: false, error: err.stack || err.message || err });
      });
    return true;
  }

  if (message.action === 'START_RECORDING') {
    logger.debug('Received START_RECORDING action');
    handleStartRecording(message.streamId)
      .then(() => {
        logger.info('Recording setup complete inside offscreen document');
        sendResponse({ success: true });
      })
      .catch(err => {
        logger.error('Recording start failed', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.action === 'STOP_RECORDING') {
    logger.debug('Received STOP_RECORDING action');
    handleStopRecording()
      .then(videoDataUrl => {
        logger.info('Recording stop complete inside offscreen document');
        sendResponse({ success: true, videoDataUrl });
      })
      .catch(err => {
        logger.error('Recording stop failed', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

/**
 * Crops a viewport screenshot base64 image using a canvas, accounting for devicePixelRatio
 */
async function handleCrop(
  dataUrl: string,
  coords: { x: number; y: number; width: number; height: number; devicePixelRatio: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    logger.debug(`Cropping screenshot. Coords: x=${coords.x}, y=${coords.y}, w=${coords.width}, h=${coords.height}, dpr=${coords.devicePixelRatio}`);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        
        // Scale dimensions based on the captured pixel density (devicePixelRatio)
        const scale = coords.devicePixelRatio || 1;
        const cropX = coords.x * scale;
        const cropY = coords.y * scale;
        const cropW = coords.width * scale;
        const cropH = coords.height * scale;

        canvas.width = cropW;
        canvas.height = cropH;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2d canvas context'));
          return;
        }

        // Draw cropped area
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        const croppedDataUrl = canvas.toDataURL('image/png');
        logger.debug(`Screenshot cropped. Size: ${canvas.width}x${canvas.height}`);
        resolve(croppedDataUrl);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load screenshot image'));
    img.src = dataUrl;
  });
}

/**
 * Runs client-side OCR on a cropped image dataURL
 */
async function handleOcr(croppedDataUrl: string): Promise<string> {
  logger.info('Enter handleOcr()');
  logger.info('Creating worker');
  
  // Tesseract.js v7 createWorker(lang, oem, options):
  // - workerPath: full path to worker.min.js (ends in .js → used as-is by worker loader)
  // - corePath: full path to tesseract-core.wasm.js (ends in .js → loaded directly via importScripts)
  // - langPath: directory URL; worker fetches langPath/eng.traineddata.gz from this origin
  // - workerBlobURL: false → mandatory for MV3; prevents Blob URL worker creation which CSP blocks
  // - wasm-unsafe-eval in manifest CSP is required for WebAssembly.instantiate() inside wasm.js
  const worker = await createWorker('eng', 1, {
    workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
    corePath: chrome.runtime.getURL('tesseract/tesseract-core.wasm.js'),
    langPath: chrome.runtime.getURL('tesseract'),
    workerBlobURL: false,
    logger: (m) => {
      logger.debug(`OCR Progress: ${m.status} | ${(m.progress * 100).toFixed(0)}%`);
    }
  }).catch((err) => {
    logger.error('Worker Creation failed. Stack trace:\n' + (err.stack || err.message || err));
    throw err;
  });

  logger.info('Worker created');
  logger.info('Language loaded');

  try {
    logger.info('Recognition started');
    const { data: { text } } = await worker.recognize(croppedDataUrl);
    logger.info('Recognition finished');
    logger.info('Returning OCR result');
    return formatOcrResult(text);
  } catch (err: any) {
    logger.error('OCR recognition step failed. Stack trace:\n' + (err.stack || err.message || err));
    throw err;
  } finally {
    logger.info('Worker Terminated');
    await worker.terminate();
  }
}

/**
 * Heuristically formats OCR output to detect programming code and wraps it in markdown blocks
 */
function formatOcrResult(text: string): string {
  const cleaned = text.trim();
  if (!cleaned) return '';

  const codePatterns = [
    /const\s+\w+\s*=/, /let\s+\w+\s*=/, /var\s+\w+\s*=/,
    /function\s+\w+\(/, /import\s+.*\s+from/, /export\s+(const|default|class|interface)/,
    /class\s+\w+/, /interface\s+\w+/, /public\s+class\s+\w+/,
    /def\s+\w+\(/, /import\s+\w+/, /from\s+\w+\s+import/,
    /console\.log\(/, /print\(/, /#include\s+<\w+>/,
    /using\s+namespace\s+std;/, /System\.out\.println/,
    /<\/?[a-z][a-z0-9]*[^<>]*>/i, // HTML tags
    /\{\s*$/m, /\}\s*$/m // Curly brackets at end of lines
  ];

  const matchCount = codePatterns.filter(pattern => pattern.test(cleaned)).length;
  const semiColons = (cleaned.match(/;/g) || []).length;
  const braces = (cleaned.match(/[{}]/g) || []).length;

  // Heuristic: If we match multiple patterns, or have multiple lines with braces and semi-colons
  const isCode = matchCount >= 2 || (semiColons >= 3 && braces >= 2);

  if (isCode) {
    let lang = '';
    const lower = cleaned.toLowerCase();
    
    if (lower.includes('import react') || lower.includes('from \'react\'') || lower.includes('const [') || lower.includes('useeffect')) {
      lang = 'tsx';
    } else if (lower.includes('interface ') || lower.includes('type ') && (lower.includes(': string') || lower.includes(': number'))) {
      lang = 'typescript';
    } else if (lower.includes('def ') || lower.includes('import sys') || lower.includes('print(')) {
      lang = 'python';
    } else if (lower.includes('<html>') || lower.includes('<!doctype') || lower.includes('href=')) {
      lang = 'html';
    } else if (lower.includes('function ') || lower.includes('const ') || lower.includes('console.log')) {
      lang = 'javascript';
    } else if (lower.includes('#include') || lower.includes('std::') || lower.includes('int main(')) {
      lang = 'cpp';
    } else if (lower.includes('public class ') || lower.includes('system.out.print')) {
      lang = 'java';
    } else if (lower.includes('body {') || lower.includes('@media') || lower.includes('padding:')) {
      lang = 'css';
    }

    logger.debug(`Detected programming language: "${lang || 'text'}" for formatting`);
    return `\`\`\`${lang}\n${cleaned}\n\`\`\``;
  }

  return cleaned;
}

/**
 * Resets MediaRecorder, MediaStreams, and timeouts to guarantee clean capture allocations
 */
function cleanupRecording() {
  logger.debug('Executing active recording capture cleanup');
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
      logger.debug('Cleaned active MediaRecorder');
    } catch (e: any) {
      logger.warn('Failed to stop media recorder during cleanup: ' + e.message);
    }
  }
  if (mediaStream) {
    try {
      mediaStream.getTracks().forEach(track => {
        track.stop();
        logger.debug(`Closed media track: ${track.kind} (${track.label})`);
      });
    } catch (e: any) {
      logger.warn('Failed to stop track during stream cleanup: ' + e.message);
    }
    mediaStream = null;
  }
  mediaRecorder = null;
  recordedChunks = [];
}

/**
 * Starts recording a tab video stream
 */
async function handleStartRecording(streamId: string): Promise<void> {
  // Enforce zero double-stream allocations
  cleanupRecording();

  // Capture stream of the tab
  logger.debug(`Fetching MediaStream for streamId: ${streamId}`);
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    } as any,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    } as any
  }).catch(async (err) => {
    logger.warn('Failed to capture audio/video stream. Falling back to video-only.', err);
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      } as any
    });
  });

  if (!mediaStream) {
    throw new Error('Failed to capture tab media stream');
  }

  // Set up MediaRecorder (use standard vp8/vp9 webm)
  const mimeTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  
  let selectedMimeType = '';
  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      selectedMimeType = mimeType;
      break;
    }
  }

  logger.debug(`Initializing MediaRecorder with mimeType: "${selectedMimeType || 'default'}"`);
  mediaRecorder = new MediaRecorder(mediaStream, selectedMimeType ? { mimeType: selectedMimeType } : undefined);
  
  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.start();
  logger.info('MediaRecorder started recording tab chunks');

  // Automatic limit of 15 seconds
  recordingTimeout = window.setTimeout(() => {
    logger.warn('Recording 15-second timeout limit reached');
    chrome.runtime.sendMessage({
      action: 'RECORDING_LIMIT_REACHED',
      target: 'background'
    });
    // Delegate stop action to background router so it is saved to history & injected
    chrome.runtime.sendMessage({
      action: 'STOP_TAB_RECORDING'
    });
  }, 15000);
}

/**
 * Stops the recording and returns the compiled video data as base64 webm
 */
async function handleStopRecording(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (recordingTimeout) {
      clearTimeout(recordingTimeout);
      recordingTimeout = null;
    }

    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      reject(new Error('No active recording session found'));
      return;
    }

    mediaRecorder.onstop = () => {
      try {
        logger.debug(`Compilation triggered. Data chunks: ${recordedChunks.length}`);
        if (recordedChunks.length === 0) {
          reject(new Error('No video data captured. Please ensure the tab is active and has content.'));
          return;
        }

        const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
        
        // Clean up tracks
        if (mediaStream) {
          mediaStream.getTracks().forEach(track => track.stop());
          mediaStream = null;
        }
        mediaRecorder = null;

        // Convert Blob to Base64
        const reader = new FileReader();
        reader.onloadend = () => {
          logger.info('WebM compilation complete');
          resolve(reader.result as string);
        };
        reader.onerror = () => {
          reject(new Error('Failed to read video blob as dataURL'));
        };
        reader.readAsDataURL(videoBlob);
      } catch (err) {
        reject(err);
      }
    };

    mediaRecorder.stop();
    logger.debug('Dispatched mediaRecorder.stop()');
  });
}
