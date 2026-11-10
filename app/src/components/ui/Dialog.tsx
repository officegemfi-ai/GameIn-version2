import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Icon } from './Icon';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog: focus moves in and stays in (Tab wraps), Escape or the backdrop closes it, focus returns to where it
 * was. On a phone it rises from the bottom as a sheet.
 *
 * Focus starts on the field marked `data-autofocus` (a dialog that is there to be typed into), otherwise on the first
 * control, which is the close button. (React's own `autoFocus` isn't used for this: it moves focus before the dialog
 * can note where focus was, so closing couldn't put it back.)
 */
export function Dialog({ open, onClose, title, description, children, footer, wide, busy }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** While a move is in flight the dialog can't be dismissed. */
  busy?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);
  busyRef.current = busy;
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const node = panel.current;
    // two lookups, not one selector list: a list answers with whichever match comes first in the page, and the close
    // button always comes before the fields
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab' && node) {
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const [a, z] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          z.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === z) {
          a.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="g-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        ref={panel}
        className={`g-dialog${wide ? ' g-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <div className="g-dialog__head">
          <div className="g-stack-sm">
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descId} className="g-muted">{description}</p> : null}
          </div>
          <button type="button" className="g-btn g-btn--ghost g-btn--icon g-btn--sm" onClick={onClose} disabled={busy} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children ? <div className="g-dialog__body">{children}</div> : null}
        {footer ? <div className="g-dialog__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A dialog for one move: cancel, or the move itself. While the move runs, the dialog can't be dismissed, cancel is
 * off and the move's button shows it's busy.
 */
export function ActionDialog({
  open = true, onClose, title, description, children, wide, action, onAction, pending = false, variant = 'primary', disabled, cancelLabel = 'cancel',
}: {
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  wide?: boolean;
  /** The move's button. */
  action: ReactNode;
  onAction: () => void;
  pending?: boolean;
  variant?: 'primary' | 'danger';
  /** The move can't be made yet (the form isn't complete). */
  disabled?: boolean;
  cancelLabel?: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={pending}
      title={title}
      description={description}
      wide={wide}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>{cancelLabel}</Button>
          <Button variant={variant} loading={pending} disabled={disabled} onClick={onAction}>{action}</Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
