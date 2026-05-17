import { NavHeader } from '@/components/nav-header'
import { Card, CardContent } from '@/components/ui/card'

export default function TransactionsLoading() {
  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <main className="container py-8">
        <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
          <div className="h-8 w-40 rounded bg-muted animate-pulse" />
          <div className="flex flex-wrap gap-2">
            <div className="h-9 w-40 rounded bg-muted animate-pulse" />
            <div className="h-9 w-40 rounded bg-muted animate-pulse" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card><CardContent className="p-6"><div className="h-12 rounded bg-muted animate-pulse" /></CardContent></Card>
          <Card><CardContent className="p-6"><div className="h-12 rounded bg-muted animate-pulse" /></CardContent></Card>
          <Card><CardContent className="p-6"><div className="h-12 rounded bg-muted animate-pulse" /></CardContent></Card>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-muted animate-pulse" />
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
