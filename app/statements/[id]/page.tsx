
import { getStatementById } from '@/app/actions/statements'
import { getTags } from '@/app/actions/tags'
import { getTransactions } from '@/app/actions/transactions'
import { NavHeader } from '@/components/nav-header'
import { TransactionTable } from '@/components/transaction-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatDate } from '@/lib/utils'
import { ArrowLeft, Calendar, CreditCard, FileText } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DeleteStatementButton } from './delete-button'

interface PageProps {
    params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export default async function StatementDetailPage(props: PageProps) {
    const params = await props.params;
    const {
        id
    } = params;

    const [statement, transactions, tags] = await Promise.all([
        getStatementById(id),
        getTransactions(null, id),
        getTags()
    ])

    if (!statement) {
        notFound()
    }

    const { label: statusLabel, variant: statusVariant } = {
        parsed: { label: 'Parsed', variant: 'secondary' as const },
        reviewing: { label: 'Reviewing', variant: 'outline' as const },
        ingested: { label: 'Imported', variant: 'default' as const },
        failed: { label: 'Failed', variant: 'destructive' as const },
    }[statement.status] || { label: statement.status, variant: 'outline' as const }

    return (
        <div className="min-h-screen bg-background">
            <NavHeader />

            <main className="container py-8">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild className="mb-4 pl-0 hover:pl-0">
                        <Link href="/statements" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                            <ArrowLeft className="h-4 w-4" />
                            Back to Statements
                        </Link>
                    </Button>

                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                                <FileText className="h-6 w-6 text-foreground" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold flex items-center gap-3">
                                    {statement.bankName}
                                    <Badge variant={statusVariant}>{statusLabel}</Badge>
                                </h1>
                                {statement.accountLabel && (
                                    <p className="text-muted-foreground">{statement.accountLabel}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {statement.status === 'reviewing' && (
                                <Button asChild>
                                    <Link href={`/imports/${id}/review`}>Review Transactions</Link>
                                </Button>
                            )}
                            <DeleteStatementButton id={id} />
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-3 mb-8">
                    <Card>
                        <CardContent className="p-6 flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                                <Calendar className="h-4 w-4" /> Period
                            </span>
                            <span className="font-medium">
                                {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)}
                            </span>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-6 flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                                <CreditCard className="h-4 w-4" /> Transactions
                            </span>
                            <span className="font-medium">
                                {transactions.length} transactions
                            </span>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-6 flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                                <FileText className="h-4 w-4" /> File
                            </span>
                             <span className="font-medium truncate" title={statement.fileHash || ''}>
                                Hash: {statement.fileHash?.substring(0, 12)}...
                            </span>
                        </CardContent>
                    </Card>
                </div>

                <Separator className="my-8" />

                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Transactions</h2>
                    <TransactionTable 
                        transactions={transactions} 
                        availableTags={tags} 
                        showSource={false} 
                        enableTagging={true}
                    />
                </div>
            </main>
        </div>
    )
}
