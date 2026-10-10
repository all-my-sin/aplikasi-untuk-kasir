import type { RoleValue } from '@pos/shared';

/** Landing page after login for each role. */
export const homeFor = (role: RoleValue) => (role === 'ADMIN' ? '/dashboard' : '/pos');
