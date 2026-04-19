import { getPendingStatements, getReviewData } from '@/app/actions/statements'
import { getTags } from '@/app/actions/tags'
import { NavHeader } from '@/components/nav-header'
import { ReviewView } from '@/components/review-view'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface ReviewPageProps {
  params: Promise<{ statementId: string }>
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { statementId } = await params

  let review
  try {
    review = await getReviewData(statementId)
  } catch (err) {
    return (
      <div className="min-h-screen bg-background">
        <NavHeader />
        <main className="container py-8">
          <div className="text-center py-20">
            <p className="text-destructive mb-4">
              {err instanceof Error ? err.message : 'Failed to load review data'}
            </p>
            <Button variant="ghost" asChild>
              <Link href="/">Go back</Link>
            </Button>
          </div>
        </main>
      </div>
    )
  }

  const [availableTags, pendingStatements] = await Promise.all([
    getTags(),
    getPendingStatements(),
  ])

  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <ReviewView
        statementId={statementId}
        review={review}
        availableTags={availableTags}
        pendingStatements={pendingStatements}
      />
    </div>
  )
}
