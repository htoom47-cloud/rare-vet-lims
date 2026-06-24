import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceArea,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

const parseReference = (ref) => {
  if (!ref || ref === '—') return null;
  const m = String(ref).match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
  if (m) return { low: parseFloat(m[1]), high: parseFloat(m[2]) };
  return null;
};

const formatDate = (iso, isAr) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
    day: '2-digit', month: 'short',
  });
};

export default function TrendChart({ data, meta, isAr, title, height = 280 }) {
  const { t } = useTranslation();
  const points = (data?.points || []).filter((p) => p.numericValue != null);
  const refRange = parseReference(meta?.reference);

  if (!points.length) {
    return (
      <Card className="portal-chart-card">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t('portal.noTrendData')}
        </CardContent>
      </Card>
    );
  }

  const chartData = points.map((p) => ({
    ...p,
    label: formatDate(p.date, isAr),
    y: p.numericValue,
  }));

  const name = isAr ? (meta?.nameAr || meta?.nameEn) : (meta?.nameEn || meta?.nameAr);

  return (
    <Card className="portal-chart-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex flex-wrap items-baseline gap-2">
          <span>{title || t('portal.trendChart')}</span>
          {name && (
            <span className="text-sm font-normal text-muted-foreground">
              {name}{meta?.unit ? ` (${meta.unit})` : ''}
            </span>
          )}
        </CardTitle>
        {meta?.reference && (
          <p className="text-xs text-muted-foreground">{t('portal.reference')}: {meta.reference}</p>
        )}
      </CardHeader>
      <CardContent className="pb-4">
        <div style={{ height }} dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} width={42} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--card))',
                  fontSize: 12,
                }}
                formatter={(value) => [value, meta?.unit || '']}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload;
                  return row?.reportNumber || row?.label || '';
                }}
              />
              {refRange && (
                <ReferenceArea
                  y1={refRange.low}
                  y2={refRange.high}
                  fill="hsl(142 76% 36% / 0.08)"
                  strokeOpacity={0}
                />
              )}
              <Line
                type="monotone"
                dataKey="y"
                stroke="hsl(38 45% 45%)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: 'hsl(38 45% 45%)', strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
