import { SaxGroupDetailClient } from './client';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [{ groupId: '0' }];
}

export default function Page() {
  return <SaxGroupDetailClient />;
}
