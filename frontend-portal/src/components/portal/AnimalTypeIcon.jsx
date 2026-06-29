import { Bird, Cat, Dog } from 'lucide-react';
import { cn } from '../../lib/utils';

function CamelIcon({ size = 24, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 18c2-1 3.5-3 5-5.5.8-1.4 1.5-2.2 2.5-2.8.6-.4 1.2-.5 1.8-.2.5.2.9.7 1.1 1.3.2.7.1 1.5-.3 2.1-.5.7-1.2 1.2-2 1.5M14 8.5c.5-1.2 1.2-2 2.2-2.5 1.2-.6 2.5-.4 3.5.5 1 .9 1.5 2.3 1.2 3.7-.2 1-.8 1.9-1.6 2.5-.5.4-1 .7-1.6.8M7 14.5c-.3-1.8.2-3.5 1.4-4.8 1-1.1 2.4-1.7 3.9-1.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.5" cy="7" r="0.75" fill="currentColor" />
      <path d="M5 18h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function HorseIcon({ size = 24, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M6 18c1.5-.8 2.8-2 3.8-3.6 1-1.5 1.5-3.2 1.6-5 .1-1.2.5-2.2 1.2-3 .8-.9 2-1.4 3.2-1.2 1.4.2 2.6 1 3.3 2.2.6 1 .8 2.2.5 3.3-.2.8-.6 1.5-1.1 2.1M15 7c.5-.8 1.2-1.3 2.1-1.5 1-.2 2 .1 2.7.8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16.5" cy="6.5" r="0.75" fill="currentColor" />
      <path d="M5 18h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SheepIcon({ size = 24, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M7 14c-1.5 0-2.8-.8-3.5-2-.6-1-.6-2.2 0-3.2.5-.8 1.3-1.3 2.2-1.4.3-1 .9-1.8 1.8-2.4 1-.6 2.2-.7 3.3-.2 1 .5 1.7 1.4 2 2.5.9-.2 1.8 0 2.5.5 1 .7 1.4 1.9 1 3-.4 1.2-1.5 2-2.8 2.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="10" r="0.6" fill="currentColor" />
      <path d="M6 17h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GoatIcon({ size = 24, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M8 14c-1.2 0-2.2-.6-2.8-1.6-.5-.8-.5-1.8 0-2.6.4-.6 1-1 1.7-1.1.4-.9 1.1-1.6 2-2 1.1-.5 2.4-.4 3.4.3 1 .7 1.5 1.8 1.4 3 .8-.3 1.6-.1 2.2.4 1 .7 1.3 2 .7 3.1-.5 1-1.6 1.7-2.8 1.7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 6.5c.3-.8.9-1.3 1.7-1.5M14.5 5.5c.4-.5 1-.7 1.6-.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9.5" cy="10.5" r="0.6" fill="currentColor" />
      <path d="M6 17h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const TYPE_ICONS = {
  camel: CamelIcon,
  horse: HorseIcon,
  sheep: SheepIcon,
  goat: GoatIcon,
  bird: Bird,
  cat: Cat,
  dog: Dog,
};

export default function AnimalTypeIcon({ type, size = 24, className }) {
  const Icon = TYPE_ICONS[type];
  if (!Icon) {
    return <HorseIcon size={size} className={cn('opacity-60', className)} />;
  }
  return <Icon size={size} className={className} strokeWidth={type === 'bird' || type === 'cat' || type === 'dog' ? 2 : undefined} />;
}

export { TYPE_ICONS, CamelIcon, HorseIcon, SheepIcon, GoatIcon };
