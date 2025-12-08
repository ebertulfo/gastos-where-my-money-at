
'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { UploadState } from '@/lib/hooks/use-statement-upload'
import { cn } from '@/lib/utils'
import { AlertCircle, Check, FileText, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface UploadProgressListProps {
    uploads: UploadState[]
    className?: string
}

export function UploadProgressList({ uploads, className }: UploadProgressListProps) {
    const router = useRouter()
    
    // Determine overall state
    const allComplete = uploads.length > 0 && uploads.every(u => u.status === 'complete')
    const hasErrors = uploads.some(u => u.status === 'error')
    const completedCount = uploads.filter(u => u.status === 'complete').length

    return (
        <Card className={cn('animate-fade-in', className)}>
            <CardHeader>
                <CardTitle className="text-lg">
                    {allComplete ? 'All files processed!' : 'Processing files...'}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    {completedCount} of {uploads.length} files processed
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3">
                    {uploads.map((upload) => (
                        <div key={upload.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card/50">
                            <div className="h-8 w-8 flex items-center justify-center bg-muted rounded">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between mb-1">
                                    <span className="text-sm font-medium truncate">{upload.file.name}</span>
                                    <span className="text-xs text-muted-foreground capitalize">{upload.status}</span>
                                </div>
                                <Progress 
                                    value={upload.progress} 
                                    className={cn("h-1.5", 
                                        upload.status === 'error' && "bg-destructive/20 [&>div]:bg-destructive",
                                        upload.status === 'complete' && "bg-success/20 [&>div]:bg-success"
                                    )} 
                                />
                                {upload.error && (
                                    <p className="text-xs text-destructive mt-1">{upload.error}</p>
                                )}
                            </div>

                            <div className="flex-shrink-0">
                                {upload.status === 'complete' ? (
                                    <Check className="h-5 w-5 text-success" />
                                ) : upload.status === 'error' ? (
                                    <AlertCircle className="h-5 w-5 text-destructive" />
                                ) : (
                                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {allComplete && !hasErrors && (
                    <div className="pt-2 animate-fade-in">
                         <Alert className="border-success/30 bg-success/5 mb-4">
                            <Check className="h-4 w-4 text-success" />
                            <AlertDescription className="text-success">
                                All statements processed successfully. 
                            </AlertDescription>
                        </Alert>
                        <Button 
                            className="w-full" 
                            onClick={() => {
                                // If only one file, go to review directly?
                                // If multiple, maybe go to a "Review All" or list page?
                                // For MVP, let's pick the first one or navigate to an import list
                                // The spec said: "Review Screen... Section A: New Transactions..."
                                // This implies we review PER upload or aggregated.
                                // M1 Spec says: "Review new vs duplicate transactions".
                                // And "Finalize button commits...".
                                
                                // Ideally we show a consolidated review.
                                // But since `ingest` logic creates separate `statements`,
                                // we might want to iterate them or review them one by one.
                                // For now, let's just go to the first one's review page for simplicity
                                // Or better: go to a dashboard/imports list.
                                
                                if (uploads.length === 1 && uploads[0].statementId) {
                                    router.push(`/imports/${uploads[0].statementId}/review`)
                                } else {
                                    // TODO: Implement a list view of pending imports? 
                                    // Or just go to the first one for now.
                                    const firstId = uploads[0].statementId
                                    if (firstId) router.push(`/imports/${firstId}/review`)
                                }
                            }}
                        >
                            Review Imported Transactions
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
