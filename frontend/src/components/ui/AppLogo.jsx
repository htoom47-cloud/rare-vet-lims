import { useState } from 'react';

export default function AppLogo({ size = 'md', variant = 'default', className = '' }) {
  const sizes = {
    sm: 'w-10 h-10',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
  };
  const [failed, setFailed] = useState(false);
  const src = variant === 'gold' ? '/reception-display-usb/logo-gold.png' : '/logo.png';

  if (failed) {
    return (
      <div
        className={`${sizes[size] || sizes.md} rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-lg shadow-sm ${className}`}
        aria-hidden
      >
        RV
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="AL NAWADER VETERINARY CARE CENTER"
      className={`${sizes[size] || sizes.md} object-contain ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
