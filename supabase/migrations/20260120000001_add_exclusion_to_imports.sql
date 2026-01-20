alter table transaction_imports 
add column is_excluded boolean default false,
add column exclusion_reason text;
