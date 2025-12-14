import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type VendorRuleRow = {
  vendor_pattern: string;
  category: string | null;
  direction_filter: string | null;
};

type RuleRow = {
  match_pattern: string;
  default_category: string | null;
};

const isSquareIncome = (txn: { description: string; direction: string }) => {
  if (txn.direction !== "credit") return false;
  return /square/i.test(txn.description);
};

const pickCategory = (
  txn: { description: string; vendor_clean?: string | null; direction: string },
  vendorRules: VendorRuleRow[],
  rules: RuleRow[]
): string | null => {
  // 1) Square credits always Income (your rule)
  if (isSquareIncome(txn)) return "Income";

  // 2) vendor_rules first (most specific)
  for (const vr of vendorRules) {
    const pattern = new RegExp(vr.vendor_pattern, "i");
    const matchesVendor =
      pattern.test(txn.description) || (txn.vendor_clean ? pattern.test(txn.vendor_clean) : false);

    const matchesDirection = !vr.direction_filter || vr.direction_filter === txn.direction;

    if (matchesVendor && matchesDirection) return vr.category || null;
  }

  // 3) fallback rules table
  for (const r of rules) {
    const pattern = new RegExp(r.match_pattern, "i");
    const matchesVendor =
      pattern.test(txn.description) || (txn.vendor_clean ? pattern.test(txn.vendor_clean) : false);

    if (matchesVendor) return r.default_category || null;
  }

  return null;
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

    const { csvContent, orgId, accountId, accountName, institution, sourceAccountName } = await req.json();

    if (!csvContent || !orgId) {
      throw new Error("Missing required parameters");
    }

    // Validate CSV size (max 5MB)
    const csvSizeBytes = new TextEncoder().encode(csvContent).length;
    const maxSizeBytes = 5 * 1024 * 1024;
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
    if (lines.length > maxRows + 1) {
      return new Response(
        JSON.stringify({ error: `CSV has too many rows. Maximum is ${maxRows} transactions.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize CSV content (formula injection guard)
    const sanitizeCell = (cell: string): string => {
      const trimmed = cell.trim();
      if (trimmed.length > 0 && ["=", "+", "-", "@", "\t", "\r"].includes(trimmed[0])) {
        return "'" + trimmed;
      }
      return trimmed;
    };

    const sanitizedLines = lines.map((line) => line.split(",").map(sanitizeCell).join(","));
    const sanitizedCsvContent = sanitizedLines.join("\n");

    // Use AI ONLY to parse rows into date/desc/amount/vendor (not to “decide” your accounting categories)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Extract transactions from CSV. Return date (YYYY-MM-DD), description, amount (positive credit, negative debit), and vendor if possible. Do NOT invent categories.",
          },
          {
            role: "user",
            content: `Parse this CSV data and extract transactions.\n\nCSV Data:\n${sanitizedCsvContent}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_transactions",
              description: "Parse bank transactions from CSV",
              parameters: {
                type: "object",
                properties: {
                  transactions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string" },
                        description: { type: "string" },
                        amount: { type: "number" },
                        vendor: { type: "string" },
                      },
                      required: ["date", "description", "amount"],
                    },
                  },
                },
                required: ["transactions"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "parse_transactions" } },
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

    // Supabase service client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Load your rules ONCE
    const { data: vendorRulesRaw, error: vrErr } = await supabase
      .from("vendor_rules")
      .select("vendor_pattern, category, direction_filter")
      .eq("org_id", orgId);

    if (vrErr) throw vrErr;

    const { data: rulesRaw, error: rErr } = await supabase
      .from("rules")
      .select("match_pattern, default_category")
      .eq("org_id", orgId)
      .eq("enabled", true);

    if (rErr) throw rErr;

    const vendorRules = (vendorRulesRaw || []) as VendorRuleRow[];
    const rules = (rulesRaw || []) as RuleRow[];

    // Prefer UI-provided labels
    const finalInstitution = (institution || "").trim() || null;
    const finalSourceAccountName =
      (sourceAccountName || "").trim() ||
      (accountName || "").trim() ||
      "Bank CSV";

    // Insert transactions (category computed by YOUR RULES)
    const transactionsToInsert = (parsedData.transactions || []).map((txn: any) => {
      const direction = txn.amount >= 0 ? "credit" : "debit";
      const vendor_clean = txn.vendor || null;

      const categoryFromRules = pickCategory(
        { description: txn.description, vendor_clean, direction },
        vendorRules,
        rules
      );

      return {
        org_id: orgId,
        account_id: accountId || null,
        txn_date: txn.date,
        description: txn.description,
        amount: Math.abs(txn.amount),
        direction,
        category: categoryFromRules, // ✅ YOUR categories now
        vendor_clean,
        institution: finalInstitution,
        source_account_name: finalSourceAccountName, // ✅ never “CSV Import” again
        imported_via: "csv",
        imported_from: finalInstitution ? `${finalInstitution.toLowerCase()}_csv` : "bank_csv",
      };
    });

    const { data: insertedData, error: insertError } = await supabase
      .from("transactions")
      .insert(transactionsToInsert)
      .select("id, category");

    if (insertError) {
      console.error("Insert error:", insertError);
      throw insertError;
    }

    const categorized = (insertedData || []).filter((x) => x.category).length;

    return new Response(
      JSON.stringify({
        success: true,
        imported: insertedData?.length || 0,
        categorized,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing CSV:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        error: "Failed to process CSV transactions. Please check the file format and try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
