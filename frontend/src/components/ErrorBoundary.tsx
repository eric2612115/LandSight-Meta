import { Component, type ErrorInfo, type ReactNode } from 'react'

/** One bad field must never blank the screen: a render error inside shows a small inline note instead, and the rest of
 * the page keeps running. `resetKey` clears the error when the data it guards changes. */
type Props = { children: ReactNode; label?: string; resetKey?: unknown; className?: string }
type State = { error: Error | null; key: unknown }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[landsight] ${this.props.label ?? 'view'} failed to render:`, error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className={`flex items-center justify-center rounded-lg border border-[#5a3b3b] bg-[#2a1d1d] px-3 py-2 text-[13px] text-[#ffb3b3] ${this.props.className ?? ''}`}>
        {this.props.label ?? 'This part'} could not be shown ({this.state.error.message}); the rest of the screen still works.
      </div>
    )
  }
}
