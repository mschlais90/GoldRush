import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Small "?" button that opens an explanation in a modal, so long how-to text stays out of the panel. */
export function Help({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="help-btn" title={`How ${title.toLowerCase()} works`} onClick={() => setOpen(true)}>
        ?
      </button>
      {open &&
        // portal so the modal doesn't inherit styles from wherever the button sits (e.g. inside an h4)
        createPortal(
          <div className="modal-bg" onClick={() => setOpen(false)}>
            <div className="modal help" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h2>{title}</h2>
                <button className="ghost" onClick={() => setOpen(false)}>
                  ✕
                </button>
              </div>
              {children}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
