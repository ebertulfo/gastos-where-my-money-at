'use client'

import { signInWithOtp, verifyOtp } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ArrowRight, Loader2, Mail } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner' // Using sonner now that we installed it

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [otp, setOtp] = useState('')
    const [step, setStep] = useState<'email' | 'otp'>('email')
    const [isLoading, setIsLoading] = useState(false)
    const [countdown, setCountdown] = useState(0)
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    // Clear timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [])

    function startCountdown() {
        setCountdown(60)
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    if (timerRef.current) clearInterval(timerRef.current)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }

    async function handleEmailSubmit(e?: React.FormEvent) {
        if (e) e.preventDefault()
        setIsLoading(true)
        try {
            const { error } = await signInWithOtp(email)
            if (error) throw error
            setStep('otp')
            startCountdown()
            toast.success('Check your email for the code!')
        } catch (error) {
            console.error(error)
            // Using alert variant for error via toast
            toast.error('Failed to send code: ' + (error as Error).message)
        } finally {
            setIsLoading(false)
        }
    }

    async function handleOtpSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsLoading(true)
        try {
            const { error } = await verifyOtp(email, otp)
            if (error) throw error
            // Redirect handled by server action
        } catch (error) {
            console.error(error)
            toast.error('Invalid code: ' + (error as Error).message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">
                        {step === 'email' ? 'Welcome back' : 'Check your inbox'}
                    </CardTitle>
                    <CardDescription>
                        {step === 'email'
                            ? 'Enter your email to sign in or create an account'
                            : `We've sent a 6-digit code to ${email}`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {step === 'email' ? (
                        <form onSubmit={handleEmailSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email address</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="name@example.com"
                                        className="pl-9"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Send Code
                                {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleOtpSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="otp">Enter code</Label>
                                <Input
                                    id="otp"
                                    type="text"
                                    placeholder="123456"
                                    className="text-center text-lg tracking-widest"
                                    maxLength={6}
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    required
                                    disabled={isLoading}
                                    autoFocus
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Verify & Sign In
                            </Button>

                            <div className="flex flex-col gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-full"
                                    onClick={() => handleEmailSubmit()}
                                    disabled={isLoading || countdown > 0}
                                >
                                    {countdown > 0 ? `Resend code (${countdown}s)` : 'Resend code'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="link"
                                    className="w-full text-zinc-500"
                                    onClick={() => setStep('email')}
                                    disabled={isLoading}
                                >
                                    Use a different email
                                </Button>
                            </div>
                        </form>
                    )}

                    <Separator className="my-6" />

                    <div className="flex justify-center">
                        <Button variant="link" asChild className="text-xs text-muted-foreground">
                            <Link href="/">Back to home</Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
