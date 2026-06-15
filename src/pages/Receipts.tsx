import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import ReceiptForm from "@/components/receipt/ReceiptForm";
import ReceiptEditDialog from "@/components/receipt/ReceiptEditDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, ExternalLink, Link as LinkIcon, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface Receipt {
  id: string;
  vendor: string;
  receipt_date: string;
  total: number;
  tax: number;
  category: string | null;
  source: string | null;
  notes: string | null;
  image_url: string | null;
}

const BUCKET = "receipts-warm";

const Receipts = () => {
  const { currentOrg, loading: orgLoading, orgRole } = useOrg();
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [isDownloadingImages, setIsDownloadingImages] = useState(false);
  const { toast } = useToast();

  const canManage = useMemo(() => orgRole === "owner" || orgRole === "admin", [orgRole]);
  const isStaff = orgRole === "staff";

  useEffect(() => {
    if (orgLoading) return;
    if (!currentOrg) {
      navigate("/onboard");
      return;
    }
    fetchReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id, orgLoading]);

  const fetchReceipts = async () => {
    if (!currentOrg) return;

    const { data: receiptsData, error: receiptsError } = await supabase
      .from("receipts")
      .select("*")
      .eq("org_id", currentOrg.id)
      .order("receipt_date", { ascending: false });

    if (receiptsError) {
      toast({
        title: "Error fetching receipts",
        description: receiptsError.message,
        variant: "destructive",
      });
      return;
    }

    setReceipts(receiptsData || []);

    // Keep this exactly the same (status badges)
    const { data: matchesData, error: matchesErr } = await supabase
      .from("matches")
      .select("receipt_id, transaction_id")
      .eq("org_id", currentOrg.id);

    if (matchesErr) {
      console.warn("Error fetching matches:", matchesErr.message);
      setMatches({});
      return;
    }

    const matchMap: Record<string, string> = {};
    matchesData?.forEach((m: any) => {
      matchMap[m.receipt_id] = m.transaction_id;
    });
    setMatches(matchMap);
  };

  const handleViewTransaction = (transactionId: string) => {
    sessionStorage.setItem("viewTransaction", transactionId);
    navigate("/transactions");
  };

  const handleMatchNow = (receiptId: string) => {
    // Staff should not have transactions access
    if (isStaff) {
      toast({
        title: "Not available",
        description: "Staff cannot access matching. Contact an admin/owner.",
        variant: "destructive",
      });
      return;
    }
    sessionStorage.setItem("linkReceipt", receiptId);
    navigate("/transactions");
  };

  const resolveReceiptImageUrl = (imageUrl: string) => {
    const trimmed = imageUrl.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    let path = trimmed;
    if (path.startsWith(`${BUCKET}/`)) path = path.slice(BUCKET.length + 1);
    if (path.startsWith(`/`)) path = path.slice(1);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  };

  const sanitizeFileName = (value: string) =>
    value
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "receipt";

  const getFileExtension = (url: string, imageUrl: string | null) => {
    const source = (imageUrl || url).split("?")[0];
    const match = source.match(/\.([a-zA-Z0-9]{3,5})$/);
    return match ? `.${match[1].toLowerCase()}` : ".jpg";
  };

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const handleDownloadVisibleImages = async () => {
    if (isStaff) return;

    const receiptsWithImages = filteredReceipts.filter((receipt) => receipt.image_url);
    if (receiptsWithImages.length === 0) {
      toast({ title: "No receipt images to download", variant: "destructive" });
      return;
    }

    const confirmed = confirm(
      `Download ${receiptsWithImages.length} visible receipt image(s)? Your browser may ask you to allow multiple downloads.`
    );
    if (!confirmed) return;

    setIsDownloadingImages(true);
    let downloaded = 0;
    let failed = 0;

    for (const receipt of receiptsWithImages) {
      if (!receipt.image_url) continue;

      try {
        const url = resolveReceiptImageUrl(receipt.image_url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const extension = getFileExtension(url, receipt.image_url);
        const fileName = sanitizeFileName(
          `${receipt.receipt_date}_${receipt.vendor}_${receipt.total.toFixed(2)}_${receipt.id}${extension}`
        );

        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);

        downloaded += 1;
        await wait(300);
      } catch (error) {
        console.error("Receipt image download failed:", receipt.id, error);
        failed += 1;
      }
    }

    setIsDownloadingImages(false);
    toast({
      title: "Receipt image download finished",
      description: `${downloaded} downloaded${failed ? `, ${failed} failed` : ""}.`,
      variant: failed ? "destructive" : "default",
    });
  };

  const handleOpenImage = (imageUrl: string | null) => {
    // Staff: hide this action (and block if somehow called)
    if (isStaff) return;

    if (!imageUrl) {
      toast({ title: "No image available", variant: "destructive" });
      return;
    }

    try {
      const url = resolveReceiptImageUrl(imageUrl);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast({
        title: "Could not open image",
        description: "Image link looks invalid or the file is missing in storage.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManage) {
      toast({
        title: "Not allowed",
        description: "Only admin/owner can delete receipts.",
        variant: "destructive",
      });
      return;
    }

    if (!confirm("Are you sure you want to delete this receipt?")) return;

    const { error: matchDelErr } = await supabase.from("matches").delete().match({ receipt_id: id });
    if (matchDelErr) {
      toast({
        title: "Error deleting receipt links",
        description: matchDelErr.message,
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.from("receipts").delete().eq("id", id);

    if (error) {
      toast({
        title: "Delete blocked",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Receipt deleted" });
    fetchReceipts();
  };

  const handleEdit = (receipt: Receipt) => {
    if (!canManage) {
      toast({
        title: "Not allowed",
        description: "Only admin/owner can edit receipts.",
        variant: "destructive",
      });
      return;
    }
    setEditingReceipt(receipt);
  };

  const getReceiptStatus = (receipt: Receipt) => {
    if (receipt.source?.toLowerCase().includes("cash")) {
      return { label: "Matched (Cash)", variant: "default" as const };
    }
    if (matches[receipt.id]) {
      return { label: "Matched", variant: "default" as const };
    }
    return { label: "Unmatched", variant: "secondary" as const };
  };

  const filteredReceipts = receipts.filter((receipt) => {
    const matchesSearch =
      receipt.vendor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      receipt.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      receipt.source?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === "matched") {
      return receipt.source?.toLowerCase().includes("cash") || matches[receipt.id];
    }
    if (filterStatus === "unmatched") {
      return !receipt.source?.toLowerCase().includes("cash") && !matches[receipt.id];
    }
    return true;
  });

  const totals = filteredReceipts.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      subtotal: acc.subtotal + (r.total - r.tax),
      tax: acc.tax + r.tax,
      total: acc.total + r.total,
    }),
    { count: 0, subtotal: 0, tax: 0, total: 0 }
  );

  const matchedCount = receipts.filter((r) => r.source?.toLowerCase().includes("cash") || matches[r.id]).length;
  const unmatchedCount = receipts.length - matchedCount;

  if (orgLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Receipts</h1>
            <p className="text-muted-foreground">
              Manage your receipts • {receipts.length} total • {matchedCount} matched • {unmatchedCount} unmatched
            </p>
          </div>
          {!isStaff && (
            <Button onClick={handleDownloadVisibleImages} disabled={isDownloadingImages || filteredReceipts.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              {isDownloadingImages ? "Downloading..." : "Download visible images"}
            </Button>
          )}
        </div>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Upload Receipt</h2>
          <ReceiptForm onSuccess={fetchReceipts} />
        </Card>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <Input
                placeholder="Search vendor, notes, or source..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Receipts</SelectItem>
                  <SelectItem value="matched">Matched</SelectItem>
                  <SelectItem value="unmatched">Unmatched</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ✅ Mobile-friendly table wrapper (prevents whole page from shrinking) */}
            <div className="relative -mx-3 sm:mx-0 overflow-x-auto">
              <Table className="min-w-[720px] sm:min-w-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReceipts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground h-32">
                        No receipts found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredReceipts.map((receipt) => {
                      const status = getReceiptStatus(receipt);
                      return (
                        <TableRow key={receipt.id}>
                          <TableCell className="whitespace-nowrap">
                            {new Date(`${receipt.receipt_date}T12:00:00`).toLocaleDateString()}
                          </TableCell>
                          <TableCell>{receipt.vendor}</TableCell>
                          <TableCell className="text-right">${receipt.total.toFixed(2)}</TableCell>
                          <TableCell className="text-right">${receipt.tax.toFixed(2)}</TableCell>
                          <TableCell>{receipt.category || "-"}</TableCell>
                          <TableCell>{receipt.source || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{receipt.notes || "-"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {/* Staff: no actions. Admin/Owner: same actions as before */}
                              {!isStaff && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleOpenImage(receipt.image_url)}
                                    title="Open image"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  {matches[receipt.id] ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleViewTransaction(matches[receipt.id])}
                                      title="View matched transaction"
                                    >
                                      View Txn
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleMatchNow(receipt.id)}
                                      title="Match now"
                                    >
                                      <LinkIcon className="h-4 w-4" />
                                    </Button>
                                  )}
                                </>
                              )}

                              {canManage && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEdit(receipt)}
                                    title="Edit"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDelete(receipt.id)}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Total Receipts:</span>
                <span>{totals.count}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-medium">Subtotal:</span>
                <span>${totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-medium">Tax:</span>
                <span>${totals.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total:</span>
                <span>${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {canManage && (
        <ReceiptEditDialog
          receipt={editingReceipt}
          open={!!editingReceipt}
          onOpenChange={(open) => !open && setEditingReceipt(null)}
          onSuccess={fetchReceipts}
        />
      )}
    </Layout>
  );
};

export default Receipts;
