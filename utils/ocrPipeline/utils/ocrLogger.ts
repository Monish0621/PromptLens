/**
 * OCR Pipeline — Structured Logger
 *
 * All pipeline stages and utilities use ocrLog instead of calling
 * console.log directly.  Every message is prefixed [OCR] and routed
 * through the shared createLogger() so that logs are written to
 * chrome.storage when Debug Mode is enabled — consistent with the
 * rest of the extension.
 */
import { createLogger } from '../../logger';

const _inner = createLogger('OCR');

export const ocrLog = {
  debug: (msg: string)           => _inner.debug(msg),
  info:  (msg: string)           => _inner.info(msg),
  warn:  (msg: string, err?: any) => _inner.warn(err ? `${msg} | ${err?.message ?? String(err)}` : msg),
  error: (msg: string, err?: any) => _inner.error(msg, err),

  /**
   * Log a pipeline lifecycle banner.
   * Example output:  ─── OCR Pipeline Started ────────────────
   */
  pipeline(event: string) {
    const pad = '─'.repeat(Math.max(0, 44 - event.length - 5));
    _inner.info(`─── OCR ${event} ${pad}`);
  },

  /**
   * Log a stage timing summary line.
   * Example:  [OCR] ✔ RecognitionStage  SUCCESS  38ms
   */
  stageSummary(name: string, status: 'success' | 'warning' | 'error' | 'skipped', elapsedMs: number) {
    const icon = status === 'success' ? '✔'
               : status === 'warning' ? '⚠'
               : status === 'error'   ? '✖'
               : '○';
    _inner.info(`${icon} ${name.padEnd(22)} ${status.toUpperCase().padEnd(8)} ${elapsedMs}ms`);
  },
};
