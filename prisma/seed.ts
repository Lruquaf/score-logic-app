import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'

import { TEAM_POOLS } from '../lib/fixtures/teamPools'

loadEnvConfig(process.cwd())

const prisma = new PrismaClient()

async function seedTeams() {
  const teams = Object.values(TEAM_POOLS).flat()

  for (const team of teams) {
    await prisma.team.upsert({
      where: { code: team.code },
      update: {
        nameEn: team.nameEn,
        nameTr: team.nameTr ?? null,
        flagEmoji: team.flagEmoji ?? null,
        continent: team.continent ?? null
      },
      create: {
        id: team.id,
        code: team.code,
        nameEn: team.nameEn,
        nameTr: team.nameTr ?? null,
        flagEmoji: team.flagEmoji ?? null,
        continent: team.continent ?? null
      }
    })
  }
}

async function main() {
  await seedTeams()
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error('Seed failed:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
