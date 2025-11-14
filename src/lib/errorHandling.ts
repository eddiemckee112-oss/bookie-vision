/**
 * Safely maps database errors to user-friendly messages
 * Logs full error details server-side while returning generic messages to users
 */
export function getSafeErrorMessage(error: any): string {
  // Log full error for debugging (server-side in production should use proper logging)
  console.error("Database error:", error);
  
  // Map specific error codes to user-friendly messages
  if (error?.code === '23505') return "This item already exists.";
  if (error?.code === '23503') return "Unable to complete action - referenced item not found.";
  if (error?.code === '23514') return "Invalid data provided. Please check your input.";
  if (error?.code === '42501') return "You don't have permission for this action.";
  if (error?.message?.toLowerCase().includes('policy')) return "You don't have permission for this action.";
  if (error?.message?.toLowerCase().includes('jwt')) return "Your session has expired. Please log in again.";
  
  // Generic fallback message
  return "An error occurred. Please try again or contact support if the issue persists.";
}
