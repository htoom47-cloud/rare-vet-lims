import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, m } from 'framer-motion';
import {
  Clock, Phone, MapPin, Droplets, FlaskConical, Microscope, Dna, Bug, Truck,
  FileText, ShieldCheck, Smartphone, ChevronRight, Maximize2,
} from 'lucide-react';
import AppLogo from '../components/ui/AppLogo';
import { settingsAPI } from '../services/api';

const SLIDE_KEYS = ['welcome', 'pricing', 'services', 'workflow', 'quality', 'portal', 'contact'];
const ROTATE_MS = 12000;

const SERVICE_ICONS = {
  cbc: Droplets,
  chemistry: FlaskConical,
  parasitology: Bug,
  microbiology: Microscope,
  pcr: Dna,
  field: Truck,
};

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function BiText({ ar, en, arClass = '', enClass = 'text-primary-300/85 text-[0.85em] font-medium mt-0.5', className = '' }) {
  return (
    <div className={className}>
      <p className={arClass} dir="rtl" lang="ar">{ar}</p>
      {en ? <p className={enClass} dir="ltr" lang="en">{en}</p> : null}
    </div>
  );
}

function BiHeading({ ar, en, size = 'hero' }) {
  const sizes = {
    hero: {
      ar: 'text-4xl md:text-5xl font-bold text-primary-50 leading-tight',
      en: 'text-xl md:text-2xl text-primary-300 font-semibold mt-2',
    },
    section: {
      ar: 'text-3xl md:text-4xl font-bold text-primary-50',
      en: 'text-lg md:text-xl text-primary-300 font-semibold mt-1',
    },
    card: {
      ar: 'text-lg font-bold text-primary-50',
      en: 'text-sm text-primary-300 font-semibold uppercase tracking-wide',
    },
    label: {
      ar: 'text-sm text-primary-400',
      en: 'text-xs text-primary-500/80',
    },
  };
  const s = sizes[size] || sizes.card;
  return <BiText ar={ar} en={en} arClass={s.ar} enClass={s.en} className="text-center" />;
}

function useBiT() {
  const { i18n } = useTranslation();
  return useMemo(() => ({
    tAr: i18n.getFixedT('ar'),
    tEn: i18n.getFixedT('en'),
  }), [i18n]);
}

export default function ReceptionDisplay() {
  const { tAr, tEn } = useBiT();
  const now = useClock();

  const [slide, setSlide] = useState(0);
  const [lab, setLab] = useState(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    settingsAPI.public()
      .then(({ data }) => setLab(data.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDE_KEYS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused]);

  const nextSlide = useCallback(() => setSlide((s) => (s + 1) % SLIDE_KEYS.length), []);

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const labNameAr = lab?.lab_name_ar || tAr('app.name');
  const labNameEn = lab?.lab_name || tEn('app.name');
  const labSubtitleAr = lab?.lab_subtitle_ar || tAr('app.subtitle');
  const labSubtitleEn = lab?.lab_subtitle || tEn('app.subtitle');
  const phone = lab?.phone || '0115007257';
  const addressAr = tAr('receptionDisplay.defaultAddress');
  const addressEn = tEn('receptionDisplay.defaultAddress');

  const services = useMemo(() => ['cbc', 'chemistry', 'parasitology', 'microbiology', 'pcr', 'field'], []);
  const workflowSteps = useMemo(() => ['register', 'collect', 'analyze', 'approve', 'deliver'], []);
  const qualityPoints = useMemo(() => ['equipment', 'accuracy', 'bilingual', 'field'], []);

  const slideKey = SLIDE_KEYS[slide];
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-gradient-to-br from-[#2B1B17] via-primary-800 to-[#5B3A29] text-primary-50 select-none"
      dir="rtl"
      onClick={nextSlide}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_80%_at_20%_30%,rgba(212,175,55,0.12)_0%,transparent_55%),radial-gradient(ellipse_70%_60%_at_85%_70%,rgba(0,0,0,0.35)_0%,transparent_60%)] pointer-events-none z-[1]" />
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#2B1B17] via-primary-300 to-[#2B1B17] pointer-events-none z-30" />
      <div className="absolute top-0 start-0 w-[50vw] h-[50vw] bg-primary-400/15 rounded-full blur-3xl -translate-y-1/3 -translate-x-1/4 pointer-events-none" />
      <div className="absolute bottom-0 end-0 w-[45vw] h-[45vw] bg-black/25 rounded-full blur-3xl translate-y-1/3 translate-x-1/4 pointer-events-none" />

      <header className="relative z-20 flex items-center justify-between px-8 py-4 border-b border-primary-400/25 bg-[#2B1B17]/88 backdrop-blur-md shadow-lg gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <AppLogo size="sm" className="drop-shadow-lg shrink-0" />
          <BiText
            ar={labNameAr}
            en={labNameEn}
            arClass="text-base font-bold text-primary-50 leading-tight truncate"
            enClass="text-xs text-primary-300 font-semibold truncate"
            className="min-w-0"
          />
        </div>
        <div className="text-center shrink-0 hidden lg:block">
          <BiText
            ar={labSubtitleAr}
            en={labSubtitleEn}
            arClass="text-sm text-primary-200"
            enClass="text-xs text-primary-300/80"
          />
        </div>
        <div className="text-end shrink-0 bg-primary-800/60 border border-primary-400/30 rounded-xl px-4 py-2 shadow-lg" dir="ltr">
          <p className="text-3xl font-mono font-bold text-primary-300 tabular-nums">{timeStr}</p>
          <p className="text-xs text-primary-200" dir="rtl">{now.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <p className="text-xs text-primary-300/80">{now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </header>

      <div className="relative z-20 bg-gradient-to-r from-[#2B1B17]/95 via-primary-800/80 to-[#2B1B17]/95 border-b border-primary-400/25 px-8 py-2.5">
        <BiText
          ar={tAr('receptionDisplay.ticker')}
          en={tEn('receptionDisplay.ticker')}
          arClass="text-center text-base font-semibold text-primary-100"
          enClass="text-center text-sm text-primary-300/85 mt-0.5"
        />
      </div>

      <main className="relative z-10 flex items-center justify-center px-8 py-6 overflow-hidden" style={{ height: 'calc(100vh - 168px)' }}>
        <AnimatePresence mode="wait">
          <m.div
            key={slideKey}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-6xl max-h-full overflow-y-auto"
          >
            {slideKey === 'welcome' && (
              <div className="text-center">
                <AppLogo size="lg" className="mx-auto mb-6 drop-shadow-2xl" />
                <BiHeading
                  ar={tAr('receptionDisplay.welcomeTitle')}
                  en={tEn('receptionDisplay.welcomeTitle')}
                  size="hero"
                />
                <BiText
                  ar={tAr('receptionDisplay.welcomeSubtitle')}
                  en={tEn('receptionDisplay.welcomeSubtitle')}
                  arClass="text-xl md:text-2xl text-primary-200 max-w-3xl mx-auto leading-relaxed mt-5"
                  enClass="text-base md:text-lg text-primary-300/85 max-w-3xl mx-auto leading-relaxed mt-2"
                  className="mt-5"
                />
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  {['camels', 'horses', 'livestock'].map((key) => (
                    <span key={key} className="px-4 py-2 rounded-full bg-primary-800/50 border border-primary-400/30 shadow-sm">
                      <BiText
                        ar={tAr(`receptionDisplay.animals.${key}`)}
                        en={tEn(`receptionDisplay.animals.${key}`)}
                        arClass="text-base font-semibold text-primary-50"
                        enClass="text-xs text-primary-300"
                      />
                    </span>
                  ))}
                </div>
              </div>
            )}

            {slideKey === 'pricing' && (
              <div className="text-center flex flex-col items-center justify-center">
                <img
                  src="/reception-display-usb/pricing-banner.png"
                  alt="Al-Nwadr Lab Pricing"
                  className="max-w-full max-h-[calc(100vh-200px)] rounded-xl border-2 border-primary-400/35 shadow-2xl object-contain"
                />
              </div>
            )}

            {slideKey === 'services' && (
              <div>
                <div className="mb-6 flex flex-col items-center">
                  <BiHeading ar={tAr('receptionDisplay.servicesTitle')} en={tEn('receptionDisplay.servicesTitle')} size="section" />
                  <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-primary-400 to-transparent mt-2" />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {services.map((key) => {
                    const Icon = SERVICE_ICONS[key];
                    return (
                      <div key={key} className="rounded-2xl bg-primary-800/55 border border-primary-400/30 p-5 shadow-lg shadow-black/20 hover:border-primary-300/50 transition-colors">
                        <div className="w-12 h-12 rounded-xl bg-primary-400/15 border border-primary-400/25 flex items-center justify-center mb-3">
                          <Icon size={24} className="text-primary-300" />
                        </div>
                        <BiText
                          ar={tAr(`receptionDisplay.services.${key}.title`)}
                          en={tEn(`receptionDisplay.services.${key}.title`)}
                          arClass="text-base font-bold text-primary-50"
                          enClass="text-xs text-primary-300 font-semibold"
                        />
                        <BiText
                          ar={tAr(`receptionDisplay.services.${key}.desc`)}
                          en={tEn(`receptionDisplay.services.${key}.desc`)}
                          arClass="text-sm text-primary-200 mt-2 leading-snug"
                          enClass="text-xs text-primary-300/75 mt-1 leading-snug"
                          className="mt-2"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {slideKey === 'workflow' && (
              <div>
                <div className="mb-6 flex flex-col items-center">
                  <BiHeading ar={tAr('receptionDisplay.workflowTitle')} en={tEn('receptionDisplay.workflowTitle')} size="section" />
                  <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-primary-400 to-transparent mt-2" />
                </div>
                <div className="flex flex-col lg:flex-row items-stretch justify-center gap-2 lg:gap-0">
                  {workflowSteps.map((key, i) => (
                    <div key={key} className="flex items-center gap-2 lg:flex-1">
                      <div className="flex-1 rounded-2xl bg-primary-800/55 border border-primary-400/30 p-4 text-center shadow-lg shadow-black/20">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-300 to-primary-500 text-[#2B1B17] font-bold text-lg flex items-center justify-center mx-auto mb-2 shadow-md">
                          {i + 1}
                        </div>
                        <BiText
                          ar={tAr(`receptionDisplay.workflow.${key}.title`)}
                          en={tEn(`receptionDisplay.workflow.${key}.title`)}
                          arClass="text-sm font-bold text-primary-50"
                          enClass="text-xs text-primary-300"
                        />
                        <BiText
                          ar={tAr(`receptionDisplay.workflow.${key}.desc`)}
                          en={tEn(`receptionDisplay.workflow.${key}.desc`)}
                          arClass="text-xs text-primary-200 mt-1"
                          enClass="text-[10px] text-primary-300/75 mt-0.5"
                          className="mt-1"
                        />
                      </div>
                      {i < workflowSteps.length - 1 && (
                        <ChevronRight size={22} className="text-primary-400 shrink-0 hidden lg:block rotate-180" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {slideKey === 'quality' && (
              <div className="max-w-4xl mx-auto">
                <div className="mb-6 flex flex-col items-center">
                  <BiHeading ar={tAr('receptionDisplay.qualityTitle')} en={tEn('receptionDisplay.qualityTitle')} size="section" />
                  <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-primary-400 to-transparent mt-2" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {qualityPoints.map((key) => (
                    <div key={key} className="flex items-start gap-3 rounded-2xl bg-primary-800/55 border border-primary-400/30 p-5 shadow-lg shadow-black/20">
                      <div className="w-10 h-10 rounded-xl bg-primary-400/15 border border-primary-400/25 flex items-center justify-center shrink-0">
                        <ShieldCheck size={20} className="text-primary-300" />
                      </div>
                      <div className="min-w-0">
                        <BiText
                          ar={tAr(`receptionDisplay.quality.${key}.title`)}
                          en={tEn(`receptionDisplay.quality.${key}.title`)}
                          arClass="text-base font-bold text-primary-50"
                          enClass="text-xs text-primary-300 font-semibold"
                        />
                        <BiText
                          ar={tAr(`receptionDisplay.quality.${key}.desc`)}
                          en={tEn(`receptionDisplay.quality.${key}.desc`)}
                          arClass="text-sm text-primary-200 mt-1"
                          enClass="text-xs text-primary-300/75 mt-0.5"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {slideKey === 'portal' && (
              <div className="text-center max-w-3xl mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-primary-400/15 border border-primary-400/25 flex items-center justify-center mx-auto mb-5 shadow-lg">
                  <Smartphone size={32} className="text-primary-300" />
                </div>
                <BiHeading ar={tAr('receptionDisplay.portalTitle')} en={tEn('receptionDisplay.portalTitle')} size="section" />
                <BiText
                  ar={tAr('receptionDisplay.portalDesc')}
                  en={tEn('receptionDisplay.portalDesc')}
                  arClass="text-lg text-primary-200 mt-4 leading-relaxed"
                  enClass="text-sm text-primary-300/85 mt-2 leading-relaxed"
                  className="mt-4"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
                  {['results', 'pdf', 'history'].map((key) => (
                    <div key={key} className="rounded-xl bg-primary-800/55 border border-primary-400/30 p-4 text-center shadow-lg">
                      <FileText size={20} className="text-primary-300 mb-2 mx-auto" />
                      <BiText
                        ar={tAr(`receptionDisplay.portalFeatures.${key}`)}
                        en={tEn(`receptionDisplay.portalFeatures.${key}`)}
                        arClass="text-sm font-semibold text-primary-50"
                        enClass="text-xs text-primary-300"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {slideKey === 'contact' && (
              <div className="max-w-3xl mx-auto">
                <div className="mb-6 flex flex-col items-center">
                  <BiHeading ar={tAr('receptionDisplay.contactTitle')} en={tEn('receptionDisplay.contactTitle')} size="section" />
                  <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-primary-400 to-transparent mt-2" />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 rounded-2xl bg-primary-800/55 border border-primary-400/30 p-5 shadow-lg shadow-black/20">
                    <Phone size={28} className="text-primary-300 shrink-0" />
                    <div className="flex-1">
                      <BiText
                        ar={tAr('receptionDisplay.phone')}
                        en={tEn('receptionDisplay.phone')}
                        arClass="text-sm text-primary-300"
                        enClass="text-xs text-primary-300/75"
                      />
                      <p className="text-2xl font-bold text-primary-300 tracking-wide mt-1" dir="ltr">{phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 rounded-2xl bg-primary-800/55 border border-primary-400/30 p-5 shadow-lg shadow-black/20">
                    <Clock size={28} className="text-primary-300 shrink-0" />
                    <div className="flex-1">
                      <BiText
                        ar={tAr('receptionDisplay.hours')}
                        en={tEn('receptionDisplay.hours')}
                        arClass="text-sm text-primary-300"
                        enClass="text-xs text-primary-300/75"
                      />
                      <BiText
                        ar={tAr('receptionDisplay.hoursValue')}
                        en={tEn('receptionDisplay.hoursValue')}
                        arClass="text-base font-semibold text-primary-50 mt-1"
                        enClass="text-sm text-primary-200 mt-0.5"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 rounded-2xl bg-primary-800/55 border border-primary-400/30 p-5 shadow-lg shadow-black/20">
                    <MapPin size={28} className="text-primary-300 shrink-0" />
                    <div className="flex-1">
                      <BiText
                        ar={tAr('receptionDisplay.location')}
                        en={tEn('receptionDisplay.location')}
                        arClass="text-sm text-primary-300"
                        enClass="text-xs text-primary-300/75"
                      />
                      <BiText
                        ar={addressAr}
                        en={addressEn}
                        arClass="text-base font-semibold text-primary-50 mt-1"
                        enClass="text-sm text-primary-200 mt-0.5"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </m.div>
        </AnimatePresence>
      </main>

      <footer className="relative z-20 flex items-center justify-between px-8 py-3 border-t border-primary-400/25 bg-[#2B1B17]/92 backdrop-blur-md gap-4 shadow-[0_-4px_24px_rgba(0,0,0,0.25)]">
        <div className="flex items-center gap-2">
          {SLIDE_KEYS.map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={(e) => { e.stopPropagation(); setSlide(i); }}
              className={`h-2 rounded-full transition-all ${i === slide ? 'w-8 bg-primary-300' : 'w-2 bg-primary-400/35'}`}
              aria-label={`${tAr(`receptionDisplay.slides.${key}`)} / ${tEn(`receptionDisplay.slides.${key}`)}`}
            />
          ))}
        </div>
        <BiText
          ar={tAr('receptionDisplay.hint')}
          en={tEn('receptionDisplay.hint')}
          arClass="text-xs text-primary-300 hidden sm:block"
          enClass="text-[10px] text-primary-300/70 hidden sm:block"
          className="hidden sm:block text-center"
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); enterFullscreen(); }}
          className="flex items-center gap-2 text-xs text-primary-200 hover:text-primary-50 bg-primary-800/60 border border-primary-400/30 rounded-lg px-3 py-1.5 transition-colors shrink-0"
        >
          <Maximize2 size={14} />
          <BiText
            ar={tAr('receptionDisplay.fullscreen')}
            en={tEn('receptionDisplay.fullscreen')}
            arClass="text-xs text-primary-200"
            enClass="text-[10px] text-primary-300/75"
          />
        </button>
      </footer>
    </div>
  );
}
