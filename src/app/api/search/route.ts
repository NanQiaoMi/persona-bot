import { NextResponse } from 'next/server';
import { performDeepSearch } from '@/lib/grok/deep-search';
import { storageRepo } from '@/lib/storage/repository';

export async function POST(request: Request) {
  try {
    const { query, provider, tavilyApiKey, serperApiKey, searchGatewayUrl, llmBaseUrl, llmApiKey } =
      await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const savedSettings = await storageRepo.getSettings();
    const result = await performDeepSearch(query, {
      ...savedSettings,
      ...(provider ? { searchProvider: provider } : {}),
      ...(typeof searchGatewayUrl === 'string' ? { searchGatewayUrl } : {}),
      ...(llmBaseUrl ? { llmBaseUrl } : {}),
      ...(llmApiKey ? { llmApiKey } : {}),
      ...(tavilyApiKey ? { tavilyApiKey } : {}),
      ...(serperApiKey ? { serperApiKey } : {}),
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Search API Error:', error);
    return NextResponse.json({ error: 'DeepSearch failed' }, { status: 500 });
  }
}
