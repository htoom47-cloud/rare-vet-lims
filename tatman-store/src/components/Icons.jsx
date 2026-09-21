const paths = {
  shield:
    "M12 3l8 3v6c0 5.5-3.4 10.4-8 12-4.6-1.6-8-6.5-8-12V6l8-3zm0 4.2L7 9v3.1c0 3.8 2.2 7.2 5 8.6 2.8-1.4 5-4.8 5-8.6V9l-5-1.8z",
  horse:
    "M4 16c2-6 6-10 10-12 1 3 3 5 6 6-1 4-4 8-7 11H8c-2-1-4-3-4-5zm12-9c3 0 6 2 7 5-4 1-7 4-8 8-1-4-3-8-4-11 1-1 3-2 5-2z",
  bolt: "M13 2L4 14h6l-1 8 10-14h-6l0-6z",
  digest:
    "M8 4c-2 2-3 5-2 8 1 4 4 7 8 8 3 1 6 0 8-2-2 4-6 6-10 5-5-1-9-6-9-11 0-3 1-6 3-8h2zm6 2c3 1 5 4 5 7 0 2-1 4-2 5-1-3-3-5-5-7V6z",
  joint:
    "M7 4h4v4H7V4zm6 0h4v4h-4V4zM6 10h12v2H6v-2zm1 4h4v6H7v-6zm6 0h4v6h-4v-6z",
  cell: "M12 4a8 8 0 100 16 8 8 0 000-16zm0 2a6 6 0 110 12 6 6 0 010-12zm-2 4h4v4h-4V10z",
};

export function BenefitIcon({ name, className = "h-7 w-7" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={paths[name] || paths.shield} />
    </svg>
  );
}

export function AnimalIcon({ type, className = "h-5 w-5" }) {
  const map = {
    horse: "M4 17c2-7 7-11 12-13 1 3 3 5 6 6-2 4-5 8-8 11H9c-2-1-4-2-5-4z",
    camel:
      "M3 17c1-5 4-9 8-11 2 2 3 5 4 8 2-3 4-5 7-6 0 4-1 8-3 10H6c-1-0-2-1-3-1z",
    cow: "M5 10c0-3 3-5 7-5s7 2 7 5v2h2v3h-3l-1 5H7l-1-5H3v-3h2v-2z",
    goat: "M6 18c1-6 4-10 8-12 2 2 3 5 3 8 2-1 4-1 5 1-2 3-5 5-8 5H8c-1 0-2-1-2-2z",
    sheep: "M6 14c0-4 3-7 6-7s6 3 6 7c2 0 3 2 2 4H4c-1-2 0-4 2-4z",
    dog: "M4 14c1-4 4-7 8-8 1 2 2 4 2 6h2c2 0 3 2 2 4H5c-1-1-1-2-1-2z",
    cat: "M5 9l3-4 4 3 4-3 3 4v7c0 2-3 4-7 4s-7-2-7-4V9z",
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={map[type] || map.horse} />
    </svg>
  );
}
