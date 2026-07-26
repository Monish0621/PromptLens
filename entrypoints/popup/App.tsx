import { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  FileText, 
  Video, 
  Trash2, 
  Copy, 
  CornerDownLeft, 
  Check, 
  Sparkles, 
  Clock, 
  AlertCircle,
  AlertTriangle,
  Bug,
  Cpu,
  Download,
  RefreshCw
} from 'lucide-react';
import './App.css';
import { createLogger, LogEntry, TraceData } from '../../utils/logger';

const logger = createLogger('Popup');

interface HistoryItem {
  id: string;
  type: 'image' | 'text' | 'video';
  dataUrl: string;
  textPreview?: string;
  timestamp: number;
}

export default function App() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [injectedId, setInjectedId] = useState<string | null>(null);
  
  const [activeSite, setActiveSite] = useState<{ name: string; url: string; supported: boolean } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Multi-tab injection selector state
  interface AiTabCandidate {
    tabId: number;
    windowId: number;
    name: string;
    title: string;
    url: string;
    favIconUrl?: string;
  }
  interface PendingInjection {
    payload: object;
    captureTabId: number;
    candidates: AiTabCandidate[];
    timestamp: number;
  }
  const [pendingInjection, setPendingInjection] = useState<PendingInjection | null>(null);
  const [selectedTabIds, setSelectedTabIds] = useState<Set<number>>(new Set());
  const [injectResults, setInjectResults] = useState<Record<number, 'pending' | 'success' | 'fail'>>({});
  const [isDispatching, setIsDispatching] = useState(false);

  // Debug settings & console state
  const [debugMode, setDebugMode] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [activeTrace, setActiveTrace] = useState<TraceData | null>(null);

  // Live developer tool statuses
  const [offscreenStatus, setOffscreenStatus] = useState<'Active' | 'Inactive'>('Inactive');
  const [lastScreenshot, setLastScreenshot] = useState<{ width: number; height: number; size: number } | null>(null);
  const [ocrStatus, setOcrStatus] = useState<{ loaded: boolean; lang: string; lastTime: string } | null>(null);
  const [injectionStatus, setInjectionStatus] = useState<{ targetDetected: boolean; method: string } | null>(null);

  const recordingIntervalRef = useRef<number | null>(null);

  // Load configuration, history, and status metrics on mount
  useEffect(() => {
    loadSettings();
    loadHistory();
    checkCurrentTab();
    refreshDevStats();
    loadPendingInjection();

    // Listen for real-time history and log broadcast updates
    const handleMessage = (message: any) => {
      if (message.action === 'HISTORY_UPDATED') {
        setHistory(message.history || []);
      }
      if (message.action === 'RECORDING_AUTO_STOPPED') {
        stopRecordingTimer();
        refreshDevStats();
      }
      if (message.action === 'LOGS_UPDATED') {
        setLogs(message.logs || []);
      }
      if (message.action === 'TRACE_UPDATED') {
        setActiveTrace(message.trace || null);
      }
      if (message.action === 'PENDING_INJECTION_READY') {
        // Background just stored a new pendingInjection — refresh immediately
        loadPendingInjection();
      }
    };

    // Storage change listener to ensure immediate UI sync if pendingInjection is written
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes.pendingInjection) {
        loadPendingInjection();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.storage.onChanged.removeListener(handleStorageChange);
      stopRecordingTimer();
    };
  }, []);

  const loadSettings = async () => {
    try {
      const res = await chrome.storage.local.get(['debugMode', 'debugLogs', 'activeTrace']);
      setDebugMode(!!res.debugMode);
      setLogs(res.debugLogs || []);
      if (res.activeTrace) {
        setActiveTrace(res.activeTrace);
      }
    } catch (err) {
      console.error('Settings load failed:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const result = await chrome.storage.session.get('captureHistory');
      setHistory(result.captureHistory || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const loadPendingInjection = async () => {
    try {
      const res = await chrome.storage.local.get('pendingInjection');
      const pending: PendingInjection | undefined = res.pendingInjection;
      if (pending && pending.candidates?.length >= 1) {
        // Pre-select all candidates
        setPendingInjection(pending);
        setSelectedTabIds(new Set(pending.candidates.map(c => c.tabId)));
        setInjectResults({});
      } else {
        setPendingInjection(null);
      }
    } catch (err) {
      console.error('Failed to load pending injection:', err);
    }
  };

  const checkCurrentTab = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        const url = tab.url.toLowerCase();
        
        // Match restricted prefixes
        const restricted = [
          'chrome://',
          'chrome-extension://',
          'https://chromewebstore.google.com',
          'about:',
          'edge://'
        ];
        const isRestricted = restricted.some(prefix => url.startsWith(prefix));

        const urlObj = new URL(tab.url);
        const host = urlObj.hostname.toLowerCase();
        
        let name = 'Webpage';
        let supported = !isRestricted;

        if (host.includes('chatgpt.com')) {
          name = 'ChatGPT';
        } else if (host.includes('claude.ai')) {
          name = 'Claude';
        } else if (host.includes('gemini.google.com')) {
          name = 'Gemini';
        } else if (host.includes('grok.com') || (host.includes('x.com') && urlObj.pathname.includes('/grok'))) {
          name = 'Grok';
        } else if (host.includes('perplexity.ai')) {
          name = 'Perplexity';
        }

        setActiveSite({ name, url: tab.url, supported });
      } else {
        setActiveSite({ name: 'Restricted UI', url: '', supported: false });
      }
    } catch (err) {
      console.warn('Could not query current tab:', err);
      setActiveSite({ name: 'Restricted UI', url: '', supported: false });
    }
  };

  const refreshDevStats = async () => {
    try {
      // 1. Offscreen context check
      try {
        const contexts = await (chrome.runtime as any).getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT']
        });
        setOffscreenStatus(contexts.length > 0 ? 'Active' : 'Inactive');
      } catch {
        setOffscreenStatus('Inactive');
      }

      // 2. Load latest action stats
      const stats = await chrome.storage.local.get(['lastScreenshot', 'ocrStatus', 'injectionStatus']);
      if (stats.lastScreenshot) setLastScreenshot(stats.lastScreenshot);
      if (stats.ocrStatus) setOcrStatus(stats.ocrStatus);
      if (stats.injectionStatus) setInjectionStatus(stats.injectionStatus);
    } catch (err) {
      console.warn('Failed to refresh stats:', err);
    }
  };

  // Toggle debug mode
  const handleToggleDebug = async () => {
    const nextMode = !debugMode;
    setDebugMode(nextMode);
    await chrome.storage.local.set({ debugMode: nextMode });
    logger.info(`Debug mode toggled to: ${nextMode ? 'ON' : 'OFF'}`);
    if (!nextMode) {
      // Clear logs from state/storage to prevent bloat when turned off
      await chrome.storage.local.set({ debugLogs: [] });
      setLogs([]);
    }
  };

  // Trigger Snip overlay after ensuring message is sent
  const handleTriggerSnip = async (mode: 'snip' | 'ocr') => {
    logger.debug(`Manual overlay requested: mode=${mode}`);
    try {
      await chrome.runtime.sendMessage({
        action: 'TRIGGER_OVERLAY',
        mode
      });
    } catch (err: any) {
      logger.error('Failed to trigger overlay', err);
      setErrorMsg(err.message || 'Overlay load failed');
    }
    // Close popup to show overlay
    window.close();
  };

  // Dispatch pending injection to user-selected AI tabs
  const handleDispatchInjection = async () => {
    if (!pendingInjection || selectedTabIds.size === 0 || isDispatching) return;
    setIsDispatching(true);

    // Initialise all selected as 'pending'
    const initial: Record<number, 'pending' | 'success' | 'fail'> = {};
    selectedTabIds.forEach(id => { initial[id] = 'pending'; });
    setInjectResults(initial);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'DISPATCH_PENDING_INJECTION',
        selectedTabIds: Array.from(selectedTabIds),
        payload: pendingInjection.payload
      });

      // Map per-tab results back to UI state
      const next: Record<number, 'pending' | 'success' | 'fail'> = {};
      selectedTabIds.forEach(id => {
        const r = response?.results?.[id];
        next[id] = r?.success ? 'success' : 'fail';
      });
      setInjectResults(next);

      // Clear the pending state after a short display delay
      setTimeout(() => {
        setPendingInjection(null);
        setSelectedTabIds(new Set());
        setInjectResults({});
        setIsDispatching(false);
      }, 2000);
    } catch (err: any) {
      logger.error('Dispatch injection failed', err);
      setErrorMsg(err.message || 'Injection dispatch failed');
      setIsDispatching(false);
    }
  };

  // Video recording controls
  const startRecordingTimer = () => {
    setRecordingSeconds(0);
    setIsRecording(true);
    setErrorMsg(null);
    recordingIntervalRef.current = window.setInterval(() => {
      setRecordingSeconds((prev) => {
        if (prev >= 14) {
          stopRecordingTimer();
          refreshDevStats();
          return 15;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecordingTimer = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsRecording(false);
  };

  const handleStartRecording = async () => {
    logger.info('Manual tab recording start requested');
    try {
      startRecordingTimer();
      const response = await chrome.runtime.sendMessage({ action: 'START_TAB_RECORDING' });
      if (response && !response.success) {
        logger.error('Recording start rejected by service worker', response.error);
        setErrorMsg(response.error || 'Failed to start recording');
        stopRecordingTimer();
      } else {
        logger.info('Recording started');
        refreshDevStats();
      }
    } catch (err: any) {
      logger.error('Failed to start recording', err);
      setErrorMsg(err.message || 'Failed to start recording worker');
      stopRecordingTimer();
    }
  };

  const handleStopRecording = async () => {
    logger.info('Manual tab recording stop requested');
    stopRecordingTimer();
    try {
      const response = await chrome.runtime.sendMessage({ action: 'STOP_TAB_RECORDING' });
      if (response && !response.success) {
        logger.error('Recording stop rejected by service worker', response.error);
        setErrorMsg(response.error || 'Failed to stop recording');
      } else {
        logger.info('Recording stopped and WebM compiled');
        loadHistory();
        refreshDevStats();
      }
    } catch (err: any) {
      logger.error('Failed to stop recording', err);
      setErrorMsg(err.message || 'Failed to stop recording worker');
    }
  };

  // Copy history item
  const handleCopyToClipboard = async (item: HistoryItem) => {
    logger.debug(`Manual clipboard copy requested: type=${item.type}, id=${item.id}`);
    
    if (item.type === 'video') {
      logger.warn('Clipboard copy aborted: WebM videos are not supported by system clipboard write.');
      setErrorMsg('Chrome does not support copying WebM videos to the system clipboard.');
      setTimeout(() => setErrorMsg(null), 5000);
      return;
    }

    try {
      if (item.type === 'text') {
        logger.debug('handleCopyToClipboard: Writing text to clipboard...');
        await navigator.clipboard.writeText(item.dataUrl);
        logger.info('handleCopyToClipboard: Text clipboard write SUCCESS');
      } else {
        logger.debug(`handleCopyToClipboard: Fetching dataUrl for ${item.type} (length: ${item.dataUrl.length})...`);
        const response = await fetch(item.dataUrl);
        
        logger.debug('handleCopyToClipboard: Data URL fetched, converting to blob...');
        const blob = await response.blob();
        logger.info(`handleCopyToClipboard: Created image blob - Size: ${blob.size} bytes, MIME: ${blob.type}`);
        
        logger.debug('handleCopyToClipboard: Creating ClipboardItem...');
        const clipboardItem = new ClipboardItem({ [blob.type]: blob });
        
        logger.debug('handleCopyToClipboard: Invoking navigator.clipboard.write...');
        await navigator.clipboard.write([clipboardItem]);
        logger.info('handleCopyToClipboard: Image clipboard write SUCCESS');
      }
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err: any) {
      logger.error('Clipboard copy operation failed', err);
      setErrorMsg(`Clipboard copy failed: ${err.message || err}`);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Download history item as a local file
  const handleDownload = (item: HistoryItem) => {
    logger.debug(`Download requested: type=${item.type}, id=${item.id}`);
    try {
      const a = document.createElement('a');
      a.href = item.dataUrl;
      a.download = item.type === 'video' 
        ? `recording_${item.id}.webm` 
        : item.type === 'text' 
        ? `text_${item.id}.txt` 
        : `snip_${item.id}.png`;
      a.click();
      logger.info(`Download completed successfully: filename=${a.download}`);
    } catch (err: any) {
      logger.error('Failed to trigger download', err);
      setErrorMsg('Failed to download file.');
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  // Re-inject history item
  const handleReinject = async (item: HistoryItem) => {
    logger.debug(`Manual injection requested: type=${item.type}, id=${item.id}`);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;

      const payload = item.type === 'text' 
        ? { type: 'text', data: item.dataUrl, id: item.id }
        : { type: item.type, dataUrl: item.dataUrl, id: item.id };

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'INJECT_PAYLOAD',
        payload
      });

      if (response && response.success) {
        setInjectedId(item.id);
        logger.info('Payload injected successfully');
        setTimeout(() => setInjectedId(null), 1500);
      } else {
        logger.warn('Injection failed or prompt textarea not resolved');
        setErrorMsg('Active tab prompt input not found or page is not supported.');
        setTimeout(() => setErrorMsg(null), 4000);
      }
    } catch (err: any) {
      logger.error('Injection message failed', err);
      setErrorMsg('Cannot inject to this tab. Please focus page prompt input.');
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Delete item
  const handleDeleteItem = async (id: string) => {
    logger.debug(`Deleting item from history: id=${id}`);
    try {
      const result = await chrome.storage.session.get('captureHistory');
      let historyList: HistoryItem[] = result.captureHistory || [];
      historyList = historyList.filter(item => item.id !== id);
      await chrome.storage.session.set({ captureHistory: historyList });
      setHistory(historyList);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Clear all
  const handleClearHistory = async () => {
    logger.info('Clearing history session');
    try {
      await chrome.storage.session.set({ captureHistory: [] });
      setHistory([]);
    } catch (err) {
      console.error('Clear failed:', err);
    }
  };

  // Clear logs
  const handleClearLogs = async () => {
    try {
      await chrome.storage.local.set({ debugLogs: [] });
      setLogs([]);
      logger.info('Local debug logs cleared');
    } catch (err) {
      console.error(err);
    }
  };

  // Copy logs
  const handleCopyLogs = async () => {
    try {
      const logString = logs.map(l => `[${l.timestamp}][${l.module}][${l.level}] ${l.message}`).join('\n');
      await navigator.clipboard.writeText(logString);
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(null as any), 1500);
    } catch (err) {
      console.error(err);
    }
  };

  // Export logs
  const handleExportLogs = () => {
    try {
      const logString = JSON.stringify(logs, null, 2);
      const blob = new Blob([logString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `llm_capture_debug_logs_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  // Helper formatting for timestamps
  const formatTime = (timestamp: number) => {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} mins ago`;
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-[390px] bg-slate-900 text-slate-100 p-4 font-sans select-none flex flex-col gap-4 border border-slate-800 shadow-2xl rounded-xl max-h-[600px] overflow-y-auto scrollbar-thin">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-indigo-100 animate-pulse" />
          </div>
          <div>
            <h1 className="font-bold text-sm leading-tight text-white tracking-wide">LLM Context Capture</h1>
            <p className="text-[10px] text-slate-400">Client-Side Snipper & OCR</p>
          </div>
        </div>

        {/* LLM Connection Badge */}
        {activeSite ? (
          <div className={`px-2 py-0.5 rounded-full text-[9px] font-semibold flex items-center gap-1 ${
            activeSite.supported 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${activeSite.supported ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
            {activeSite.supported ? `Connected to ${activeSite.name}` : 'Capture Restricted'}
          </div>
        ) : (
          <div className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Clipboard Mode
          </div>
        )}
      </div>

      {/* Unsupported URLs Friendly Error Banner */}
      {activeSite && !activeSite.supported && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-xs flex flex-col gap-1.5 shadow-inner">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Browser Page Capture Limit</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-300">
            This page cannot be captured because Chrome security restricts extensions from accessing browser UI or internal pages (like chrome:// pages or the Web Store).
          </p>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs flex items-start gap-2 shadow-inner">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="flex-1">{errorMsg}</p>
        </div>
      )}



      {/* Quick Action Capture Buttons */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => handleTriggerSnip('snip')}
          disabled={isRecording || (activeSite !== null && !activeSite.supported)}
          className="flex flex-col items-center justify-center p-3 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700/60 hover:border-indigo-500/50 hover:shadow-indigo-500/5 transition duration-200 group text-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Camera className="w-6 h-6 text-indigo-400 group-hover:text-indigo-300 group-hover:scale-105 transition-transform" />
          <span className="text-xs font-semibold text-slate-200 mt-1.5">Snip Region</span>
          <span className="text-[9px] text-slate-400 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800 mt-1 font-mono">Alt + S</span>
        </button>

        <button
          onClick={() => handleTriggerSnip('ocr')}
          disabled={isRecording || (activeSite !== null && !activeSite.supported)}
          className="flex flex-col items-center justify-center p-3 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700/60 hover:border-purple-500/50 hover:shadow-purple-500/5 transition duration-200 group text-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileText className="w-6 h-6 text-purple-400 group-hover:text-purple-300 group-hover:scale-105 transition-transform" />
          <span className="text-xs font-semibold text-slate-200 mt-1.5">OCR Code</span>
          <span className="text-[9px] text-slate-400 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800 mt-1 font-mono">Alt + O</span>
        </button>
      </div>

      {/* Tab Media stream Video Recorder */}
      <div className="border border-slate-800 bg-slate-950/40 rounded-xl p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Video className="w-4 h-4 text-rose-400" />
            <h2 className="text-xs font-bold text-slate-200">Tab Screen Recorder</h2>
          </div>
          <span className="text-[9px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-medium">Max 15 seconds</span>
        </div>

        {isRecording ? (
          <div className="flex items-center justify-between bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              <span className="text-xs font-semibold text-rose-400 font-mono">
                Recording: 0:{recordingSeconds.toString().padStart(2, '0')} / 0:15
              </span>
            </div>
            <button
              onClick={handleStopRecording}
              className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] shadow-lg shadow-rose-600/20 cursor-pointer"
            >
              Stop
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartRecording}
            disabled={activeSite !== null && !activeSite.supported}
            className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/80 hover:border-slate-600 flex items-center justify-center gap-2 text-xs font-bold text-slate-100 hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Video className="w-4 h-4 text-slate-300" />
            Record Active Tab Stream
          </button>
        )}
      </div>

      {/* History section */}
      <div className="flex flex-col gap-2 mt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-bold">Session Snippet History</span>
            <span className="bg-slate-800 text-slate-300 text-[10px] font-mono px-1.5 py-0.2 rounded-full">
              {history.length}
            </span>
          </div>
          {history.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="text-[10px] font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              Clear Session
            </button>
          )}
        </div>

        {/* History List */}
        <div className="max-h-[190px] overflow-y-auto pr-1 flex flex-col gap-2 scrollbar-thin">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-7 px-4 text-center border border-dashed border-slate-800 bg-slate-950/30 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-slate-850 border border-slate-750 flex items-center justify-center mb-2.5 text-indigo-400 shadow-inner">
                <Camera className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-slate-200">No captures yet</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Take your first screenshot using</p>
              <div className="inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700/80 text-[10px] font-mono font-semibold text-indigo-300 shadow-sm">
                <Camera className="w-3 h-3 text-indigo-400" />
                <span>Alt + S</span>
              </div>
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.id} 
                title={`Type: ${item.type.toUpperCase()}\nCaptured: ${new Date(item.timestamp).toLocaleString()}\nStatus: ${item.type === 'text' ? 'OCR Extracted' : 'Visual Snapshot'}`}
                className="flex items-center gap-3 p-2 bg-slate-850 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/30 rounded-lg group transition duration-150 relative"
              >
                {/* Visual Thumbnail */}
                <div className="w-11 h-11 bg-slate-900 border border-slate-750 rounded-md overflow-hidden flex items-center justify-center shrink-0">
                  {item.type === 'image' && (
                    <img 
                      src={item.dataUrl} 
                      alt="Capture preview" 
                      className="w-full h-full object-cover select-none transition-transform group-hover:scale-105"
                    />
                  )}
                  {item.type === 'text' && (
                    <FileText className="w-5 h-5 text-purple-400" />
                  )}
                  {item.type === 'video' && (
                    <Video className="w-5 h-5 text-rose-400" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold tracking-wider ${
                      item.type === 'image' ? 'text-indigo-400' : item.type === 'text' ? 'text-purple-400' : 'text-rose-400'
                    }`}>
                      {item.type === 'image' ? 'IMAGE' : item.type === 'text' ? 'OCR' : 'VIDEO'}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">{formatTime(item.timestamp)}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate mt-0.5 font-sans leading-normal">
                    {item.type === 'text' ? item.textPreview : item.type === 'image' ? 'Visual crop snapshot' : '15s WebM tab media stream'}
                  </p>
                </div>

                {/* Quick actions panel */}
                <div className="flex items-center gap-1.5 shrink-0 opacity-85 group-hover:opacity-100 transition-opacity">
                  {/* Copy Button */}
                  <button
                    onClick={() => handleCopyToClipboard(item)}
                    title="Copy to Clipboard"
                    className="p-1.5 rounded bg-slate-900 hover:bg-slate-750 text-slate-350 hover:text-white border border-slate-800 hover:border-slate-700 transition cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                  >
                    {copiedId === item.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Download Button */}
                  <button
                    onClick={() => handleDownload(item)}
                    title="Download to File"
                    className="p-1.5 rounded bg-slate-900 hover:bg-slate-750 text-slate-350 hover:text-white border border-slate-800 hover:border-slate-700 transition cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  {/* Inject Button */}
                  <button
                    onClick={() => handleReinject(item)}
                    disabled={!activeSite?.supported}
                    title={activeSite?.supported ? `Inject into ${activeSite.name}` : 'Inject (Not supported in current tab)'}
                    className={`p-1.5 rounded transition border active:scale-95 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                      activeSite?.supported 
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 hover:border-indigo-400 shadow-md shadow-indigo-600/10 cursor-pointer' 
                        : 'bg-slate-800 text-slate-500 border-slate-750 cursor-not-allowed opacity-50'
                    }`}
                  >
                    {injectedId === item.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                    ) : (
                      <CornerDownLeft className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    title="Delete item"
                    className="p-1.5 rounded hover:bg-rose-950/40 text-slate-450 hover:text-rose-400 transition cursor-pointer border border-transparent hover:border-rose-900/40 active:scale-95 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Debug Setting Toggle Section */}
      <div className="border-t border-slate-800 pt-3 mt-1">
        <label className="flex items-center gap-2 cursor-pointer group text-xs text-slate-400 hover:text-slate-200">
          <input
            type="checkbox"
            checked={debugMode}
            onChange={handleToggleDebug}
            className="w-3.5 h-3.5 bg-slate-850 border border-slate-700 accent-indigo-600 rounded cursor-pointer"
          />
          <Bug className="w-3.5 h-3.5 text-indigo-400 shrink-0 group-hover:scale-105 transition-transform" />
          <span className="font-semibold tracking-wide">Developer Debug Mode</span>
        </label>
      </div>

      {/* Developer Tools (Visible only when debugMode is active) */}
      {debugMode && (
        <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-3 animation-fade-in">
          <div className="flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <h2 className="text-xs font-bold text-slate-200">Developer Diagnostics Panel</h2>
            <button 
              onClick={refreshDevStats}
              title="Refresh Stats"
              className="ml-auto p-1 rounded hover:bg-slate-800 text-slate-450 hover:text-slate-200 transition cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {/* Pipeline Trace Visual Checklist */}
          {activeTrace && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1.5 font-mono text-[10px] shadow-inner">
              <div className="flex justify-between items-center border-b border-slate-850 pb-1.5 mb-1">
                <span className="font-bold text-indigo-400">Trace: {activeTrace.name}</span>
                <span className={`font-bold text-[9px] px-1.5 py-0.5 rounded ${
                  activeTrace.status === 'SUCCESS' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : activeTrace.status === 'FAIL' 
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                }`}>
                  {activeTrace.status}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {activeTrace.steps.map((step, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={
                        step.status === 'SUCCESS' 
                          ? 'text-emerald-400 font-bold' 
                          : step.status === 'FAIL' 
                          ? 'text-rose-500 font-bold' 
                          : 'text-slate-650 animate-pulse'
                      }>
                        {step.status === 'SUCCESS' ? '✔' : step.status === 'FAIL' ? '✖' : '○'}
                      </span>
                      <span className={step.status === 'PENDING' ? 'text-slate-500' : 'text-slate-300'}>
                        {step.name}
                      </span>
                    </div>
                    {step.duration !== undefined && (
                      <span className="text-slate-500 text-[9px]">{step.duration}ms</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extension Status Indicators */}
          <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-900/50 p-2 rounded-lg border border-slate-850">
            <div className="flex justify-between border-r border-slate-800/60 pr-2">
              <span className="text-slate-400">Background Worker</span>
              <span className="text-emerald-400 font-bold">Active</span>
            </div>
            <div className="flex justify-between pl-2">
              <span className="text-slate-400">Offscreen Window</span>
              <span className={`font-bold ${offscreenStatus === 'Active' ? 'text-emerald-400' : 'text-slate-500'}`}>
                {offscreenStatus}
              </span>
            </div>
            <div className="flex justify-between border-r border-slate-800/60 pr-2 border-t border-slate-800/40 pt-1">
              <span className="text-slate-400">Content Script</span>
              <span className={`font-bold ${activeSite?.supported ? 'text-emerald-400' : 'text-slate-500'}`}>
                {activeSite?.supported ? 'Linked' : 'Fallback'}
              </span>
            </div>
            <div className="flex justify-between pl-2 border-t border-slate-800/40 pt-1">
              <span className="text-slate-400">Recorder Status</span>
              <span className={`font-bold ${isRecording ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`}>
                {isRecording ? 'Recording' : 'Idle'}
              </span>
            </div>
          </div>

          {/* Core Metrics Summary */}
          <div className="flex flex-col gap-1 text-[9px] text-slate-350 font-mono bg-slate-900/40 p-2 rounded-lg border border-slate-850/80">
            <div>• Last Screenshot: {lastScreenshot ? `${lastScreenshot.width}x${lastScreenshot.height} (${Math.round(lastScreenshot.size / 1024)} KB)` : 'None'}</div>
            <div>• OCR Engine: {ocrStatus ? `${ocrStatus.lang.toUpperCase()} | ${ocrStatus.lastTime}` : 'Idle / Not loaded'}</div>
            <div>• Last Inject: {injectionStatus ? `${injectionStatus.method}` : 'None'}</div>
          </div>

          {/* Debug Console Logs */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-300">Live Console Output</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyLogs}
                  className="text-[9px] font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer"
                >
                  {copiedLogs ? 'Copied!' : 'Copy'}
                </button>
                <span className="text-slate-700">|</span>
                <button
                  onClick={handleClearLogs}
                  className="text-[9px] font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer"
                >
                  Clear
                </button>
                <span className="text-slate-700">|</span>
                <button
                  onClick={handleExportLogs}
                  className="text-[9px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 transition cursor-pointer"
                >
                  <Download className="w-2.5 h-2.5" /> JSON
                </button>
              </div>
            </div>

            <div className="h-[120px] overflow-y-auto bg-black/60 border border-slate-800 rounded-lg p-2 font-mono text-[9px] text-indigo-350 select-text scrollbar-thin">
              {logs.length === 0 ? (
                <span className="text-slate-600 block text-center mt-8">Console output is empty. Enable capturing to trigger logs.</span>
              ) : (
                logs.map((log, idx) => (
                  <div 
                    key={idx} 
                    className={`leading-normal border-b border-slate-900/40 pb-0.5 mb-0.5 whitespace-pre-wrap ${
                      log.level === 'ERROR' ? 'text-rose-400 font-bold' : log.level === 'WARN' ? 'text-amber-400' : 'text-indigo-300'
                    }`}
                  >
                    [{log.timestamp}][{log.module}] {log.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
