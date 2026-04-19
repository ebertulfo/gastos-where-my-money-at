'use client'

import { OnboardingWizard } from '@/components/onboarding-wizard'
import { StatementCard } from '@/components/statement-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { UploadDropzone } from '@/components/upload-dropzone'
import { UploadProgressList } from '@/components/upload-progress-list'
import { useStatementUpload } from '@/lib/hooks/use-statement-upload'
import type { Statement } from '@/lib/types/transaction'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

interface UploadViewProps {
  initialRecentImports: Statement[]
  needsOnboarding: boolean
}

export function UploadView({ initialRecentImports, needsOnboarding }: UploadViewProps) {
  const router = useRouter()
  const { upload, uploads, isUploading } = useStatementUpload()
  const [showOnboarding, setShowOnboarding] = useState(needsOnboarding)

  const handleFileSelect = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    await upload(files)
  }, [upload])

  const showParsingProgress = isUploading || uploads.length > 0

  return (
    <>
      <OnboardingWizard
        open={showOnboarding}
        onFinish={() => {
          setShowOnboarding(false)
          router.refresh()
        }}
      />

      <main className="container py-8 md:py-12">
        <div className="text-center mb-10 animate-fade-in">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Unfuck your finances.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload your bank statements and see where your household money really goes.
          </p>
        </div>

        <div className="max-w-2xl mx-auto mb-12">
          {showParsingProgress ? (
            <UploadProgressList uploads={uploads} className="animate-slide-up" />
          ) : (
            <UploadDropzone
              onFileSelect={handleFileSelect}
              isUploading={isUploading}
              className="animate-slide-up"
            />
          )}
        </div>

        <Separator className="my-8" />

        <div className="max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Imports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {initialRecentImports.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">
                  No statements imported yet. Upload your first one above.
                </p>
              ) : (
                initialRecentImports.map((stmt) => (
                  <StatementCard key={stmt.id} {...stmt} />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  )
}
