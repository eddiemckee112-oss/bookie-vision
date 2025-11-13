import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_url, hint_vendor, hint_amount, hint_date, source } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const prompt = `Analyze this receipt image and extract the following information:
- Vendor name
- Receipt date (YYYY-MM-DD format)
- Total amount
- Tax amount
- Category (choose from: Uncategorized, Income, Bank Fees, Fuel, Utilities, Phone/Internet, Insurance, Professional Fees, Software, Subscriptions, Repairs & Maintenance, Office, Meals & Entertainment, Travel, Lodging, Building Maintenance, Building Miscellaneous, Restaurant (Food & Supplies), Taxes, Other)
- Source payment method

${hint_vendor ? `Vendor hint: ${hint_vendor}` : ""}
${hint_amount ? `Amount hint: ${hint_amount}` : ""}
${hint_date ? `Date hint: ${hint_date}` : ""}
${source ? `Payment source: ${source}` : ""}

Return ONLY a JSON object with these exact fields: vendor, date, total, tax, category, source`;

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
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: image_url } }
            ]
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_receipt_data",
            description: "Extract structured data from a receipt",
            parameters: {
              type: "object",
              properties: {
                vendor: { type: "string" },
                date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                total: { type: "number" },
                tax: { type: "number" },
                category: { type: "string" },
                source: { type: "string" }
              },
              required: ["vendor", "date", "total"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_receipt_data" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const extractedData = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(extractedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in ai-suggest:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
