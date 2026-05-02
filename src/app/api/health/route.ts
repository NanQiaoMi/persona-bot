import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';

export async function GET() {
  const startTime = Date.now();

  try {
    await connectDB();
    const dbLatency = Date.now() - startTime;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      database: {
        status: 'connected',
        latency: `${dbLatency}ms`
      },
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    const dbLatency = Date.now() - startTime;

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: {
          status: 'disconnected',
          latency: `${dbLatency}ms`,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        environment: process.env.NODE_ENV || 'development'
      },
      { status: 503 }
    );
  }
}
