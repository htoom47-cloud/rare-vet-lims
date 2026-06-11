import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordInput({
  value,
  onChange,
  className = 'input-field pe-11',
  required = false,
  autoComplete = 'current-password',
  placeholder,
}) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        className={className}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 end-0 flex items-center px-3 text-primary-500 hover:text-primary-700 dark:hover:text-primary-300"
        aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
        tabIndex={-1}
      >
        {show ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
    </div>
  );
}
