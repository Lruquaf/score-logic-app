export function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatPuzzleLabel(input: {
  dailyDate: string | null
  campaignOrder: number | null
}) {
  if (input.dailyDate) {
    return input.dailyDate
  }

  return input.campaignOrder ? `Campaign ${input.campaignOrder}` : 'Practice'
}
