/** Official Tatman camel logo — used as image asset only, never redrawn. */
const LOGO_SRC = "/brand/logo.png?v=knockout";

export function Logo({ className = "", compact = false }) {
  if (compact) {
    return (
      <img
        src={LOGO_SRC}
        alt="تطمن | Tatman Veterinary Services"
        className={`h-12 w-auto object-contain sm:h-14 ${className}`}
        width={112}
        height={168}
        decoding="async"
      />
    );
  }

  return (
    <img
      src={LOGO_SRC}
      alt="تطمن | Tatman Veterinary Services"
      className={`mx-auto h-auto w-[min(72vw,280px)] object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.35)] sm:w-[300px] ${className}`}
      width={300}
      height={450}
      decoding="async"
    />
  );
}
