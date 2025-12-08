'use client'

import { useState, useCallback } from 'react'
import { uploadStatement, parseStatementProgress, type ParsingStep } from '@/lib/services/statement-service'
import { supabase } from '@/lib/supabase/client'

export interface UploadState {
    id: string
    file: File
    status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error'
    progress: number
    error?: string
    statementId?: string
}

interface UseStatementUploadReturn {
    upload: (files: File[]) => Promise<void>
    uploads: UploadState[]
    isUploading: boolean
    reset: () => void
}

export function useStatementUpload(): UseStatementUploadReturn {
    const [uploads, setUploads] = useState<UploadState[]>([])
    const [isUploading, setIsUploading] = useState(false)

    const reset = useCallback(() => {
        setUploads([])
        setIsUploading(false)
    }, [])

    const upload = useCallback(async (files: File[]) => {
        setIsUploading(true)

        // Check for session and sign in anonymously if needed
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            const { error: signInError } = await supabase.auth.signInAnonymously()
            if (signInError) {
                console.error("Anonymous sign-in failed:", signInError)
                setUploads(prev => [...prev, ...files.map(f => ({
                    id: Math.random().toString(36).substring(7),
                    file: f,
                    status: 'error' as const,
                    progress: 0,
                    error: "Could not sign in. Please try again."
                }))])
                setIsUploading(false)
                return
            }
        }
        
        // Initialize state for new files
        const newUploads = files.map(file => ({
            id: Math.random().toString(36).substring(7),
            file,
            status: 'pending' as const,
            progress: 0
        }))

        setUploads(prev => [...prev, ...newUploads])

        // Process files sequentially to avoid overwhelming the server
        // (Parallel could be an option for small batches)
        for (const uploadItem of newUploads) {
            setUploads(prev => prev.map(u => 
                u.id === uploadItem.id ? { ...u, status: 'uploading', progress: 0 } : u
            ))

            try {
                // Upload
                setUploads(prev => prev.map(u => 
                    u.id === uploadItem.id ? { ...u, progress: 50, status: 'processing' } : u
                ))

                // Get the latest session to ensure we have the token
                const { data: { session } } = await supabase.auth.getSession()
                const { statementId } = await uploadStatement(uploadItem.file, session?.access_token)

                // Success
                setUploads(prev => prev.map(u => 
                    u.id === uploadItem.id ? { 
                        ...u, 
                        status: 'complete', 
                        progress: 100, 
                        statementId 
                    } : u
                ))

            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : 'Upload failed'
                setUploads(prev => prev.map(u => 
                    u.id === uploadItem.id ? { ...u, status: 'error', error: errorMsg } : u
                ))
            }
        }

        setIsUploading(false)
    }, [])

    return {
        upload,
        uploads,
        isUploading,
        reset,
    }
}
