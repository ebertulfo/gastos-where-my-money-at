'use client'

import { completeOnboarding } from '@/app/actions/onboarding'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Loader2, PartyPopper } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

// Common countries mapping to currency
const COUNTRIES = [
    { code: 'SG', name: 'Singapore', currency: 'SGD', flag: '🇸🇬' },
    { code: 'US', name: 'United States', currency: 'USD', flag: '🇺🇸' },
    { code: 'GB', name: 'United Kingdom', currency: 'GBP', flag: '🇬🇧' },
    { code: 'EU', name: 'Europe', currency: 'EUR', flag: '🇪🇺' },
    { code: 'AU', name: 'Australia', currency: 'AUD', flag: '🇦🇺' },
    { code: 'MY', name: 'Malaysia', currency: 'MYR', flag: '🇲🇾' },
    { code: 'ID', name: 'Indonesia', currency: 'IDR', flag: '🇮🇩' },
    { code: 'PH', name: 'Philippines', currency: 'PHP', flag: '🇵🇭' },
    { code: 'TH', name: 'Thailand', currency: 'THB', flag: '🇹🇭' },
    { code: 'JP', name: 'Japan', currency: 'JPY', flag: '🇯🇵' },
]

type Step = 'welcome' | 'region' | 'success'

interface OnboardingWizardProps {
    open: boolean
    onFinish?: () => void
}

export function OnboardingWizard({ open, onFinish }: OnboardingWizardProps) {
    const router = useRouter()
    const [step, setStep] = React.useState<Step>('welcome')
    const [selectedCountry, setSelectedCountry] = React.useState<string>('SG')
    const [isSubmitting, setIsSubmitting] = React.useState(false)

    // Derived currency
    const currency = COUNTRIES.find(c => c.code === selectedCountry)?.currency || 'SGD'

    const handleNext = () => {
        if (step === 'welcome') setStep('region')
    }

    const handleComplete = async () => {
        setIsSubmitting(true)
        try {
            await completeOnboarding({
                currency,
                country: selectedCountry,
            })
            setStep('success')
        } catch (error) {
            console.error('Onboarding failed', error)
            setIsSubmitting(false)
        }
    }

    const handleFinish = () => {
        onFinish?.()
        router.refresh()
    }

    // Prevent closing by clicking outside
    return (
        <Dialog open={open}>
            <DialogContent className="sm:max-w-[425px] [&>button]:hidden"> {/* Hide close X */}
                {step === 'welcome' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-2xl text-center">Unfuck Your Finances</DialogTitle>
                            <DialogDescription className="text-center pt-2">
                                Welcome to Gastos! Let's get your workspace set up in less than a minute.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-6 flex justify-center">
                            <div className="text-6xl">💸</div>
                        </div>
                        <DialogFooter>
                            <Button className="w-full" onClick={handleNext}>Let's Go</Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'region' && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Where are you based?</DialogTitle>
                            <DialogDescription>
                                We'll set your primary currency and seed local
                                spending categories that match merchants you'll
                                actually see on statements.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-6">
                            <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select country" />
                                </SelectTrigger>
                                <SelectContent>
                                    {COUNTRIES.map((country) => (
                                        <SelectItem key={country.code} value={country.code}>
                                            <span className="mr-2">{country.flag}</span>
                                            {country.name} ({country.currency})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter>
                            <Button className="w-full" onClick={handleComplete} disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Setting up...
                                    </>
                                ) : (
                                    'Complete Setup'
                                )}
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'success' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-2xl text-center">You're all set!</DialogTitle>
                            <DialogDescription className="text-center pt-2">
                                Time to upload your first bank statement and see where your money is going.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-6 flex justify-center">
                            <PartyPopper className="h-16 w-16 text-yellow-500 animate-bounce" />
                        </div>
                        <DialogFooter>
                            <Button className="w-full" onClick={handleFinish}>Go to Dashboard</Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
