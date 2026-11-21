import type { NextRequest } from 'next/server'
export const runtime = 'nodejs'
import { nativeCommandReceipt } from '@/lib/services/mobile-api'
export async function GET(request: NextRequest, context: {params: Promise<{id:string;commandId:string}>}) { const {id,commandId}=await context.params; return nativeCommandReceipt(request,id,commandId) }
