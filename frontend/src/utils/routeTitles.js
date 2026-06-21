/** Map pathname → i18n key for header title */
export const routeTitleKey = (pathname, isReception) => {
  const map = {
    '/': isReception ? 'reception.home' : 'nav.dashboard',
    '/customers': 'nav.customers',
    '/animals': 'nav.animals',
    '/samples': isReception ? 'reception.viewSamples' : 'nav.samples',
    '/workflow': isReception ? 'reception.newCase' : 'nav.workflow',
    '/billing': isReception ? 'reception.billing' : 'nav.billing',
    '/reports': 'nav.reports',
    '/workbench': 'nav.workbench',
    '/vet-review': 'nav.vetReview',
    '/tests': 'nav.tests',
    '/inventory': 'nav.inventory',
    '/quality': 'nav.quality',
    '/devices': 'nav.devices',
    '/users': 'nav.users',
    '/audit': 'nav.audit',
    '/settings': 'nav.settings',
  };
  return map[pathname] || 'app.subtitle';
};
