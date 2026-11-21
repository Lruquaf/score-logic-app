import type { NextRequest } from 'next/server'
export const runtime = 'nodejs'
import { nativeAuthAction } from '@/lib/services/mobile-api'
export async function POST(request: NextRequest, context: {params: Promise<{action:string}>}) { return nativeAuthAction(request,(await context.params).action) }
