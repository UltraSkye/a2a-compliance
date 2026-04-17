import { runFullChecks } from '@a2a-compliance/core';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.url !== 'string' || body.url.length === 0) {
    return NextResponse.json({ error: 'missing "url" in request body' }, { status: 400 });
  }
  try {
    // Reject obviously malformed input before spawning any HTTP.
    new URL(body.url);
  } catch {
    return NextResponse.json({ error: 'not a valid URL' }, { status: 400 });
  }

  try {
    const report = await runFullChecks(body.url);
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
