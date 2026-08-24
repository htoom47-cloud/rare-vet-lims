import { WHATSAPP } from "../data/products";
import { useLang } from "../context/LangContext";

export function Contact() {
  const { t, lang } = useLang();
  const preset =
    lang === "ar"
      ? "مرحباً تطمن، أريد الاستفسار عن المنتجات البيطرية."
      : "Hello Tatman, I would like to inquire about veterinary products.";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <p className="font-display text-sm tracking-[0.25em] text-medical">
        {t("الصيدلية", "PHARMACY")}
      </p>
      <h1 className="mt-2 font-arabic text-4xl font-extrabold text-ink">
        {t("تواصل مع تطمن", "Contact Tatman")}
      </h1>
      <p className="mt-3 max-w-xl text-ink/65">
        {t(
          "اطلب مباشرة عبر واتساب — نفس رقم الإعلانات الرسمية.",
          "Order directly on WhatsApp — the same number from the official flyers.",
        )}
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <a
          href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(preset)}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-[1.75rem] bg-[#25D366] p-8 text-ink shadow-lg transition hover:brightness-105"
        >
          <p className="text-sm font-bold tracking-wide opacity-70">WhatsApp</p>
          <p className="mt-2 font-display text-3xl tracking-wide">+974 5121 1169</p>
          <p className="mt-4 text-sm font-semibold">
            {t("اضغط لفتح المحادثة", "Tap to open chat")}
          </p>
        </a>

        <div className="rounded-[1.75rem] bg-navy p-8 text-white">
          <p className="font-arabic text-4xl font-extrabold text-sand">تطمن</p>
          <p className="mt-2 font-display tracking-[0.2em]">VET TATMAN</p>
          <p className="mt-1 text-sm text-white/65">VETERINARY SERVICES</p>
          <p className="mt-6 text-sm leading-relaxed text-white/75">
            {t(
              "قطر · منتجات بيطرية لخيول السباق والإبل والمواشي.",
              "Qatar · Veterinary products for race horses, camels, and livestock.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
