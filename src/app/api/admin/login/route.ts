import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// POST /api/admin/login
// Body: { username: string, password: string }
export async function POST(request: NextRequest) {
  const BodySchema = z.object({ username: z.string(), password: z.string() });
  const json = await request.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const { username, password } = parsed.data;

  const envUser = process.env.ADMIN_BASIC_USER;
  const envPass = process.env.ADMIN_BASIC_PASSWORD;
  const secret = process.env.ADMIN_SECRET;

  if (!envUser || !envPass || !secret) {
    return NextResponse.json({ error: 'Admin credentials not configured' }, { status: 500 });
  }

  if (username !== envUser || password !== envPass) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // Create a signed session token valid for 8 hours
  const now = Date.now();
  const exp = now + 8 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64');
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString('base64');
  const toSign = `${payload}.${nonce}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
  const signature = Buffer.from(new Uint8Array(sigBuf)).toString('base64');
  const token = `${payload}.${nonce}.${signature}`;

  const res = NextResponse.json({ success: true });
  res.cookies.set('admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor((exp - now) / 1000),
  });
  return res;
}
