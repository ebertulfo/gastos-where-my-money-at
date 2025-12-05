import { NavHeader } from '@/components/nav-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BarChart3, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function SummaryPage() {
    return (
        <div className="min-h-screen bg-background">
            <NavHeader />

            <main className="container py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">Month Summary</h1>
                        <Badge variant="secondary">Coming in M3</Badge>
                    </div>
                </div>

                {/* Coming Soon Card */}
                <Card className="max-w-2xl mx-auto animate-fade-in">
                    <CardHeader className="text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                            <BarChart3 className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <CardTitle className="text-xl">Spending insights are coming soon</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center space-y-6">
                        <p className="text-muted-foreground">
                            Once you've imported a few statements and we've categorized your transactions,
                            you'll see a breakdown of where your money went each month.
                        </p>

                        <div className="bg-muted/50 rounded-lg p-6 text-left space-y-3">
                            <p className="text-sm text-muted-foreground">Preview of what's coming:</p>
                            <ul className="space-y-2 text-sm">
                                <li className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-primary" />
                                    Total spend per month
                                </li>
                                <li className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-accent" />
                                    Category breakdown (Food, Transport, Bills, etc.)
                                </li>
                                <li className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-success" />
                                    Top merchants by spend
                                </li>
                                <li className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-warning" />
                                    Month-over-month trends
                                </li>
                            </ul>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Button asChild>
                                <Link href="/">
                                    Upload a statement
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                </Link>
                            </Button>
                            <Button variant="outline" asChild>
                                <Link href="/transactions">
                                    View transactions
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
