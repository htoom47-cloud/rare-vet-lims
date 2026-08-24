export function Logo({ className = "", compact = false, light = false }) {
  const tone = light ? "text-white" : "text-ink";

  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${tone} ${className}`}>
        <svg viewBox="0 0 48 48" className="h-11 w-11" aria-hidden>
          <path
            d="M10 36c3-12 10-22 18-26 2 5 5 9 10 10-3 8-8 15-13 20-5-2-10-3-15-4zm24-28c5 1 10 4 12 9-7 2-12 7-15 14-2-7-5-14-7-19 3-2 6-3 10-4z"
            fill="currentColor"
          />
        </svg>
        <div className="leading-tight">
          <div className="font-arabic text-xl font-extrabold tracking-tight">تطمن</div>
          <div className="font-display text-[11px] tracking-[0.22em] opacity-80">TATMAN VET</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center text-center ${tone} ${className}`}>
      <div className="font-arabic text-3xl font-extrabold tracking-tight sm:text-4xl">تطمن</div>
      <svg viewBox="0 0 120 70" className="my-1 h-14 w-24" aria-hidden>
        <path
          d="M58 8c-10 5-22 22-26 40-2 8 0 14 6 18 8-16 20-28 34-34-4-10-10-18-14-24zm-28 42c-8 2-16 10-18 18 10-8 22-14 34-16-6-4-12-4-16-2zm42 2c14 2 26 10 32 22-2-12-10-20-22-24-4-2-8-2-10 2z"
          fill="currentColor"
        />
        <text
          x="60"
          y="62"
          textAnchor="middle"
          fill="currentColor"
          style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, fontFamily: "Oswald, sans-serif" }}
        >
          VET
        </text>
      </svg>
      <div className="font-display text-lg tracking-[0.28em]">TATMAN</div>
      <div className="mt-0.5 text-[10px] font-semibold tracking-[0.28em] opacity-80">
        VETERINARY SERVICES
      </div>
      <div className="font-arabic text-xs font-semibold opacity-80">للخدمات البيطرية</div>
    </div>
  );
}
