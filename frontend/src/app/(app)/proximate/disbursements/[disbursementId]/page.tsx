import { ProximateDisbursementDetailClient } from "./client";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ disbursementId: "0" }];
}

export default function Page() {
  return <ProximateDisbursementDetailClient />;
}
