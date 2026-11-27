import React, { useState } from 'react';
import { ShieldCheck, Lock, FileCheck2, ArrowRight } from 'lucide-react';
import { DEFAULT_MOVEMENT_NAME, SYSTEM_NAME } from '../types/electoral';

interface LoginScreenProps {
  onSignIn: () => Promise<void>;
  loading: boolean;
  errorMsg: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onSignIn,
  loading,
  errorMsg,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between">
      <header className="border-b border-slate-200 bg-white px-8 py-4 flex flex-wrap items-center justify-between gap-4">
        <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
          SICCE · Sistema de Cargas de Candidaturas Electoral
        </span>
        <span className="text-xs font-semibold text-[#B91C1C]">
          {DEFAULT_MOVEMENT_NAME}
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="lg:col-span-7 p-8 lg:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200">
            <div>
              <div className="flex items-center gap-4 mb-6">
                {!imgFailed ? (
                  <img
                    src="/src/assets/images/anr_institutional_crest_1795626748289.jpg"
                    alt="Emblema Institucional ANR"
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-14 h-14 object-contain rounded-lg border border-slate-200 bg-white p-1 shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-[#B91C1C] text-white flex items-center justify-center font-bold text-lg shrink-0">
                    ANR
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-[#B91C1C] tracking-wide">
                    {DEFAULT_MOVEMENT_NAME}
                  </p>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 text-balance leading-tight mt-0.5">
                    {SYSTEM_NAME}
                  </h1>
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed mb-8 max-w-xl">
                Plataforma centralizada para la inscripción, validación estricta contra el PadrónANR, control de escaños, gestión de usuarios (Alta, Baja y Modificación), carga con observaciones y exportación oficial de listas nacionales, partidarias y seccionales.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-[#B91C1C] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Verificación Estricta en PadronANR
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Búsqueda instantánea por cédula de identidad, autocompletado de filiación y bloqueo de listas incompletas o con órdenes duplicados.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileCheck2 className="w-5 h-5 text-[#B91C1C] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Auditoría, Versionado y Exportación Oficial
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Control de roles (Admin, Operador, Revisor), respaldo documental digital, historial de versiones y reportes PDF/Excel.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-[#B91C1C] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Acceso Autenticado y Trazable
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Conexión cifrada HTTPS con registro inmutable de autor y marca de tiempo por cada operación.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-8 mt-8 border-t border-slate-200 text-xs text-slate-500">
              Autoridades Nacionales · Junta de Gobierno ANR · Seccionales ANR
            </div>
          </div>

          <div className="lg:col-span-5 p-8 lg:p-10 bg-slate-50 flex flex-col justify-center">
            <h2 className="text-lg font-bold text-slate-900 mb-2">
              Ingreso al Sistema
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              Inicia sesión con tu cuenta institucional autorizada para acceder a los módulos de carga y revisión.
            </p>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              onClick={onSignIn}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 bg-[#B91C1C] text-white text-sm font-semibold rounded-lg hover:bg-[#991B1B] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>{loading ? 'Verificando credenciales...' : 'Ingresar con Google'}</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>

            <div className="mt-6 pt-6 border-t border-slate-200 space-y-2 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">Perfiles de Acceso (RBAC)</p>
              <p>Administrador · Parámetros, Padrón, Roles y Control Total</p>
              <p>Operador · Carga, edición y documentación de listas</p>
              <p>Revisor · Auditoría, aprobación y observación oficial</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
