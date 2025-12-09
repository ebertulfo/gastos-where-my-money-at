import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { BarChart3, FileText, Home, Receipt, Settings, User } from 'lucide-react'
import Link from 'next/link'

export function NavHeader() {
    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 items-center">
                <div className="mr-4 flex">
                    <Link href="/" className="mr-6 flex items-center space-x-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                            G
                        </div>
                        <span className="font-semibold text-lg">Gastos</span>
                    </Link>
                    <nav className="flex items-center space-x-1 text-sm">
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/" className="flex items-center gap-2">
                                <Home className="h-4 w-4" />
                                Upload
                            </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/statements" className="flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Statements
                            </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/transactions" className="flex items-center gap-2">
                                <Receipt className="h-4 w-4" />
                                Transactions
                            </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/summary" className="flex items-center gap-2">
                                <BarChart3 className="h-4 w-4" />
                                Summary
                            </Link>
                        </Button>
                    </nav>
                </div>
                <div className="flex flex-1 items-center justify-end space-x-2">
                    <Button variant="ghost" size="icon" disabled>
                        <Settings className="h-4 w-4" />
                    </Button>
                    <Separator orientation="vertical" className="h-6" />
                    <Button variant="ghost" size="icon" disabled>
                        <User className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </header>
    )
}
