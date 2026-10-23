import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { listStoredReports } from "@/lib/report-store";
import { pageMetadata, productionSiteConfigured } from "@/lib/site";
import { MatchReportCard } from "@/components/reports/MatchReportArticle";
import { DataNotice } from "@/components/ui/DataNotice";
import { SectionHeading } from "@/components/ui/SectionHeading";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const reports = await listStoredReports(1);
  // Indexable only once there is real content and a production domain.
  return pageMetadata({
    title: "MatchPulse Match Reports",
    description: "Factual match reports generated from official match data: final scores, scorers, cards and key statistics.",
    path: "/reports",
    index: reports.length > 0 && productionSiteConfigured(),
  });
}

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeading
        as="h1"
        title="MatchPulse Match Reports"
        description="Short factual reports on finished matches, generated from API-Football match data."
      />
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl border border-line bg-surface" />}>
        <ReportList />
      </Suspense>
    </div>
  );
}

async function ReportList() {
  await connection();
  const reports = await listStoredReports(60);
  if (reports.length === 0) {
    return (
      <DataNotice>
        No match reports yet. A report is created from official match data once a finished match&apos;s page has loaded
        complete data (final score and matching goal events). Matches with incomplete data get no report.
      </DataNotice>
    );
  }
  return (
    <div className="space-y-4">
      <DataNotice>
        Reports are generated automatically from API-Football data and contain only the facts in that data. They are
        not news articles and include no quotes, opinions or commentary.
      </DataNotice>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <li key={report.fixtureId}>
            <MatchReportCard report={report} />
          </li>
        ))}
      </ul>
    </div>
  );
}
