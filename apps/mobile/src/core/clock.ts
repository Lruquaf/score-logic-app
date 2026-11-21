/** Device wall-clock changes must not add/remove a day from an active timer. */
export class ServerClock {
  private at = Date.now()
  private tick = performance.now()
  private aligned = false
  align(serverTime: string) { this.aligned = true; this.at = Date.parse(serverTime); this.tick = performance.now() }
  cached(serverTime: string) { if (!this.aligned) this.align(serverTime) }
  local() { this.at = Date.now(); this.tick = performance.now() }
  now() { return this.at + Math.max(0, performance.now() - this.tick) }
}
