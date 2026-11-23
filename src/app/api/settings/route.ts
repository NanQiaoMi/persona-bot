import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';

export async function GET() {
  try {
    const settings = await storageRepo.getSettings();
    const hasEnvLlmKey = Boolean(
      process.env.LLM_API_KEY && process.env.LLM_API_KEY !== 'your-api-key'
    );
    return NextResponse.json({
      success: true,
      settings: {
        ...settings,
        hasConfiguredKey: Boolean(settings.llmApiKey) || hasEnvLlmKey,
      },
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const updated = await storageRepo.saveSettings(body);
    const hasEnvLlmKey = Boolean(
      process.env.LLM_API_KEY && process.env.LLM_API_KEY !== 'your-api-key'
    );
    return NextResponse.json({
      success: true,
      settings: {
        ...updated,
        hasConfiguredKey: Boolean(updated.llmApiKey) || hasEnvLlmKey,
      },
    });
  } catch (error) {
    console.error('Save settings error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
