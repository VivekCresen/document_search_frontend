import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/** JWT tokens always start with "ey" (base64-encoded {"alg":...}) */
function isJwt(token: string | null): boolean {
  return !!token && token.startsWith('ey') && token.split('.').length === 3;
}

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('ds_token');
  const user  = localStorage.getItem('ds_current_user');

  if (isJwt(token) && user) return true;

  // No valid JWT session — clear stale data and redirect to login
  localStorage.removeItem('ds_token');
  localStorage.removeItem('ds_current_user');
  localStorage.removeItem('ds_user_id');
  router.navigate(['/login']);
  return false;
};
