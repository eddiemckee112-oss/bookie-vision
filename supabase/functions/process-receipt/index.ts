import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// IMPORTANT:
// Keep this list TIGHT. These are the ONLY categories Gemini is allowed to return.
// Edit these strings to match EXACTLY what you want in the app.
const ALLOWED_CATEGORIES = [
  "Restaurant Food & Supplies",
  "Restaurant Supplies",
  "Cleaning Supplies",
  "Building Supplies",
  "Tools & Equipment",
  "Utilities",
  "Insurance",
  "Repairs & Maintenance",
  "Rent / Lease",
  "Fuel",
  "Advertising",
  "Bank Fees",
  "Payroll",
  "Meals & Entertainment",
  "Transfers / Owner Draw",
  "Other",
];

// Normalize + merge “duplicate-ish” categories into ONE canonical label
function normalizeCategory(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null; // NEVER return empty string (it breaks Select.Item)

  const lower = s.toLowerCase();

  // hard merges for your common duplicates
  const merges: Record<string, string> = {
    "food & supplies": "Restaurant Food & Supplies",
    "food and supplies": "Restaurant Food & Supplies",
    "restaurant food and supplies": "Restaurant Food & Supplies",
    "restaurant food & supplies": "Restaurant Food & Supplies",

    "supplies": "Restaurant Supplies",
    "restaurant supplies": "Restaurant Supplies",

    "cleaning": "Cleaning Supplies",
    "cleaning supplies": "Cleaning Supplies",

    "tools": "Tools & Equipment",
    "equipment": "Tools & Equipment",
    "tools and equipment": "Tools & Equipment",

    "building": "Building Supplies",
    "building supplies": "Building Supplies",
    "materials": "Building Supplies",
  };

  if (merges[lower]) return merges[lower];

  // fuzzy merges (helps Gemini “almost matches”)
  if (lower.includes("food") && lower.includes("suppl")) return "Restaurant Food & Supplies";
  if (lower.includes("clean")) return "Cleaning Supplies";
  if (lower.includes("tool") || lower.includes("equip")) return "Tools & Equipment";
  if (lower.includes("build") || lower.includes("reno") || lower.includes("material")) return "Building Supplies";
  if (lower.includes("bank fee")) return "Bank Fees";
  if (lower.includes("util")) return "Utilities";
  if (lower.includes("insur")) return "Insurance";
  if (lower.includes("fuel") || lower.includes("gas")) return "Fuel";

  // If Gemini returns something not in your list, force it to Other
  const exact = ALLOWED_CATEGORIES.find((c) => c.toLowerCase() === lower);
  return exact ?? "Other";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { image } = await req.json();
    if (!image) throw new Error("No image provided");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const allowedCategoryText = ALLOWED_CATEGORIES.map((c) => `- ${c}`).join("\n");

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
              "You are a receipt data extraction assistant. Extract structured data from receipt images accurately. " +
              "IMPORTANT: The 'category' field MUST be exactly one of the allowed categories provided. " +
              "If unsure, set category to 'Other'. Never invent new categories.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all relevant data from this receipt." },
              {
                type: "text",
                text:
                  "Allowed categories (choose EXACTLY one):\n" +
                  allowedCategoryText +
                  "\n\nRules:\n- category must match exactly (case + spacing)\n- if uncertain use 'Other'\n- do not create new categories",
              },
              {
                type: "image_url",
                image_url: { url: image },
              },
            ],
          },
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
                  vendor: { type: "string", description: "The name of the vendor/store" },
                  date: { type: "string", description: "Receipt date in ISO format (YYYY-MM-DD)" },
                  total: { type: "number", description: "Total amount paid" },
                  tax: { type: "number", description: "Tax amount if available" },
                  subtotal: { type: "number", description: "Subtotal before tax if available" },
                  items: {
                    type: "array",
                    description: "List of purchased items",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: "number" },
                        price: { type: "number" },
                      },
                      required: ["name", "quantity", "price"],
                    },
                  },
                  category: {
                    type: "string",
                    description:
                      "Business category. MUST be exactly one of the allowed categories. If unsure, 'Other'.",
                  },
                  paymentMethod: {
                    type: "string",
                    description: "Payment method used if visible (e.g., Cash, Credit Card, Debit)",
                  },
                },
                required: ["vendor", "date", "total", "items"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_receipt_data" } },
      }),
    });

    if (!response.ok) throw new Error(`AI processing failed: ${response.status}`);

    const aiResponse = await response.json();

    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No structured data returned from AI");

    const receiptData = JSON.parse(toolCall.function.arguments);

    // ✅ enforce normalization here so you NEVER get duplicates saved
    receiptData.category = normalizeCategory(receiptData.category);

    return new Response(JSON.stringify({ receiptData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
