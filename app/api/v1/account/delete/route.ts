import type { NextRequest } from 'next/server'
export const runtime = 'nodejs'
import { deleteAccount } from '@/lib/services/mobile-api'
export async function POST(request: NextRequest) { return deleteAccount(request) }
