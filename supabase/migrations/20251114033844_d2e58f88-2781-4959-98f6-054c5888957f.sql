-- Add validation constraints to receipts table for security

-- Vendor name length constraint
ALTER TABLE public.receipts 
  ADD CONSTRAINT receipts_vendor_length CHECK (length(vendor) <= 200);

-- Notes length constraint  
ALTER TABLE public.receipts 
  ADD CONSTRAINT receipts_notes_length CHECK (notes IS NULL OR length(notes) <= 2000);

-- Category length constraint
ALTER TABLE public.receipts 
  ADD CONSTRAINT receipts_category_length CHECK (category IS NULL OR length(category) <= 100);

-- Total amount validation (positive and reasonable)
ALTER TABLE public.receipts 
  ADD CONSTRAINT receipts_total_positive CHECK (total > 0 AND total < 10000000);

-- Tax validation (non-negative and reasonable)
ALTER TABLE public.receipts 
  ADD CONSTRAINT receipts_tax_valid CHECK (tax >= 0 AND tax < 1000000);

-- Subtotal validation (non-negative and reasonable)
ALTER TABLE public.receipts 
  ADD CONSTRAINT receipts_subtotal_valid CHECK (subtotal IS NULL OR (subtotal >= 0 AND subtotal < 10000000));

-- Receipt date validation (reasonable date range)
ALTER TABLE public.receipts 
  ADD CONSTRAINT receipts_date_valid CHECK (
    receipt_date >= '2000-01-01' 
    AND receipt_date <= CURRENT_DATE + INTERVAL '1 year'
  );

-- Source field length constraint
ALTER TABLE public.receipts 
  ADD CONSTRAINT receipts_source_length CHECK (source IS NULL OR length(source) <= 100);

-- Vendor cannot be empty after trimming
ALTER TABLE public.receipts 
  ADD CONSTRAINT receipts_vendor_not_empty CHECK (length(trim(vendor)) > 0);
