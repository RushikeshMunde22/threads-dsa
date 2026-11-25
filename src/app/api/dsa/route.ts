import { NextResponse } from 'next/server';
import { runDsaOperation, type SupportedDsaOperation } from '@/lib/dsa';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON request payload' },
        { status: 400 }
      );
    }

    const operation = body.operation as SupportedDsaOperation;
    const payload = body.payload ?? {};

    if (!operation || typeof operation !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Missing required field: operation' },
        { status: 400 }
      );
    }

    const result = runDsaOperation(operation, payload);

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('API /api/dsa unhandled error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Internal server error in DSA engine',
      },
      { status: 500 }
    );
  }
}
