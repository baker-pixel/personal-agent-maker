import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  /**
   * "page"   — shows a full-screen fallback (use at the app root)
   * "widget" — shows nothing / hides the widget silently (use around dashboard cards)
   * "inline" — shows a compact inline error card (use inside modals/sections)
   */
  variant?: "page" | "widget" | "inline";
  /** Label shown in "inline" fallback to help identify which section failed */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Log for debugging without exposing to users
    console.error("[ErrorBoundary] caught:", error.message, info.componentStack?.slice(0, 300));
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    const { variant = "inline", label } = this.props;

    // "widget" — silent, renders nothing so the rest of the page is unaffected
    if (variant === "widget") return null;

    // "page" — full-screen fallback, replaces the entire viewport
    if (variant === "page") {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                Something went wrong
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                An unexpected error occurred. Your data is safe — this is a display issue only.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                <RefreshCw className="w-4 h-4" />
                Reload page
              </button>
              <button
                onClick={this.reset}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    // "inline" — compact card, useful inside a section or modal
    return (
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-destructive/5 border border-destructive/20 text-sm">
        <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground">
            {label ? `${label} failed to load` : "Something went wrong here"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            The rest of the page is unaffected.
          </p>
        </div>
        <button
          onClick={this.reset}
          className="shrink-0 text-xs text-accent hover:underline font-medium"
        >
          Retry
        </button>
      </div>
    );
  }
}
