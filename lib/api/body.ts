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

  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > maximumBytes) {
    throw new RequestBodyTooLargeError(maximumBytes)
  }

  try {
    return JSON.parse(body) as unknown
  } catch (error) {
    throw new InvalidJsonBodyError({ cause: error })
  }
}
