import { getStatements } from '@/app/actions/statements'
import { NavHeader } from '@/components/nav-header'
import { StatementCard } from '@/components/statement-card'
import { Button } from '@/components/ui/button'
import { FileUp } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function StatementsPage() {
    const statements = await getStatements()

    return (
        <div className="min-h-screen bg-background">
            <NavHeader />

            <main className="container py-8">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-2xl font-bold">Statements</h1>
                    <Button asChild>
                        <Link href="/upload">
                            <FileUp className="h-4 w-4 mr-2" />
                            Upload New
                        </Link>
                    </Button>
                </div>

                {statements.length === 0 ? (
                    <div className="text-center py-20 border rounded-lg bg-muted/10">
                        <div className="flex justify-center mb-4">
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                <FileUp className="h-6 w-6 text-muted-foreground" />
                            </div>
                        </div>
                        <h3 className="text-lg font-medium">No statements yet</h3>
                        <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                            Upload your bank statements to start tracking your expenses automatically.
                        </p>
                        <Button asChild>
                            <Link href="/upload">Upload Statement</Link>
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {statements.map((statement) => (
                            <StatementCard
                                key={statement.id}
                                {...statement}
                            />
                        ))}
                    </div>
                )}
            </main>
        </div>
    )
}
