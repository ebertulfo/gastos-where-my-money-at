import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight, BarChart3, Lock, Upload } from 'lucide-react'
import Link from 'next/link'

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="px-6 h-16 flex items-center border-b">
                <div className="flex items-center gap-2 font-bold text-xl">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        G
                    </div>
                    Gastos
                </div>
                <div className="ml-auto">
                    <Button variant="ghost" asChild>
                        <Link href="/login">Log in</Link>
                    </Button>
                    <Button asChild className="ml-4">
                        <Link href="/login">Get Started</Link>
                    </Button>
                </div>
            </header>

            <main className="flex-1">
                {/* Hero Section */}
                <section className="py-24 px-6 text-center animate-fade-in">
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        Unfuck your finances.
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
                        Stop wondering where your money went. Upload your bank statements, categorize automatically, and get clear actionable insights.
                    </p>
                    <Button size="lg" className="h-12 px-8 text-lg" asChild>
                        <Link href="/login">
                            Start for free <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                    </Button>
                </section>

                {/* Features Grid */}
                <section className="py-12 px-6 bg-muted/30">
                    <div className="container max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
                        <Card className="border-none shadow-none bg-background/50">
                            <CardContent className="pt-6">
                                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary">
                                    <Upload className="h-6 w-6" />
                                </div>
                                <h3 className="text-xl font-bold mb-2">Statement Upload</h3>
                                <p className="text-muted-foreground">
                                    Drag and drop PDF statements from major banks. We parse them securely in seconds.
                                </p>
                            </CardContent>
                        </Card>
                        <Card className="border-none shadow-none bg-background/50">
                            <CardContent className="pt-6">
                                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary">
                                    <Lock className="h-6 w-6" />
                                </div>
                                <h3 className="text-xl font-bold mb-2">Private & Secure</h3>
                                <p className="text-muted-foreground">
                                    Your data belongs to you. We use Row Level Security to ensure only you can see your finances.
                                </p>
                            </CardContent>
                        </Card>
                        <Card className="border-none shadow-none bg-background/50">
                            <CardContent className="pt-6">
                                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary">
                                    <BarChart3 className="h-6 w-6" />
                                </div>
                                <h3 className="text-xl font-bold mb-2">Clear Insights</h3>
                                <p className="text-muted-foreground">
                                    Visualize your spending habits with intuitive charts and categorization.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </section>
            </main>

            <footer className="py-8 text-center text-sm text-muted-foreground border-t">
                <p>&copy; {new Date().getFullYear()} Gastos. All rights reserved.</p>
            </footer>
        </div>
    )
}
