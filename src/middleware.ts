import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Cookie session protection for /admin and /api/admin routes
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  console.log(pathname);

  // Bypass: login page and auth APIs
  const isLoginPage = pathname === '/admin/login' || pathname === '/admin/login/';
  if (isLoginPage) return NextResponse.next();
  if (pathname.startsWith('/api/admin/login') || pathname.startsWith('/api/admin/logout')) {
    return NextResponse.next();
  }

  // Detect protected segments while excluding login page
  const isAdminPage = pathname.startsWith('/admin') && !isLoginPage;
  const isAdminApi = pathname.startsWith('/api/admin');
  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return new NextResponse('Admin secret not configured', { status: 500 });
  }

  const cookie = request.cookies.get('admin_session')?.value;
  const valid = cookie ? await verifySession(cookie, secret) : false;

  if (valid) {
    return NextResponse.next();
  }

  // Unauthenticated
  if (isAdminApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = '/admin/login';
  url.searchParams.set('redirect', pathname);
  return NextResponse.redirect(url);
}

// Verify HMAC-SHA256 signature using Web Crypto (Edge runtime)
async function verifySession(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [b64Payload, b64Sig] = [parts[0] + '.' + parts[1], parts[2]];
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const payloadBytes = enc.encode(b64Payload);
    const sigBytes = Uint8Array.from(atob(b64Sig), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, payloadBytes);
    if (!ok) return false;

    const payloadJson = JSON.parse(atob(parts[0]));
    const exp: number = payloadJson.exp;
    if (!exp || Date.now() > exp) return false;
    return true;
  } catch {
    return false;
  }
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
