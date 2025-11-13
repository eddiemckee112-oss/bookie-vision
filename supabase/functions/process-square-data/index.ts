import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SquareRequest {
  type: 'payments' | 'deposits' | 'loan';
  csv: string;
  org_id: string;
  account_id?: string;
}

interface ProcessResult {
  imported: number;
  duplicates: number;
  skipped: number;
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { type, csv, org_id, account_id } = await req.json() as SquareRequest;

    console.log(`Processing Square ${type} CSV for org ${org_id}`);

    const lines = csv.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file is empty or invalid');
    }

    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const values = parseCSVLine(line);
      const obj: any = {};
      headers.forEach((header, i) => {
        obj[header] = values[i] || '';
      });
      return obj;
    });

    let result: ProcessResult;

    if (type === 'payments') {
      result = await processPayments(supabaseClient, rows, org_id, account_id);
    } else if (type === 'deposits') {
      result = await processDeposits(supabaseClient, rows, org_id, account_id);
    } else if (type === 'loan') {
      result = await processLoan(supabaseClient, rows, org_id, account_id);
    } else {
      throw new Error('Invalid type');
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing Square data:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseAmount(value: string): number {
  if (!value) return 0;
  return parseFloat(value.replace(/[$,]/g, '')) || 0;
}

function parseDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  try {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

async function autoMatch(supabaseClient: any, transaction_id: string, txn_date: string, amount: number, org_id: string) {
  try {
    const dateObj = new Date(txn_date);
    const minDate = new Date(dateObj);
    minDate.setDate(minDate.getDate() - 5);
    const maxDate = new Date(dateObj);
    maxDate.setDate(maxDate.getDate() + 5);

    const { data: receipts } = await supabaseClient
      .from('receipts')
      .select('id, total, receipt_date')
      .eq('org_id', org_id)
      .gte('receipt_date', minDate.toISOString().split('T')[0])
      .lte('receipt_date', maxDate.toISOString().split('T')[0])
      .gte('total', Math.abs(amount) - 0.01)
      .lte('total', Math.abs(amount) + 0.01);

    if (receipts && receipts.length > 0) {
      const { data: existingMatch } = await supabaseClient
        .from('matches')
        .select('id')
        .eq('transaction_id', transaction_id)
        .maybeSingle();

      if (!existingMatch) {
        await supabaseClient
          .from('matches')
          .insert({
            transaction_id,
            receipt_id: receipts[0].id,
            matched_amount: Math.abs(amount),
            org_id,
            method: 'auto',
            match_type: 'square_auto',
            confidence: 0.85
          });
        
        console.log(`Auto-matched transaction ${transaction_id} to receipt ${receipts[0].id}`);
      }
    }
  } catch (error) {
    console.error('Auto-match error:', error);
  }
}

async function processPayments(supabaseClient: any, rows: any[], org_id: string, account_id?: string): Promise<ProcessResult> {
  let imported = 0;
  let duplicates = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const paymentId = row['Payment ID'] || row['payment_id'] || '';
      const date = parseDate(row['Date'] || row['date'] || row['Transaction Date'] || row['Created At']);
      const grossAmount = parseAmount(row['Gross Sales'] || row['Amount'] || '0');
      const netAmount = parseAmount(row['Net Total'] || row['Net Amount'] || '0');
      const fees = parseAmount(row['Fees'] || row['Fee'] || row['Processing Fee'] || '0');
      const tip = parseAmount(row['Tip'] || row['Tips'] || '0');
      const refundAmount = parseAmount(row['Refunded Amount'] || row['Refund'] || '0');
      const tax = parseAmount(row['Tax'] || '0');
      const description = row['Description'] || row['Details'] || row['Notes'] || 'Square Payment';
      const paymentMethod = row['Card Brand'] || row['Payment Method'] || row['Tender Type'] || 'Card';
      const customerName = row['Customer Name'] || row['Customer'] || '';
      const cardLastFour = row['PAN Suffix'] || row['Card Last 4'] || '';

      if (!paymentId || netAmount === 0) {
        skipped++;
        continue;
      }

      const { data: existing } = await supabaseClient
        .from('transactions')
        .select('id')
        .eq('external_id', paymentId)
        .eq('org_id', org_id)
        .maybeSingle();

      if (existing) {
        duplicates++;
        continue;
      }

      const vendorName = customerName || `Square Sale ${cardLastFour ? `****${cardLastFour}` : ''}`;
      const { data: paymentTxn, error: paymentError } = await supabaseClient
        .from('transactions')
        .insert({
          org_id,
          account_id,
          txn_date: date,
          description: `${description} - Payment ${paymentId}`,
          amount: netAmount,
          direction: 'credit',
          category: 'Income',
          institution: 'Square',
          source_account_name: 'Square Payments',
          imported_via: 'square_csv',
          external_id: paymentId,
          vendor_clean: vendorName,
          raw: {
            payment_id: paymentId,
            payment_method: paymentMethod,
            gross_amount: grossAmount,
            net_amount: netAmount,
            tip: tip,
            tax: tax,
            refund: refundAmount,
            customer: customerName
          }
        })
        .select()
        .single();

      if (paymentError) {
        errors.push(`Payment ${paymentId}: ${paymentError.message}`);
        continue;
      }

      imported++;

      if (paymentTxn) {
        await autoMatch(supabaseClient, paymentTxn.id, date, netAmount, org_id);
      }

      if (fees > 0) {
        await supabaseClient
          .from('transactions')
          .insert({
            org_id,
            account_id,
            txn_date: date,
            description: `Square Processing Fee - ${paymentId}`,
            amount: -Math.abs(fees),
            direction: 'debit',
            category: 'Bank Fees',
            institution: 'Square',
            source_account_name: 'Square Payments',
            imported_via: 'square_csv',
            external_id: `${paymentId}-fee`,
            vendor_clean: 'Square',
          });
      }

    } catch (error) {
      errors.push(`Row error: ${error.message}`);
      skipped++;
    }
  }

  return { imported, duplicates, skipped, errors };
}

async function processDeposits(supabaseClient: any, rows: any[], org_id: string, account_id?: string): Promise<ProcessResult> {
  let imported = 0;
  let duplicates = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const depositId = row['Transfer ID'] || row['Deposit ID'] || row['transfer_id'] || '';
      const date = parseDate(row['Date'] || row['date'] || row['Deposit Date'] || row['Transfer Date']);
      const amount = parseAmount(row['Net'] || row['Amount'] || row['Net Amount'] || '0');
      const status = row['Status'] || row['status'] || 'completed';
      const description = row['Description'] || `Square Deposit ${depositId}`;

      if (!depositId || amount === 0) {
        skipped++;
        continue;
      }

      const { data: existing } = await supabaseClient
        .from('transactions')
        .select('id')
        .eq('external_id', depositId)
        .eq('org_id', org_id)
        .maybeSingle();

      if (existing) {
        duplicates++;
        continue;
      }

      const { error: depositError } = await supabaseClient
        .from('transactions')
        .insert({
          org_id,
          account_id,
          txn_date: date,
          description,
          amount: amount,
          direction: 'debit',
          category: 'Transfer',
          institution: 'Square',
          source_account_name: 'Square Deposits',
          imported_via: 'square_csv',
          external_id: depositId,
          vendor_clean: 'Square',
          raw: {
            deposit_id: depositId,
            status: status
          }
        });

      if (depositError) {
        errors.push(`Deposit ${depositId}: ${depositError.message}`);
        continue;
      }

      imported++;

    } catch (error) {
      errors.push(`Row error: ${error.message}`);
      skipped++;
    }
  }

  return { imported, duplicates, skipped, errors };
}

async function processLoan(supabaseClient: any, rows: any[], org_id: string, account_id?: string): Promise<ProcessResult> {
  let imported = 0;
  let duplicates = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const loanId = row['Loan ID'] || row['loan_id'] || row['ID'] || '';
      const repaymentId = row['Payment ID'] || row['Repayment ID'] || row['payment_id'] || '';
      const date = parseDate(row['Date'] || row['date'] || row['Payment Date'] || row['Repayment Date']);
      const repaymentAmount = parseAmount(row['Repayment Amount'] || row['Amount'] || row['Payment'] || '0');
      const principal = parseAmount(row['Principal'] || row['Loan Amount'] || '0');
      const interest = parseAmount(row['Interest'] || row['Fee'] || '0');
      const balance = parseAmount(row['Outstanding Balance'] || row['Balance'] || '0');

      if (!loanId || repaymentAmount === 0) {
        skipped++;
        continue;
      }

      const { data: existingLoan } = await supabaseClient
        .from('square_loans')
        .select('*')
        .eq('org_id', org_id)
        .eq('loan_id', loanId)
        .maybeSingle();

      if (existingLoan) {
        await supabaseClient
          .from('square_loans')
          .update({
            outstanding_balance: balance,
            interest_paid: existingLoan.interest_paid + interest,
            total_repayments: existingLoan.total_repayments + repaymentAmount,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingLoan.id);
      } else {
        await supabaseClient
          .from('square_loans')
          .insert({
            org_id,
            loan_id: loanId,
            principal: principal,
            outstanding_balance: balance,
            interest_paid: interest,
            total_repayments: repaymentAmount,
            start_date: date,
            status: balance > 0 ? 'active' : 'paid'
          });
      }

      const txnId = repaymentId || `${loanId}-${date}`;
      const { data: existingTxn } = await supabaseClient
        .from('transactions')
        .select('id')
        .eq('external_id', txnId)
        .eq('org_id', org_id)
        .maybeSingle();

      if (existingTxn) {
        duplicates++;
        continue;
      }

      const { error: txnError } = await supabaseClient
        .from('transactions')
        .insert({
          org_id,
          account_id,
          txn_date: date,
          description: `Square Capital Repayment - Loan ${loanId}`,
          amount: -Math.abs(repaymentAmount),
          direction: 'debit',
          category: 'Loan Repayment',
          institution: 'Square Capital',
          source_account_name: 'Square Loan',
          imported_via: 'square_csv',
          external_id: txnId,
          vendor_clean: 'Square Capital',
          raw: {
            loan_id: loanId,
            principal_payment: repaymentAmount - interest,
            interest_payment: interest,
            outstanding_balance: balance
          }
        });

      if (txnError) {
        errors.push(`Loan repayment ${txnId}: ${txnError.message}`);
        continue;
      }

      imported++;

    } catch (error) {
      errors.push(`Row error: ${error.message}`);
      skipped++;
    }
  }

  return { imported, duplicates, skipped, errors };
}
