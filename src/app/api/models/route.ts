import { NextResponse } from 'next/server';
import { getAvailableModels } from '@/lib/models';

export async function GET() {
  const models = getAvailableModels();
  return NextResponse.json(models.map(m => ({ id: m.id, name: m.name })));
}
