import { ProximateGrantDetailClient } from "./client";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ grantId: "0" }];
}

export default function Page() {
  return <ProximateGrantDetailClient />;
}
