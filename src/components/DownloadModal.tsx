import React, { useEffect, useState, useRef } from 'react';
import { Download, X, ExternalLink, RotateCcw } from 'lucide-react';
import { ConversionOptions, VideoMetadata } from '../types';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: VideoMetadata;
  options: ConversionOptions;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({
  isOpen,
  onClose,
  metadata,
  options,
}) => {
  const [stage, setStage] = useState<'preparing' | 'extracting' | 'completed' | 'error'>('preparing');
  const [progress, setProgress] = useState(15);
  const [statusMessage, setStatusMessage] = useState('Processing media stream...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [directDownloadUrl, setDirectDownloadUrl] = useState<string | null>(null);
  const [targetFilename, setTargetFilename] = useState<string>('media');

  const activePollingRef = useRef(false);

  const startConversion = async () => {
    activePollingRef.current = true;
    setStage('preparing');
    setProgress(15);
    setErrorMessage(null);
    setStatusMessage(`Initializing ${options.format.toUpperCase()} (${options.quality})...`);

    try {
      // Step 1: Start job
      const startRes = await fetch('/api/convert/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: metadata.url,
          format: options.format,
          quality: options.quality,
          title: options.title || metadata.title,
          artist: options.artist || metadata.author,
        }),
      });

      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok || !startData.progressUrl) {
        throw new Error('Internal server error. Please try again.');
      }

      setStage('extracting');
      setStatusMessage(
        options.format === 'mp3'
          ? `Extracting audio at ${options.quality}...`
          : `Processing video at ${options.quality}...`
      );

      const progressUrl = startData.progressUrl;
      const cleanTitle = (options.title || metadata.title || 'media').replace(/[^\w\s.-]/g, '').trim() || 'media';
      const resolvedFilename = `${cleanTitle} [${options.quality}].${options.format}`;
      setTargetFilename(resolvedFilename);

      // Step 2: Poll status non-blockingly
      const startTime = Date.now();
      while (activePollingRef.current) {
        await new Promise((r) => setTimeout(r, 1600));
        if (!activePollingRef.current) break;

        const statusRes = await fetch(`/api/convert/status?progressUrl=${encodeURIComponent(progressUrl)}`);
        const statusData = await statusRes.json().catch(() => ({}));

        if (statusData.ready && statusData.downloadUrl) {
          setProgress(100);
          setStage('completed');
          setStatusMessage('Stream processed and ready.');
          setDirectDownloadUrl(statusData.downloadUrl);

          // Trigger same-origin download with filename in URL path for mobile compatibility
          const downloadEndpoint = `/api/download-file/${encodeURIComponent(resolvedFilename)}?url=${encodeURIComponent(statusData.downloadUrl)}`;
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = downloadEndpoint;
          a.download = resolvedFilename;
          document.body.appendChild(a);
          a.click();

          setTimeout(() => {
            if (document.body.contains(a)) {
              document.body.removeChild(a);
            }
          }, 4000);
          break;
        }

        if (statusData.error) {
          throw new Error('Internal server error. Please try again later.');
        }

        if (statusData.progress) {
          setProgress(statusData.progress);
          if (statusData.text) {
            setStatusMessage(statusData.text);
          }
        }

        if (Date.now() - startTime > 75000) {
          throw new Error('Internal server error. Please try again later.');
        }
      }
    } catch (err: any) {
      if (activePollingRef.current) {
        setStage('error');
        setErrorMessage('Internal server error. Please try again later.');
      }
    }
  };

  useEffect(() => {
    if (!isOpen) {
      activePollingRef.current = false;
      setStage('preparing');
      setProgress(15);
      setErrorMessage(null);
      setDirectDownloadUrl(null);
      return;
    }

    startConversion();

    return () => {
      activePollingRef.current = false;
    };
  }, [isOpen, metadata.url, options.format, options.quality]);

  if (!isOpen) return null;

  const sameOriginDownloadUrl = directDownloadUrl
    ? `/api/download-file/${encodeURIComponent(targetFilename)}?url=${encodeURIComponent(directDownloadUrl)}`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-2xl relative space-y-4 text-neutral-200">
        <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
          <div>
            <h3 className="text-sm font-semibold text-white">
              {options.format.toUpperCase()} · {options.quality.toUpperCase()}
            </h3>
            <p className="text-xs text-neutral-400 truncate max-w-[280px]">
              {options.title || metadata.title}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="truncate max-w-[300px]">{statusMessage}</span>
            <span className="font-mono text-white tabular-nums">{progress}%</span>
          </div>

          <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                stage === 'error'
                  ? 'bg-red-500'
                  : stage === 'completed'
                  ? 'bg-white'
                  : 'bg-neutral-300'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Status Completed */}
        {stage === 'completed' && directDownloadUrl && (
          <div className="space-y-2.5 pt-1">
            <a
              href={sameOriginDownloadUrl}
              download={targetFilename}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-neutral-200 text-neutral-900 font-semibold text-xs rounded-lg transition-colors shadow-md text-center"
            >
              <Download className="w-4 h-4 text-neutral-900 shrink-0" />
              <span>Save {options.format.toUpperCase()} File ({options.quality.toUpperCase()})</span>
            </a>

            <div className="flex items-center justify-between text-[11px] text-neutral-500 px-1 pt-0.5">
              <span>If download popup was blocked:</span>
              <a
                href={directDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-400 hover:text-white underline flex items-center gap-1"
              >
                <span>Direct link (new tab)</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        )}

        {/* Error Fallback: Clean, Simple, No Advertising */}
        {stage === 'error' && (
          <div className="p-3 bg-red-950/30 border border-red-900/40 rounded-lg space-y-2 text-xs text-red-300">
            <p className="leading-relaxed">{errorMessage}</p>
            <div className="pt-1.5 flex items-center justify-end border-t border-red-900/30">
              <button
                type="button"
                onClick={() => startConversion()}
                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-red-900/60 hover:bg-red-900 rounded transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Try again</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-750 rounded-md transition-colors"
          >
            {stage === 'completed' ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};
