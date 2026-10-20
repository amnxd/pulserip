import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { DownloadModal } from './components/DownloadModal';
import { HistoryQueue } from './components/HistoryQueue';
import { VideoMetadata, ConversionOptions, DownloadHistoryItem } from './types';
import {
  ArrowRight,
  Clipboard,
  X,
  Loader2,
  Download,
  Scissors,
  Check,
  ExternalLink,
} from 'lucide-react';

const STORAGE_KEY = 'pulserip_history_v1';

export default function App() {
  const [url, setUrl] = useState('');
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isHistoryQueueOpen, setIsHistoryQueueOpen] = useState(false);
  const [showTrimmer, setShowTrimmer] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState(false);

  const [historyItems, setHistoryItems] = useState<DownloadHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [options, setOptions] = useState<ConversionOptions>({
    format: 'mp3',
    quality: '320k',
    trimStart: 0,
    trimEnd: 0,
    volume: 1,
    channels: '2',
    sampleRate: '44100',
    fps: '30',
    title: '',
    artist: '',
    album: 'PulseRip',
    year: new Date().getFullYear().toString(),
    genre: 'Media',
    muteVideo: false,
  });

  // Save history
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(historyItems));
    } catch (e) {
      console.warn('Failed to save history', e);
    }
  }, [historyItems]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        setPasteFeedback(true);
        setTimeout(() => setPasteFeedback(false), 1200);
        handleFetchVideo(text.trim());
      }
    } catch (err) {
      console.warn('Clipboard read error:', err);
    }
  };

  const handleFetchVideo = async (targetUrl?: string) => {
    const inputUrl = (targetUrl || url).trim();
    if (!inputUrl) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to resolve video details.');
      }

      const data: VideoMetadata = await res.json();
      setMetadata(data);
      setUrl(inputUrl);

      setOptions((prev) => ({
        ...prev,
        title: data.title,
        artist: data.author,
        trimStart: 0,
        trimEnd: data.durationSec || 180,
      }));
    } catch (err: any) {
      setError(err.message || 'Could not fetch video. Verify the URL and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormatChange = (newFormat: 'mp3' | 'mp4') => {
    setOptions((prev) => ({
      ...prev,
      format: newFormat,
      quality: newFormat === 'mp3' ? '320k' : '1080p',
    }));
  };

  const handleStartDownload = () => {
    if (!metadata) return;

    const newItem: DownloadHistoryItem = {
      id: Date.now().toString(),
      videoId: metadata.id,
      title: options.title || metadata.title,
      author: options.artist || metadata.author,
      thumbnail: metadata.thumbnails.hq,
      format: options.format,
      quality: options.quality,
      size:
        options.format === 'mp3'
          ? metadata.audioSizes[options.quality] || '4.5 MB'
          : metadata.videoSizes[options.quality] || '45 MB',
      date: new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      url: metadata.url,
    };

    setHistoryItems((prev) => [newItem, ...prev.filter((i) => i.videoId !== newItem.videoId)].slice(0, 30));
    setIsDownloadModalOpen(true);
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-neutral-800">
      {/* Top Header */}
      <Header
        queueCount={historyItems.length}
        onOpenQueue={() => setIsHistoryQueueOpen(true)}
      />

      {/* Main Responsive Container */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-24 flex flex-col justify-center space-y-6">
        {/* Title & Tagline matching reference */}
        <div className="space-y-2 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white">
            YouTube Downloader
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400">
            Paste any YouTube link to save as MP3 audio or MP4 video.
          </p>
        </div>

        {/* URL Input Box (Fully Responsive across Phone / Tablet / Desktop) */}
        <div className="relative w-full">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2 bg-neutral-900 border border-neutral-800 focus-within:border-neutral-600 rounded-xl p-1.5 sm:p-2 transition-colors">
            <div className="flex-1 flex items-center min-w-0">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleFetchVideo();
                  }
                }}
                placeholder="Paste YouTube video or Shorts link..."
                className="w-full bg-transparent px-2.5 py-1.5 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none"
              />

              {url && (
                <button
                  type="button"
                  onClick={() => {
                    setUrl('');
                    setMetadata(null);
                    setError(null);
                  }}
                  className="p-1 text-neutral-500 hover:text-white transition-colors shrink-0"
                  title="Clear input"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-neutral-800/60">
              <button
                type="button"
                onClick={handlePaste}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white bg-neutral-800/80 hover:bg-neutral-800 rounded-lg transition-colors shrink-0"
                title="Paste from clipboard"
              >
                {pasteFeedback ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5 text-neutral-400" />}
                <span>{pasteFeedback ? 'Pasted' : 'Paste'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleFetchVideo()}
                disabled={isLoading || !url.trim()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-neutral-900 bg-neutral-200 hover:bg-white disabled:opacity-40 disabled:pointer-events-none rounded-lg transition-colors shrink-0"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading</span>
                  </>
                ) : (
                  <>
                    <span>Fetch</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-950/30 border border-red-900/40 rounded-xl text-xs text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Controls Row: Format, Quality & Trim */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs pt-1">
          {/* Format Switcher */}
          <div className="flex items-center justify-center sm:justify-start gap-1 bg-neutral-900 border border-neutral-800 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => handleFormatChange('mp3')}
              className={`flex-1 sm:flex-none px-3.5 py-1 font-medium rounded-md transition-colors text-center ${
                options.format === 'mp3'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              MP3 Audio
            </button>
            <button
              type="button"
              onClick={() => handleFormatChange('mp4')}
              className={`flex-1 sm:flex-none px-3.5 py-1 font-medium rounded-md transition-colors text-center ${
                options.format === 'mp4'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              MP4 Video
            </button>
          </div>

          {/* Quality & Trim Actions */}
          <div className="flex items-center justify-between sm:justify-end gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-400 text-xs whitespace-nowrap">Quality:</span>
              <select
                value={options.quality}
                onChange={(e) => setOptions((prev) => ({ ...prev, quality: e.target.value }))}
                className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-neutral-600"
              >
                {options.format === 'mp3' ? (
                  <>
                    <option value="320k">320 kbps (High Fidelity)</option>
                    <option value="256k">256 kbps</option>
                    <option value="192k">192 kbps (Standard)</option>
                    <option value="128k">128 kbps (Compact)</option>
                    <option value="96k">96 kbps (Voice)</option>
                  </>
                ) : (
                  <>
                    <option value="1080p">1080p (Full HD)</option>
                    <option value="720p">720p (HD)</option>
                    <option value="4k">4K (2160p UHD)</option>
                    <option value="1440p">1440p (2K)</option>
                    <option value="480p">480p (SD)</option>
                    <option value="360p">360p (Mobile)</option>
                  </>
                )}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowTrimmer(!showTrimmer)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors shrink-0 ${
                showTrimmer
                  ? 'bg-neutral-800 border-neutral-700 text-white'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
              title="Trim start/end"
            >
              <Scissors className="w-3 h-3" />
              <span>Trim</span>
            </button>
          </div>
        </div>

        {/* Minimal Audio/Video Trim Expandable */}
        {showTrimmer && metadata && (
          <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-xl space-y-2 text-xs animate-fade-in">
            <div className="flex items-center justify-between text-neutral-400">
              <span>Trim Segment</span>
              <span className="font-mono text-white">
                {formatSeconds(options.trimStart)} – {formatSeconds(options.trimEnd)} ({formatSeconds(Math.max(0, options.trimEnd - options.trimStart))})
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">Start Time (sec)</label>
                <input
                  type="number"
                  min={0}
                  max={metadata.durationSec || 300}
                  value={options.trimStart}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      trimStart: Math.max(0, parseInt(e.target.value) || 0),
                    }))
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">End Time (sec)</label>
                <input
                  type="number"
                  min={options.trimStart + 1}
                  max={metadata.durationSec || 300}
                  value={options.trimEnd}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      trimEnd: Math.min(metadata.durationSec || 300, parseInt(e.target.value) || 0),
                    }))
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* Resolved Video Card (Responsive on Phone / Tablet / Desktop) */}
        {metadata && (
          <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl space-y-4 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5">
              <img
                src={metadata.thumbnails.hq}
                alt=""
                referrerPolicy="no-referrer"
                className="w-full sm:w-28 aspect-video object-cover rounded-lg bg-neutral-950 shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-1">
                <h3 className="text-sm font-semibold text-white line-clamp-2 leading-snug">
                  {metadata.title}
                </h3>
                <p className="text-xs text-neutral-400 truncate">
                  {metadata.author} · <span className="font-mono">{metadata.formattedDuration}</span>
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-neutral-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="text-xs text-neutral-400 font-mono text-center sm:text-left">
                {options.format.toUpperCase()} · {options.quality.toUpperCase()}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleStartDownload}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-neutral-900 bg-white hover:bg-neutral-200 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download {options.format.toUpperCase()}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Ultra-Minimal Footer matching reference image exactly */}
      <footer className="w-full py-8 text-center">
        <span className="text-xs text-neutral-500 font-normal tracking-wide">
          YouTube Downloader
        </span>
      </footer>

      {/* Modals */}
      {metadata && (
        <DownloadModal
          isOpen={isDownloadModalOpen}
          onClose={() => setIsDownloadModalOpen(false)}
          metadata={metadata}
          options={options}
        />
      )}

      <HistoryQueue
        isOpen={isHistoryQueueOpen}
        onClose={() => setIsHistoryQueueOpen(false)}
        items={historyItems}
        onRemoveItem={(id) => setHistoryItems((prev) => prev.filter((i) => i.id !== id))}
        onClearAll={() => setHistoryItems([])}
        onSelectVideo={(videoUrl) => handleFetchVideo(videoUrl)}
      />
    </div>
  );
}
