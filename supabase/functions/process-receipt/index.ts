import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { image } = await req.json();

    if (!image) {
      throw new Error("No image provided");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Call Lovable AI with vision model
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
            content: "You are a receipt data extraction assistant. Extract structured data from receipt images accurately."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all relevant data from this receipt."
              },
              {
                type: "image_url",
                image_url: {
                  url: image
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_receipt_data",
              description: "Extract structured data from a receipt",
              parameters: {
                type: "object",
                properties: {
                  vendor: { 
                    type: "string",
                    description: "The name of the vendor/store"
                  },
                  date: { 
                    type: "string",
                    description: "Receipt date in ISO format (YYYY-MM-DD)"
                  },
                  total: { 
                    type: "number",
                    description: "Total amount paid"
                  },
                  tax: { 
                    type: "number",
                    description: "Tax amount if available"
                  },
                  subtotal: { 
                    type: "number",
                    description: "Subtotal before tax if available"
                  },
                  items: {
                    type: "array",
                    description: "List of purchased items",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: "number" },
                        price: { type: "number" }
                      },
                      required: ["name", "quantity", "price"]
                    }
                  },
                  category: { 
                    type: "string",
                    description: "Business category (e.g., Office Supplies, Food & Beverage, Travel)"
                  },
                  paymentMethod: { 
                    type: "string",
                    description: "Payment method used if visible (e.g., Cash, Credit Card, Debit)"
                  }
                },
                required: ["vendor", "date", "total", "items"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_receipt_data" } }
      }),
    });

    if (!response.ok) {
      throw new Error(`AI processing failed: ${response.status}`);
    }

    const aiResponse = await response.json();

    // Extract tool call result
    const toolCall = aiResponse.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No structured data returned from AI");
    }

    const receiptData = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({ receiptData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
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
