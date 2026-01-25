'use client'

import { supabase } from '@/lib/supabase/client'
import { useEffect } from 'react'

export function AuthProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const ensureSession = async () => {
             // Just check session, don't auto-login anonymously
             await supabase.auth.getSession()
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
