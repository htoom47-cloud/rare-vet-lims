import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, DollarSign, AlertTriangle, Activity, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import StatCard from '../components/ui/StatCard';
import { dashboardAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#4A3728', '#C5A059', '#A88644', '#D9C48A', '#3D2E22'];

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAPI.stats().then(({ data }) => setStats(data.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-20">{t('common.loading')}</div>;

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  if (!isAdmin) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">{t('nav.dashboard')}</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title={t('dashboard.queue')} value={stats?.queue_count || 0} icon={FlaskConical} color="blue" />
          <StatCard title={t('dashboard.running')} value={stats?.running_count || 0} icon={Activity} color="primary" />
          <StatCard title={t('dashboard.critical')} value={stats?.critical_alerts || 0} icon={AlertTriangle} color="red" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t('nav.dashboard')}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title={t('dashboard.dailySamples')} value={stats?.daily_samples || 0} icon={FlaskConical} color="primary" />
        <StatCard title={t('dashboard.revenue')} value={`SAR ${(stats?.daily_revenue || 0).toLocaleString()}`} icon={DollarSign} color="green" />
        <StatCard title={t('dashboard.rejected')} value={stats?.rejected_samples || 0} icon={AlertTriangle} color="red" />
        <StatCard title="Active Tests" value={stats?.top_tests?.length || 0} icon={TrendingUp} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold mb-4">{t('dashboard.topTests')}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats?.top_tests || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#4A3728" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Sample Status</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={stats?.status_breakdown || []} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} label>
                {(stats?.status_breakdown || []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {stats?.technician_performance?.length > 0 && (
        <div className="card mt-6">
          <h3 className="font-semibold mb-4">Technician Performance (7 days)</h3>
          <div className="space-y-3">
            {stats.technician_performance.map((tech, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm">{tech.full_name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-600 rounded-full" style={{ width: `${Math.min(100, tech.completed_tests * 10)}%` }} />
                  </div>
                  <span className="text-sm font-medium w-8">{tech.completed_tests}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
