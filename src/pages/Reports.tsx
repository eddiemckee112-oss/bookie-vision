import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import Layout from "@/components/Layout";
import { Card } from "@/components/ui/card";
import PeriodSelector from "@/components/reports/PeriodSelector";
import ExportSection from "@/components/reports/ExportSection";
import TaxSummary from "@/components/reports/TaxSummary";
import ReportPreview from "@/components/reports/ReportPreview";

const Reports = () => {
  const { currentOrg, loading: orgLoading } = useOrg();
  const navigate = useNavigate();
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);

  if (orgLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!currentOrg) {
    navigate("/onboard");
    return null;
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Reports & Exports</h1>
          <p className="text-muted-foreground">
            Generate comprehensive reports and export data for accounting and CRA compliance
          </p>
        </div>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Period Selection</h2>
          <PeriodSelector
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
          />
        </Card>

        <div>
          <h2 className="text-xl font-semibold mb-4">Export Data</h2>
          <ExportSection 
            orgId={currentOrg.id} 
            fromDate={fromDate} 
            toDate={toDate} 
          />
        </div>

        <TaxSummary 
          orgId={currentOrg.id} 
          fromDate={fromDate} 
          toDate={toDate} 
        />

        <ReportPreview 
          orgId={currentOrg.id} 
          fromDate={fromDate} 
          toDate={toDate} 
        />
      </div>
    </Layout>
  );
};

export default Reports;
