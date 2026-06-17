export const userRole = (user) => user?.role || user?.role_name || '';
export const isReception = (user) => userRole(user) === 'reception';
