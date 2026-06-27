import { ProximateRoundReportClient } from "./client";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ roundId: "0" }];
}

export default function Page() {
  return <ProximateRoundReportClient />;
}
