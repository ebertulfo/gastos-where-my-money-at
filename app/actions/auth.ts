'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signInWithOtp(email: string) {
    const supabase = await createClient()

    // Assuming we want to support both Magic Link and OTP.
    // Specifying emailRedirectTo encourages Supabase to construct a link.
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            shouldCreateUser: true,
            emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
        },
    })

    if (error) {
        return { error: error.message }
    }

    return { success: true }
}

export async function verifyOtp(email: string, token: string) {
    const supabase = await createClient()

    // Try 'email' first (Magic Link / Login OTP)
    let { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
    })

    // If 'email' type failed, it might be a new user (Signup OTP)
    if (error) {
        const { error: signupError } = await supabase.auth.verifyOtp({
            email,
            token,
            type: 'signup',
        })

        // If 'signup' also failed, return the original error (or signup error)
        if (signupError) {
            console.error('Verify Error:', error.message, signupError.message)
            return { error: error.message }
        }
    }

    redirect('/upload')
}

export async function signOut() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/')
}
