import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { cn } from '../../lib/utils';

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const sizes = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn('no-print-root', sizes[size])} onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 p-4 sm:p-5 no-print">
          <DialogTitle>{title}</DialogTitle>
          <button type="button" onClick={onClose} className="icon-btn no-print -me-1">
            <X size={20} />
          </button>
        </DialogHeader>
        <div className="p-4 sm:p-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
