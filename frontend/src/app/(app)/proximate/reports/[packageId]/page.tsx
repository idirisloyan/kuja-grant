import { ProximateReportPackageClient } from "./client";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ packageId: "0" }];
}

export default function Page() {
  return <ProximateReportPackageClient />;
}
