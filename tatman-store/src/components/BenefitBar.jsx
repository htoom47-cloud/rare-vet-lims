import { categories } from "../data/products";
import { BenefitIcon } from "./Icons";
import { useLang } from "../context/LangContext";
import { Link } from "react-router-dom";

export function BenefitBar() {
  const { t } = useLang();

  return (
    <section className="relative z-10 -mt-10 px-3 sm:-mt-8 sm:px-6">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-2xl bg-gradient-to-l from-teal to-navy shadow-[0_20px_50px_rgba(26,61,58,0.35)]">
        <div className="grid grid-cols-3 gap-px bg-white/10 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.id}
              to={`/shop?cat=${c.id}`}
              className="flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 bg-transparent px-2 py-4 text-center text-white transition hover:bg-white/10 sm:min-h-0 sm:gap-2 sm:px-3 sm:py-5"
            >
              <BenefitIcon name={c.icon} className="h-6 w-6 text-sand sm:h-8 sm:w-8" />
              <span className="text-[10px] font-bold leading-snug sm:text-sm">
                {t(c.ar, c.en)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
