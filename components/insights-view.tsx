'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import type { Insights, InsightsPeriod } from '@/lib/types/insights'
import { cn, formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

const STORAGE_KEY = 'gastos.insights-last-period'

interface InsightsViewProps {
    insights: Insights
    period: InsightsPeriod
    availableMonths: string[]
    availableYears: string[]
    availableStatements: { id: string; label: string }[]
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatMonthOption(month: string): string {
    const [year, monthNum] = month.split('-')
    const idx = parseInt(monthNum, 10) - 1
    return `${MONTH_NAMES[idx] ?? monthNum} ${year}`
}

export function InsightsView({
    insights,
    period,
    availableMonths,
    availableYears,
    availableStatements,
}: InsightsViewProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    // Persist the latest selection so repeat visitors land on the same view.
    useEffect(() => {
        if (typeof window === 'undefined') return
        const params = new URLSearchParams(searchParams.toString())
        if (params.get('period') && params.get('value')) {
            window.localStorage.setItem(STORAGE_KEY, params.toString())
        }
    }, [searchParams])

    // On first mount, if the URL has no params and storage has a saved
    // selection, redirect there.
    useEffect(() => {
        if (typeof window === 'undefined') return
        if (searchParams.get('period') || searchParams.get('value')) return
        const saved = window.localStorage.getItem(STORAGE_KEY)
        if (saved) {
            router.replace(`${pathname}?${saved}`)
        }
    }, [pathname, router, searchParams])

    const setSelection = (type: InsightsPeriod['type'], value: string) => {
        const params = new URLSearchParams()
        params.set('period', type)
        params.set('value', value)
        router.push(`${pathname}?${params.toString()}`)
    }

    const togglePeriodType = (type: InsightsPeriod['type']) => {
        // Pick a sensible default value when toggling.
        if (type === 'month') {
            setSelection('month', availableMonths[0] ?? '')
        } else if (type === 'year') {
            setSelection('year', availableYears[0] ?? '')
        } else {
            setSelection('statement', availableStatements[0]?.id ?? '')
        }
    }

    const currentValue =
        period.type === 'statement' ? period.statementId :
        period.type === 'month' ? period.month :
        period.year

    return (
        <div className="container py-8">
            <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
                <h1 className="text-2xl font-bold">Insights</h1>

                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md border bg-background p-0.5">
                        {(['statement', 'month', 'year'] as const).map(type => (
                            <Button
                                key={type}
                                variant={period.type === type ? 'default' : 'ghost'}
                                size="sm"
                                className="capitalize"
                                onClick={() => togglePeriodType(type)}
                            >
                                {type}
                            </Button>
                        ))}
                    </div>

                    {period.type === 'month' && availableMonths.length > 0 && (
                        <Select value={currentValue} onValueChange={v => setSelection('month', v)}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Select month" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableMonths.map(m => (
                                    <SelectItem key={m} value={m}>{formatMonthOption(m)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    {period.type === 'year' && availableYears.length > 0 && (
                        <Select value={currentValue} onValueChange={v => setSelection('year', v)}>
                            <SelectTrigger className="w-[120px]">
                                <SelectValue placeholder="Select year" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableYears.map(y => (
                                    <SelectItem key={y} value={y}>{y}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    {period.type === 'statement' && availableStatements.length > 0 && (
                        <Select value={currentValue} onValueChange={v => setSelection('statement', v)}>
                            <SelectTrigger className="w-[260px]">
                                <SelectValue placeholder="Select statement" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableStatements.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            <Card className="mb-6 animate-fade-in">
                <CardContent className="p-6">
                    <p className="text-sm text-muted-foreground">{insights.periodLabel}</p>
                    <p className="text-4xl font-bold mt-1">
                        {formatCurrency(insights.totalSpent, insights.currency)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                        {insights.transactionCount} {insights.transactionCount === 1 ? 'transaction' : 'transactions'}
                        {insights.statementCount > 0 && ` across ${insights.statementCount} ${insights.statementCount === 1 ? 'statement' : 'statements'}`}
                    </p>
                </CardContent>
            </Card>

            {insights.transactionCount === 0 ? (
                <EmptyPeriodCard period={period} />
            ) : (
                <div className="grid gap-6 md:grid-cols-2 animate-slide-up">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">By tag</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {insights.tagBreakdown.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No tagged transactions in this period.</p>
                            ) : (
                                insights.tagBreakdown.map(row => (
                                    <div key={row.tagId ?? 'untagged'} className="space-y-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="flex items-center gap-2">
                                                <span
                                                    className={cn('inline-block h-2 w-2 rounded-full', !row.tagColor && 'bg-muted')}
                                                    style={row.tagColor ? { backgroundColor: row.tagColor } : undefined}
                                                />
                                                <span className="font-medium">{row.tagName}</span>
                                                <span className="text-xs text-muted-foreground">({row.count})</span>
                                            </span>
                                            <span className="font-mono text-muted-foreground">
                                                {formatCurrency(row.amount, insights.currency)}
                                                <span className="ml-2 text-xs">{row.percentage.toFixed(1)}%</span>
                                            </span>
                                        </div>
                                        <Progress value={row.percentage} className="h-1.5" />
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Top merchants</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {insights.topMerchants.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No merchants to show.</p>
                            ) : (
                                insights.topMerchants.map((m, i) => (
                                    <div key={`${m.description}-${i}`} className="flex items-start justify-between gap-3 text-sm">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{m.description}</p>
                                            <p className="text-xs text-muted-foreground">{m.count} {m.count === 1 ? 'visit' : 'visits'}</p>
                                        </div>
                                        <span className="font-mono text-muted-foreground">
                                            {formatCurrency(m.amount, insights.currency)}
                                        </span>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}

function EmptyPeriodCard({ period }: { period: InsightsPeriod }) {
    const label =
        period.type === 'statement' ? 'this statement' :
        period.type === 'month' ? 'this month' :
        'this year'

    return (
        <Card className="text-center py-12">
            <CardContent>
                <p className="text-muted-foreground mb-4">No spending in {label}.</p>
                <Button asChild variant="outline">
                    <Link href="/transactions">Browse transactions</Link>
                </Button>
            </CardContent>
        </Card>
    )
}
