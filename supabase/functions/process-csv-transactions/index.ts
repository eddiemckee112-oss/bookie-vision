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

    const { csvContent, orgId, accountId } = await req.json();

    if (!csvContent || !orgId) {
      throw new Error("Missing required parameters");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Parse CSV
    const lines = csvContent.split("\n").filter((line: string) => line.trim());
    const headers = lines[0].split(",").map((h: string) => h.trim().toLowerCase());
    
    console.log("CSV Headers:", headers);

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
            content: `Parse this CSV data and extract transactions. Return structured data with proper categorization.\n\nCSV Data:\n${csvContent}`
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

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseKey);

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
      imported_via: "csv_ai",
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
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});