-- Create square_loans table for tracking Square Capital loans
CREATE TABLE IF NOT EXISTS public.square_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  loan_id text NOT NULL,
  principal numeric NOT NULL DEFAULT 0,
  outstanding_balance numeric NOT NULL DEFAULT 0,
  interest_paid numeric NOT NULL DEFAULT 0,
  total_repayments numeric NOT NULL DEFAULT 0,
  start_date date,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, loan_id)
);

-- Enable RLS
ALTER TABLE public.square_loans ENABLE ROW LEVEL SECURITY;

-- RLS policies for square_loans
CREATE POLICY "Org members can view square_loans"
ON public.square_loans FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.org_users
    WHERE org_users.org_id = square_loans.org_id
    AND org_users.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can manage square_loans"
ON public.square_loans FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.org_users
    WHERE org_users.org_id = square_loans.org_id
    AND org_users.user_id = auth.uid()
  )
);

-- Add square_account_id to accounts table for mapping
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS square_account_type text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_square_loans_org_id ON public.square_loans(org_id);
CREATE INDEX IF NOT EXISTS idx_square_loans_loan_id ON public.square_loans(loan_id);
CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON public.transactions(external_id) WHERE external_id IS NOT NULL;