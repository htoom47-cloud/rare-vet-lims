import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { m } from 'framer-motion';
import { FlaskConical, DollarSign, Activity, TrendingUp, Receipt, BarChart3, CreditCard, Tags, Layers, Bell, FileCheck, Send, AlertTriangle, Printer } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import toast from 'react-hot-toast';
import StatCard from '../components/ui/StatCard';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { staggerContainer, staggerItem } from '../components/motion/AnimatedPage';
import { dashboardAPI, notificationsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#4A3728', '#C5A059', '#A88644', '#D9C48A', '#3D2E22'];

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, hasPermission, hasAnyPermission } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifStats, setNotifStats] = useState(null);

  useEffect(() => {
    dashboardAPI.stats()
      .then(({ data }) => setStats(data.data))
      .catch(() => toast.error(t('common.error')))
      .finally(() => setLoading(false));
    notificationsAPI.stats()
      .then(({ data }) => setNotifStats(data.data))
      .catch(() => {});
  }, [t]);

  if (loading) return <DashboardSkeleton />;

  const isAdmin = stats?.mode === 'admin' || hasPermission('dashboard.admin');

  const topTestsData = (stats?.top_tests || []).map((row) => ({ ...row, count: Number(row.count) || 0 }));
  const revenueChartData = (stats?.monthly_revenue || []).map((row) => ({
    ...row,
    revenue: Number(row.revenue) || 0,
    label: row.date ? new Date(row.date).toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short' }) : '',
  }));

  const statusChartData = (stats?.status_breakdown || []).map((row) => ({
    ...row,
    count: Number(row.count) || 0,
    label: t(`samples.statuses.${row.status}`, { defaultValue: row.status }),
  }));

  const formatMoney = (amount) => {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString(i18n.language === 'ar' ? 'ar-SA' : 'en-SA', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title={t('nav.dashboard')} subtitle={t('dashboard.labOverview')} />
        <m.div
          className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <m.div variants={staggerItem}>
            <StatCard title={t('dashboard.queue')} value={stats?.queue_count || 0} icon={FlaskConical} color="blue" />
          </m.div>
          <m.div variants={staggerItem}>
            <StatCard title={t('dashboard.running')} value={stats?.running_count || 0} icon={Activity} color="primary" />
          </m.div>
        </m.div>

        {hasAnyPermission('price_list.view', 'tests.view') && (
          <m.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-primary-200/80 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/price-list')}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
                  <Tags size={20} />
                </div>
                <div>
                  <p className="font-semibold">{t('nav.priceList')}</p>
                  <p className="text-sm text-muted-foreground">{t('priceList.subtitle')}</p>
                </div>
              </CardContent>
            </Card>
            {hasPermission('billing.view') && (
              <>
            <Card className="border-primary-200/80 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/accounting')}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shrink-0">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <p className="font-semibold">{t('accounting.titleFull')}</p>
                  <p className="text-sm text-muted-foreground">{t('accounting.subtitle')}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-primary-200/80 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/billing')}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-600 text-white flex items-center justify-center shrink-0">
                  <CreditCard size={20} />
                </div>
                <div>
                  <p className="font-semibold">{t('nav.billing')}</p>
                  <p className="text-sm text-muted-foreground">{t('billing.title')}</p>
                </div>
              </CardContent>
            </Card>
              </>
            )}
          </m.div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('nav.dashboard')}
        subtitle={t('dashboard.adminOverview')}
        badge={t('dashboard.today')}
      />

      <m.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <m.div variants={staggerItem}>
          <StatCard
            title={t('dashboard.dailySamples')}
            value={stats?.daily_samples || 0}
            subtitle={t('dashboard.monthSamples', { count: stats?.month_samples || 0 })}
            icon={FlaskConical}
            color="primary"
          />
        </m.div>
        <m.div variants={staggerItem}>
          <StatCard
            title={t('dashboard.revenue')}
            value={`SAR ${formatMoney(stats?.daily_revenue)}`}
            subtitle={t('dashboard.monthRevenue', { amount: formatMoney(stats?.month_revenue) })}
            icon={DollarSign}
            color="green"
          />
        </m.div>
        <m.div variants={staggerItem}>
          <StatCard
            title={t('dashboard.pendingSamples')}
            value={stats?.pending_samples || 0}
            subtitle={stats?.rejected_samples > 0 ? `${t('dashboard.rejected')}: ${stats.rejected_samples}` : undefined}
            icon={Layers}
            color="orange"
          />
        </m.div>
        <m.div variants={staggerItem}>
          <StatCard
            title={t('dashboard.activeTests')}
            value={stats?.active_tests || 0}
            icon={TrendingUp}
            color="blue"
          />
        </m.div>
      </m.div>

      {stats?.operations && (
        <m.div
          className="mb-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.06 }}
        >
          <h2 className="text-lg font-semibold mb-3">{t('dashboard.opsTitle')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            <StatCard title={t('dashboard.awaitingInvoice')} value={stats.operations.awaiting_invoice || 0} icon={Receipt} color="orange" />
            <StatCard title={t('dashboard.awaitingBarcodePrint')} value={stats.operations.awaiting_barcode_print || 0} icon={Printer} color="blue" />
            <StatCard title={t('dashboard.inLab')} value={stats.operations.in_lab || 0} icon={FlaskConical} color="primary" />
            <StatCard title={t('dashboard.pendingApproval')} value={stats.operations.pending_approval || 0} icon={FileCheck} color="orange" />
            <StatCard
              title={`📨 ${t('dashboard.readyToSend')}`}
              value={stats.operations.ready_to_send || 0}
              subtitle={t('dashboard.readyToSendCustomers', { count: stats.operations.ready_to_send || 0 })}
              icon={Send}
              color="green"
            />
            <StatCard title={t('dashboard.failedMessages')} value={stats.operations.failed_messages || 0} icon={Bell} color="orange" />
            <StatCard title={t('dashboard.dataErrors')} value={stats.operations.data_errors || 0} icon={AlertTriangle} color="orange" />
          </div>
        </m.div>
      )}

      {hasAnyPermission('price_list.view', 'tests.view') && (
        <m.div
          className="mb-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.08 }}
        >
          <Card className="border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/20 dark:to-card cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/price-list')}>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
                  <Tags size={20} />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{t('nav.priceList')}</p>
                  <p className="text-sm text-muted-foreground">{t('priceList.subtitle')}</p>
                </div>
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); navigate('/price-list'); }} className="btn-primary shrink-0">
                {t('common.view')}
              </button>
            </CardContent>
          </Card>
        </m.div>
      )}

      {hasPermission('billing.view') && (
        <m.div
          className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
        >
          <Card className="border-primary-200/80 bg-gradient-to-br from-primary-50/80 to-white dark:from-primary-950/40 dark:to-card cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/accounting')}>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shrink-0">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{t('accounting.titleFull')}</p>
                  <p className="text-sm text-muted-foreground">{t('accounting.subtitle')}</p>
                </div>
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); navigate('/accounting'); }} className="btn-primary shrink-0">
                {t('accounting.openModule')}
              </button>
            </CardContent>
          </Card>
          <Card className="border-primary-200/80 bg-gradient-to-br from-primary-50/80 to-white dark:from-primary-950/40 dark:to-card">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shrink-0">
                  <Receipt size={20} />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{t('invoiceSettings.title')}</p>
                  <p className="text-sm text-muted-foreground">{t('invoiceSettings.dashboardHint')}</p>
                </div>
              </div>
              <button type="button" onClick={() => navigate('/invoice-settings')} className="btn-primary shrink-0">
                {t('invoiceSettings.open')}
              </button>
            </CardContent>
          </Card>
        </m.div>
      )}

      {notifStats && (
        <m.div
          className="mb-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.11 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell size={16} /> {t('notifications.todayStats')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                  <p className="text-gray-500">{t('notifications.sent')}</p>
                  <p className="font-bold text-green-600 text-xl">{notifStats.sent_today || 0}</p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                  <p className="text-gray-500">{t('notifications.failed')}</p>
                  <p className="font-bold text-red-600 text-xl">{notifStats.failed_today || 0}</p>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
                  <p className="text-gray-500">{t('notifications.dryRun')}</p>
                  <p className="font-bold text-yellow-600 text-xl">{notifStats.dry_run_today || 0}</p>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                  <p className="text-gray-500">{t('notifications.pending')}</p>
                  <p className="font-bold text-blue-600 text-xl">{notifStats.pending_today || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      <m.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.12 }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('dashboard.monthlyRevenue')}</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueChartData.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} stroke="#4A3728" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#A88644' }} />
                  <YAxis tick={{ fill: '#A88644' }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EDE0C8' }} />
                  <Line type="monotone" dataKey="revenue" stroke="#C5A059" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-16">{t('dashboard.noChartData')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('dashboard.sampleStatus')}</CardTitle>
          </CardHeader>
          <CardContent>
            {statusChartData.some((r) => r.count > 0) ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={statusChartData} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                    {statusChartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EDE0C8' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-16">{t('dashboard.noChartData')}</p>
            )}
          </CardContent>
        </Card>
      </m.div>

      <m.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('dashboard.topTests')}</CardTitle>
          </CardHeader>
          <CardContent>
            {topTestsData.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topTestsData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} stroke="#4A3728" />
                  <XAxis dataKey={i18n.language === 'ar' ? 'name_ar' : 'name'} tick={{ fontSize: 11, fill: '#A88644' }} />
                  <YAxis tick={{ fill: '#A88644' }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EDE0C8' }} />
                  <Bar dataKey="count" fill="#4A3728" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-16">{t('dashboard.noChartData')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('dashboard.techPerformance')}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.technician_performance?.length > 0 ? (
              <div className="space-y-3 py-2">
                {stats.technician_performance.map((tech, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-foreground truncate">{tech.full_name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <m.div
                          className="h-full bg-primary-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, tech.completed_tests * 10)}%` }}
                          transition={{ duration: 0.5, delay: 0.3 + i * 0.05 }}
                        />
                      </div>
                      <span className="text-sm font-semibold w-8 text-primary tabular-nums">{tech.completed_tests}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-16">{t('dashboard.noChartData')}</p>
            )}
          </CardContent>
        </Card>
      </m.div>
    </div>
  );
}
