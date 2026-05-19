import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isJwt } from './auth-role.util';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('ds_token');
  const user  = localStorage.getItem('ds_current_user');

  if (isJwt(token) && user) return true;

  // No valid JWT session — clear stale data and redirect to login
  localStorage.removeItem('ds_token');
  localStorage.removeItem('ds_current_user');
  localStorage.removeItem('ds_user_id');
  localStorage.removeItem('ds_is_admin');
  router.navigate(['/login']);
  return false;
};
