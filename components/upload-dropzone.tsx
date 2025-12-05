'use client'

import { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Upload, FileText, X, AlertCircle } from 'lucide-react'

interface UploadDropzoneProps {
    onFileSelect: (file: File) => void
    isUploading?: boolean
    accept?: string
    maxSize?: number // in bytes
    className?: string
}

export function UploadDropzone({
    onFileSelect,
    isUploading = false,
    accept = '.pdf',
    maxSize = 5 * 1024 * 1024, // 5MB default
    className,
}: UploadDropzoneProps) {
    const [isDragging, setIsDragging] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const validateFile = useCallback((file: File): string | null => {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            return 'Only PDF files are supported right now.'
        }
        if (file.size > maxSize) {
            return `File is too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`
        }
        return null
    }, [maxSize])

    const handleFile = useCallback((file: File) => {
        const validationError = validateFile(file)
        if (validationError) {
            setError(validationError)
            setSelectedFile(null)
            return
        }
        setError(null)
        setSelectedFile(file)
        onFileSelect(file)
    }, [validateFile, onFileSelect])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const file = e.dataTransfer.files[0]
        if (file) {
            handleFile(file)
        }
    }, [handleFile])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }, [])

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            handleFile(file)
        }
    }, [handleFile])

    const clearSelection = useCallback(() => {
        setSelectedFile(null)
        setError(null)
        if (inputRef.current) {
            inputRef.current.value = ''
        }
    }, [])

    return (
        <Card
            className={cn(
                'relative border-2 border-dashed transition-all duration-200',
                isDragging && 'border-primary bg-primary/5',
                error && 'border-destructive',
                !isDragging && !error && 'border-border hover:border-muted-foreground/50',
                className
            )}
        >
            <div
                className="p-8 text-center"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                {selectedFile && !isUploading ? (
                    <div className="animate-fade-in">
                        <div className="flex items-center justify-center gap-3 mb-4">
                            <FileText className="h-10 w-10 text-primary" />
                            <div className="text-left">
                                <p className="font-medium text-foreground">{selectedFile.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    {(selectedFile.size / 1024).toFixed(1)} KB
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={clearSelection}
                                className="ml-2"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Ready to parse. Drop another file to replace.
                        </p>
                    </div>
                ) : (
                    <>
                        <Upload className={cn(
                            'mx-auto h-12 w-12 mb-4 transition-colors',
                            isDragging ? 'text-primary' : 'text-muted-foreground'
                        )} />
                        <p className="text-lg font-medium text-foreground mb-2">
                            {isDragging ? 'Drop your statement here' : 'Drag & drop PDF statements here'}
                        </p>
                        <p className="text-muted-foreground mb-4">or</p>
                        <Button
                            variant="secondary"
                            onClick={() => inputRef.current?.click()}
                            disabled={isUploading}
                        >
                            Choose files
                        </Button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept={accept}
                            onChange={handleInputChange}
                            className="hidden"
                            disabled={isUploading}
                        />
                        <p className="text-sm text-muted-foreground mt-4">
                            Supported: Bank & credit card statements (PDF)
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            We don't store your PDFs, only the extracted transactions.
                        </p>
                    </>
                )}

                {error && (
                    <div className="flex items-center justify-center gap-2 mt-4 text-destructive animate-fade-in">
                        <AlertCircle className="h-4 w-4" />
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {isUploading && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                            <span className="text-muted-foreground">Uploading...</span>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    )
}
