import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  if (!isOpen) return null;

  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print-root">
      <div className="fixed inset-0 bg-black/50 no-print" onClick={onClose} />
      <div className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-[calc(100vw-1.5rem)] ${sizes[size]} max-h-[90dvh] overflow-y-auto overscroll-contain`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 no-print">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg no-print">
            <X size={20} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
