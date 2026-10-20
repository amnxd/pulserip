import React from 'react';
import { History, Trash2, ExternalLink, X } from 'lucide-react';
import { DownloadHistoryItem } from '../types';

interface HistoryQueueProps {
  isOpen: boolean;
  onClose: () => void;
  items: DownloadHistoryItem[];
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
  onSelectVideo: (url: string) => void;
}

export const HistoryQueue: React.FC<HistoryQueueProps> = ({
  isOpen,
  onClose,
  items,
  onRemoveItem,
  onClearAll,
  onSelectVideo,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-2xl relative space-y-4 max-h-[80vh] flex flex-col text-neutral-200">
        <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">History</h3>
            <span className="text-xs text-neutral-500 font-mono">({items.length})</span>
          </div>

          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs text-neutral-400 hover:text-white transition-colors"
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-white rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {items.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-500">
              No recent downloads.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-2.5 bg-neutral-950 border border-neutral-850 rounded-lg hover:border-neutral-750 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={item.thumbnail}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-12 h-8 object-cover rounded bg-neutral-900 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-white truncate max-w-[240px] font-medium">{item.title}</p>
                    <p className="text-[11px] text-neutral-500 truncate">
                      {item.format.toUpperCase()} · {item.quality} · {item.date}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectVideo(item.url);
                      onClose();
                    }}
                    className="p-1 text-neutral-400 hover:text-white transition-colors"
                    title="Load"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
                    title="Delete"
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
};
