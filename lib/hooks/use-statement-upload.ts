'use client'

import { useState, useCallback } from 'react'
import { uploadStatement, parseStatementProgress, type ParsingStep } from '@/lib/services/statement-service'

interface UseStatementUploadReturn {
    upload: (file: File) => Promise<string | null>
    isUploading: boolean
    isParsing: boolean
    currentStep: ParsingStep
    progress: number
    error: string | null
    reset: () => void
}

export function useStatementUpload(): UseStatementUploadReturn {
    const [isUploading, setIsUploading] = useState(false)
    const [isParsing, setIsParsing] = useState(false)
    const [currentStep, setCurrentStep] = useState<ParsingStep>('uploading')
    const [progress, setProgress] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const reset = useCallback(() => {
        setIsUploading(false)
        setIsParsing(false)
        setCurrentStep('uploading')
        setProgress(0)
        setError(null)
    }, [])

    const upload = useCallback(async (file: File): Promise<string | null> => {
        reset()
        setIsUploading(true)

        try {
            // Step 1: Upload the file
            const { statementId } = await uploadStatement(file)

            setIsUploading(false)
            setIsParsing(true)

            // Step 2: Track parsing progress
            for await (const update of parseStatementProgress(statementId)) {
                setCurrentStep(update.step)
                setProgress(update.progress)

                if (update.error) {
                    setError(update.error)
                    setIsParsing(false)
                    return null
                }
            }

            setIsParsing(false)
            return statementId
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred while uploading')
            setIsUploading(false)
            setIsParsing(false)
            return null
        }
    }, [reset])

    return {
        upload,
        isUploading,
        isParsing,
        currentStep,
        progress,
        error,
        reset,
    }
}
