import { getStatements } from '@/app/actions/statements'
import {
  getAvailableMonthsList,
  getInsights,
  getYearsWithDataList,
} from '@/app/actions/transactions'
import { InsightsView } from '@/components/insights-view'
import { NavHeader } from '@/components/nav-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InsightsPeriod } from '@/lib/types/insights'
import { ArrowRight, BarChart3 } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ period?: string; value?: string }>
}

function parsePeriod(
  rawPeriod: string | undefined,
  rawValue: string | undefined,
  defaults: { latestMonth?: string; latestYear?: string; latestStatementId?: string },
): InsightsPeriod | null {
  const type = rawPeriod === 'statement' || rawPeriod === 'year' ? rawPeriod : 'month'

  if (type === 'statement') {
    const value = rawValue ?? defaults.latestStatementId
    if (!value) return null
    return { type: 'statement', statementId: value }
  }

  if (type === 'year') {
    const value = rawValue ?? defaults.latestYear
    if (!value) return null
    return { type: 'year', year: value }
  }

  const value = rawValue ?? defaults.latestMonth
  if (!value) return null
  return { type: 'month', month: value }
}

export default async function InsightsPage({ searchParams }: PageProps) {
  const params = await searchParams

  const [availableMonths, availableYears, statements] = await Promise.all([
    getAvailableMonthsList(),
    getYearsWithDataList(),
    getStatements(),
  ])

  const availableStatements = statements.map(s => ({
    id: s.id,
    label: `${s.bankName} (${s.periodStart.slice(0, 7)})`,
  }))

  const period = parsePeriod(params.period, params.value, {
    latestMonth: availableMonths[0],
    latestYear: availableYears[0],
    latestStatementId: availableStatements[0]?.id,
  })

  if (!period) {
    // No data at all yet — render the "upload to see insights" empty state.
    return (
      <div className="min-h-screen bg-background">
        <NavHeader />
        <main className="container py-8">
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </div>
              <CardTitle>Upload a statement to see insights</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground mb-6">
                After your first import, this page shows where the money went, by tag and by merchant.
              </p>
              <Button asChild>
                <Link href="/upload">
                  Upload a statement
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const insights = await getInsights(period)

  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <main>
        <InsightsView
          insights={insights}
          period={period}
          availableMonths={availableMonths}
          availableYears={availableYears}
          availableStatements={availableStatements}
        />
      </main>
    </div>
  )
}
