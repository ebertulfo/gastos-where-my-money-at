'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import type { HouseholdMember } from '@/lib/supabase/database.types'

export type CreateHouseholdMemberInput = {
    name: string
    color?: string | null
}

// Pages that read the member list. Kept here so revalidation after every
// mutation hits the same set.
const MEMBER_REVALIDATE_PATHS = ['/upload', '/transactions', '/insights', '/statements'] as const

function revalidateMemberSurfaces() {
    for (const path of MEMBER_REVALIDATE_PATHS) revalidatePath(path)
}

export async function getHouseholdMembers(): Promise<HouseholdMember[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('household_members')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('Error fetching household members:', error)
        return []
    }

    return (data ?? []) as HouseholdMember[]
}

export async function createHouseholdMember(
    input: CreateHouseholdMemberInput,
): Promise<HouseholdMember> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const name = input.name.trim()
    if (!name) throw new Error('Member name is required')

    const { data, error } = await supabase
        .from('household_members')
        .insert({
            name,
            color: input.color ?? null,
            user_id: user.id,
        } as any)
        .select()
        .single()

    if (error) {
        if (error.message?.includes('duplicate key') || error.code === '23505') {
            throw new Error(`A member named "${name}" already exists`)
        }
        console.error('Error creating household member:', error)
        throw new Error(error.message)
    }

    revalidateMemberSurfaces()
    return data as HouseholdMember
}

// Idempotent variant used during onboarding seeding. Returns the existing
// row when the name is already taken instead of throwing.
export async function ensureHouseholdMember(
    input: CreateHouseholdMemberInput,
): Promise<HouseholdMember | null> {
    try {
        return await createHouseholdMember(input)
    } catch (e: any) {
        if (e?.message?.includes('already exists')) {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return null
            const { data } = await supabase
                .from('household_members')
                .select('*')
                .eq('user_id', user.id)
                .ilike('name', input.name.trim())
                .maybeSingle()
            return (data as HouseholdMember | null) ?? null
        }
        throw e
    }
}
