// Modal primitive with accessible focus management; formatting only, no behavior changes.
import * as React from 'react';
import { createPortal } from 'react-dom';
import { cx } from './utils';

const focusableSelectors =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export type ModalProps = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const lastActiveElement = React.useRef<HTMLElement | null>(null);
  const labelId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    lastActiveElement.current = document.activeElement as HTMLElement;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = dialog.querySelectorAll<HTMLElement>(focusableSelectors);
    const firstFocusable = focusable[0];
    const titleElement = dialog.querySelector<HTMLElement>('[data-modal-title]');

    const toFocus = titleElement || firstFocusable || dialog;
    toFocus.focus();

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key === 'Tab') {
        if (!focusable.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeydown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.body.style.overflow = '';
    };
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (!open && lastActiveElement.current) {
      lastActiveElement.current.focus();
      lastActiveElement.current = null;
    }
  }, [open]);

  if (!mounted) return null;
  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 sm:px-6"
      onMouseDown={(event) => {
        if (event.target === overlayRef.current) {
          onOpenChange(false);
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          'focus-visible:outline-none',
          'w-full animate-in fade-in duration-200',
          'max-h-full overflow-y-auto rounded-[var(--radius)] bg-white shadow-lg',
          'sm:max-w-lg',
          className
        )}
        data-modal
      >
        <div className="flex flex-col gap-4 p-6">
          {title && (
            <div>
              <h2 id={labelId} data-modal-title className="text-lg font-semibold text-[var(--ink)]">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-[var(--muted)]">
                  {description}
                </p>
              )}
            </div>
          )}
          <div className="space-y-4">{children}</div>
        </div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-6 pb-6">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
