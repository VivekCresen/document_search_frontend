interface JwtPayload {
  roles?: string[];
  isAdmin?: boolean;
  exp?: number;
}

export function decodeJwtPayload(token: string | null): JwtPayload | null {
  if (!token || token.split('.').length !== 3) return null;

  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

export function tokenHasAdminRole(token: string | null): boolean {
  const payload = decodeJwtPayload(token);
  return payload?.roles?.includes('ROLE_ADMIN') || payload?.isAdmin === true;
}

export function isJwt(token: string | null): boolean {
  return !!token && token.startsWith('ey') && token.split('.').length === 3;
}
