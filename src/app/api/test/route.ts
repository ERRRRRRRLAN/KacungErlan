import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.OPENROUTER_BASE_URL;

  return NextResponse.json({
    apiKeyConfigured: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 12) + '...' : null,
    baseUrl: baseUrl,
    environment: process.env.NODE_ENV,
  });
}
