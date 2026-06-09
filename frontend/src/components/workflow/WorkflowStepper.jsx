import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { getWorkflowProgress } from '../../utils/workflow';

export default function WorkflowStepper({ context, compact = false }) {
  const { t } = useTranslation();
  const { steps, percent } = getWorkflowProgress(context);

  if (compact) {
    return (
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{t('workflow.title')}</span>
          <span>{percent}%</span>
        </div>
        <div className="h-2 bg-primary-200 dark:bg-primary-700 rounded-full overflow-hidden">
          <div className="h-full bg-primary-400 transition-all" style={{ width: `${percent}%` }} />
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {steps.map((step) => (
            <span
              key={step.key}
              title={t(step.labelKey)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                step.done
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : step.current
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700'
              }`}
            >
              {step.number}. {t(step.labelKey)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4 mb-6 overflow-x-auto">
      <h3 className="font-semibold mb-4">{t('workflow.title')}</h3>
      <div className="flex items-start min-w-[720px] gap-1">
        {steps.map((step, idx) => (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center text-center flex-1 min-w-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  step.done
                    ? 'bg-green-600 text-white'
                    : step.current
                      ? 'bg-primary-600 text-white ring-4 ring-primary-200 dark:ring-primary-900'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                }`}
              >
                {step.done ? <Check size={16} /> : step.number}
              </div>
              <p className={`text-[11px] mt-2 leading-tight ${step.current ? 'font-semibold text-primary-700 dark:text-primary-400' : 'text-gray-500'}`}>
                {t(step.labelKey)}
              </p>
            </div>
            {idx < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mt-4 ${step.done ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
