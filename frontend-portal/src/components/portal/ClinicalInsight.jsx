import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export default function ClinicalInsight({ interpretation, isAr }) {
  const { t } = useTranslation();
  const text = isAr ? interpretation?.ar : interpretation?.en;
  if (!text) return null;

  return (
    <Card className="portal-insight-card border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          {t('portal.clinicalInterpretation')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-foreground/90">{text}</p>
      </CardContent>
    </Card>
  );
}
