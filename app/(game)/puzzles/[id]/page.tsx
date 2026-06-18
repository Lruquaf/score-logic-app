import { DailyPuzzleExperience } from '@/components/puzzle/DailyPuzzleExperience'

export const metadata = {
  title: 'Practice Puzzle'
}

interface PuzzlePageProps {
  params: Promise<{
    id: string
  }>
}

export default async function PuzzlePage({ params }: PuzzlePageProps) {
  const { id } = await params
  return <DailyPuzzleExperience puzzleId={id} />
}
