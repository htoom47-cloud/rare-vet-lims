/** Official Tatman logo — displayed exactly as the brand PNG, no redraw. */
const LOGO_SRC = "/brand/logo.png?v=pdf-original";

export function Logo({ className = "", compact = false }) {
  if (compact) {
    return (
      <img
        src={LOGO_SRC}
        alt="تطمن | Tatman Veterinary Services"
        className={`h-12 w-auto object-contain object-center sm:h-14 ${className}`}
        width={96}
        height={132}
        decoding="async"
      />
    );
  }

  return (
    <img
      src={LOGO_SRC}
      alt="تطمن | Tatman Veterinary Services"
      className={`mx-auto h-auto w-[min(78vw,320px)] object-contain object-center sm:w-[340px] ${className}`}
      width={340}
      height={467}
      decoding="async"
    />
  );
}
