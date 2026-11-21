import type { NextRequest } from 'next/server'
export const runtime = 'nodejs'
import { nativePuzzleCommand } from '@/lib/services/mobile-api'
export async function POST(request: NextRequest, context: {params: Promise<{id:string}>}) { return nativePuzzleCommand(request,(await context.params).id) }
