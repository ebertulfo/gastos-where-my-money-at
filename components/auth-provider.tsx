'use client'

import { supabase } from '@/lib/supabase/client'
import { useEffect } from 'react'

export function AuthProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const ensureSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                const { error } = await supabase.auth.signInAnonymously()
                if (error) {
                    console.error('Failed to sign in anonymously:', error)
                }
            }
        }

        ensureSession()

        // Set up listener for auth state changes (optional but good practice)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
             if (event === 'SIGNED_OUT' || !session) {
                 ensureSession()
             }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [])

    return <>{children}</>
}
