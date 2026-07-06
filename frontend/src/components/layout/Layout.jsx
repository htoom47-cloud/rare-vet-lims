import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import AnimatedOutlet from '../motion/AnimatedOutlet';
import { bootstrapSpeciesLabels } from '../../utils/speciesLabels';

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    bootstrapSpeciesLabels();
  }, []);

  return (
    <div className="min-h-screen bg-background bg-app-mesh">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden backdrop-blur-[2px]"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCollapse={() => setCollapsed(!collapsed)}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className={`transition-all duration-300 min-w-0 overflow-x-hidden ${collapsed ? 'lg:ms-[4.5rem]' : 'lg:ms-72'}`}>
        <Header
          onMenuClick={() => setMobileOpen(!mobileOpen)}
          sidebarCollapsed={collapsed}
        />
        <main className="p-3 sm:p-4 md:p-6 max-w-[1600px]">
          <AnimatedOutlet />
        </main>
      </div>
    </div>
  );
}
