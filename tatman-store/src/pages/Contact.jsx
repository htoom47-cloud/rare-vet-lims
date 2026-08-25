import { WHATSAPP } from "../data/products";
import { useLang } from "../context/LangContext";
import { Logo } from "../components/Logo";

export function Contact() {
  const { t, lang } = useLang();
  const preset =
    lang === "ar"
      ? "مرحباً تطمن، أريد الاستفسار عن المنتجات البيطرية. أنا أتواصل من:"
      : "Hello Tatman, I would like to inquire about veterinary products. I am contacting from:";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="font-display text-sm tracking-[0.25em] text-medical">
        {t("الصيدلية", "PHARMACY")}
      </p>
      <h1 className="mt-2 font-arabic text-3xl font-extrabold text-ink sm:text-4xl">
        {t("تواصل مع تطمن", "Contact Tatman")}
      </h1>
      <p className="mt-3 max-w-xl text-sm text-ink/65 sm:text-base">
        {t(
          "اطلب مباشرة عبر واتساب من قطر أو السعودية أو أي دولة — نفس رقم الإعلانات الرسمية.",
          "Order on WhatsApp from Qatar, Saudi Arabia, or any country — same official flyer number.",
        )}
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-2 md:gap-6">
        <a
          href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(preset)}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-[1.5rem] bg-[#25D366] p-7 text-ink shadow-lg transition hover:brightness-105 sm:rounded-[1.75rem] sm:p-8"
        >
          <p className="text-sm font-bold tracking-wide opacity-70">WhatsApp</p>
          <p className="mt-2 font-display text-2xl tracking-wide sm:text-3xl" dir="ltr">
            +974 5121 1169
          </p>
          <p className="mt-4 text-sm font-semibold">
            {t("اضغط لفتح المحادثة", "Tap to open chat")}
          </p>
        </a>

        <div className="rounded-[1.5rem] bg-navy p-7 text-white sm:rounded-[1.75rem] sm:p-8">
          <div className="inline-block overflow-hidden rounded-lg">
            <Logo compact className="h-16" />
          </div>
          <p className="mt-5 text-sm leading-relaxed text-white/75">
            {t(
              "نخدم مربي الإبل والخيل والهجن في قطر والسعودية والخليج، ويمكن الطلب من أي دولة عبر واتساب.",
              "We serve camel, horse, and hajjan owners in Qatar, Saudi Arabia, and the Gulf — and take orders worldwide via WhatsApp.",
            )}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { ar: "قطر", en: "Qatar" },
          { ar: "السعودية", en: "Saudi Arabia" },
          { ar: "الخليج", en: "Gulf" },
          { ar: "عالمي", en: "Worldwide" },
        ].map((c) => (
          <div
            key={c.en}
            className="rounded-2xl bg-white px-3 py-4 text-center text-sm font-bold text-navy shadow-sm ring-1 ring-medical/10"
          >
            {t(c.ar, c.en)}
          </div>
        ))}
      </div>
    </div>
  );
}
