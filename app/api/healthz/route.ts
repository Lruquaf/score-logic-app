import { jsonResponse } from '@/lib/api/http'

export const runtime = 'nodejs'

export async function GET() {
  return jsonResponse(
    {
      status: 'ok',
      timestamp: new Date().toISOString()
    },
    {
      status: 200
    }
  )
}
