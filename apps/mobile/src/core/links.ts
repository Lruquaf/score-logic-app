import { parsePuzzleLink } from './puzzle.ts'
/** Last valid incoming link wins. Account transitions never dispatch a link into the old owner. */
export class IncomingLinks {
  private pending: string | null = null
  private revision = 0
  constructor(private webOrigin: string, private scheme: string) {}
  receive(url: string) {
    const target = parsePuzzleLink(url, this.webOrigin, this.scheme)
    if (!target) return false
    this.pending = target; this.revision++; return true
  }
  initialTicket() { return this.revision }
  receiveInitial(url: string | null, ticket: number) { return this.revision === ticket && url !== null ? this.receive(url) : false }
  take(ready: boolean) { if (!ready) return null; const target = this.pending; this.pending = null; return target }
}
