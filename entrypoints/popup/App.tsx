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
  RefreshCw,
  X
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

    // Check active recording state on popup open
    chrome.storage.local.get('recordingState').then((res) => {
      const rec = (res.recordingState as any);
      if (rec?.isRecording && rec?.startTime) {
        startRecordingTimerFrom(rec.startTime);
      }
    }).catch(() => {});

    // Listen for real-time history, log, and recording state broadcast updates
    const handleMessage = (message: any) => {
      if (message.action === 'HISTORY_UPDATED') {
        setHistory(message.history || []);
      }
      if (message.action === 'RECORDING_STATE_UPDATED') {
        if (message.state?.isRecording && message.state?.startTime) {
          startRecordingTimerFrom(message.state.startTime);
        } else {
          stopRecordingTimer();
        }
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

    // Storage change listener to ensure immediate UI sync if pendingInjection or recordingState is written
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes.pendingInjection) {
        loadPendingInjection();
      }
      if (areaName === 'local' && changes.recordingState) {
        const state = (changes.recordingState.newValue as any);
        if (state?.isRecording && state?.startTime) {
          startRecordingTimerFrom(state.startTime);
        } else {
          stopRecordingTimer();
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.storage.onChanged.removeListener(handleStorageChange);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    };
  }, []);

  const loadSettings = async () => {
    try {
      const res = await chrome.storage.local.get(['debugMode', 'debugLogs', 'activeTrace']);
      setDebugMode(!!res.debugMode);
      setLogs((res.debugLogs as LogEntry[]) || []);
      if (res.activeTrace) {
        setActiveTrace(res.activeTrace as TraceData);
      }
    } catch (err) {
      console.error('Settings load failed:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const result = await chrome.storage.session.get('captureHistory');
      setHistory((result.captureHistory as HistoryItem[]) || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const loadPendingInjection = async () => {
    try {
      const res = await chrome.storage.local.get('pendingInjection');
      const pending: PendingInjection | undefined = res.pendingInjection as PendingInjection | undefined;
      if (pending && pending.candidates?.length >= 1) {
        // Expire if older than 5 minutes
        if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
          await chrome.storage.local.remove('pendingInjection');
          setPendingInjection(null);
          return;
        }

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
      if (stats.lastScreenshot) setLastScreenshot(stats.lastScreenshot as any);
      if (stats.ocrStatus) setOcrStatus(stats.ocrStatus as any);
      if (stats.injectionStatus) setInjectionStatus(stats.injectionStatus as any);
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
        chrome.storage.local.remove('pendingInjection').catch(err => logger.error('Failed to clear pendingInjection storage', err));
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

  // Cancel pending injection
  const handleCancelInjection = async () => {
    logger.info('User cancelled injection from popup');
    try {
      await chrome.storage.local.remove('pendingInjection');
      setPendingInjection(null);
      setSelectedTabIds(new Set());
      setInjectResults({});
    } catch (err: any) {
      logger.error('Failed to cancel injection', err);
    }
  };

  // Video recording controls
  const startRecordingTimerFrom = (startTime: number) => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    setIsRecording(true);
    setErrorMsg(null);
    const updateTimer = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      setRecordingSeconds(elapsed);
    };
    updateTimer();
    recordingIntervalRef.current = window.setInterval(updateTimer, 1000);
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
      setErrorMsg(null);
      const response = await chrome.runtime.sendMessage({ action: 'START_TAB_RECORDING' });
      if (response && !response.success) {
        logger.error('Recording start rejected by service worker', response.error);
        setErrorMsg(response.error || 'Failed to start recording');
        stopRecordingTimer();
      } else {
        logger.info('Recording started successfully');
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
      let historyList: HistoryItem[] = (result.captureHistory as HistoryItem[]) || [];
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
      await chrome.storage.local.remove('pendingInjection');
      setPendingInjection(null);
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
    <div className="w-[390px] bg-slate-900 text-slate-100 p-4 font-sans select-none flex flex-col gap-3.5 border border-slate-800 shadow-2xl rounded-2xl max-h-[600px] overflow-y-auto scrollbar-thin">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-[38px] h-[38px] rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25 border border-blue-400/30 shrink-0">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-extrabold text-base leading-none text-white tracking-tight">Prompt<span className="text-blue-400 font-semibold ml-[2.5px]">Lens</span></h1>
            <p className="text-[11px] font-medium text-slate-400 mt-1 tracking-wide">Capture. Understand. Prompt.</p>
          </div>
        </div>

        {/* LLM Connection Badge */}
        {activeSite ? (
          <div className={`px-2.5 py-1 rounded-full text-[9px] font-semibold flex items-center gap-1.5 transition-colors ${
            activeSite.supported 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${activeSite.supported ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
            {activeSite.supported ? `${activeSite.name}` : 'Restricted'}
          </div>
        ) : (
          <div className="px-2.5 py-1 rounded-full text-[9px] font-semibold bg-slate-800 text-slate-400 border border-slate-700/80">
            Clipboard Mode
          </div>
        )}
      </div>

      {/* Unsupported URLs Friendly Error Banner */}
      {activeSite && !activeSite.supported && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl text-xs flex flex-col gap-1.5 shadow-inner">
          <div className="flex items-center gap-2 font-bold text-amber-300">
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
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs flex items-start gap-2 shadow-inner">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="flex-1 font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Multi-Tab Pending Injection Dispatch Banner */}
      {pendingInjection && pendingInjection.candidates?.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-950/80 to-slate-900 border border-indigo-500/40 rounded-xl p-3.5 flex flex-col gap-2.5 shadow-lg shadow-indigo-950/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
              <span className="text-xs font-bold text-indigo-200">Inject Captured Context</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-mono">
                {selectedTabIds.size} of {pendingInjection.candidates.length} selected
              </span>
              <button
                onClick={handleCancelInjection}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                title="Cancel Injection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 max-h-[110px] overflow-y-auto pr-1 scrollbar-thin">
            {pendingInjection.candidates.map(candidate => {
              const isChecked = selectedTabIds.has(candidate.tabId);
              const status = injectResults[candidate.tabId];

              return (
                <div
                  key={candidate.tabId}
                  onClick={() => {
                    const next = new Set(selectedTabIds);
                    if (next.has(candidate.tabId)) next.delete(candidate.tabId);
                    else next.add(candidate.tabId);
                    setSelectedTabIds(next);
                  }}
                  className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer border transition-all ${
                    isChecked
                      ? 'bg-indigo-600/20 border-indigo-500/60 text-white'
                      : 'bg-slate-850 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // handled by parent div onClick
                      className="w-3.5 h-3.5 accent-indigo-500 rounded cursor-pointer shrink-0"
                    />
                    {candidate.favIconUrl ? (
                      <img src={candidate.favIconUrl} alt="" className="w-3.5 h-3.5 shrink-0 rounded-sm" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    )}
                    <span className="font-semibold truncate">{candidate.name}</span>
                    <span className="text-[10px] text-slate-400 truncate max-w-[120px]">({candidate.title})</span>
                  </div>

                  {status === 'pending' && <span className="text-[10px] text-indigo-400 animate-pulse font-mono">Injecting...</span>}
                  {status === 'success' && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  {status === 'fail'    && <span className="text-[10px] text-rose-400 font-mono">Failed</span>}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleDispatchInjection}
            disabled={selectedTabIds.size === 0 || isDispatching}
            className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
            {isDispatching ? 'Injecting Context...' : `Inject into ${selectedTabIds.size} Selected Tab${selectedTabIds.size > 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Quick Action Capture Buttons */}
      <div className="grid grid-cols-2 gap-3">
        {/* Snip Region */}
        <button
          onClick={() => handleTriggerSnip('snip')}
          disabled={isRecording || (activeSite !== null && !activeSite.supported)}
          className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150 group text-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Camera className="w-6 h-6 text-blue-400 group-hover:text-blue-300 group-hover:scale-110 transition-transform duration-150" />
          <span className="text-xs font-bold text-slate-200 mt-2 tracking-wide">Snip Region</span>
          <span className="text-[9px] text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded-md border border-slate-700/80 mt-1 font-mono font-semibold">Alt + S</span>
        </button>

        {/* OCR Code */}
        <button
          onClick={() => handleTriggerSnip('ocr')}
          disabled={isRecording || (activeSite !== null && !activeSite.supported)}
          className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150 group text-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileText className="w-6 h-6 text-purple-400 group-hover:text-purple-300 group-hover:scale-110 transition-transform duration-150" />
          <span className="text-xs font-bold text-slate-200 mt-2 tracking-wide">OCR Code</span>
          <span className="text-[9px] text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded-md border border-slate-700/80 mt-1 font-mono font-semibold">Alt + O</span>
        </button>
      </div>

      {/* Tab Media Stream Video Recorder */}
      <div className="border border-slate-800/90 bg-slate-950/40 rounded-xl p-3 flex flex-col gap-2 shadow-inner">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Video className="w-4 h-4 text-rose-400" />
            <h2 className="text-xs font-bold text-slate-200 tracking-wide">Tab Screen Recorder</h2>
          </div>
        </div>

        {isRecording ? (
          <div className="flex items-center justify-between bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              <span className="text-xs font-semibold text-rose-400 font-mono">
                Recording: {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
              </span>
            </div>
            <button
              onClick={handleStopRecording}
              className="px-3 py-1 rounded-md bg-rose-600 hover:bg-rose-500 active:scale-[0.96] text-white font-semibold text-[11px] shadow-lg shadow-rose-600/20 transition cursor-pointer"
            >
              Stop
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartRecording}
            disabled={activeSite !== null && !activeSite.supported}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700/80 hover:border-slate-600 hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2 text-xs font-bold text-slate-100 hover:text-white transition duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Video className="w-4 h-4 text-slate-300" />
            Record Active Tab Stream
          </button>
        )}
      </div>

      {/* History Section */}
      <div className="flex flex-col gap-2 mt-0.5">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-bold tracking-wide">Session Snippet History</span>
            <span className="bg-slate-800 text-slate-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-slate-700/60">
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
            <div className="flex flex-col items-center justify-center py-7 px-4 text-center border border-dashed border-slate-800/90 bg-slate-950/30 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mb-2.5 text-blue-400 shadow-inner">
                <Camera className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-slate-200 tracking-wide">No captures yet</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Take your first screenshot using</p>
              <div className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-lg bg-slate-800 border border-slate-700/80 text-[10px] font-mono font-semibold text-blue-300 shadow-sm">
                <Camera className="w-3.5 h-3.5 text-blue-400" />
                <span>Alt + S</span>
              </div>
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.id} 
                title={`Type: ${item.type.toUpperCase()}\nCaptured: ${new Date(item.timestamp).toLocaleString()}\nStatus: ${item.type === 'text' ? 'OCR Extracted' : 'Visual Snapshot'}`}
                className="flex items-center gap-3 p-2.5 bg-slate-850 hover:bg-slate-800/90 border border-slate-800 hover:border-blue-500/30 rounded-xl group transition duration-150 relative"
              >
                {/* Visual Thumbnail */}
                <div className="w-11 h-11 bg-slate-900 border border-slate-750 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
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
                      item.type === 'image' ? 'text-blue-400' : item.type === 'text' ? 'text-purple-400' : 'text-rose-400'
                    }`}>
                      {item.type === 'image' ? 'IMAGE' : item.type === 'text' ? 'OCR' : 'VIDEO'}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">{formatTime(item.timestamp)}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate mt-0.5 font-sans leading-normal">
                    {item.type === 'text' ? item.textPreview : item.type === 'image' ? 'Visual crop snapshot' : (item.textPreview || 'Tab Video Clip')}
                  </p>
                </div>

                {/* Quick Actions Panel */}
                <div className="flex items-center gap-1.5 shrink-0 opacity-85 group-hover:opacity-100 transition-opacity">
                  {/* Copy Button */}
                  <button
                    onClick={() => handleCopyToClipboard(item)}
                    title="Copy to Clipboard"
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-750 text-slate-350 hover:text-white border border-slate-800 hover:border-slate-700 transition cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
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
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-750 text-slate-350 hover:text-white border border-slate-800 hover:border-slate-700 transition cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  {/* Inject Button */}
                  <button
                    onClick={() => handleReinject(item)}
                    disabled={!activeSite?.supported}
                    title={activeSite?.supported ? `Inject into ${activeSite.name}` : 'Inject (Not supported in current tab)'}
                    className={`p-1.5 rounded-lg transition border active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                      activeSite?.supported 
                        ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 hover:border-blue-400 shadow-md shadow-blue-600/15 cursor-pointer' 
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
                    className="p-1.5 rounded-lg hover:bg-rose-950/40 text-slate-450 hover:text-rose-400 transition cursor-pointer border border-transparent hover:border-rose-900/40 active:scale-95 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
