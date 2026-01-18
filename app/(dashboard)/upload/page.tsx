'use client'

import { getSettings } from '@/app/actions/settings'
import { getRecentStatements } from '@/app/actions/statements'
import { NavHeader } from '@/components/nav-header'
import { OnboardingWizard } from '@/components/onboarding-wizard'
import { StatementCard } from '@/components/statement-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { UploadDropzone } from '@/components/upload-dropzone'
import { UploadProgressList } from '@/components/upload-progress-list'
import { useStatementUpload } from '@/lib/hooks/use-statement-upload'
import type { Statement } from '@/lib/types/transaction'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

export default function HomePage() {
  const router = useRouter()
  const { upload, uploads, isUploading, reset } = useStatementUpload()
  const [uploadedFileName, setUploadedFileName] = useState<string>('')
  const [recentImports, setRecentImports] = useState<Statement[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const handleFileSelect = useCallback(async (files: File[]) => {
    if (files.length > 0) {
      setUploadedFileName(files.map(f => f.name).join(', '))
      await upload(files)
      // Refresh history after upload (optional, usually redirect handles flow)
    }
  }, [upload])

  useEffect(() => {
    async function init() {
      try {
        // Parallel fetch history and settings
        const [data, settings] = await Promise.all([
          getRecentStatements(),
          getSettings()
        ])
        setRecentImports(data)

        // If no settings, trigger onboarding
        if (!settings) {
          setShowOnboarding(true)
        }
      } catch (e) {
        console.error("Failed to load data", e)
      } finally {
        setIsLoadingHistory(false)
      }
    }
    init()
  }, [])

  const showParsingProgress = isUploading || uploads.length > 0

  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <OnboardingWizard open={showOnboarding} onFinish={() => setShowOnboarding(false)} />

      <main className="container py-8 md:py-12">
        {/* ... existing content ... */}
        <div className="text-center mb-10 animate-fade-in">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Unfuck your finances.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload your bank statements and see where your household money really goes.
          </p>
        </div>

        {/* Upload Section */}
        <div className="max-w-2xl mx-auto mb-12">
          {showParsingProgress ? (
            <UploadProgressList
              uploads={uploads}
              className="animate-slide-up"
            />
          ) : (
            <UploadDropzone
              onFileSelect={handleFileSelect}
              isUploading={isUploading}
              className="animate-slide-up"
            />
          )}
        </div>

        <Separator className="my-8" />

        {/* Recent Imports Section */}
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Imports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingHistory ? (
                <p className="text-muted-foreground text-center py-6">Loading history...</p>
              ) : recentImports.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">
                  No statements imported yet. Upload your first one above.
                </p>
              ) : (
                recentImports.map((stmt) => (
                  <StatementCard
                    key={stmt.id}
                    {...stmt}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
