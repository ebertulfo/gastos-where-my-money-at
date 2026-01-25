'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getURL } from '@/lib/utils'

export async function signInWithOtp(email: string) {
    const supabase = await createClient()

    // Test Backdoor for E2E testing
    if (process.env.NODE_ENV !== 'production' && email.startsWith('test-')) {
        console.log('Using test bypass for sign in:', email)
        return { success: true }
    }

    // Assuming we want to support both Magic Link and OTP.
    // Specifying emailRedirectTo encourages Supabase to construct a link.
    const redirectUrl = `${getURL()}auth/callback`
    console.log('SignInWithOtp Redirect URL:', redirectUrl)
    
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            shouldCreateUser: true,
            emailRedirectTo: redirectUrl,
        },
    })

    if (error) {
        return { error: error.message }
    }

    return { success: true }
}

export async function verifyOtp(email: string, token: string) {
    const supabase = await createClient()

    // Test Backdoor for E2E testing
    if (process.env.NODE_ENV !== 'production' && email.startsWith('test-') && token === '111111') {
        console.log('Using test bypass for:', email)
        
        // 1. Try to sign in
        let { error } = await supabase.auth.signInWithPassword({
            email,
            password: 'password123',
        })

        // 2. If sign in fails, try to sign up
        if (error) {
            console.log('Test user login failed, attempting to create user...', error.message)
            const { error: signUpError } = await supabase.auth.signUp({
                 email,
                 password: 'password123',
                 options: {
                     data: { full_name: 'Test User' }
                 }
            })
            
            if (signUpError) {
                 console.error('Failed to create test user:', signUpError)
                 return { error: 'Test setup failed: ' + signUpError.message }
            }

            // 3. Retry sign in (to ensure session cookies are set on this request context)
            const res = await supabase.auth.signInWithPassword({
                email,
                password: 'password123',
            })
            error = res.error
        }

        if (error) {
            console.error('Test user login failed after creation attempt.', error)
            return { error: 'Test login failed: ' + error.message }
        }

        redirect('/upload')
    }

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
