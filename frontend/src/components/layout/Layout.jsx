import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-primary-900 bg-app-mesh">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCollapse={() => setCollapsed(!collapsed)}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className={`transition-all min-w-0 overflow-x-hidden ${collapsed ? 'lg:ms-[4.5rem]' : 'lg:ms-72'}`}>
        <Header
          onMenuClick={() => setMobileOpen(!mobileOpen)}
          sidebarCollapsed={collapsed}
        />
        <main className="p-3 sm:p-4 md:p-6 max-w-[1600px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
