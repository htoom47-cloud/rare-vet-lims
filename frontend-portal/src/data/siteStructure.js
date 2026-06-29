import {
  FlaskConical, Droplets, Microscope, Dna, TestTubes, HeartPulse,
  Bug, Truck, MapPin, Building2, Stethoscope, Tractor,
} from 'lucide-react';

/** Service departments mapped to DB category codes + marketing copy keys */
export const SERVICE_DEPARTMENTS = [
  { id: 'biochemistry', icon: FlaskConical, categories: ['CHEM'], color: 'amber' },
  { id: 'hematology', icon: Droplets, categories: ['CBC'], color: 'rose' },
  { id: 'microbiology', icon: Microscope, categories: ['MICRO'], color: 'emerald' },
  { id: 'bacterialCulture', icon: TestTubes, categories: ['CULT'], color: 'teal' },
  { id: 'elisa', icon: TestTubes, categories: ['ELISA', 'SERO'], color: 'sky' },
  { id: 'pcr', icon: Dna, categories: ['PCR'], color: 'violet' },
  { id: 'hormones', icon: HeartPulse, categories: ['HORM'], color: 'pink' },
  { id: 'parasitology', icon: Bug, categories: ['MICRO'], color: 'lime' },
  { id: 'fieldCollection', icon: Truck, categories: [], color: 'orange' },
  { id: 'fieldServices', icon: MapPin, categories: [], color: 'primary' },
];

export const AUDIENCES = [
  { id: 'camels', image: '/images/animals/camel.jpg' },
  { id: 'horses', image: '/images/animals/horse.jpg' },
  { id: 'cattle', image: '/images/animals/sheep.jpg' },
  { id: 'sheep', image: '/images/animals/sheep.jpg' },
  { id: 'goats', image: '/images/animals/sheep.jpg' },
  { id: 'clinics', icon: Stethoscope },
  { id: 'farms', icon: Tractor },
];

export const WORKFLOW_STEPS = ['book', 'collect', 'analyze', 'review', 'approve', 'deliver'];

export const WHY_US = ['equipment', 'accuracy', 'speed', 'reports', 'field', 'portal', 'compare', 'support'];

export const EQUIPMENT = [
  { id: 'hematology', image: '/images/lab-hero-bg.jpg' },
  { id: 'chemistry', image: '/images/lab-bg-texture.jpg' },
  { id: 'microscope', image: '/images/animals/horse.jpg' },
  { id: 'elisa', image: '/images/lab-hero-bg.jpg' },
  { id: 'pcr', image: '/images/lab-bg-texture.jpg' },
  { id: 'coldChain', image: '/images/animals/camel.jpg' },
];

export const PORTAL_FEATURES = ['results', 'pdf', 'compare', 'archive', 'share'];

export const QUALITY_PILLARS = ['standards', 'biosafety', 'accreditation', 'procedures'];

export const COLOR_RING = {
  amber: 'bg-amber-50 text-amber-900 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-100',
  rose: 'bg-rose-50 text-rose-900 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-100',
  emerald: 'bg-emerald-50 text-emerald-900 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-100',
  sky: 'bg-sky-50 text-sky-900 ring-sky-200/60 dark:bg-sky-950/30 dark:text-sky-100',
  violet: 'bg-violet-50 text-violet-900 ring-violet-200/60 dark:bg-violet-950/30 dark:text-violet-100',
  pink: 'bg-pink-50 text-pink-900 ring-pink-200/60 dark:bg-pink-950/30 dark:text-pink-100',
  lime: 'bg-lime-50 text-lime-900 ring-lime-200/60 dark:bg-lime-950/30 dark:text-lime-100',
  orange: 'bg-orange-50 text-orange-900 ring-orange-200/60 dark:bg-orange-950/30 dark:text-orange-100',
  primary: 'bg-primary-50 text-primary-900 ring-primary-200/60 dark:bg-primary-950/30 dark:text-primary-100',
  teal: 'bg-teal-50 text-teal-900 ring-teal-200/60 dark:bg-teal-950/30 dark:text-teal-100',
};
