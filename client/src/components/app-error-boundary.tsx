import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Catches render errors so a failed component does not leave a blank dark screen.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[AppErrorBoundary]", error?.stack ?? error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render(): ReactNode {
    if (this.state.error) {
      const err = this.state.error;
      const stack = typeof err.stack === "string" ? err.stack : "";
      const details =
        [stack, this.state.componentStack ? `\n--- React ---\n${this.state.componentStack}` : ""]
          .filter(Boolean)
          .join("") || null;

      return (
        <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 bg-background text-foreground">
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            This app hit an unexpected error. Try reloading. If this persists after connecting your wallet,
            disconnect in your wallet extension and refresh.
          </p>
          <pre className="text-xs text-destructive/90 max-w-lg max-h-32 overflow-auto rounded border border-border p-2 bg-muted/30">
            {err.message}
          </pre>
          {details ? (
            <details className="w-full max-w-lg text-left text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none text-foreground/80">Technical details</summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded border border-border bg-muted/30 p-2 whitespace-pre-wrap break-words">
                {details}
              </pre>
            </details>
          ) : null}
          <Button type="button" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
