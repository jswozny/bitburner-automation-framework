/**
 * ErrorBoundary - Wraps dashboard plugins to prevent cascade crashes.
 *
 * If a plugin throws during render, this catches it and shows an
 * inline error message instead of crashing the whole dashboard.
 */
import React from "lib/react";

interface ErrorBoundaryProps {
  label: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: string | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return { error: err.message || "Unknown render error" };
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div style={{
          backgroundColor: "#1a0000",
          border: "1px solid #ff4444",
          borderRadius: "4px",
          padding: "10px",
          color: "#ff4444",
          fontSize: "12px",
        }}>
          <strong>{this.props.label}</strong>: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}
