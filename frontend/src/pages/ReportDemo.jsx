import LaboratoryReport from './LaboratoryReport';

/** Public sample report — no login required */
export default function ReportDemo() {
  return (
    <div className="min-h-screen bg-background bg-app-mesh p-3 sm:p-6">
      <LaboratoryReport demoMode />
    </div>
  );
}
