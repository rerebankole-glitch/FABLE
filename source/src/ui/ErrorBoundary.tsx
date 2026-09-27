import React from 'react';

/** Last-resort recovery for render-time errors in menus/HUD; does not discard saved worlds. */
export class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('FABLE UI error', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="fable-recovery" role="alert">
      <h1>Something went wrong</h1>
      <p>The game stopped drawing this screen to avoid repeating the error. Saved worlds remain in your browser.</p>
      <button onClick={() => window.location.reload()}>Reload FABLE</button>
      <details><summary>Technical details</summary><pre>{this.state.error.message}</pre></details>
    </div>;
  }
}
