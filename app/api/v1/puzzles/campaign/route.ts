import type { NextRequest } from 'next/server'
import { v1Read } from '@/lib/api/v1'
import { GET as read } from '@/lib/services/puzzle-handlers/read-campaign'
export const runtime = 'nodejs'
export async function GET(request: NextRequest) { return v1Read(request, read) }
