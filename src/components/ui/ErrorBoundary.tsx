'use client'

import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 24px',
            textAlign: 'center',
            minHeight: '300px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(239,68,68,0.1)',
              color: 'var(--color-danger-400)',
              marginBottom: '16px',
            }}
          >
            <AlertTriangle size={28} />
          </div>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--color-content-primary)',
              marginBottom: '8px',
            }}
          >
            Something went wrong
          </h3>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-content-secondary)',
              maxWidth: '400px',
              lineHeight: 1.5,
              marginBottom: '16px',
            }}
          >
            {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="sf-btn sf-btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 20px',
              fontSize: '13px',
            }}
          >
            <RefreshCw size={14} /> Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
