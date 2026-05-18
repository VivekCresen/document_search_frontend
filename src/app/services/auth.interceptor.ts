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
  if (isValidJwt) {
    headers['Authorization'] = `Bearer ${rawToken}`;
  } else if (!req.url.includes('/api/auth/')) {
    // Warn in dev when a protected request goes out with no token — helps catch missing login
    console.warn(`[authInterceptor] No JWT token found for request: ${req.method} ${req.url}`);
  }
  if (identity)               headers['X-Username']    = identity;
  if (identity.includes('@')) headers['X-User-Email'] = identity;

  if (Object.keys(headers).length > 0) {
    req = req.clone({ setHeaders: headers });
  }

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // 401 Unauthorized = no token / expired token → redirect to login and clear storage.
      // 403 Forbidden    = authenticated but lacks permission → surface the error, don't log out.
      // Skip /api/auth/ endpoints to avoid redirect loops on login/register failures.
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
