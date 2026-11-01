import { useState } from 'react';
import { createPortal } from 'react-dom';
import { music, useMusicSettings } from './music';

/** Button that opens the settings modal (music on/off and volume). */
export function SettingsButton({ className = 'ghost', label = '⚙' }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} title="Settings">
        {label}
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const m = useMusicSettings();
  const pct = Math.round(m.volume * 100);
  // portal so the modal isn't styled by wherever the button sits (top bar, title screen)
  return createPortal(
    <div className="modal-bg" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <h4>Music</h4>
        <label className="row">
          <input type="checkbox" checked={m.enabled} onChange={(e) => music.setEnabled(e.target.checked)} /> Play music
        </label>
        <label className="row">
          <span>Volume</span>
          <input type="range" min={0} max={100} value={pct} disabled={!m.enabled} onChange={(e) => music.setVolume(Number(e.target.value) / 100)} />
          <span className="fixed-num">{pct}%</span>
        </label>
        <div className="row">
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
