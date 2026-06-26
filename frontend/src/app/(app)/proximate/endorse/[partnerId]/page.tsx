import ProximateEndorseWizardClient from './client';

export function generateStaticParams() {
  return [{ partnerId: '0' }];
}

export default function Page() {
  return <ProximateEndorseWizardClient />;
}
