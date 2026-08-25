import { useState } from "react";

export function PasswordField({ className = "input", ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative" dir="ltr">
      <input {...props} className={`${className} pe-20`} type={show ? "text" : "password"} />
      <button
        type="button"
        className="absolute inset-y-0 end-1.5 my-auto h-8 rounded-full px-2.5 text-xs font-bold text-navy hover:bg-mist"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        tabIndex={-1}
      >
        {show ? "إخفاء" : "إظهار"}
      </button>
    </div>
  );
}
