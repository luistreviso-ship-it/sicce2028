import React, { useMemo, useState } from 'react';
import { Search, UserCheck, AlertCircle, AlertTriangle, Plus } from 'lucide-react';
import { lookupPadronByCedula } from '../services/firestoreService';
import { PadronRecord } from '../types/electoral';
import {
  SublistEligibilityRules,
  validateCandidateEligibility,
} from '../utils/validation';

interface CandidateLookupInputProps {
  padronCatalog: PadronRecord[];
  padronMap: Map<string, PadronRecord>;
  nextDefaultOrder: number;
  maxOrder: number;
  isUnipersonal?: boolean;
  cargoLabel?: string;
  eligibilityRules?: SublistEligibilityRules;
  onAddCandidate: (record: PadronRecord, orden: number) => string | null;
  disabled?: boolean;
}

export const CandidateLookupInput: React.FC<CandidateLookupInputProps> = ({
  padronCatalog,
  padronMap,
  nextDefaultOrder,
  maxOrder,
  isUnipersonal = false,
  cargoLabel,
  eligibilityRules,
  onAddCandidate,
  disabled = false,
}) => {
  const [queryText, setQueryText] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<PadronRecord | null>(null);
  const [orderInput, setOrderInput] = useState<string>(String(nextDefaultOrder));
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [searchingDb, setSearchingDb] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  React.useEffect(() => {
    setOrderInput(String(isUnipersonal ? 1 : nextDefaultOrder));
  }, [nextDefaultOrder, isUnipersonal]);

  const suggestions = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return [];
    return padronCatalog
      .filter(
        (r) =>
          (r.numero_ced || '').toLowerCase().includes(q) ||
          `${r.nombre || ''} ${r.apellido || ''}`.toLowerCase().includes(q) ||
          `${r.apellido || ''} ${r.nombre || ''}`.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [queryText, padronCatalog]);

  const handleSelectRecord = (rec: PadronRecord) => {
    setSelectedRecord(rec);
    setQueryText(rec.numero_ced);
    setShowDropdown(false);
    setLookupError(null);
  };

  const handleDirectCedulaSearch = async () => {
    const clean = queryText.trim();
    if (!clean) {
      setLookupError('Ingrese un número de Cédula de Identidad (numero_ced).');
      return;
    }
    setLookupError(null);
    const localHit = padronMap.get(clean);
    if (localHit) {
      handleSelectRecord(localHit);
      return;
    }
    setSearchingDb(true);
    try {
      const dbRecord = await lookupPadronByCedula(clean);
      if (dbRecord) {
        handleSelectRecord(dbRecord);
      } else {
        setSelectedRecord(null);
        setLookupError(
          `No se encontró numero_ced "${clean}" en la base de datos PadronANR. Todo candidato debe estar empadronado.`
        );
      }
    } finally {
      setSearchingDb(false);
    }
  };

  const handleConfirmAdd = () => {
    if (!selectedRecord) {
      setLookupError('Primero busque y seleccione un candidato válido del PadronANR.');
      return;
    }
    const parsedOrder = isUnipersonal ? 1 : Number(orderInput);
    if (!Number.isInteger(parsedOrder) || parsedOrder < 1 || parsedOrder > maxOrder) {
      setLookupError(`El número de orden debe ser un entero entre 1 y ${maxOrder}.`);
      return;
    }

    const validationErr = onAddCandidate(selectedRecord, parsedOrder);
    if (validationErr) {
      setLookupError(validationErr);
      return;
    }

    setSelectedRecord(null);
    setQueryText('');
    setLookupError(null);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
        <div className={isUnipersonal ? 'lg:col-span-9 relative' : 'lg:col-span-7 relative'}>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Buscar en PadronANR por Cédula (numero_ced) o Nombre/Apellido
            {cargoLabel ? ` · ${cargoLabel}` : ''}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={queryText}
                disabled={disabled}
                onChange={(e) => {
                  setQueryText(e.target.value);
                  setShowDropdown(true);
                  setLookupError(null);
                  if (selectedRecord && e.target.value !== selectedRecord.numero_ced) {
                    setSelectedRecord(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleDirectCedulaSearch();
                  }
                }}
                placeholder="Ej: 1420000 o apellido..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 focus:border-[#B91C1C]"
              />
            </div>
            <button
              type="button"
              disabled={disabled || searchingDb}
              onClick={() => void handleDirectCedulaSearch()}
              className="px-3.5 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {searchingDb ? 'Buscando...' : 'Verificar C.I.'}
            </button>
          </div>

          {showDropdown && suggestions.length > 0 && (
            <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
              {suggestions.map((rec) => (
                <button
                  key={rec.numero_ced}
                  type="button"
                  onClick={() => handleSelectRecord(rec)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {rec.apellido}, {rec.nombre}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      ({rec.cod_dpto}) {rec.desc_dep} · ({rec.cod_dist}) {rec.desc_dis} · Sec. {rec.codigo_sec}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono text-xs font-semibold text-slate-800 block tabular-nums">
                      C.I. {rec.numero_ced}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      Afil. {rec.fecha_afil}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {!isUnipersonal && (
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              N° Orden (1–{maxOrder})
            </label>
            <input
              type="number"
              min={1}
              max={maxOrder}
              disabled={disabled}
              value={orderInput}
              onChange={(e) => setOrderInput(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 focus:border-[#B91C1C]"
            />
          </div>
        )}

        <div className="lg:col-span-3">
          <button
            type="button"
            disabled={disabled || !selectedRecord}
            onClick={handleConfirmAdd}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#B91C1C] text-white text-sm font-semibold rounded-lg hover:bg-[#991B1B] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            {isUnipersonal ? 'Asignar Candidato' : 'Agregar a Lista'}
          </button>
        </div>
      </div>

      {selectedRecord && (() => {
        const elig = eligibilityRules
          ? validateCandidateEligibility(selectedRecord, eligibilityRules)
          : validateCandidateEligibility(selectedRecord, {});
        return (
          <div className="space-y-2">
            <div className="bg-white border border-slate-200 rounded-lg p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Apellido y Nombre</span>
                <span className="font-semibold text-slate-900 flex items-center gap-1 mt-0.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  {selectedRecord.apellido}, {selectedRecord.nombre}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">numero_ced / Edad (fecha_naci)</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5 block">
                  {selectedRecord.numero_ced} ·{' '}
                  {elig.ageYears !== null ? `${elig.ageYears} años` : 'Edad s/d'} (
                  {selectedRecord.fecha_naci || 's/d'})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Dpto. / Distrito</span>
                <span className="font-medium text-slate-800 mt-0.5 block truncate">
                  {selectedRecord.cod_dpto} {selectedRecord.desc_dep} · {selectedRecord.cod_dist} {selectedRecord.desc_dis}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">codigo_sec / Antigüedad Afil.</span>
                <span className="font-mono font-semibold text-slate-800 tabular-nums mt-0.5 block">
                  Sec. {selectedRecord.codigo_sec} · {elig.affiliationYears !== null ? `${elig.affiliationYears} año(s)` : selectedRecord.fecha_afil}
                </span>
              </div>
            </div>
            {elig.blockingErrors.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{elig.blockingErrors.join(' ')}</span>
              </div>
            )}
            {(elig.ageErrors.length > 0 || elig.seccionalErrors.length > 0) && (
              <div className="flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-2.5">
                <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-red-900">Pasa a Observación automática:</strong>{' '}
                  {[...elig.ageErrors, ...elig.seccionalErrors].join(' ')}{' '}
                  Puede agregar al candidato y la candidatura quedará en estado OBSERVADA.
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {lookupError && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{lookupError}</span>
        </div>
      )}
    </div>
  );
};
