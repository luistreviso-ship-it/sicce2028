import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Error inesperado en la aplicación.',
    };
  }

  render() {
    if (this.state.hasError) {
      let parsedDetail = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed.error) {
          parsedDetail = `${parsed.error} (${parsed.operationType || 'operación'} en ${parsed.path || 'recurso'})`;
        }
      } catch {
        // Keep raw error string
      }

      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
            <div className="flex items-center gap-3 text-red-700 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h1 className="text-lg font-bold text-slate-900">
                Error de Operación o Permisos
              </h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              No se pudo completar la operación solicitada. Verifica tu rol asignado o la conexión con el sistema electoral.
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-xs text-slate-700 break-words mb-6">
              {parsedDetail}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#B91C1C] text-white text-sm font-semibold rounded-lg hover:bg-[#991B1B] transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              Reintentar Sesión
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
