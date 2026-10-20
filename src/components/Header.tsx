import React from 'react';
import { History } from 'lucide-react';

interface HeaderProps {
  queueCount: number;
  onOpenQueue: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  queueCount,
  onOpenQueue,
}) => {
  return (
    <header className="w-full border-b border-neutral-900 bg-neutral-950/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-4xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
        {/* Brand matching reference */}
        <a href="/" className="text-sm font-bold tracking-tight text-white hover:opacity-85 transition-opacity">
          YouTube Downloader
        </a>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenQueue}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-neutral-400 hover:text-white rounded-md transition-colors"
            title="Download history"
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
            {queueCount > 0 && (
              <span className="text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.2 rounded-full font-mono">
                {queueCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
