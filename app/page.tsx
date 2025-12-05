'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { NavHeader } from '@/components/nav-header'
import { UploadDropzone } from '@/components/upload-dropzone'
import { ParsingProgress } from '@/components/parsing-progress'
import { StatementCard, type StatementStatus } from '@/components/statement-card'
import { useStatementUpload } from '@/lib/hooks/use-statement-upload'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

// Mock recent imports for demo
const recentImports = [
  {
    id: 'stmt-001',
    bankName: 'DBS',
    accountLabel: 'Visa ending 1234',
    periodStart: '2025-11-01',
    periodEnd: '2025-11-30',
    transactionCount: 142,
    status: 'ingested' as StatementStatus,
  },
  {
    id: 'stmt-002',
    bankName: 'POSB',
    accountLabel: 'Savings ending 5678',
    periodStart: '2025-10-01',
    periodEnd: '2025-10-31',
    transactionCount: 98,
    status: 'ingested' as StatementStatus,
  },
  {
    id: 'stmt-003',
    bankName: 'UOB',
    accountLabel: 'One Card ending 9012',
    periodStart: '2025-09-01',
    periodEnd: '2025-09-30',
    transactionCount: 76,
    status: 'ingested' as StatementStatus,
  },
]

export default function HomePage() {
  const router = useRouter()
  const { upload, isUploading, isParsing, currentStep, progress, error } = useStatementUpload()
  const [uploadedFileName, setUploadedFileName] = useState<string>('')

  const handleFileSelect = useCallback(async (file: File) => {
    setUploadedFileName(file.name)
    const statementId = await upload(file)

    if (statementId) {
      // Redirect to review page after successful parsing
      router.push(`/imports/${statementId}/review`)
    }
  }, [upload, router])

  const showParsingProgress = isUploading || isParsing

  return (
    <div className="min-h-screen bg-background">
      <NavHeader />

      <main className="container py-8 md:py-12">
        {/* Hero Section */}
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
            <ParsingProgress
              fileName={uploadedFileName}
              currentStep={currentStep}
              progress={progress}
              error={error || undefined}
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
              {recentImports.length === 0 ? (
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
