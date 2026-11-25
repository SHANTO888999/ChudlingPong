import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="w-full min-h-[42px] py-2 px-4 rounded-xl bg-white/8 hover:bg-white/14 border border-white/14 text-zinc-200 font-bold text-xs inline-flex items-center justify-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <Download className="w-4 h-4 shrink-0" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="w-full min-h-[42px] py-2 px-4 rounded-xl bg-white/8 hover:bg-white/14 border border-white/14 text-zinc-200 font-bold text-xs inline-flex items-center justify-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Download className="w-4 h-4 shrink-0" />
          Install App
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#14141B] border-2 border-white/20 p-5 shadow-2xl text-white text-center">
              <h3 className="font-display text-lg font-bold">Install</h3>
              <p className="mt-2 text-sm text-zinc-300">
                Share → Add to Home Screen
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-white text-[#050507] py-2.5 text-sm font-extrabold hover:bg-zinc-200 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
