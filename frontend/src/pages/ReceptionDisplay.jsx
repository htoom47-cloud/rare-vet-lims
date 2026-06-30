import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, m } from 'framer-motion';
import {
  Clock, Phone, MapPin, Droplets, FlaskConical, Microscope, Dna, Bug, Truck,
  FileText, ShieldCheck, Smartphone, ChevronRight, Maximize2,
} from 'lucide-react';
import AppLogo from '../components/ui/AppLogo';
import { settingsAPI } from '../services/api';

const SLIDE_KEYS = ['welcome', 'services', 'workflow', 'quality', 'portal', 'contact'];
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

function BiText({ ar, en, arClass = '', enClass = 'text-primary-400/75 text-[0.85em] font-normal mt-0.5', className = '' }) {
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
      en: 'text-xl md:text-2xl text-primary-300/90 font-medium mt-2',
    },
    section: {
      ar: 'text-3xl md:text-4xl font-bold text-primary-100',
      en: 'text-lg md:text-xl text-primary-400/80 font-medium mt-1',
    },
    card: {
      ar: 'text-lg font-bold text-primary-50',
      en: 'text-sm text-primary-400/80 font-medium',
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
      className="fixed inset-0 overflow-hidden bg-primary-900 text-primary-50 select-none"
      dir="rtl"
      onClick={nextSlide}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary-800 via-primary-900 to-[#1a120c] pointer-events-none" />
      <div className="absolute top-0 end-0 w-[45vw] h-[45vw] bg-primary-400/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4 pointer-events-none" />
      <div className="absolute bottom-0 start-0 w-[50vw] h-[50vw] bg-primary-600/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 pointer-events-none" />

      <header className="relative z-20 flex items-center justify-between px-8 py-4 border-b border-white/10 gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <AppLogo size="sm" className="drop-shadow-lg shrink-0" />
          <BiText
            ar={labNameAr}
            en={labNameEn}
            arClass="text-base font-bold text-primary-100 leading-tight truncate"
            enClass="text-xs text-primary-400/80 font-medium truncate"
            className="min-w-0"
          />
        </div>
        <div className="text-center shrink-0 hidden lg:block">
          <BiText
            ar={labSubtitleAr}
            en={labSubtitleEn}
            arClass="text-sm text-primary-300/90"
            enClass="text-xs text-primary-500/70"
          />
        </div>
        <div className="text-end shrink-0" dir="ltr">
          <p className="text-3xl font-mono font-bold text-primary-300 tabular-nums">{timeStr}</p>
          <p className="text-xs text-primary-400/90" dir="rtl">{now.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <p className="text-xs text-primary-500/70">{now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </header>

      <div className="relative z-20 bg-primary-400/20 border-b border-primary-400/30 px-8 py-2.5">
        <BiText
          ar={tAr('receptionDisplay.ticker')}
          en={tEn('receptionDisplay.ticker')}
          arClass="text-center text-base font-medium text-primary-100"
          enClass="text-center text-sm text-primary-300/80 mt-0.5"
          className="animate-pulse"
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
                  arClass="text-xl md:text-2xl text-primary-300 max-w-3xl mx-auto leading-relaxed mt-5"
                  enClass="text-base md:text-lg text-primary-400/75 max-w-3xl mx-auto leading-relaxed mt-2"
                  className="mt-5"
                />
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  {['camels', 'horses', 'livestock'].map((key) => (
                    <span key={key} className="px-4 py-2 rounded-full bg-white/10 border border-white/20">
                      <BiText
                        ar={tAr(`receptionDisplay.animals.${key}`)}
                        en={tEn(`receptionDisplay.animals.${key}`)}
                        arClass="text-base font-semibold"
                        enClass="text-xs text-primary-400/80"
                      />
                    </span>
                  ))}
                </div>
              </div>
            )}

            {slideKey === 'services' && (
              <div>
                <div className="mb-8">
                  <BiHeading ar={tAr('receptionDisplay.servicesTitle')} en={tEn('receptionDisplay.servicesTitle')} size="section" />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {services.map((key) => {
                    const Icon = SERVICE_ICONS[key];
                    return (
                      <div key={key} className="rounded-2xl bg-white/8 border border-white/15 p-5 backdrop-blur-sm">
                        <div className="w-12 h-12 rounded-xl bg-primary-400/25 flex items-center justify-center mb-3">
                          <Icon size={24} className="text-primary-300" />
                        </div>
                        <BiText
                          ar={tAr(`receptionDisplay.services.${key}.title`)}
                          en={tEn(`receptionDisplay.services.${key}.title`)}
                          arClass="text-base font-bold text-primary-50"
                          enClass="text-xs text-primary-400/80 font-medium"
                        />
                        <BiText
                          ar={tAr(`receptionDisplay.services.${key}.desc`)}
                          en={tEn(`receptionDisplay.services.${key}.desc`)}
                          arClass="text-sm text-primary-300/90 mt-2 leading-snug"
                          enClass="text-xs text-primary-500/70 mt-1 leading-snug"
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
                <div className="mb-8">
                  <BiHeading ar={tAr('receptionDisplay.workflowTitle')} en={tEn('receptionDisplay.workflowTitle')} size="section" />
                </div>
                <div className="flex flex-col lg:flex-row items-stretch justify-center gap-2 lg:gap-0">
                  {workflowSteps.map((key, i) => (
                    <div key={key} className="flex items-center gap-2 lg:flex-1">
                      <div className="flex-1 rounded-2xl bg-white/8 border border-white/15 p-4 text-center">
                        <div className="w-10 h-10 rounded-full bg-primary-400 text-primary-900 font-bold text-lg flex items-center justify-center mx-auto mb-2">
                          {i + 1}
                        </div>
                        <BiText
                          ar={tAr(`receptionDisplay.workflow.${key}.title`)}
                          en={tEn(`receptionDisplay.workflow.${key}.title`)}
                          arClass="text-sm font-bold text-primary-50"
                          enClass="text-xs text-primary-400/80"
                        />
                        <BiText
                          ar={tAr(`receptionDisplay.workflow.${key}.desc`)}
                          en={tEn(`receptionDisplay.workflow.${key}.desc`)}
                          arClass="text-xs text-primary-300/90 mt-1"
                          enClass="text-[10px] text-primary-500/70 mt-0.5"
                          className="mt-1"
                        />
                      </div>
                      {i < workflowSteps.length - 1 && (
                        <ChevronRight size={22} className="text-primary-400/60 shrink-0 hidden lg:block rotate-180" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {slideKey === 'quality' && (
              <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                  <BiHeading ar={tAr('receptionDisplay.qualityTitle')} en={tEn('receptionDisplay.qualityTitle')} size="section" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {qualityPoints.map((key) => (
                    <div key={key} className="flex items-start gap-3 rounded-2xl bg-white/8 border border-white/15 p-5">
                      <div className="w-10 h-10 rounded-xl bg-primary-400/25 flex items-center justify-center shrink-0">
                        <ShieldCheck size={20} className="text-primary-300" />
                      </div>
                      <div className="min-w-0">
                        <BiText
                          ar={tAr(`receptionDisplay.quality.${key}.title`)}
                          en={tEn(`receptionDisplay.quality.${key}.title`)}
                          arClass="text-base font-bold text-primary-50"
                          enClass="text-xs text-primary-400/80 font-medium"
                        />
                        <BiText
                          ar={tAr(`receptionDisplay.quality.${key}.desc`)}
                          en={tEn(`receptionDisplay.quality.${key}.desc`)}
                          arClass="text-sm text-primary-300/90 mt-1"
                          enClass="text-xs text-primary-500/70 mt-0.5"
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
                <div className="w-16 h-16 rounded-2xl bg-primary-400/25 flex items-center justify-center mx-auto mb-5">
                  <Smartphone size={32} className="text-primary-300" />
                </div>
                <BiHeading ar={tAr('receptionDisplay.portalTitle')} en={tEn('receptionDisplay.portalTitle')} size="section" />
                <BiText
                  ar={tAr('receptionDisplay.portalDesc')}
                  en={tEn('receptionDisplay.portalDesc')}
                  arClass="text-lg text-primary-300 mt-4 leading-relaxed"
                  enClass="text-sm text-primary-400/75 mt-2 leading-relaxed"
                  className="mt-4"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
                  {['results', 'pdf', 'history'].map((key) => (
                    <div key={key} className="rounded-xl bg-white/8 border border-white/15 p-4 text-center">
                      <FileText size={20} className="text-primary-400 mb-2 mx-auto" />
                      <BiText
                        ar={tAr(`receptionDisplay.portalFeatures.${key}`)}
                        en={tEn(`receptionDisplay.portalFeatures.${key}`)}
                        arClass="text-sm font-semibold text-primary-100"
                        enClass="text-xs text-primary-400/80"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {slideKey === 'contact' && (
              <div className="max-w-3xl mx-auto">
                <div className="mb-8">
                  <BiHeading ar={tAr('receptionDisplay.contactTitle')} en={tEn('receptionDisplay.contactTitle')} size="section" />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 rounded-2xl bg-white/8 border border-white/15 p-5">
                    <Phone size={28} className="text-primary-400 shrink-0" />
                    <div className="flex-1">
                      <BiText
                        ar={tAr('receptionDisplay.phone')}
                        en={tEn('receptionDisplay.phone')}
                        arClass="text-sm text-primary-400"
                        enClass="text-xs text-primary-500/70"
                      />
                      <p className="text-2xl font-bold text-primary-50 tracking-wide mt-1" dir="ltr">{phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 rounded-2xl bg-white/8 border border-white/15 p-5">
                    <Clock size={28} className="text-primary-400 shrink-0" />
                    <div className="flex-1">
                      <BiText
                        ar={tAr('receptionDisplay.hours')}
                        en={tEn('receptionDisplay.hours')}
                        arClass="text-sm text-primary-400"
                        enClass="text-xs text-primary-500/70"
                      />
                      <BiText
                        ar={tAr('receptionDisplay.hoursValue')}
                        en={tEn('receptionDisplay.hoursValue')}
                        arClass="text-base font-semibold text-primary-50 mt-1"
                        enClass="text-sm text-primary-300/80 mt-0.5"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 rounded-2xl bg-white/8 border border-white/15 p-5">
                    <MapPin size={28} className="text-primary-400 shrink-0" />
                    <div className="flex-1">
                      <BiText
                        ar={tAr('receptionDisplay.location')}
                        en={tEn('receptionDisplay.location')}
                        arClass="text-sm text-primary-400"
                        enClass="text-xs text-primary-500/70"
                      />
                      <BiText
                        ar={addressAr}
                        en={addressEn}
                        arClass="text-base font-semibold text-primary-50 mt-1"
                        enClass="text-sm text-primary-300/80 mt-0.5"
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

      <footer className="relative z-20 flex items-center justify-between px-8 py-3 border-t border-white/10 bg-black/20 backdrop-blur-sm gap-4">
        <div className="flex items-center gap-2">
          {SLIDE_KEYS.map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={(e) => { e.stopPropagation(); setSlide(i); }}
              className={`h-2 rounded-full transition-all ${i === slide ? 'w-8 bg-primary-400' : 'w-2 bg-white/30'}`}
              aria-label={`${tAr(`receptionDisplay.slides.${key}`)} / ${tEn(`receptionDisplay.slides.${key}`)}`}
            />
          ))}
        </div>
        <BiText
          ar={tAr('receptionDisplay.hint')}
          en={tEn('receptionDisplay.hint')}
          arClass="text-xs text-primary-400 hidden sm:block"
          enClass="text-[10px] text-primary-500/70 hidden sm:block"
          className="hidden sm:block text-center"
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); enterFullscreen(); }}
          className="flex items-center gap-2 text-xs text-primary-300 hover:text-primary-100 transition-colors shrink-0"
        >
          <Maximize2 size={14} />
          <BiText
            ar={tAr('receptionDisplay.fullscreen')}
            en={tEn('receptionDisplay.fullscreen')}
            arClass="text-xs"
            enClass="text-[10px] text-primary-500/70"
          />
        </button>
      </footer>
    </div>
  );
}
