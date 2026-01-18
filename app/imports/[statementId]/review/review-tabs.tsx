'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface PendingStatement {
    id: string
    bankName: string
    transactionCount: number
    status: string
}

interface ReviewTabsProps {
    currentStatementId: string
    pendingStatements: PendingStatement[]
}

export function ReviewTabs({ currentStatementId, pendingStatements }: ReviewTabsProps) {
    const pathname = usePathname()

    // If no other statements, don't show tabs? Or show single tab?
    // Better to show at least the current one to give context of "Files to Review"

    if (pendingStatements.length === 0) return null

    return (
        <div className="border-b mb-8 overflow-x-auto">
            <div className="flex items-center gap-2">
                {pendingStatements.map((stmt) => {
                    const isActive = stmt.id === currentStatementId
                    return (
                        <Link
                            key={stmt.id}
                            href={`/imports/${stmt.id}/review`}
                            className={cn(
                                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                                isActive
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                            )}
                        >
                            {stmt.bankName}
                            {/* We could show a badge if we had the count, but let's keep it clean for now */}
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
