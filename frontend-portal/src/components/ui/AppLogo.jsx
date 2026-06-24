import { useState } from 'react';
import { cn } from '../../lib/utils';

const SIZES = {
  sm: { frame: 'w-11 h-11', img: 'w-7 h-7', pad: 'p-1.5', radius: 'rounded-[13px]' },
  md: { frame: 'w-16 h-16', img: 'w-11 h-11', pad: 'p-2', radius: 'rounded-2xl' },
  lg: { frame: 'w-24 h-24', img: 'w-[4.5rem] h-[4.5rem]', pad: 'p-3', radius: 'rounded-[1.35rem]' },
};

function LogoFallback({ size, className }) {
  const s = SIZES[size] || SIZES.md;
  return (
    <div
      className={cn(
        s.frame,
        s.radius,
        'bg-gradient-to-br from-[#2563EB] to-[#8B5CF6] flex items-center justify-center text-white font-bold shadow-lg',
        size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-2xl' : 'text-lg',
        className
      )}
      aria-hidden
    >
      RV
    </div>
  );
}

function LogoImage({ size, className, onError }) {
  const s = SIZES[size] || SIZES.md;
  return (
    <img
      src="/logo.png"
      alt="Rare Vet Care"
      className={cn(s.img, 'object-contain', className)}
      onError={onError}
    />
  );
}

export default function AppLogo({ size = 'md', variant = 'default', className = '' }) {
  const [failed, setFailed] = useState(false);
  const s = SIZES[size] || SIZES.md;

  if (failed) {
    return <LogoFallback size={size} className={className} />;
  }

  if (variant === 'portal') {
    return (
      <div className={cn('relative shrink-0', s.frame, className)}>
        <div
          className={cn(
            'absolute -inset-px opacity-90',
            s.radius,
            'bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#8B5CF6]'
          )}
          aria-hidden
        />
        <div
          className={cn(
            'absolute inset-0 opacity-40 blur-md',
            s.radius,
            'bg-gradient-to-br from-[#2563EB] to-[#8B5CF6]'
          )}
          aria-hidden
        />
        <div
          className={cn(
            'relative h-full w-full flex items-center justify-center',
            s.radius,
            s.pad,
            'bg-gradient-to-b from-white to-[#F8FAFC]',
            'shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-white/30'
          )}
        >
          <LogoImage size={size} onError={() => setFailed(true)} />
        </div>
      </div>
    );
  }

  if (variant === 'light') {
    return (
      <div className={cn('relative shrink-0', s.frame, className)}>
        <div
          className={cn(
            'absolute -inset-0.5',
            s.radius,
            'bg-gradient-to-br from-[#2563EB]/30 to-[#8B5CF6]/30 blur-[2px]'
          )}
          aria-hidden
        />
        <div
          className={cn(
            'relative h-full w-full flex items-center justify-center',
            s.radius,
            s.pad,
            'bg-white shadow-[0_10px_30px_rgba(0,0,0,0.12)] ring-1 ring-[#E5E7EB]'
          )}
        >
          <LogoImage size={size} onError={() => setFailed(true)} />
        </div>
      </div>
    );
  }

  return (
    <img
      src="/logo.png"
      alt="Rare Vet Care"
      className={cn(s.frame, 'object-contain', className)}
      onError={() => setFailed(true)}
    />
  );
}
