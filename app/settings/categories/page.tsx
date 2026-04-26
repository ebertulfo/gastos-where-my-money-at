import { getCategories } from '@/app/actions/categories'
import { NavHeader } from '@/components/nav-header'
import { CategoriesManager } from './categories-manager'

export const dynamic = 'force-dynamic'

export default async function CategoriesSettingsPage() {
  const categories = await getCategories()

  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <main className="container max-w-3xl py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="text-muted-foreground">
            One bucket per transaction. AI auto-applies these during ingest;
            you confirm or override on the review screen.
          </p>
        </div>
        <CategoriesManager initialCategories={categories} />
      </main>
    </div>
  )
}
