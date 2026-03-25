import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so a failed component does not leave a blank dark screen.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 bg-background text-foreground">
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            The app hit an unexpected error. Try reloading. If this persists after connecting your wallet,
            disconnect in your wallet extension and refresh.
          </p>
          <pre className="text-xs text-destructive/90 max-w-lg max-h-32 overflow-auto rounded border border-border p-2 bg-muted/30">
            {this.state.error.message}
          </pre>
          <Button type="button" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
