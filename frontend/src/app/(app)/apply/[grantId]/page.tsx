import ApplyWizardClient from './client';

export function generateStaticParams() {
  return [{ grantId: '0' }];
}

export default function Page() {
  return <ApplyWizardClient />;
}
