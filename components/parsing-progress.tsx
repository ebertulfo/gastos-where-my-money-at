'use client'

import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Check, Loader2, AlertCircle } from 'lucide-react'

export type ParsingStep =
    | 'uploading'
    | 'reading'
    | 'detecting'
    | 'extracting'
    | 'sanitizing'
    | 'checking_duplicates'
    | 'complete'
    | 'error'

interface ParsingProgressProps {
    fileName: string
    currentStep: ParsingStep
    progress: number
    error?: string
    className?: string
}

const steps: { key: ParsingStep; label: string }[] = [
    { key: 'uploading', label: 'Uploading file' },
    { key: 'reading', label: 'Reading PDF in memory' },
    { key: 'detecting', label: 'Detecting statement type' },
    { key: 'extracting', label: 'Extracting transactions' },
    { key: 'sanitizing', label: 'Sanitizing sensitive details' },
    { key: 'checking_duplicates', label: 'Checking for duplicates' },
]

export function ParsingProgress({
    fileName,
    currentStep,
    progress,
    error,
    className,
}: ParsingProgressProps) {
    const currentStepIndex = steps.findIndex(s => s.key === currentStep)
    const isComplete = currentStep === 'complete'
    const hasError = currentStep === 'error'

    return (
        <Card className={cn('animate-fade-in', className)}>
            <CardHeader>
                <CardTitle className="text-lg">
                    {isComplete ? 'Parsing complete!' : hasError ? 'Parsing failed' : 'Parsing your statement...'}
                </CardTitle>
                <p className="text-sm text-muted-foreground font-mono">{fileName}</p>
            </CardHeader>
            <CardContent className="space-y-4">
                <Progress value={progress} className="h-2" />

                <div className="space-y-2">
                    {steps.map((step, index) => {
                        const isCurrentStep = step.key === currentStep
                        const isCompleted = currentStepIndex > index || isComplete
                        const isPending = currentStepIndex < index && !isComplete

                        return (
                            <div
                                key={step.key}
                                className={cn(
                                    'flex items-center gap-3 text-sm transition-opacity',
                                    isPending && 'opacity-40'
                                )}
                            >
                                {isCompleted ? (
                                    <Check className="h-4 w-4 text-success" />
                                ) : isCurrentStep ? (
                                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                                ) : (
                                    <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                                )}
                                <span className={cn(
                                    isCompleted && 'text-muted-foreground',
                                    isCurrentStep && 'text-foreground font-medium'
                                )}>
                                    {step.label}
                                </span>
                            </div>
                        )
                    })}
                </div>

                {hasError && error && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {isComplete && (
                    <Alert className="mt-4 border-success/30 bg-success/5">
                        <Check className="h-4 w-4 text-success" />
                        <AlertDescription className="text-success">
                            All transactions extracted. Redirecting to review...
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    )
}
