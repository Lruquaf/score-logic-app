export class RequestBodyTooLargeError extends Error {
  constructor(readonly maximumBytes: number) {
    super(`Request body exceeds the ${maximumBytes} byte limit.`)
    this.name = 'RequestBodyTooLargeError'
  }
}

export class InvalidJsonBodyError extends Error {
  constructor(options?: ErrorOptions) {
    super('Request body is not valid JSON.', options)
    this.name = 'InvalidJsonBodyError'
  }
}

export async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestBodyTooLargeError(maximumBytes)
  }

  const reader = request.body?.getReader()
  let body = ''
  if (reader) {
    const decoder = new TextDecoder()
    let bytes = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > maximumBytes) {
          await reader.cancel()
          throw new RequestBodyTooLargeError(maximumBytes)
        }
        body += decoder.decode(chunk.value, { stream: true })
      }
      body += decoder.decode()
    } finally { reader.releaseLock() }
  }

  try {
    return JSON.parse(body) as unknown
  } catch (error) {
    throw new InvalidJsonBodyError({ cause: error })
  }
}
