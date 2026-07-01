import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, PawPrint, FlaskConical, TestTube, FileText, Activity, Stethoscope,
  CreditCard, Package, Shield, UserCog, ScrollText, Settings, PanelLeftClose, PanelLeft, Route, Cpu, Bug, Camera, BarChart3, Receipt, Tags,
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
      { path: '/price-list', icon: Tags, label: 'nav.priceList', permissions: ['price_list.view', 'tests.view'] },
      { path: '/billing', icon: CreditCard, label: 'reception.billing', permission: 'billing.view' },
      { path: '/accounting', icon: BarChart3, label: 'nav.accounting', permission: 'billing.view' },
      { path: '/invoice-settings', icon: Receipt, label: 'nav.invoiceSettings', permission: 'billing.view' },
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
      { path: '/price-list', icon: Tags, label: 'nav.priceList', permissions: ['price_list.view', 'tests.view'] },
      { path: '/billing', icon: CreditCard, label: 'nav.billing', permission: 'billing.view' },
      { path: '/accounting', icon: BarChart3, label: 'nav.accounting', permission: 'billing.view' },
      { path: '/invoice-settings', icon: Receipt, label: 'nav.invoiceSettings', permission: 'billing.view' },
      { path: '/reports', icon: FileText, label: 'nav.reports', permission: 'reports.view' },
    ],
  },
  {
    section: 'nav.sections.lab',
    items: [
      { path: '/workbench', icon: Activity, label: 'nav.workbench', permission: 'results.enter' },
      { path: '/parasitology/upload', icon: Camera, label: 'nav.parasitologyUpload', permission: 'results.upload_images' },
      { path: '/parasitology', icon: Bug, label: 'nav.parasitology', permissions: ['results.enter', 'results.validate'] },
      { path: '/vet-review', icon: Stethoscope, label: 'nav.vetReview', permissions: ['results.validate', 'results.edit', 'results.unvalidate', 'results.enter'] },
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
  const { user, hasPermission, hasAnyPermission } = useAuth();
  const roleKey = user?.role ? `permissions.roles.${user.role}` : '';
  const roleLabel = roleKey ? t(roleKey, { defaultValue: user?.role }) : '';

  return (
    <aside
      className={`fixed top-0 start-0 z-40 h-screen bg-card border-e border-border/80 transition-transform duration-300 shadow-lg lg:shadow-none
        ${collapsed ? 'w-[4.5rem]' : 'w-72'}
        ${mobileOpen ? 'translate-x-0' : 'max-lg:-translate-x-full max-lg:rtl:translate-x-full'}
        lg:translate-x-0`}
    >
      <div className={`flex items-center border-b border-primary-200/80 dark:border-primary-700 bg-gradient-to-b from-primary-50 to-white dark:from-primary-900 dark:to-primary-900 ${collapsed ? 'justify-center p-3' : 'gap-3 p-4'}`}>
        <AppLogo size="sm" className="shrink-0" />
        {!collapsed && (
          <div className="overflow-hidden flex-1 min-w-0">
            <h1 className="font-bold text-sm truncate text-primary-800 dark:text-primary-100">{t('app.name')}</h1>
            <p className="text-[11px] text-primary-400 truncate leading-tight mt-0.5">{t('app.subtitle')}</p>
          </div>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onCollapse}
            className="hidden lg:flex icon-btn text-primary-400"
            title={t('nav.collapseSidebar')}
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={onCollapse}
          className="hidden lg:flex w-full justify-center py-2.5 text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-800 transition-colors"
          title={t('nav.expandSidebar')}
        >
          <PanelLeft size={18} />
        </button>
      )}

      <nav className="p-2 space-y-4 overflow-y-auto" style={{ height: collapsed ? 'calc(100vh - 120px)' : 'calc(100vh - 140px)' }}>
        {(isReception(user) ? receptionNavSections : navSections).map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (item.adminOnly && userRole(user) !== 'admin') return false;
            if (item.permissions?.length) return hasAnyPermission(...item.permissions);
            return hasPermission(item.permission);
          });
          if (!visibleItems.length) return null;

          return (
            <div key={group.section}>
              {!collapsed && (
                <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-primary-400/90">
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
                      `flex items-center gap-3 rounded-xl text-sm font-medium transition-all ${
                        collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                      } ${
                        isActive
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800/70'
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

      {!collapsed && user && (
        <div className="absolute bottom-0 start-0 end-0 p-3 border-t border-primary-200/80 dark:border-primary-700 bg-primary-50/80 dark:bg-primary-900/80 backdrop-blur-sm">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-8 h-8 rounded-full bg-primary-200 dark:bg-primary-700 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-200">
              {user.full_name?.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate text-primary-800 dark:text-primary-100">{user.full_name}</p>
              <p className="text-[10px] text-primary-400 truncate">{roleLabel}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
