import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message?: string;
}

/** Catches render / lazy-chunk-load errors (common on flaky networks) and offers a reload. */
export class StudentErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    console.error("[STUDENT][BOUNDARY]", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-[60vh] grid place-items-center p-6">
        <div className="text-center max-w-sm">
          <span className="icon text-[48px] text-ink-outline mb-3">sync_problem</span>
          <h2 className="font-display font-semibold text-title-lg text-ink">This page hit a snag</h2>
          <p className="text-body-sm text-ink-variant mt-1">
            {this.state.message || "A part of the app failed to load."} Reloading usually fixes it.
          </p>
          <Button className="mt-4" leftIcon="refresh" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    );
  }
}
