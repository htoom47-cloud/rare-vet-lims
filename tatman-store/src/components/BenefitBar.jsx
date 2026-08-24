import { categories } from "../data/products";
import { BenefitIcon } from "./Icons";
import { useLang } from "../context/LangContext";
import { Link } from "react-router-dom";

export function BenefitBar() {
  const { t } = useLang();

  return (
    <section className="relative z-10 -mt-8 px-4 sm:px-6">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-2xl bg-gradient-to-l from-medical to-navy shadow-[0_20px_50px_rgba(20,33,61,0.35)]">
        <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.id}
              to={`/shop?cat=${c.id}`}
              className="flex flex-col items-center gap-2 bg-transparent px-3 py-5 text-center text-white transition hover:bg-white/10"
            >
              <BenefitIcon name={c.icon} className="h-8 w-8 text-sand" />
              <span className="text-xs font-semibold leading-snug sm:text-sm">
                {t(c.ar, c.en)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
