-- Create user role enum
CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'staff');

-- Create organizations table
CREATE TABLE public.orgs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

-- Create accounts table
CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type = ANY (ARRAY['bank'::text, 'credit'::text, 'cash'::text])),
  currency TEXT DEFAULT 'CAD'::text,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- Create receipts table
CREATE TABLE public.receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id),
  image_url TEXT,
  size_bytes BIGINT DEFAULT 0,
  receipt_date DATE,
  total NUMERIC NOT NULL,
  tax NUMERIC NOT NULL DEFAULT 0.00,
  subtotal NUMERIC GENERATED ALWAYS AS (total - tax) STORED,
  category TEXT,
  vendor TEXT,
  source TEXT,
  notes TEXT,
  entered_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  reconciled BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id),
  txn_date DATE NOT NULL,
  post_date DATE,
  description TEXT NOT NULL,
  vendor_clean TEXT,
  amount NUMERIC NOT NULL,
  direction TEXT NOT NULL CHECK (direction = ANY (ARRAY['debit'::text, 'credit'::text])),
  currency TEXT DEFAULT 'CAD'::text,
  generic_descriptor BOOLEAN DEFAULT false,
  raw JSONB,
  txn_hash TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  imported_from TEXT,
  csv_row INTEGER,
  institution TEXT,
  external_id TEXT,
  source_account_name TEXT,
  imported_via TEXT DEFAULT 'manual'::text,
  provider_raw JSONB,
  category TEXT
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Create matches table
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  receipt_id UUID REFERENCES public.receipts(id) ON DELETE CASCADE,
  matched_amount NUMERIC NOT NULL,
  confidence NUMERIC,
  method TEXT,
  match_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Create org_users table (for role management)
CREATE TABLE public.org_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'staff'::user_role,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE public.org_users ENABLE ROW LEVEL SECURITY;

-- Create org_invites table
CREATE TABLE public.org_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  role user_role NOT NULL DEFAULT 'staff'::user_role,
  status TEXT DEFAULT 'pending'::text CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

-- Create rules table
CREATE TABLE public.rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  match_pattern TEXT NOT NULL,
  vendor_normalized TEXT,
  default_category TEXT,
  account_id UUID REFERENCES public.accounts(id),
  recurring_amount NUMERIC,
  recurring_day_window INTEGER,
  enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100
);

ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;

-- Create vendor_rules table
CREATE TABLE public.vendor_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  vendor_pattern TEXT NOT NULL,
  category TEXT,
  source TEXT,
  tax NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  direction_filter TEXT CHECK (direction_filter = ANY (ARRAY['debit'::text, 'credit'::text])),
  auto_match BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.vendor_rules ENABLE ROW LEVEL SECURITY;

-- Create receipt_txn_links table
CREATE TABLE public.receipt_txn_links (
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'strict_v1'::text,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT 'sql'::text,
  PRIMARY KEY (receipt_id, transaction_id)
);

ALTER TABLE public.receipt_txn_links ENABLE ROW LEVEL SECURITY;

-- Create archive_manifests table
CREATE TABLE public.archive_manifests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  period_label TEXT GENERATED ALWAYS AS (lpad(year::text, 4, '0') || '-' || lpad(month::text, 2, '0')) STORED,
  total_receipts INTEGER NOT NULL,
  total_size_bytes BIGINT NOT NULL,
  zip_path TEXT NOT NULL,
  zip_size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.archive_manifests ENABLE ROW LEVEL SECURITY;

-- Create storage bucket for receipts
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Helper function to check user role in org (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_role_in_org(_user_id UUID, _org_id UUID)
RETURNS user_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.org_users
  WHERE user_id = _user_id AND org_id = _org_id
  LIMIT 1;
$$;

-- Helper function to check if user has minimum role
CREATE OR REPLACE FUNCTION public.has_min_role(_user_id UUID, _org_id UUID, _min_role user_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN _min_role = 'staff' THEN role IN ('staff', 'admin', 'owner')
    WHEN _min_role = 'admin' THEN role IN ('admin', 'owner')
    WHEN _min_role = 'owner' THEN role = 'owner'
    ELSE false
  END
  FROM public.org_users
  WHERE user_id = _user_id AND org_id = _org_id
  LIMIT 1;
$$;

-- RLS Policies for orgs
CREATE POLICY "Users can view their orgs"
  ON public.orgs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = orgs.id
      AND org_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update their orgs"
  ON public.orgs FOR UPDATE
  USING (public.has_min_role(auth.uid(), id, 'owner'));

CREATE POLICY "Authenticated users can create orgs"
  ON public.orgs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Owners can delete their orgs"
  ON public.orgs FOR DELETE
  USING (public.has_min_role(auth.uid(), id, 'owner'));

-- RLS Policies for org_users
CREATE POLICY "Users can view org members"
  ON public.org_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.org_id = org_users.org_id
      AND ou.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can add org members"
  ON public.org_users FOR INSERT
  WITH CHECK (public.has_min_role(auth.uid(), org_id, 'admin'));

CREATE POLICY "Admins can update org members"
  ON public.org_users FOR UPDATE
  USING (public.has_min_role(auth.uid(), org_id, 'admin'));

CREATE POLICY "Owners can delete org members"
  ON public.org_users FOR DELETE
  USING (public.has_min_role(auth.uid(), org_id, 'owner'));

-- RLS Policies for org_invites
CREATE POLICY "Users can view org invites"
  ON public.org_invites FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR public.has_min_role(auth.uid(), org_id, 'admin')
  );

CREATE POLICY "Admins can create invites"
  ON public.org_invites FOR INSERT
  WITH CHECK (public.has_min_role(auth.uid(), org_id, 'admin'));

CREATE POLICY "Users can update their invites"
  ON public.org_invites FOR UPDATE
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- RLS Policies for accounts
CREATE POLICY "Org members can view accounts"
  ON public.accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = accounts.org_id
      AND org_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage accounts"
  ON public.accounts FOR ALL
  USING (public.has_min_role(auth.uid(), org_id, 'admin'));

-- RLS Policies for receipts
CREATE POLICY "Org members can view receipts"
  ON public.receipts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = receipts.org_id
      AND org_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create receipts"
  ON public.receipts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = receipts.org_id
      AND org_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update receipts"
  ON public.receipts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = receipts.org_id
      AND org_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can delete receipts"
  ON public.receipts FOR DELETE
  USING (public.has_min_role(auth.uid(), org_id, 'admin'));

-- RLS Policies for transactions
CREATE POLICY "Org members can view transactions"
  ON public.transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = transactions.org_id
      AND org_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = transactions.org_id
      AND org_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update transactions"
  ON public.transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = transactions.org_id
      AND org_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can delete transactions"
  ON public.transactions FOR DELETE
  USING (public.has_min_role(auth.uid(), org_id, 'admin'));

-- RLS Policies for matches
CREATE POLICY "Org members can view matches"
  ON public.matches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = matches.org_id
      AND org_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can manage matches"
  ON public.matches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = matches.org_id
      AND org_users.user_id = auth.uid()
    )
  );

-- RLS Policies for rules
CREATE POLICY "Org members can view rules"
  ON public.rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = rules.org_id
      AND org_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage rules"
  ON public.rules FOR ALL
  USING (public.has_min_role(auth.uid(), org_id, 'admin'));

-- RLS Policies for vendor_rules
CREATE POLICY "Org members can view vendor_rules"
  ON public.vendor_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = vendor_rules.org_id
      AND org_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage vendor_rules"
  ON public.vendor_rules FOR ALL
  USING (public.has_min_role(auth.uid(), org_id, 'admin'));

-- RLS Policies for receipt_txn_links
CREATE POLICY "Org members can view links"
  ON public.receipt_txn_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.receipts r
      JOIN public.org_users ou ON ou.org_id = r.org_id
      WHERE r.id = receipt_txn_links.receipt_id
      AND ou.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can manage links"
  ON public.receipt_txn_links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.receipts r
      JOIN public.org_users ou ON ou.org_id = r.org_id
      WHERE r.id = receipt_txn_links.receipt_id
      AND ou.user_id = auth.uid()
    )
  );

-- RLS Policies for archive_manifests
CREATE POLICY "Org members can view archives"
  ON public.archive_manifests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_users
      WHERE org_users.org_id = archive_manifests.org_id
      AND org_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage archives"
  ON public.archive_manifests FOR ALL
  USING (public.has_min_role(auth.uid(), org_id, 'admin'));

-- Storage policies for receipts bucket
CREATE POLICY "Org members can view receipt images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts' AND
    EXISTS (
      SELECT 1 FROM public.receipts r
      JOIN public.org_users ou ON ou.org_id = r.org_id
      WHERE r.image_url = storage.objects.name
      AND ou.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can upload receipt images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'receipts' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete receipt images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'receipts' AND auth.uid() IS NOT NULL);