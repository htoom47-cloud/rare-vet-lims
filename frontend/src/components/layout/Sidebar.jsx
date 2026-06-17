import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, PawPrint, FlaskConical, TestTube, FileText, Activity, Stethoscope,
  CreditCard, Package, Shield, UserCog, ScrollText, Settings, PanelLeftClose, PanelLeft, Route, Cpu,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isReception, userRole } from '../../utils/roles';
import AppLogo from '../ui/AppLogo';

const receptionNavSections = [
  {
    section: 'nav.sections.reception',
    items: [
      { path: '/', icon: LayoutDashboard, label: 'reception.home', permission: 'dashboard.view' },
      { path: '/workflow', icon: Route, label: 'reception.newCase', permission: 'samples.create' },
      { path: '/samples', icon: FlaskConical, label: 'reception.viewSamples', permission: 'samples.view' },
      { path: '/billing', icon: CreditCard, label: 'reception.billing', permission: 'billing.view' },
    ],
  },
];

const navSections = [
  {
    section: 'nav.sections.main',
    items: [
      { path: '/', icon: LayoutDashboard, label: 'nav.dashboard', permission: 'dashboard.view' },
      { path: '/customers', icon: Users, label: 'nav.customers', permission: 'customers.view' },
      { path: '/animals', icon: PawPrint, label: 'nav.animals', permission: 'animals.view' },
      { path: '/workflow', icon: Route, label: 'nav.workflow', permission: 'samples.create' },
      { path: '/samples', icon: FlaskConical, label: 'nav.samples', permission: 'samples.view' },
      { path: '/billing', icon: CreditCard, label: 'nav.billing', permission: 'billing.view' },
      { path: '/reports', icon: FileText, label: 'nav.reports', permission: 'reports.view' },
    ],
  },
  {
    section: 'nav.sections.lab',
    items: [
      { path: '/workbench', icon: Activity, label: 'nav.workbench', permission: 'results.enter' },
      { path: '/vet-review', icon: Stethoscope, label: 'nav.vetReview', permission: 'results.validate' },
      { path: '/tests', icon: TestTube, label: 'nav.tests', permission: 'tests.view' },
      { path: '/inventory', icon: Package, label: 'nav.inventory', permission: 'inventory.view' },
      { path: '/quality', icon: Shield, label: 'nav.quality', permission: 'quality.view' },
      { path: '/devices', icon: Cpu, label: 'nav.devices', permission: 'devices.view' },
    ],
  },
  {
    section: 'nav.sections.admin',
    items: [
      { path: '/users', icon: UserCog, label: 'nav.users', permission: 'users.view', adminOnly: true },
      { path: '/audit', icon: ScrollText, label: 'nav.audit', permission: 'audit.view' },
      { path: '/settings', icon: Settings, label: 'nav.settings', permission: 'settings.view' },
    ],
  },
];

export default function Sidebar({ collapsed, mobileOpen, onCollapse, onCloseMobile }) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();

  return (
    <aside
      className={`fixed top-0 start-0 z-40 h-screen bg-white dark:bg-primary-900 border-e border-primary-200 dark:border-primary-700 transition-all duration-300
        ${collapsed ? 'w-[4.5rem]' : 'w-72'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0`}
    >
      <div className={`flex items-center border-b border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-900 ${collapsed ? 'justify-center p-3' : 'gap-3 p-4'}`}>
        <AppLogo size="sm" className="shrink-0" />
        {!collapsed && (
          <div className="overflow-hidden flex-1 min-w-0">
            <h1 className="font-bold text-sm truncate text-primary-800 dark:text-primary-100">{t('app.name')}</h1>
            <p className="text-xs text-primary-400 truncate">{t('app.subtitle')}</p>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={onCollapse}
            className="hidden lg:flex p-1.5 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-800 text-primary-500"
            title="طي القائمة"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={onCollapse}
          className="hidden lg:flex w-full justify-center py-2 text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800"
          title="توسيع القائمة"
        >
          <PanelLeft size={18} />
        </button>
      )}

      <nav className="p-2 space-y-4 overflow-y-auto" style={{ height: 'calc(100vh - 80px)' }}>
        {(isReception(user) ? receptionNavSections : navSections).map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (item.adminOnly && userRole(user) !== 'admin') return false;
            return hasPermission(item.permission);
          });
          if (!visibleItems.length) return null;

          return (
            <div key={group.section}>
              {!collapsed && (
                <p className="px-3 mb-1.5 text-[11px] font-semibold text-primary-400 dark:text-primary-500">
                  {t(group.section)}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    title={collapsed ? t(item.label) : undefined}
                    onClick={onCloseMobile}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                        collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                      } ${
                        isActive
                          ? 'bg-primary-100 dark:bg-primary-800 text-primary-800 dark:text-primary-300 border-s-2 border-primary-400'
                          : 'text-primary-700 dark:text-primary-300 hover:bg-primary-100/60 dark:hover:bg-primary-800/60'
                      }`
                    }
                  >
                    <item.icon size={20} className="shrink-0" />
                    {!collapsed && (
                      <span className="truncate leading-snug">{t(item.label)}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
