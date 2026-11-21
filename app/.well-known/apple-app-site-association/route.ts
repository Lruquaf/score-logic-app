import { associationResponse } from '@/lib/mobile/associations'
export const runtime = 'nodejs'
export function GET(request: Request) { return associationResponse('ios', request) }
