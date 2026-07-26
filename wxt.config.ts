import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LLM Context Capture',
    description: 'Capture screenshot regions, run client-side OCR, and auto-inject into ChatGPT, Claude, Gemini, Grok',
    version: '1.0.0',
    permissions: [
      'activeTab',
      'tabs',
      'scripting',
      'offscreen',
      'storage',
      'tabCapture',
      'clipboardWrite'
    ],
    host_permissions: [
      '*://chatgpt.com/*',
      '*://*.chatgpt.com/*',
      '*://claude.ai/*',
      '*://*.claude.ai/*',
      '*://gemini.google.com/*',
      '*://grok.com/*',
      '*://*.grok.com/*',
      '*://x.com/*',
      '*://*.x.com/*',
      '*://perplexity.ai/*',
      '*://*.perplexity.ai/*',
      '<all_urls>'
    ],
    // Required for Tesseract.js WebAssembly compilation inside the offscreen document.
    // tesseract-core.wasm.js calls WebAssembly.instantiate() internally, which Chrome
    // blocks under the default MV3 CSP unless 'wasm-unsafe-eval' is explicitly added.
    // Only 'self' and 'wasm-unsafe-eval' are permitted in MV3 extension_pages script-src.
    // 'unsafe-eval' is NOT used and would be rejected by the Chrome Web Store.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
    },
    commands: {
      'visual-snip': {
        suggested_key: {
          default: 'Alt+S'
        },
        description: 'Trigger visual screenshot selection overlay'
      },
      'ocr-snip': {
        suggested_key: {
          default: 'Alt+O'
        },
        description: 'Trigger visual selection overlay for OCR text extraction'
      }
    },
    action: {
      default_title: 'LLM Context Capture'
    },
    web_accessible_resources: [
      {
        resources: ['tesseract/*'],
        matches: ['<all_urls>']
      }
    ]
  }
});

