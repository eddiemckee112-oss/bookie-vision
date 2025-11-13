import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SquareRequest {
  type: 'payments' | 'deposits' | 'loan';
  csv: string;
  org_id: string;
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

    const { type, csv, org_id } = await req.json() as SquareRequest;

    console.log(`Processing Square ${type} CSV for org ${org_id}`);

    const lines = csv.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file is empty or invalid');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = parseCSVLine(line);
      const obj: any = {};
      headers.forEach((header, i) => {
        obj[header] = values[i] || '';
      });
      return obj;
    });

    let imported = 0;
    let duplicates = 0;

    if (type === 'payments') {
      const result = await processPayments(supabaseClient, rows, org_id);
      imported = result.imported;
      duplicates = result.duplicates;
    } else if (type === 'deposits') {
      const result = await processDeposits(supabaseClient, rows, org_id);
      imported = result.imported;
      duplicates = result.duplicates;
    } else if (type === 'loan') {
      const result = await processLoan(supabaseClient, rows, org_id);
      imported = result.imported;
    }

    return new Response(
      JSON.stringify({ imported, duplicates }),
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
      inQuotes = !inQuotes;
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

async function processPayments(supabaseClient: any, rows: any[], org_id: string) {
  let imported = 0;
  let duplicates = 0;

  for (const row of rows) {
    try {
      // Extract common Square payment fields (adjust based on actual CSV format)
      const date = row['Date'] || row['date'] || row['Transaction Date'];
      const amount = parseFloat(row['Net Total'] || row['Net Amount'] || row['Amount'] || '0');
      const fees = parseFloat(row['Fees'] || row['Fee'] || row['Processing Fee'] || '0');
      const description = row['Description'] || row['Notes'] || 'Square Payment';

      if (!date || amount === 0) continue;

      // Create a unique hash to prevent duplicates
      const txnHash = `square-payment-${date}-${amount}-${org_id}`;

      // Check for existing transaction
      const { data: existing } = await supabaseClient
        .from('transactions')
        .select('id')
        .eq('txn_hash', txnHash)
        .eq('org_id', org_id)
        .maybeSingle();

      if (existing) {
        duplicates++;
        continue;
      }

      // Insert net payment transaction
      await supabaseClient
        .from('transactions')
        .insert({
          org_id,
          txn_date: date,
          post_date: date,
          description: description,
          amount: amount,
          direction: amount >= 0 ? 'credit' : 'debit',
          institution: 'Square',
          source_account_name: 'Square Payments',
          category: amount >= 0 ? 'Income' : 'Expense',
          imported_via: 'csv',
          imported_from: 'square_payments',
          txn_hash: txnHash,
        });

      // If there are fees, create a separate fee transaction
      if (fees && fees !== 0) {
        const feeHash = `square-fee-${date}-${fees}-${org_id}`;
        await supabaseClient
          .from('transactions')
          .insert({
            org_id,
            txn_date: date,
            post_date: date,
            description: 'Square Processing Fee',
            amount: -Math.abs(fees),
            direction: 'debit',
            institution: 'Square',
            source_account_name: 'Square Fees',
            category: 'Bank Fees',
            imported_via: 'csv',
            imported_from: 'square_payments',
            txn_hash: feeHash,
          });
      }

      imported++;
    } catch (error) {
      console.error('Error processing payment row:', error, row);
    }
  }

  return { imported, duplicates };
}

async function processDeposits(supabaseClient: any, rows: any[], org_id: string) {
  let imported = 0;
  let duplicates = 0;

  for (const row of rows) {
    try {
      const date = row['Date'] || row['Deposit Date'] || row['Transfer Date'];
      const amount = parseFloat(row['Net'] || row['Amount'] || row['Deposit Amount'] || '0');
      const description = row['Description'] || 'Square Payout';

      if (!date || amount === 0) continue;

      const txnHash = `square-deposit-${date}-${amount}-${org_id}`;

      // Check for duplicate (either from Square or from bank import)
      const { data: existing } = await supabaseClient
        .from('transactions')
        .select('id')
        .eq('org_id', org_id)
        .eq('txn_date', date)
        .eq('direction', 'credit')
        .gte('amount', amount * 0.99)
        .lte('amount', amount * 1.01)
        .or(`institution.eq.Square,description.ilike.%square%`)
        .maybeSingle();

      if (existing) {
        duplicates++;
        console.log(`Duplicate deposit found: ${date} ${amount}`);
        continue;
      }

      await supabaseClient
        .from('transactions')
        .insert({
          org_id,
          txn_date: date,
          post_date: date,
          description: description,
          amount: amount,
          direction: 'credit',
          institution: 'Square',
          source_account_name: 'Square Payout',
          category: 'Income',
          imported_via: 'csv',
          imported_from: 'square_deposits',
          txn_hash: txnHash,
        });

      imported++;
    } catch (error) {
      console.error('Error processing deposit row:', error, row);
    }
  }

  return { imported, duplicates };
}

async function processLoan(supabaseClient: any, rows: any[], org_id: string) {
  let imported = 0;

  for (const row of rows) {
    try {
      const date = row['Date'] || row['Payment Date'] || row['Repayment Date'];
      const amount = parseFloat(row['Amount'] || row['Payment Amount'] || row['Repayment'] || '0');
      const description = row['Description'] || 'Square Loan Repayment';

      if (!date || amount === 0) continue;

      const txnHash = `square-loan-${date}-${amount}-${org_id}`;

      const { data: existing } = await supabaseClient
        .from('transactions')
        .select('id')
        .eq('txn_hash', txnHash)
        .eq('org_id', org_id)
        .maybeSingle();

      if (existing) continue;

      await supabaseClient
        .from('transactions')
        .insert({
          org_id,
          txn_date: date,
          post_date: date,
          description: description,
          amount: -Math.abs(amount),
          direction: 'debit',
          institution: 'Square Loan',
          source_account_name: 'Square Capital',
          category: 'Loan Repayment',
          imported_via: 'csv',
          imported_from: 'square_loan',
          txn_hash: txnHash,
        });

      imported++;
    } catch (error) {
      console.error('Error processing loan row:', error, row);
    }
  }

  return { imported };
}
