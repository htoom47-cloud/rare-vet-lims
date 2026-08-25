const LOGO_SRC = "/brand/logo.png?v=pdf-original";

/** Atmospheric brand layer from official logo + hero photos. Does not redraw the mark. */
export function BrandBackdrop() {
  return (
    <div className="brand-backdrop" aria-hidden="true">
      <picture>
        <source media="(max-width: 768px)" srcSet="/brand/hero-mobile.jpg" />
        <img src="/brand/hero-desktop.jpg" alt="" className="brand-backdrop-photo" />
      </picture>
      <div className="brand-backdrop-wash" />
      <img src={LOGO_SRC} alt="" className="brand-backdrop-logo brand-backdrop-logo-a" />
      <img src={LOGO_SRC} alt="" className="brand-backdrop-logo brand-backdrop-logo-b" />
    </div>
  );
}
