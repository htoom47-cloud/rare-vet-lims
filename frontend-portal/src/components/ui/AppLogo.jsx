import { useState } from 'react';
import { cn } from '../../lib/utils';

const SIZES = {
  xs: { frame: 'w-9 h-9', img: 'w-7 h-7', pad: 'p-1', radius: 'rounded-lg' },
  sm: { frame: 'w-11 h-11', img: 'w-9 h-9', pad: 'p-1.5', radius: 'rounded-xl' },
  md: { frame: 'w-16 h-16', img: 'w-12 h-12', pad: 'p-2', radius: 'rounded-2xl' },
  lg: { frame: 'w-24 h-24', img: 'w-[4.5rem] h-[4.5rem]', pad: 'p-3', radius: 'rounded-[1.35rem]' },
};

function LogoFallback({ size, className, variant }) {
  const s = SIZES[size] || SIZES.md;
  const dark = variant === 'portal';

  if (dark) {
    return (
      <div
        className={cn(
          'portal-logo-mark shrink-0 flex items-center justify-center',
          s.frame,
          s.radius,
          'bg-white/5 text-white font-bold',
          size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-2xl' : 'text-lg',
          className
        )}
        aria-hidden
      >
        RV
      </div>
    );
  }

  return (
    <div
      className={cn(
        s.frame,
        s.radius,
        'bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold shadow-lg',
        size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-2xl' : 'text-lg',
        className
      )}
      aria-hidden
    >
      RV
    </div>
  );
}

export default function AppLogo({ size = 'md', variant = 'default', className = '' }) {
  const [failed, setFailed] = useState(false);
  const s = SIZES[size] || SIZES.md;

  if (failed) {
    return <LogoFallback size={size} variant={variant} className={className} />;
  }

  if (variant === 'portal') {
    return (
      <div
        className={cn(
          'portal-logo-mark relative shrink-0 flex items-center justify-center',
          s.frame,
          s.radius,
          className
        )}
      >
        <img
          src="/logo.png"
          alt="Rare Vet Care"
          className={cn(s.img, 'object-contain portal-logo-mark__img')}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  if (variant === 'brand') {
    return (
      <div
        className={cn(
          'relative shrink-0 flex items-center justify-center bg-white',
          s.frame,
          s.radius,
          s.pad,
          'shadow-sm ring-1 ring-black/5',
          className
        )}
      >
        <img
          src="/logo.png"
          alt="Rare Vet Care"
          className={cn(s.img, 'object-contain')}
          onError={() => setFailed(true)}
        />
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
            'bg-gradient-to-br from-primary-400/30 to-primary-600/30 blur-[2px]'
          )}
          aria-hidden
        />
        <div
          className={cn(
            'relative h-full w-full flex items-center justify-center',
            s.radius,
            s.pad,
            'bg-card shadow-card ring-1 ring-border'
          )}
        >
          <img
            src="/logo.png"
            alt="Rare Vet Care"
            className={cn(s.img, 'object-contain')}
            onError={() => setFailed(true)}
          />
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
