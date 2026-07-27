export interface LogEntry {
  timestamp: string;
  module: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

class Logger {
  private moduleName: string;

  constructor(moduleName: string) {
    this.moduleName = moduleName;
  }

  private getTimestamp(): string {
    const now = new Date();
    const hrs = now.getHours().toString().padStart(2, '0');
    const mins = now.getMinutes().toString().padStart(2, '0');
    const secs = now.getSeconds().toString().padStart(2, '0');
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    return `${hrs}:${mins}:${secs}.${ms}`;
  }

  private async shouldLog(): Promise<boolean> {
    try {
      const res = await chrome.storage.local.get('debugMode');
      return !!res.debugMode;
    } catch {
      return false;
    }
  }

  private async writeLog(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', msg: string) {
    const timestamp = this.getTimestamp();
    const structuredMsg = `[${timestamp}][${this.moduleName}] ${msg}`;
    
    // Always print to native console for development
    if (level === 'ERROR') {
      console.error(structuredMsg);
    } else if (level === 'WARN') {
      console.warn(structuredMsg);
    } else {
      console.log(structuredMsg);
    }

    // Write to storage if Debug Mode is enabled
    if (await this.shouldLog()) {
      try {
        const entry: LogEntry = {
          timestamp,
          module: this.moduleName,
          level,
          message: msg
        };

        const res = await chrome.storage.local.get('debugLogs');
        const logs: LogEntry[] = (res.debugLogs as LogEntry[]) || [];
        logs.push(entry);
        
        // Restrict to last 100 entries
        if (logs.length > 100) {
          logs.shift();
        }

        await chrome.storage.local.set({ debugLogs: logs });

        // Notify popup UI to hot-reload logs
        chrome.runtime.sendMessage({
          action: 'LOGS_UPDATED',
          logs
        }).catch(() => {
          // Ignore if popup is closed
        });
      } catch (err) {
        console.error('Failed to save log entry to storage:', err);
      }
    }
  }

  debug(msg: string) {
    this.writeLog('DEBUG', msg);
  }

  info(msg: string) {
    this.writeLog('INFO', msg);
  }

  warn(msg: string, err?: any) {
    let errorDetail = '';
    if (err) {
      errorDetail = ` | Details: ${err.message || err}`;
    }
    this.writeLog('WARN', `${msg}${errorDetail}`);
  }

  error(msg: string, err?: any) {
    let errorDetail = '';
    if (err) {
      errorDetail = ` | Error: ${err.message || err}`;
      if (err.stack) {
        errorDetail += `\nStack: ${err.stack}`;
      }
    }
    this.writeLog('ERROR', `${msg}${errorDetail}`);
  }
}

export function createLogger(moduleName: string): Logger {
  return new Logger(moduleName);
}

// Pipeline Trace Tracker interfaces
export interface TraceStep {
  name: string;
  status: 'PENDING' | 'SUCCESS' | 'FAIL';
  duration?: number;
}

export interface TraceData {
  name: string;
  startTime: number;
  lastStepTime: number;
  steps: TraceStep[];
  status: 'START' | 'SUCCESS' | 'FAIL';
}

export class PipelineTracker {
  static async start(name: string, stepNames: string[]) {
    const startTime = Date.now();
    const data: TraceData = {
      name,
      startTime,
      lastStepTime: startTime,
      steps: stepNames.map(step => ({ name: step, status: 'PENDING' })),
      status: 'START'
    };
    
    // Log start statement
    const logger = createLogger('PipelineTrace');
    logger.info(`[${name}] Starting pipeline trace tracker`);
    
    await chrome.storage.local.set({ activeTrace: data });
    chrome.runtime.sendMessage({ action: 'TRACE_UPDATED', trace: data }).catch(() => {});
  }

  static async updateStep(stepName: string, status: 'PENDING' | 'SUCCESS' | 'FAIL', detail?: string) {
    try {
      const res = await chrome.storage.local.get('activeTrace');
      const data: TraceData | undefined = res.activeTrace as TraceData | undefined;
      if (!data) return;

      const now = Date.now();
      const elapsed = now - data.lastStepTime;
      data.lastStepTime = now;

      let found = false;
      data.steps = data.steps.map(step => {
        if (step.name.toLowerCase() === stepName.toLowerCase()) {
          found = true;
          return { name: step.name, status, duration: elapsed };
        }
        return step;
      });

      if (!found) {
        data.steps.push({ name: stepName, status, duration: elapsed });
      }

      // Log step status update
      const logger = createLogger(data.name);
      const mark = status === 'SUCCESS' ? '✔' : '✖';
      if (status === 'SUCCESS') {
        logger.info(`${mark} ${stepName} completed successfully (+${elapsed}ms)`);
      } else {
        logger.error(`${mark} ${stepName} FAILED (+${elapsed}ms)${detail ? `: ${detail}` : ''}`);
      }

      await chrome.storage.local.set({ activeTrace: data });
      chrome.runtime.sendMessage({ action: 'TRACE_UPDATED', trace: data }).catch(() => {});
    } catch (err) {
      console.error('Failed to update trace step:', err);
    }
  }

  static async complete(status: 'SUCCESS' | 'FAIL', finalMessage?: string) {
    try {
      const res = await chrome.storage.local.get('activeTrace');
      const data: TraceData | undefined = res.activeTrace as TraceData | undefined;
      if (!data) return;

      const totalDuration = Date.now() - data.startTime;
      data.status = status;

      const logger = createLogger(data.name);
      if (status === 'SUCCESS') {
        logger.info(`Operation "${data.name}" fully succeeded (Total time: ${totalDuration}ms)`);
      } else {
        logger.error(`Operation "${data.name}" failed after ${totalDuration}ms. Reason: ${finalMessage || 'Unknown'}`);
      }

      await chrome.storage.local.set({ activeTrace: data });
      chrome.runtime.sendMessage({ action: 'TRACE_UPDATED', trace: data }).catch(() => {});
    } catch (err) {
      console.error('Failed to complete trace:', err);
    }
  }
}
