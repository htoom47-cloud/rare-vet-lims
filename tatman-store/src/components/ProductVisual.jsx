import { productImage } from "../data/stock";

/** Real product photo when uploaded; otherwise a stylized pack fallback. */
export function ProductVisual({ product, className = "" }) {
  const photo = productImage(product);
  const { packStyle, accent, secondary, nameEn, volume } = product;

  if (photo) {
    return (
      <div className={`product-podium relative flex items-center justify-center p-4 ${className}`}>
        <img src={photo} alt={nameEn || product.nameAr || ""} className="max-h-56 w-full object-contain sm:max-h-64" />
      </div>
    );
  }

  if (packStyle === "bottle") {
    return (
      <div className={`product-podium relative flex items-end justify-center pb-4 ${className}`}>
        <div className="relative h-52 w-24 sm:h-60 sm:w-28">
          <div className="absolute inset-x-6 top-0 h-5 rounded-t-md bg-white shadow-sm ring-1 ring-black/10" />
          <div
            className="absolute inset-x-3 top-4 bottom-0 overflow-hidden rounded-b-2xl rounded-t-lg bg-white shadow-[0_20px_40px_rgba(10,10,10,0.18)] ring-1 ring-black/10"
          >
            <div className="mt-8 px-2 text-center">
              <div className="font-display text-[10px] tracking-widest" style={{ color: secondary }}>
                VITAVET
              </div>
              <div className="font-display text-lg leading-none" style={{ color: accent }}>
                {nameEn.split(" ").pop()}
              </div>
              <div className="mt-2 text-[8px] leading-tight text-ink/60">{volume}</div>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-10" style={{ background: accent }} />
          </div>
        </div>
      </div>
    );
  }

  if (packStyle === "bucket") {
    return (
      <div className={`product-podium relative flex items-end justify-center pb-4 ${className}`}>
        <div className="relative h-48 w-40 sm:h-56 sm:w-44">
          <div
            className="absolute inset-x-4 top-0 h-4 rounded-full opacity-90"
            style={{ background: accent }}
          />
          <div className="absolute inset-x-2 top-3 bottom-6 overflow-hidden rounded-b-[28px] rounded-t-xl bg-white shadow-[0_22px_44px_rgba(10,10,10,0.2)] ring-1 ring-black/10">
            <div
              className="h-2 w-full"
              style={{ background: `linear-gradient(90deg, ${secondary}, ${accent})` }}
            />
            <div className="px-3 pt-4 text-center">
              <div className="font-display text-sm tracking-wide text-ink">{nameEn}</div>
              <div className="mt-1 text-[10px] text-ink/55">{volume}</div>
            </div>
            <div
              className="absolute inset-x-4 bottom-4 h-14 rounded-lg opacity-90"
              style={{ background: `linear-gradient(160deg, ${accent}33, ${secondary}22)` }}
            />
          </div>
          <div className="absolute inset-x-6 bottom-0 h-4 rounded-full bg-ink/10 blur-[1px]" />
        </div>
      </div>
    );
  }

  if (packStyle === "vial") {
    return (
      <div className={`product-podium relative flex items-end justify-center gap-3 pb-4 ${className}`}>
        <div className="h-40 w-28 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black/10 sm:h-48 sm:w-32">
          <div className="h-2 w-full" style={{ background: accent }} />
          <div className="flex h-full flex-col items-center justify-center px-2 pb-6 text-center">
            <div className="font-display text-xs tracking-wide" style={{ color: secondary }}>
              {nameEn}
            </div>
            <div className="mt-2 h-12 w-12 rounded-full" style={{ background: `${accent}33` }} />
          </div>
        </div>
        <div className="relative h-36 w-12 sm:h-44 sm:w-14">
          <div
            className="absolute inset-x-2 top-0 h-4 rounded-sm"
            style={{ background: accent }}
          />
          <div className="absolute inset-x-0 top-3 bottom-0 rounded-b-xl bg-gradient-to-b from-white to-mist shadow-md ring-1 ring-black/10" />
        </div>
      </div>
    );
  }

  // box default
  return (
    <div className={`product-podium relative flex items-end justify-center pb-4 ${className}`}>
      <div className="relative h-44 w-36 overflow-hidden rounded-xl bg-white shadow-[0_20px_40px_rgba(10,10,10,0.16)] ring-1 ring-black/10 sm:h-52 sm:w-40">
        <div
          className="absolute -end-6 -top-6 h-28 w-28 rounded-full opacity-80"
          style={{ background: accent }}
        />
        <div className="relative z-10 flex h-full flex-col items-center justify-center p-4 text-center">
          <div
            className="mb-2 flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold text-white"
            style={{ background: secondary }}
          >
            +
          </div>
          <div className="font-display text-base tracking-wide text-navy">{nameEn}</div>
          <div className="mt-1 text-xs font-semibold text-ink/55">{volume}</div>
        </div>
      </div>
    </div>
  );
}
