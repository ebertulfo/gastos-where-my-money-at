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
import type { Insights, InsightsPeriod, InsightsTravelMode } from '@/lib/types/insights'
import type { Tag } from '@/db/schema'
import type { CategoryOption } from '@/components/category-picker'
import { CategoryDetailDialog } from '@/components/category-detail-dialog'
import { TripDetectionDialog } from '@/components/trip-detection-dialog'
import type { TripBreakdownRow } from '@/app/actions/trips'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { Loader2, Plane } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

const STORAGE_KEY = 'gastos.insights-last-period'

interface InsightsViewProps {
    insights: Insights
    period: InsightsPeriod
    availableMonths: string[]
    availableYears: string[]
    availableStatements: { id: string; label: string }[]
    householdMembers: { id: string; name: string; color: string | null }[]
    selectedMemberIds: string[]
    travelMode: InsightsTravelMode
    availableTags: Tag[]
    availableCategories: CategoryOption[]
    tripBreakdown: TripBreakdownRow[]
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
    householdMembers,
    selectedMemberIds,
    travelMode,
    availableTags,
    availableCategories,
    tripBreakdown,
}: InsightsViewProps) {
    const [drillCategory, setDrillCategory] = useState<{
        id: string | null
        name: string
        amount: number
    } | null>(null)
    const [isDetectTripsOpen, setIsDetectTripsOpen] = useState(false)
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()

    // Optimistic filter state. While a navigation transition is pending we
    // render these as if they're already the active value, so the clicked
    // button highlights immediately + shows a spinner. Once the transition
    // finishes we drop back to the server-derived props.
    const [optimisticPeriodType, setOptimisticPeriodType] = useState<InsightsPeriod['type'] | null>(null)
    const [optimisticPeriodValue, setOptimisticPeriodValue] = useState<string | null>(null)
    const [optimisticTravelMode, setOptimisticTravelMode] = useState<InsightsTravelMode | null>(null)

    useEffect(() => {
        if (!isPending) {
            setOptimisticPeriodType(null)
            setOptimisticPeriodValue(null)
            setOptimisticTravelMode(null)
        }
    }, [isPending])

    const navigate = (url: string) => {
        startTransition(() => router.push(url))
    }

    const effectivePeriodType = isPending && optimisticPeriodType ? optimisticPeriodType : period.type
    const effectiveTravelMode = isPending && optimisticTravelMode ? optimisticTravelMode : travelMode

    const setMemberFilter = (memberIds: string[]) => {
        const params = new URLSearchParams(searchParams.toString())
        if (memberIds.length === 0) {
            params.delete('members')
        } else {
            params.set('members', memberIds.join(','))
        }
        navigate(`${pathname}?${params.toString()}`)
    }

    const toggleMember = (memberId: string) => {
        const next = selectedMemberIds.includes(memberId)
            ? selectedMemberIds.filter(id => id !== memberId)
            : [...selectedMemberIds, memberId]
        setMemberFilter(next)
    }

    const setTravelMode = (mode: InsightsTravelMode) => {
        setOptimisticTravelMode(mode)
        const params = new URLSearchParams(searchParams.toString())
        if (mode === 'all') params.delete('travel')
        else if (mode === 'travel') params.set('travel', 'only')
        else params.set('travel', 'exclude')
        navigate(`${pathname}?${params.toString()}`)
    }

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
        setOptimisticPeriodType(type)
        setOptimisticPeriodValue(value)
        const params = new URLSearchParams()
        params.set('period', type)
        params.set('value', value)
        navigate(`${pathname}?${params.toString()}`)
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

    const serverValue =
        period.type === 'statement' ? period.statementId :
        period.type === 'month' ? period.month :
        period.year
    const currentValue = isPending && optimisticPeriodValue ? optimisticPeriodValue : serverValue

    return (
        <div className="container py-8">
            <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
                <h1 className="text-2xl font-bold">Insights</h1>

                <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex rounded-md border bg-background p-0.5">
                        {(['statement', 'month', 'year'] as const).map(type => {
                            const isActive = effectivePeriodType === type
                            const showSpinner = isPending && optimisticPeriodType === type
                            return (
                                <Button
                                    key={type}
                                    variant={isActive ? 'default' : 'ghost'}
                                    size="sm"
                                    className="capitalize"
                                    onClick={() => togglePeriodType(type)}
                                    disabled={isPending}
                                >
                                    {showSpinner && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                    {type}
                                </Button>
                            )
                        })}
                    </div>

                    <div className="inline-flex rounded-md border bg-background p-0.5">
                        {([
                            { mode: 'all' as const, label: 'All' },
                            { mode: 'travel' as const, label: 'Travel only' },
                            { mode: 'no-travel' as const, label: 'No travel' },
                        ]).map(({ mode, label }) => {
                            const isActive = effectiveTravelMode === mode
                            const showSpinner = isPending && optimisticTravelMode === mode
                            return (
                                <Button
                                    key={mode}
                                    variant={isActive ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setTravelMode(mode)}
                                    disabled={isPending}
                                >
                                    {showSpinner && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                    {label}
                                </Button>
                            )
                        })}
                    </div>

                    <Button variant="outline" size="sm" onClick={() => setIsDetectTripsOpen(true)}>
                        <Plane className="h-3 w-3 mr-1.5" />
                        Detect trips
                    </Button>

                    {effectivePeriodType === 'month' && availableMonths.length > 0 && (
                        <Select value={currentValue} onValueChange={v => setSelection('month', v)} disabled={isPending}>
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

                    {effectivePeriodType === 'year' && availableYears.length > 0 && (
                        <Select value={currentValue} onValueChange={v => setSelection('year', v)} disabled={isPending}>
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

                    {effectivePeriodType === 'statement' && availableStatements.length > 0 && (
                        <Select value={currentValue} onValueChange={v => setSelection('statement', v)} disabled={isPending}>
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

            {/* Member filter chips hidden until per-row attribution lands. The
                statement-level filter only catches solo statements, which is
                rarely what the user actually wants when they ask "what did
                Edrian spend this month?". Re-introduce when transactions get
                an explicit `member_id` (or split-amount). */}

            <div
                className={cn(
                    'transition-opacity duration-200',
                    isPending && 'opacity-50 pointer-events-none',
                )}
                aria-busy={isPending}
            >
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
                    {insights.aiCategorizedCount > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                            {Math.round((insights.aiCategorizedCount / Math.max(insights.transactionCount, 1)) * 100)}% auto-categorized — review on Transactions
                        </p>
                    )}
                    {insights.travelTransactionCount > 0 && travelMode === 'all' && (
                        <p className="text-xs text-muted-foreground mt-1">
                            ✈ Travel: {formatCurrency(insights.travelSpent, insights.currency)} across {insights.travelTransactionCount} {insights.travelTransactionCount === 1 ? 'transaction' : 'transactions'}
                        </p>
                    )}
                </CardContent>
            </Card>

            {tripBreakdown.length > 0 && (
                <Card className="mb-6 animate-fade-in">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Plane className="h-4 w-4" />
                            Trips
                        </CardTitle>
                        <Button variant="ghost" size="sm" onClick={() => setIsDetectTripsOpen(true)}>
                            Detect more
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {tripBreakdown.map(trip => (
                                <div
                                    key={trip.labelId}
                                    className="rounded-md border bg-card p-3"
                                >
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={cn('inline-block h-2 w-2 rounded-full', !trip.labelColor && 'bg-primary/60')}
                                            style={trip.labelColor ? { backgroundColor: trip.labelColor } : undefined}
                                        />
                                        <span className="font-medium text-sm capitalize truncate">
                                            {trip.labelName}
                                        </span>
                                    </div>
                                    <p className="mt-1 font-mono text-lg">
                                        {formatCurrency(trip.amount, insights.currency)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {trip.count} {trip.count === 1 ? 'transaction' : 'transactions'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {insights.transactionCount === 0 ? (
                <EmptyPeriodCard period={period} />
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 animate-slide-up">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">By category</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {insights.tagBreakdown.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No categorized transactions in this period.</p>
                            ) : (
                                insights.tagBreakdown.map(row => (
                                    <button
                                        type="button"
                                        key={row.tagId ?? 'untagged'}
                                        className="-mx-2 block w-[calc(100%+1rem)] space-y-1 rounded px-2 py-1 text-left transition-colors hover:bg-muted/50"
                                        onClick={() => setDrillCategory({
                                            id: row.tagId,
                                            name: row.tagName,
                                            amount: row.amount,
                                        })}
                                    >
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
                                    </button>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">By person</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {insights.memberBreakdown.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {householdMembers.length === 0
                                        ? 'No household members yet. Add some on the upload page.'
                                        : 'No member attributed to this period’s statements. Pick a member when uploading future statements.'}
                                </p>
                            ) : (
                                insights.memberBreakdown.map(row => {
                                    const pct = insights.totalSpent > 0
                                        ? (row.amount / insights.totalSpent) * 100
                                        : 0
                                    return (
                                        <div key={row.memberId} className="space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="flex items-center gap-2">
                                                    <span
                                                        className={cn('inline-block h-2 w-2 rounded-full', !row.memberColor && 'bg-muted')}
                                                        style={row.memberColor ? { backgroundColor: row.memberColor } : undefined}
                                                    />
                                                    <span className="font-medium">{row.memberName}</span>
                                                    <span className="text-xs text-muted-foreground">({row.count})</span>
                                                </span>
                                                <span className="font-mono text-muted-foreground">
                                                    {formatCurrency(row.amount, insights.currency)}
                                                </span>
                                            </div>
                                            {row.jointAmount > 0 && (
                                                <p className="text-xs text-muted-foreground">
                                                    incl. {formatCurrency(row.jointAmount, insights.currency)} joint
                                                </p>
                                            )}
                                            <Progress value={pct} className="h-1.5" />
                                        </div>
                                    )
                                })
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

            {drillCategory && (
                <CategoryDetailDialog
                    open={Boolean(drillCategory)}
                    onOpenChange={(o) => { if (!o) setDrillCategory(null) }}
                    rollupCategoryId={drillCategory.id}
                    rollupName={drillCategory.name}
                    rollupAmount={drillCategory.amount}
                    currency={insights.currency}
                    period={period}
                    filters={{ memberIds: selectedMemberIds, travelMode }}
                    availableTags={availableTags}
                    availableCategories={availableCategories}
                />
            )}
            </div>
            <TripDetectionDialog
                open={isDetectTripsOpen}
                onOpenChange={setIsDetectTripsOpen}
                currency={insights.currency}
            />
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
