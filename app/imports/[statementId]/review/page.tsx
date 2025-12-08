'use client'

import { getTags } from '@/app/actions/tags'
import { DuplicateComparison } from '@/components/duplicate-comparison'
import { NavHeader } from '@/components/nav-header'
import { TransactionTable } from '@/components/transaction-table'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useStatementReview } from '@/lib/hooks/use-statement-review'
import { Tag } from '@/lib/supabase/database.types'
import { formatDate } from '@/lib/utils'
import { AlertTriangle, ArrowLeft, Check, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'

interface ReviewPageProps {
    params: Promise<{ statementId: string }>
}

export default function ReviewPage({ params }: ReviewPageProps) {
    const { statementId } = use(params)
    const router = useRouter()
    const [availableTags, setAvailableTags] = useState<Tag[]>([])

    useEffect(() => {
        getTags().then(setAvailableTags).catch((err) => console.error('Failed to fetch tags', err))
    }, [])

    const {
        review,
        isLoading,
        error,
        duplicateDecisions,
        setDuplicateDecision,
        confirm: confirmImport,
        isConfirming,
        reject,
        isRejecting,
    } = useStatementReview(statementId)

    const handleConfirm = async () => {
        const success = await confirmImport()
        if (success) {
            router.push('/transactions?month=2025-12')
        }
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background">
                <NavHeader />
                <main className="container py-8">
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                </main>
            </div>
        )
    }

    if (error || !review) {
        return (
            <div className="min-h-screen bg-background">
                <NavHeader />
                <main className="container py-8">
                    <div className="text-center py-20">
                        <p className="text-destructive mb-4">{error || 'Failed to load review data'}</p>
                        <Button variant="ghost" asChild>
                            <Link href="/">Go back</Link>
                        </Button>
                    </div>
                </main>
            </div>
        )
    }

    const { statement, newTransactions, duplicates } = review

    return (
        <div className="min-h-screen bg-background">
            <NavHeader />

            <main className="container py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold">
                            Review Import: {statement.bankName} — {formatDate(statement.periodStart).split(' ')[1]} {formatDate(statement.periodStart).split(' ')[2]}
                        </h1>
                    </div>
                </div>

                {/* Statement Summary Card */}
                <Card className="mb-8 animate-fade-in">
                    <CardContent className="p-6">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Bank / Account</p>
                                <p className="font-medium">
                                    {statement.bankName}
                                    {statement.accountLabel && ` (${statement.accountLabel})`}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Period</p>
                                <p className="font-medium">
                                    {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Currency</p>
                                <p className="font-medium">{statement.currency}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Found</p>
                                <div className="flex items-center gap-2">
                                    <p className="font-medium">{statement.transactionCount} transactions</p>
                                </div>
                            </div>
                        </div>
                        <Separator className="my-4" />
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Badge variant="default" className="bg-success">
                                    <Check className="h-3 w-3 mr-1" />
                                    New: {newTransactions.length}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Possible duplicates: {duplicates.length}
                                </Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Section A: New Transactions */}
                <Card className="mb-8 animate-slide-up">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Check className="h-5 w-5 text-success" />
                            New Transactions
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                            {newTransactions.length} new transactions will be added to your history.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <TransactionTable
                            transactions={newTransactions}
                            availableTags={availableTags}
                            showSource={false}
                            emptyMessage="No new transactions found."
                            enableTagging={false}
                        />
                    </CardContent>
                </Card>

                {/* Section B: Potential Duplicates */}
                {duplicates.length > 0 && (
                    <Card className="mb-8 animate-slide-up">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-warning" />
                                Potential Duplicates
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                {duplicates.length} transactions look like they may already exist.
                                We'll keep your existing ones by default.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <Accordion type="single" collapsible defaultValue="duplicates">
                                <AccordionItem value="duplicates" className="border-none">
                                    <AccordionTrigger className="py-2">
                                        Show {duplicates.length} potential duplicates
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="space-y-4 pt-4">
                                            {duplicates.map((dup) => (
                                                <DuplicateComparison
                                                    key={dup.importId}
                                                    duplicate={dup}
                                                    decision={duplicateDecisions[dup.importId] || 'keep_existing'}
                                                    onDecisionChange={(decision) => setDuplicateDecision(dup.importId, decision)}
                                                />
                                            ))}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </CardContent>
                    </Card>
                )}

                {/* Footer Actions */}
                <div className="flex items-center justify-between py-6 border-t">
                    <Button 
                        variant="destructive" 
                        onClick={async () => {
                            if (window.confirm('Are you sure you want to delete this import? This action cannot be undone.')) {
                                const success = await reject()
                                if (success) {
                                    router.push('/')
                                }
                            }
                        }}
                        disabled={isRejecting || isConfirming}
                    >
                        {isRejecting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Deleting...
                            </>
                        ) : (
                            'Delete Import'
                        )}
                    </Button>
                    <Button onClick={handleConfirm} disabled={isConfirming || isRejecting}>
                        {isConfirming ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Importing...
                            </>
                        ) : (
                            <>
                                <Check className="h-4 w-4 mr-2" />
                                Finish Import
                            </>
                        )}
                    </Button>
                </div>
            </main>
        </div>
    )
}
