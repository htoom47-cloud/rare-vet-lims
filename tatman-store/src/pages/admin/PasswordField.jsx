import { useState } from "react";

function EyeIcon({ off = false }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {off ? (
        <>
          <path d="M3 3l18 18" strokeLinecap="round" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" strokeLinecap="round" />
          <path d="M9.9 5.2A10.5 10.5 0 0 1 12 5c5 0 9.3 3.1 11 7.5a11.8 11.8 0 0 1-4.2 5.1" strokeLinecap="round" />
          <path d="M6.6 6.6A11.7 11.7 0 0 0 1 12.5a11.8 11.8 0 0 0 6.3 5.7 10.6 10.6 0 0 0 8.2-.3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M2 12.5C3.7 8.1 7.6 5 12 5s8.3 3.1 10 7.5c-1.7 4.4-5.6 7.5-10 7.5S3.7 16.9 2 12.5Z" />
          <circle cx="12" cy="12.5" r="2.6" />
        </>
      )}
    </svg>
  );
}

export function PasswordField({ className = "input", ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative" dir="ltr">
      <input {...props} className={`${className} pe-11`} type={show ? "text" : "password"} />
      <button
        type="button"
        className="absolute inset-y-0 end-1.5 my-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-navy hover:bg-mist"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        tabIndex={-1}
      >
        <EyeIcon off={show} />
      </button>
    </div>
  );
}
