'use client';

/**
 * ErrorBoundary — catches render-time exceptions in a subtree and shows a
 * friendly fallback instead of white-screening the whole app.
 *
 * A single panel throwing (e.g. reading `.length` on an unexpected API shape)
 * should never take down the entire page. Wrap page content in this so the
 * rest of the screen — headers, nav, other panels — still renders.
 */

import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional custom fallback. Receives the error + a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Short label for the section, shown in the default fallback. */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface to the console for diagnosis; keep the UI resilient.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.label ?? '', error);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div className="rounded-lg border border-[hsl(var(--kuja-flag)/0.3)] bg-[hsl(var(--kuja-flag)/0.05)] p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[hsl(var(--kuja-flag))] shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-[hsl(var(--kuja-flag))]">
              {this.props.label ? `${this.props.label} couldn’t load` : 'This section couldn’t load'}
            </p>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
              The rest of the page is unaffected.{' '}
              <button type="button" onClick={this.reset} className="underline hover:opacity-80">
                Try again
              </button>
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
