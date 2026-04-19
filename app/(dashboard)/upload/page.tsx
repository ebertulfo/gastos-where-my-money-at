import { getSettings } from '@/app/actions/settings'
import { getRecentStatements } from '@/app/actions/statements'
import { NavHeader } from '@/components/nav-header'
import { UploadView } from '@/components/upload-view'

export const dynamic = 'force-dynamic'

export default async function UploadPage() {
  const [recentImports, settings] = await Promise.all([
    getRecentStatements(),
    getSettings(),
  ])

  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <UploadView
        initialRecentImports={recentImports}
        needsOnboarding={!settings}
      />
    </div>
  )
}
