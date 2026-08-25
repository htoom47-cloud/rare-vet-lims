/** Official Tatman camel logo — used as image, never redrawn. */
export function Logo({ className = "", compact = false }) {
  if (compact) {
    return (
      <img
        src="/brand/logo.png"
        alt="تطمن | Tatman Veterinary Services"
        className={`h-12 w-auto object-contain sm:h-14 ${className}`}
        width={112}
        height={56}
        decoding="async"
      />
    );
  }

  return (
    <img
      src="/brand/logo.png"
      alt="تطمن | Tatman Veterinary Services"
      className={`mx-auto h-auto w-[min(72vw,280px)] object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.35)] sm:w-[300px] ${className}`}
      width={300}
      height={400}
      decoding="async"
    />
  );
}
