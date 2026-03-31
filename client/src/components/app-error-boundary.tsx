import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { StatePanel } from "@/components/state-panel";
import { captureClientException } from "@/sentry-client";

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
    captureClientException(error, { componentStack: info.componentStack ?? undefined });
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
        <div className="min-h-dvh bg-background p-6 text-foreground">
          <div className="mx-auto flex min-h-dvh max-w-3xl items-center justify-center">
            <div className="w-full space-y-4">
              <StatePanel
                icon={<AlertTriangle className="h-6 w-6" />}
                title="Something interrupted the workspace"
                description="The app hit an unexpected error. Reload the page first. If it happens again after connecting your wallet, disconnect in your wallet extension and try once more."
                actionLabel="Reload page"
                onAction={() => window.location.reload()}
              />
              <pre className="max-h-32 overflow-auto rounded-xl border border-border bg-muted/30 p-3 text-xs text-destructive/90 shadow-sm">
                {err.message}
              </pre>
            </div>
          </div>
          {details ? (
            <details className="mx-auto w-full max-w-lg text-left text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none text-foreground/80">Technical details</summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded border border-border bg-muted/30 p-2 whitespace-pre-wrap break-words">
                {details}
              </pre>
            </details>
          ) : null}
        </div>
      );
    }
    return this.props.children;
  }
}
