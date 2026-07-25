import { injectImageToLLM, injectTextToLLM } from '../utils/llmInjectors';
import { createLogger } from '../utils/logger';

const logger = createLogger('Content');

export default defineContentScript({
  matches: [
    '*://chatgpt.com/*',
    '*://*.chatgpt.com/*',
    '*://claude.ai/*',
    '*://*.claude.ai/*',
    '*://gemini.google.com/*',
    '*://grok.com/*',
    '*://*.grok.com/*',
    '*://x.com/i/grok',
    '*://*.x.com/i/grok',
    '*://perplexity.ai/*',
    '*://*.perplexity.ai/*'
  ],
  main() {
    logger.info(`LLM Context Capture content script loaded on: ${window.location.hostname}`);

    // Detect AI provider name
    const host = window.location.hostname.toLowerCase();
    let provider: 'ChatGPT' | 'Claude' | 'Gemini' | 'Grok' | 'Perplexity' = 'ChatGPT';
    if (host.includes('chatgpt.com')) provider = 'ChatGPT';
    else if (host.includes('claude.ai')) provider = 'Claude';
    else if (host.includes('gemini.google.com')) provider = 'Gemini';
    else if (host.includes('grok.com') || host.includes('x.com')) provider = 'Grok';
    else if (host.includes('perplexity.ai')) provider = 'Perplexity';

    // Send proactive REGISTER_AI_TAB message to background
    const registerSelf = () => {
      chrome.runtime.sendMessage({
        action: 'REGISTER_AI_TAB',
        provider,
        url: window.location.href,
        title: document.title || provider,
        timestamp: Date.now()
      }).catch(() => {});
    };
    registerSelf();

    // Re-register if title changes dynamically (SPA navigation)
    let lastTitle = document.title;
    const titleObserver = new MutationObserver(() => {
      if (document.title !== lastTitle) {
        lastTitle = document.title;
        registerSelf();
      }
    });
    const titleNode = document.querySelector('title');
    if (titleNode) {
      titleObserver.observe(titleNode, { childList: true });
    }

    // Unregister on page unload
    window.addEventListener('beforeunload', () => {
      chrome.runtime.sendMessage({ action: 'UNREGISTER_AI_TAB' }).catch(() => {});
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Liveness probe used by background to check if content script is loaded
      if (message.action === 'PING') {
        sendResponse({ pong: true });
        return;
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

      if (message.action === 'INJECT_PAYLOAD') {
        const { type } = message.payload;
        logger.info(`Message received: INJECT_PAYLOAD for type="${type}"`);

        if (type === 'image') {
          logger.info('Message handled: Injecting image crop into target Chat window');
          injectImageToLLM(message.payload.dataUrl, false)
            .then(success => {
              logger.info(`Response sent: INJECT_PAYLOAD image success=${success}`);
              sendResponse({ success });
            })
            .catch(err => {
              logger.error(`Image injection FAILED: ${err.message}`, err);
              logger.info('Response sent: INJECT_PAYLOAD image error');
              sendResponse({ success: false, error: err.message });
            });
          return true; // Keep channel open
        }

        if (type === 'video') {
          logger.info('Message handled: Injecting compiled tab recording video into target Chat window');
          injectImageToLLM(message.payload.dataUrl, true)
            .then(success => {
              logger.info(`Response sent: INJECT_PAYLOAD video success=${success}`);
              sendResponse({ success });
            })
            .catch(err => {
              logger.error(`Video injection FAILED: ${err.message}`, err);
              logger.info('Response sent: INJECT_PAYLOAD video error');
              sendResponse({ success: false, error: err.message });
            });
          return true;
        }

        if (type === 'text') {
          logger.info('Message handled: Injecting OCR extracted text into target Chat window');
          injectTextToLLM(message.payload.data)
            .then(success => {
              logger.info(`Response sent: INJECT_PAYLOAD text success=${success}`);
              sendResponse({ success });
            })
            .catch(err => {
              logger.error(`Text injection FAILED: ${err.message}`, err);
              logger.info('Response sent: INJECT_PAYLOAD text error');
              sendResponse({ success: false, error: err.message });
            });
          return true;
        }
      }
    });
  }
});
