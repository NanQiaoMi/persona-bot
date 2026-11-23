import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';

export async function GET() {
  const startTime = Date.now();

  try {
    const personas = await storageRepo.listPersonas();
    const latency = Date.now() - startTime;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      uptime: process.uptime(),
      storage: {
        mode: process.env.MONGODB_URI ? 'hybrid-local-mongo' : 'local-unified',
        personaCount: personas.length,
        latency: `${latency}ms`,
      },
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    const latency = Date.now() - startTime;
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        storage: {
          status: 'error',
          latency: `${latency}ms`,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        environment: process.env.NODE_ENV || 'development',
      },
      { status: 503 }
    );
  }
}
