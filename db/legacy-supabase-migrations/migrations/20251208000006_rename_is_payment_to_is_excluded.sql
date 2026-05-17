-- Rename is_payment to is_excluded
ALTER TABLE transactions 
RENAME COLUMN is_payment TO is_excluded;

-- Add exclusion_reason column
ALTER TABLE transactions
ADD COLUMN exclusion_reason text;

-- Policy adjustment if necessary (not needed as policies are usually row-level based on user_id, not specific columns, but good to check if existing policies referenced is_payment explicitly. They didn't in previous checks.)
