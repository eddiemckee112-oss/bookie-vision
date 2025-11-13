import { z } from "zod";

export const receiptDataSchema = z.object({
  vendor: z.string().trim().min(1, "Vendor name is required").max(200, "Vendor name too long"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  total: z.number().positive("Total must be positive").max(1000000, "Total amount too large"),
  tax: z.number().nonnegative("Tax cannot be negative").max(100000, "Tax amount too large").optional(),
  subtotal: z.number().nonnegative("Subtotal cannot be negative").max(1000000, "Subtotal too large").optional(),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    quantity: z.number().positive().max(10000),
    price: z.number().nonnegative().max(100000)
  })),
  category: z.string().trim().max(100).optional(),
  paymentMethod: z.string().trim().max(50).optional()
});

export const orgNameSchema = z.string()
  .trim()
  .min(2, "Organization name must be at least 2 characters")
  .max(100, "Organization name must be less than 100 characters")
  .regex(/^[a-zA-Z0-9\s&\-.,]+$/, "Organization name contains invalid characters");

export const emailSchema = z.string()
  .email("Invalid email address")
  .max(255, "Email too long")
  .toLowerCase()
  .trim();

export const passwordSchema = z.string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");
