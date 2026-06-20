import ShareClient from './client';

// Static export needs at least one prerendered param. Production uses the
// real slug; the build only prerenders the placeholder.
// The Flask static fallback (app/__init__.py _serve_nextjs) replaces a
// missing dynamic segment with the literal "0" to find a placeholder
// index.html. Convention across this app — match it.
export function generateStaticParams() {
  return [{ slug: '0' }];
}

export default function Page() {
  return <ShareClient />;
}
