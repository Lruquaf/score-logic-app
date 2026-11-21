import { NextRequest } from 'next/server'
import { v1Read, v1Caught } from '@/lib/api/v1'
import { readBoundedJson } from '@/lib/api/body'
import { analyzeBoardRequestSchema } from '@/packages/contracts/src'
import { POST as analyze } from '@/lib/services/puzzle-handlers/analyze'
export const runtime = 'nodejs'
export async function POST(request: NextRequest, context: {params: Promise<{id:string}>}) { try { const payload=analyzeBoardRequestSchema.parse(await readBoundedJson(request,65536)); const headers=new Headers(request.headers);headers.delete('content-length');return v1Read(new NextRequest(request.url,{method:'POST',headers,body:JSON.stringify(payload)}),analyze,context) } catch(error) { return v1Caught(error,'Native analysis') } }
