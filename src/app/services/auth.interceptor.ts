import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router   = inject(Router);
  const rawToken = localStorage.getItem('ds_token');
  const identity = localStorage.getItem('ds_current_user') ?? '';

  // Only attach the token if it looks like a real JWT (ey...) to avoid sending stale non-JWT tokens
  const isValidJwt = !!rawToken && rawToken.startsWith('ey') && rawToken.split('.').length === 3;

  const headers: Record<string, string> = {};
  if (isValidJwt)  headers['Authorization'] = `Bearer ${rawToken}`;
  if (identity)    headers['X-Username']    = identity;
  if (identity.includes('@')) headers['X-User-Email'] = identity;

  if (Object.keys(headers).length > 0) {
    req = req.clone({ setHeaders: headers });
  }

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // Only auto-logout on 401 (Unauthorized = session expired / invalid token).
      // 403 (Forbidden) means authenticated but no permission — do NOT log out.
      // Skip the auth endpoints themselves to avoid redirect loops.
      if (err.status === 401 && !req.url.includes('/api/auth/')) {
        localStorage.removeItem('ds_token');
        localStorage.removeItem('ds_current_user');
        localStorage.removeItem('ds_user_id');
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
