import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  if (!isOpen) return null;

  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print-root">
      <div className="fixed inset-0 bg-primary-900/40 backdrop-blur-sm no-print" onClick={onClose} />
      <div className={`relative bg-white dark:bg-primary-800 rounded-2xl shadow-card-hover w-full max-w-[calc(100vw-1.5rem)] ${sizes[size]} max-h-[90dvh] overflow-y-auto overscroll-contain border border-primary-200/60 dark:border-primary-700`}>
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-primary-100 dark:border-primary-700 no-print">
          <h3 className="text-lg font-semibold text-primary-800 dark:text-primary-100">{title}</h3>
          <button type="button" onClick={onClose} className="icon-btn no-print">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
