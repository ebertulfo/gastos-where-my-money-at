create table if not exists public.user_settings (
    user_id uuid not null references auth.users(id) on delete cascade primary key,
    currency text not null default 'SGD',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can view their own settings"
    on public.user_settings for select
    using (auth.uid() = user_id);

create policy "Users can update their own settings"
    on public.user_settings for update
    using (auth.uid() = user_id);

create policy "Users can insert their own settings"
    on public.user_settings for insert
    with check (auth.uid() = user_id);
