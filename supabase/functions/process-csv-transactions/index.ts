import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { csvContent, orgId, accountId, accountName } = await req.json();

    if (!csvContent || !orgId) {
      throw new Error("Missing required parameters");
    }

    // Validate CSV size (max 5MB)
    const csvSizeBytes = new TextEncoder().encode(csvContent).length;
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB
    if (csvSizeBytes > maxSizeBytes) {
      return new Response(
        JSON.stringify({ error: "CSV file too large. Maximum size is 5MB." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Parse and validate CSV structure
    const lines = csvContent.split("\n").filter((line: string) => line.trim());
    
    if (lines.length === 0) {
      return new Response(
        JSON.stringify({ error: "CSV file is empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate row count (max 1000 rows)
    const maxRows = 1000;
    if (lines.length > maxRows + 1) { // +1 for header
      return new Response(
        JSON.stringify({ error: `CSV has too many rows. Maximum is ${maxRows} transactions.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize CSV content to prevent formula injection
    const sanitizeCell = (cell: string): string => {
      const trimmed = cell.trim();
      // Remove leading characters that could indicate formulas
      if (trimmed.length > 0 && ['=', '+', '-', '@', '\t', '\r'].includes(trimmed[0])) {
        return "'" + trimmed; // Prefix with single quote to neutralize
      }
      return trimmed;
    };

    const sanitizedLines = lines.map(line => {
      return line.split(',').map(sanitizeCell).join(',');
    });
    const sanitizedCsvContent = sanitizedLines.join('\n');
    
    const headers = sanitizedLines[0].split(",").map((h: string) => h.trim().toLowerCase());
    
    console.log("CSV Headers:", headers);
    console.log("CSV rows:", lines.length - 1);

    // Call AI to categorize transactions
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a financial transaction categorization assistant. Extract and categorize bank transactions from CSV data."
          },
          {
            role: "user",
            content: `Parse this CSV data and extract transactions. Return structured data with proper categorization.\n\nCSV Data:\n${sanitizedCsvContent}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_transactions",
              description: "Parse and categorize bank transactions from CSV",
              parameters: {
                type: "object",
                properties: {
                  transactions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string", description: "Transaction date in YYYY-MM-DD format" },
                        description: { type: "string", description: "Transaction description" },
                        amount: { type: "number", description: "Transaction amount (positive for credits, negative for debits)" },
                        category: { type: "string", description: "Transaction category (e.g., Food & Beverage, Travel, Office Supplies)" },
                        vendor: { type: "string", description: "Cleaned vendor name if identifiable" }
                      },
                      required: ["date", "description", "amount"]
                    }
                  }
                },
                required: ["transactions"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "parse_transactions" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI processing failed:", response.status, errorText);
      throw new Error(`AI processing failed: ${response.status}`);
    }

    const aiResponse = await response.json();
    const toolCall = aiResponse.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No structured data returned from AI");
    }

    const parsedData = JSON.parse(toolCall.function.arguments);
    console.log("Parsed transactions:", parsedData.transactions.length);

    // Initialize Supabase client with service role for inserting
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Use accountName from request body, or fetch from DB as fallback
    let finalAccountName = accountName;
    if (!finalAccountName && accountId) {
      const { data: accountData } = await supabase
        .from("accounts")
        .select("name")
        .eq("id", accountId)
        .single();
      finalAccountName = accountData?.name;
    }

    // Insert transactions
    const transactionsToInsert = parsedData.transactions.map((txn: any) => ({
      org_id: orgId,
      account_id: accountId || null,
      txn_date: txn.date,
      description: txn.description,
      amount: Math.abs(txn.amount),
      direction: txn.amount >= 0 ? "credit" : "debit",
      category: txn.category || null,
      vendor_clean: txn.vendor || null,
      source_account_name: finalAccountName || "CSV Import",
      imported_via: "csv",
      imported_from: "lovable_upload"
    }));

    const { data: insertedData, error: insertError } = await supabase
      .from("transactions")
      .insert(transactionsToInsert)
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw insertError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported: insertedData?.length || 0 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    // Log full error details server-side only
    console.error("Error processing CSV:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    // Return safe, generic error message to client
    return new Response(
      JSON.stringify({ 
        error: "Failed to process CSV transactions. Please check the file format and try again." 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});