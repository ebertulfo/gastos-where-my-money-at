'use client'

import { useAuth } from '@clerk/nextjs'
import { useState, useCallback } from 'react'

async function uploadStatement(
    file: File,
    memberIds: string[],
): Promise<{ statementId: string; isDuplicate?: boolean }> {
    const formData = new FormData()
    formData.append('file', file)
    for (const id of memberIds) {
        formData.append('member_ids', id)
    }

    // Clerk authenticates the request via session cookie automatically — no
    // bearer token needed since the API route uses auth() from @clerk/nextjs/server.
    const response = await fetch('/api/statements/ingest', {
        method: 'POST',
        body: formData,
    })

    if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to upload statement')
    }

    return response.json()
}

export interface UploadState {
    id: string
    file: File
    status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error'
    progress: number
    error?: string
    statementId?: string
}

interface UseStatementUploadReturn {
    upload: (files: File[], memberIds?: string[]) => Promise<void>
    uploads: UploadState[]
    isUploading: boolean
    reset: () => void
}

export function useStatementUpload(): UseStatementUploadReturn {
    const { isSignedIn } = useAuth()
    const [uploads, setUploads] = useState<UploadState[]>([])
    const [isUploading, setIsUploading] = useState(false)

    const reset = useCallback(() => {
        setUploads([])
        setIsUploading(false)
    }, [])

    const upload = useCallback(async (files: File[], memberIds: string[] = []) => {
        setIsUploading(true)

        if (!isSignedIn) {
            setUploads(prev => [...prev, ...files.map(f => ({
                id: Math.random().toString(36).substring(7),
                file: f,
                status: 'error' as const,
                progress: 0,
                error: 'You must be logged in to upload statements.',
            }))])
            setIsUploading(false)
            return
        }

        const newUploads = files.map(file => ({
            id: Math.random().toString(36).substring(7),
            file,
            status: 'pending' as const,
            progress: 0,
        }))

        setUploads(prev => [...prev, ...newUploads])

        for (const uploadItem of newUploads) {
            setUploads(prev => prev.map(u =>
                u.id === uploadItem.id ? { ...u, status: 'uploading', progress: 0 } : u,
            ))

            try {
                setUploads(prev => prev.map(u =>
                    u.id === uploadItem.id ? { ...u, progress: 50, status: 'processing' } : u,
                ))

                const { statementId } = await uploadStatement(uploadItem.file, memberIds)

                setUploads(prev => prev.map(u =>
                    u.id === uploadItem.id
                        ? { ...u, status: 'complete', progress: 100, statementId }
                        : u,
                ))
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : 'Upload failed'
                setUploads(prev => prev.map(u =>
                    u.id === uploadItem.id ? { ...u, status: 'error', error: errorMsg } : u,
                ))
            }
        }

        setIsUploading(false)
    }, [isSignedIn])

    return {
        upload,
        uploads,
        isUploading,
        reset,
    }
}
