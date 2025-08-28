import { NextResponse } from 'next/server';

// GET /api/admin/status - Check if user is logged in as admin
export async function GET() {
  // If this endpoint is reached, middleware has already validated the admin session
  // So the user is authenticated as an admin
  return NextResponse.json({ isAdmin: true }, { status: 200 });
}
