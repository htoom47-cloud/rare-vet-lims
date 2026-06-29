import {
  FlaskConical, Droplets, Microscope, Dna, TestTubes, HeartPulse,
  Bug, Truck, MapPin, Stethoscope, Tractor,
} from 'lucide-react';

/** Service departments mapped to DB category codes + marketing metadata */
export const SERVICE_DEPARTMENTS = [
  {
    id: 'biochemistry', icon: FlaskConical, categories: ['CHEM'], color: 'amber',
    image: '/images/services/biochemistry.jpg',
    animals: ['camels', 'horses', 'cattle', 'sheep', 'goats', 'clinics', 'farms'],
  },
  {
    id: 'hematology', icon: Droplets, categories: ['CBC'], color: 'rose',
    image: '/images/services/hematology.jpg',
    animals: ['camels', 'horses', 'cattle', 'sheep', 'goats', 'clinics', 'farms'],
  },
  {
    id: 'microbiology', icon: Microscope, categories: ['MICRO'], color: 'emerald',
    image: '/images/services/microbiology.jpg',
    animals: ['camels', 'horses', 'cattle', 'sheep', 'goats', 'clinics', 'farms'],
  },
  {
    id: 'bacterialCulture', icon: TestTubes, categories: ['CULT'], color: 'teal',
    image: '/images/lab/operations.jpg',
    animals: ['camels', 'horses', 'cattle', 'sheep', 'goats', 'clinics', 'farms'],
  },
  {
    id: 'elisa', icon: TestTubes, categories: ['ELISA', 'SERO'], color: 'sky',
    image: '/images/equipment/elisa.jpg',
    animals: ['camels', 'cattle', 'sheep', 'goats', 'farms'],
  },
  {
    id: 'pcr', icon: Dna, categories: ['PCR'], color: 'violet',
    image: '/images/services/pcr.jpg',
    animals: ['camels', 'horses', 'cattle', 'sheep', 'goats', 'clinics', 'farms'],
  },
  {
    id: 'hormones', icon: HeartPulse, categories: ['HORM'], color: 'pink',
    image: '/images/lab/interior.jpg',
    animals: ['camels', 'horses', 'cattle', 'sheep', 'goats', 'clinics'],
  },
  {
    id: 'parasitology', icon: Bug, categories: [], color: 'lime',
    image: '/images/equipment/microscope.jpg',
    animals: ['camels', 'horses', 'cattle', 'sheep', 'goats', 'farms'],
  },
  {
    id: 'fieldCollection', icon: Truck, categories: [], color: 'orange',
    image: '/images/lab/field-service.jpg',
    animals: ['camels', 'horses', 'cattle', 'sheep', 'goats', 'farms'],
  },
  {
    id: 'fieldServices', icon: MapPin, categories: [], color: 'primary',
    image: '/images/lab/field-service.jpg',
    animals: ['camels', 'horses', 'cattle', 'sheep', 'goats', 'clinics', 'farms'],
  },
];

export const ANIMAL_FILTERS = [
  { id: 'all' },
  { id: 'camels' },
  { id: 'horses' },
  { id: 'cattle' },
  { id: 'sheep' },
  { id: 'goats' },
  { id: 'clinics' },
  { id: 'farms' },
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

export const WORKFLOW_STEPS = ['book', 'collect', 'analyze', 'approve', 'deliver', 'archive'];

export const WHY_US = ['equipment', 'speed', 'field', 'reports', 'compare', 'team', 'qualityLab'];

export const HERO_BADGES = ['field', 'digital', 'equipment', 'portal', 'reports'];

export const EQUIPMENT = [
  { id: 'hematology', image: '/images/equipment/hematology.jpg' },
  { id: 'chemistry', image: '/images/equipment/chemistry.jpg' },
  { id: 'microscope', image: '/images/equipment/microscope.jpg' },
  { id: 'elisa', image: '/images/equipment/elisa.jpg' },
  { id: 'pcr', image: '/images/services/pcr.jpg' },
  { id: 'coldChain', image: '/images/lab/field-service.jpg' },
];

export const CREDIBILITY = [
  { id: 'interior', image: '/images/lab/interior.jpg' },
  { id: 'operations', image: '/images/lab/operations.jpg' },
  { id: 'field', image: '/images/lab/field-service.jpg' },
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
