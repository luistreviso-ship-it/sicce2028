import React, { useState } from 'react';
import {
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Users,
  ListChecks,
  Zap,
  AlertCircle,
} from 'lucide-react';
import { lookupPadronByCedula } from '../services/firestoreService';
import {
  CandidateEntry,
  CandidatureModuleType,
  CandidatureSublist,
  PadronRecord,
} from '../types/electoral';
import {
  getSublistEligibilityRules,
  validateCandidateEligibility,
} from '../utils/validation';
import { CandidateLookupInput } from './CandidateLookupInput';

interface PlurinominalListBuilderProps {
  sublist: CandidatureSublist;
  padronCatalog: PadronRecord[];
  padronMap: Map<string, PadronRecord>;
  moduleType?: CandidatureModuleType;
  departamento?: string;
  seccional?: string;
  onChange: (updated: CandidatureSublist) => void;
  excludedCedulas?: Set<string>;
  readOnly?: boolean;
}

function buildEntryFromPadron(
  record: PadronRecord,
  orden: number,
  cargo: string
): CandidateEntry {
  return {
    orden,
    numero_ced: record.numero_ced,
    apellido: record.apellido,
    nombre: record.nombre,
    telefono: '',
    cod_dpto: record.cod_dpto,
    desc_dep: record.desc_dep,
    cod_dist: record.cod_dist,
    desc_dis: record.desc_dis,
    codigo_sec: record.codigo_sec,
    fecha_naci: record.fecha_naci,
    fecha_afil: record.fecha_afil,
    cargoLabel: cargo,
  };
}

export const PlurinominalListBuilder: React.FC<PlurinominalListBuilderProps> = ({
  sublist,
  padronCatalog,
  padronMap,
  moduleType,
  departamento,
  seccional,
  onChange,
  excludedCedulas,
  readOnly = false,
}) => {
  const eligibilityRules = getSublistEligibilityRules(
    moduleType,
    sublist,
    departamento,
    seccional
  );
  const isUnipersonal = sublist.tipo === 'UNIPERSONAL';
  const loadedCount = sublist.candidates.length;
  const availableSeats = Math.max(0, sublist.requiredSeats - loadedCount);
  const isComplete = loadedCount === sublist.requiredSeats;

  // Inline per-seat numero_ced inputs for empty ("Sin Registro") slots
  const [slotCedulas, setSlotCedulas] = useState<Record<number, string>>({});
  const [slotErrors, setSlotErrors] = useState<Record<number, string>>({});
  const [slotLoading, setSlotLoading] = useState<Record<number, boolean>>({});

  // Automatic multi-seat form by numero_ced (Escaños 1..N)
  const [showBatchCedulaForm, setShowBatchCedulaForm] = useState(false);
  const [batchSlotCedulas, setBatchSlotCedulas] = useState<Record<number, string>>({});
  const [batchTextArea, setBatchTextArea] = useState('');
  const [batchFeedback, setBatchFeedback] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [fillError, setFillError] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);

  const usedOrders = new Set(sublist.candidates.map((c) => c.orden));
  let nextDefaultOrder = 1;
  while (usedOrders.has(nextDefaultOrder) && nextDefaultOrder < sublist.requiredSeats) {
    nextDefaultOrder++;
  }

  const resolvePadronRecord = async (cedulaRaw: string): Promise<PadronRecord | null> => {
    const clean = cedulaRaw.trim();
    if (!clean) return null;
    const localHit = padronMap.get(clean);
    if (localHit) return localHit;
    return lookupPadronByCedula(clean);
  };

  const handleAddCandidate = (record: PadronRecord, orden: number): string | null => {
    const elig = validateCandidateEligibility(record, eligibilityRules);
    if (!elig.blockingValid) {
      return elig.blockingErrors.join(' ');
    }
    if (sublist.candidates.some((c) => c.numero_ced === record.numero_ced)) {
      return `El ciudadano C.I. ${record.numero_ced} ya se encuentra cargado en esta lista.`;
    }
    if (excludedCedulas && excludedCedulas.has(record.numero_ced)) {
      return `El ciudadano C.I. ${record.numero_ced} ya figura en otra sublista incompatible de este mismo paquete.`;
    }
    if (!isUnipersonal && sublist.candidates.length >= sublist.requiredSeats) {
      return `Ya se completaron los ${sublist.requiredSeats} escaños asignados para esta lista.`;
    }
    if (!isUnipersonal && sublist.candidates.some((c) => c.orden === orden)) {
      return `El número de orden #${orden} ya está ocupado en esta lista. Elija otro orden único.`;
    }

    const newEntry = buildEntryFromPadron(record, isUnipersonal ? 1 : orden, sublist.cargo);
    const nextCandidates = isUnipersonal
      ? [newEntry]
      : [...sublist.candidates, newEntry].sort((a, b) => a.orden - b.orden);

    onChange({ ...sublist, candidates: nextCandidates });
    return null;
  };

  const handleAssignSlotByCedula = async (orden: number, overrideCedula?: string) => {
    const raw = (overrideCedula ?? slotCedulas[orden] ?? '').trim();
    if (!raw) {
      setSlotErrors((prev) => ({ ...prev, [orden]: 'Ingrese un numero_ced.' }));
      return;
    }

    setSlotErrors((prev) => {
      const next = { ...prev };
      delete next[orden];
      return next;
    });
    setSlotLoading((prev) => ({ ...prev, [orden]: true }));

    try {
      const rec = await resolvePadronRecord(raw);
      if (!rec) {
        setSlotErrors((prev) => ({
          ...prev,
          [orden]: `numero_ced ${raw} no figura en PadronANR.`,
        }));
        return;
      }
      const err = handleAddCandidate(rec, orden);
      if (err) {
        setSlotErrors((prev) => ({ ...prev, [orden]: err }));
        return;
      }
      setSlotCedulas((prev) => {
        const next = { ...prev };
        delete next[orden];
        return next;
      });
    } finally {
      setSlotLoading((prev) => ({ ...prev, [orden]: false }));
    }
  };

  const handleBatchAutoLoad = async () => {
    setBatchError(null);
    setBatchFeedback(null);
    setBatchProcessing(true);

    try {
      const assignments: { orden: number; cedula: string }[] = [];
      const pastedList = batchTextArea
        .split(/[\r\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (pastedList.length > 0) {
        let pIdx = 0;
        for (let pos = 1; pos <= sublist.requiredSeats && pIdx < pastedList.length; pos++) {
          if (sublist.candidates.some((c) => c.orden === pos)) continue;
          assignments.push({ orden: pos, cedula: pastedList[pIdx++] });
        }
      } else {
        for (let pos = 1; pos <= sublist.requiredSeats; pos++) {
          const val = (batchSlotCedulas[pos] || '').trim();
          if (val) assignments.push({ orden: pos, cedula: val });
        }
      }

      if (assignments.length === 0) {
        setBatchError('Ingrese al menos una cédula (numero_ced) para cargar automáticamente.');
        return;
      }

      const existingCedulas = new Set(sublist.candidates.map((c) => c.numero_ced));
      const existingOrders = new Set(sublist.candidates.map((c) => c.orden));
      const newEntries: CandidateEntry[] = [];
      const errors: string[] = [];
      let autoObsCount = 0;

      for (const item of assignments) {
        if (existingOrders.has(item.orden)) {
          errors.push(`Escaño #${item.orden} ya ocupado.`);
          continue;
        }
        const rec = await resolvePadronRecord(item.cedula);
        if (!rec) {
          errors.push(`Escaño #${item.orden}: numero_ced ${item.cedula} no existe en PadronANR.`);
          continue;
        }
        const elig = validateCandidateEligibility(rec, eligibilityRules);
        if (!elig.blockingValid) {
          errors.push(`Escaño #${item.orden}: ${elig.blockingErrors.join(' ')}`);
          continue;
        }
        if (!elig.ageValid || !elig.seccionalValid) {
          autoObsCount++;
        }
        if (existingCedulas.has(rec.numero_ced)) {
          errors.push(`Escaño #${item.orden}: C.I. ${item.cedula} está duplicada en esta lista.`);
          continue;
        }
        if (excludedCedulas && excludedCedulas.has(rec.numero_ced)) {
          errors.push(`Escaño #${item.orden}: C.I. ${item.cedula} ya figura en otra sublista.`);
          continue;
        }
        existingCedulas.add(rec.numero_ced);
        existingOrders.add(item.orden);
        newEntries.push(buildEntryFromPadron(rec, item.orden, sublist.cargo));
      }

      if (newEntries.length > 0) {
        onChange({
          ...sublist,
          candidates: [...sublist.candidates, ...newEntries].sort((a, b) => a.orden - b.orden),
        });
        setBatchFeedback(
          autoObsCount > 0
            ? `Se cargaron ${newEntries.length} candidato(s) desde PadronANR (${autoObsCount} con observación automática).`
            : `Se cargaron automáticamente ${newEntries.length} candidato(s) validados desde PadronANR.`
        );
        setBatchTextArea('');
        setBatchSlotCedulas({});
      }

      if (errors.length > 0) {
        setBatchError(errors.slice(0, 6).join(' | '));
      }
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleUpdateOrder = (cedula: string, newOrderRaw: string) => {
    const parsed = Number(newOrderRaw);
    if (!Number.isInteger(parsed)) return;
    const updated = sublist.candidates.map((c) =>
      c.numero_ced === cedula ? { ...c, orden: parsed } : c
    );
    onChange({ ...sublist, candidates: updated });
  };

  const handleUpdateCandidateField = (
    cedula: string,
    field: 'apellido' | 'nombre' | 'telefono' | 'observacion',
    value: string
  ) => {
    const updated = sublist.candidates.map((c) =>
      c.numero_ced === cedula ? { ...c, [field]: value } : c
    );
    onChange({ ...sublist, candidates: updated });
  };

  const handleRemoveCandidate = (cedula: string) => {
    onChange({
      ...sublist,
      candidates: sublist.candidates.filter((c) => c.numero_ced !== cedula),
    });
  };

  const handleFillRemainingFromPadron = () => {
    setFillError(null);
    const currentSet = new Set(sublist.candidates.map((c) => c.numero_ced));
    const currentOrders = new Set(sublist.candidates.map((c) => c.orden));

    const missingOrders: number[] = [];
    for (let i = 1; i <= sublist.requiredSeats; i++) {
      if (!currentOrders.has(i)) missingOrders.push(i);
    }

    const eligible = padronCatalog.filter(
      (r) =>
        Boolean(r.numero_ced) &&
        !currentSet.has(r.numero_ced) &&
        !(excludedCedulas && excludedCedulas.has(r.numero_ced)) &&
        validateCandidateEligibility(r, eligibilityRules).valid
    );

    if (eligible.length === 0) {
      setFillError(
        `No se encontraron afiliados disponibles en el PadronANR que cumplan los requisitos (${eligibilityRules.ruleSummary || 'generales'}).`
      );
      return;
    }

    const added: CandidateEntry[] = [];
    for (let idx = 0; idx < missingOrders.length && idx < eligible.length; idx++) {
      const rec = eligible[idx];
      added.push(buildEntryFromPadron(rec, missingOrders[idx], sublist.cargo));
    }

    onChange({
      ...sublist,
      candidates: [...sublist.candidates, ...added].sort((a, b) => a.orden - b.orden),
    });
  };

  const orderCounts = new Map<number, number>();
  sublist.candidates.forEach((c) => {
    orderCounts.set(c.orden, (orderCounts.get(c.orden) || 0) + 1);
  });
  const hasOrderDuplicates = Array.from(orderCounts.values()).some((cnt) => cnt > 1);

  const candidateByOrder = new Map<number, CandidateEntry>();
  const extraOrDuplicateCandidates: CandidateEntry[] = [];
  for (const cand of sublist.candidates) {
    if (
      cand.orden >= 1 &&
      cand.orden <= sublist.requiredSeats &&
      !candidateByOrder.has(cand.orden)
    ) {
      candidateByOrder.set(cand.orden, cand);
    } else {
      extraOrDuplicateCandidates.push(cand);
    }
  }

  const seatSlots = Array.from({ length: sublist.requiredSeats }, (_, i) => i + 1);
  const autoObservedCount = sublist.candidates.filter((c) => {
    const src = padronMap.get(c.numero_ced) || c;
    const el = validateCandidateEligibility(src, eligibilityRules);
    return !el.ageValid || !el.seccionalValid;
  }).length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h3 className="text-base font-bold text-slate-900">{sublist.label}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {sublist.tipo === 'UNIPERSONAL' ? 'Candidatura Unipersonal' : 'Candidatura Plurinominal'}
            {' · '}
            {sublist.cargo}
            {sublist.departamento ? ` · ${sublist.departamento}` : ''}
          </p>
          {eligibilityRules.ruleSummary && (
            <p className="text-[11px] font-semibold text-[#B91C1C] mt-1">
              {eligibilityRules.ruleSummary}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs">
          <div>
            <span className="text-slate-500 block">Escaños Obligatorios</span>
            <span className="font-mono font-bold text-slate-900 text-sm tabular-nums">
              {sublist.requiredSeats}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Cargados</span>
            <span className="font-mono font-bold text-slate-900 text-sm tabular-nums">
              {loadedCount}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Disponibles</span>
            <span
              className={`font-mono font-bold text-sm tabular-nums ${
                availableSeats === 0 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {availableSeats}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-semibold">
            {isComplete && !hasOrderDuplicates ? (
              <span className="text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Lista Completa
              </span>
            ) : (
              <span className="text-amber-700 inline-flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {hasOrderDuplicates ? 'Orden Duplicado' : `Faltan ${availableSeats}`}
              </span>
            )}
            {autoObservedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {autoObservedCount} en Observación
              </span>
            )}
          </div>
        </div>
      </div>

      {!readOnly && (
        <CandidateLookupInput
          padronCatalog={padronCatalog}
          padronMap={padronMap}
          nextDefaultOrder={nextDefaultOrder}
          maxOrder={sublist.requiredSeats}
          isUnipersonal={isUnipersonal}
          cargoLabel={sublist.cargo}
          eligibilityRules={eligibilityRules}
          onAddCandidate={handleAddCandidate}
        />
      )}

      {!readOnly && availableSeats > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <button
            type="button"
            onClick={() => setShowBatchCedulaForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-slate-800 font-semibold rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ListChecks className="w-3.5 h-3.5 text-[#B91C1C]" />
            {showBatchCedulaForm
              ? 'Ocultar Formulario Automático por Cédulas'
              : `Formulario Automático por numero_ced (${sublist.requiredSeats} escaños)`}
          </button>

          <button
            type="button"
            onClick={handleFillRemainingFromPadron}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            Asignar desde Padrón ({availableSeats} vacantes)
          </button>
        </div>
      )}

      {!readOnly && fillError && (
        <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{fillError}</span>
        </div>
      )}

      {!readOnly && showBatchCedulaForm && availableSeats > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#B91C1C]" />
                Carga Automática de {sublist.requiredSeats} Escaño(s) mediante numero_ced
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Complete los campos por escaño o pegue un listado de numero_ced (una por línea o separadas por coma) para autocompletar desde PadronANR.
              </p>
            </div>
            <button
              type="button"
              disabled={batchProcessing}
              onClick={() => void handleBatchAutoLoad()}
              className="px-3.5 py-2 bg-[#B91C1C] text-white text-xs font-semibold rounded-lg hover:bg-[#991B1B] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              {batchProcessing ? 'Validando PadronANR...' : 'Cargar y Validar en PadronANR'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
                {seatSlots.map((pos) => {
                  const occupied = candidateByOrder.get(pos);
                  return (
                    <div key={pos} className="space-y-1">
                      <label className="block text-[11px] font-mono font-semibold text-slate-600 tabular-nums">
                        Escaño #{pos}
                      </label>
                      {occupied ? (
                        <div className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-[11px] font-mono text-emerald-800 truncate">
                          {occupied.numero_ced} · Cargado
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={batchSlotCedulas[pos] || ''}
                          onChange={(e) =>
                            setBatchSlotCedulas((prev) => ({ ...prev, [pos]: e.target.value }))
                          }
                          placeholder="numero_ced"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-4 space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-700">
                O pegar lista de numero_ced (lote):
              </label>
              <textarea
                rows={5}
                value={batchTextArea}
                onChange={(e) => setBatchTextArea(e.target.value)}
                placeholder={'1420000\n1439371\n1458742'}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          {batchFeedback && (
            <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{batchFeedback}</span>
            </div>
          )}
          {batchError && (
            <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{batchError}</span>
            </div>
          )}
        </div>
      )}

      {/* Full Seat Table (1..requiredSeats) ordered ascending, showing "Sin Registro" for empty seats */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
              <th className="py-2.5 px-3 w-28">Número de Orden</th>
              <th className="py-2.5 px-3">Nombres y Apellidos</th>
              <th className="py-2.5 px-3">Cédula de Identidad</th>
              <th className="py-2.5 px-3">Teléfono</th>
              <th className="py-2.5 px-3">Observación</th>
              {!readOnly && <th className="py-2.5 px-3 text-right w-14">Acción</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {seatSlots.map((pos) => {
              const cand = candidateByOrder.get(pos);
              if (!cand) {
                return (
                  <tr key={`empty-${pos}`} className="bg-slate-50/40">
                    <td className="py-2 px-3 font-mono font-bold text-slate-500 tabular-nums">
                      #{pos}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="italic font-medium text-slate-500">
                          Sin Registro
                        </span>
                        {!readOnly && (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={slotCedulas[pos] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSlotCedulas((prev) => ({ ...prev, [pos]: val }));
                                const trimmed = val.trim();
                                if (trimmed && padronMap.has(trimmed)) {
                                  void handleAssignSlotByCedula(pos, trimmed);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void handleAssignSlotByCedula(pos);
                                }
                              }}
                              placeholder="Cargar por C.I...."
                              className="w-36 px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 focus:outline-none focus:border-[#B91C1C]"
                            />
                            <button
                              type="button"
                              disabled={slotLoading[pos]}
                              onClick={() => void handleAssignSlotByCedula(pos)}
                              className="px-2.5 py-1 bg-slate-900 text-white text-[11px] font-semibold rounded hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                            >
                              {slotLoading[pos] ? '...' : 'Cargar'}
                            </button>
                            {slotErrors[pos] && (
                              <span className="text-[11px] text-red-700 font-medium">
                                {slotErrors[pos]}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 italic text-slate-400">Sin Registro</td>
                    <td className="py-2 px-3 italic text-slate-400">Sin Registro</td>
                    <td className="py-2 px-3 italic text-slate-400">Sin Registro</td>
                    {!readOnly && <td className="py-2 px-3 text-right text-slate-400">—</td>}
                  </tr>
                );
              }

              const isDupOrder = (orderCounts.get(cand.orden) || 0) > 1;
              const invalidRange = cand.orden < 1 || cand.orden > sublist.requiredSeats;
              const padronSource = padronMap.get(cand.numero_ced) || cand;
              const rowElig = validateCandidateEligibility(padronSource, eligibilityRules);
              const hasRowAutoObs = !rowElig.ageValid || !rowElig.seccionalValid;
              const hasManualObs = Boolean((cand.observacion || '').trim());
              const hasAnyObs = hasRowAutoObs || hasManualObs;
              return (
                <tr
                  key={cand.numero_ced}
                  className={
                    hasAnyObs ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-slate-50/70'
                  }
                >
                  <td className="py-2 px-3">
                    {isUnipersonal || readOnly ? (
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        #{cand.orden}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        max={sublist.requiredSeats}
                        value={cand.orden}
                        onChange={(e) => handleUpdateOrder(cand.numero_ced, e.target.value)}
                        className={`w-16 px-2 py-1 rounded border font-mono tabular-nums text-xs ${
                          isDupOrder || invalidRange
                            ? 'border-red-500 bg-red-50 text-red-800 font-bold'
                            : 'border-slate-300 bg-white text-slate-900'
                        }`}
                      />
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {readOnly ? (
                      <span className="font-medium text-slate-900">
                        {cand.nombre} {cand.apellido}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        <input
                          type="text"
                          value={cand.nombre}
                          onChange={(e) =>
                            handleUpdateCandidateField(cand.numero_ced, 'nombre', e.target.value)
                          }
                          placeholder="Nombres"
                          className="w-28 px-2 py-1 border border-slate-200 rounded text-xs font-medium text-slate-900 bg-white focus:border-[#B91C1C] focus:outline-none"
                        />
                        <input
                          type="text"
                          value={cand.apellido}
                          onChange={(e) =>
                            handleUpdateCandidateField(cand.numero_ced, 'apellido', e.target.value)
                          }
                          placeholder="Apellidos"
                          className="w-28 px-2 py-1 border border-slate-200 rounded text-xs font-medium text-slate-900 bg-white focus:border-[#B91C1C] focus:outline-none"
                        />
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                    {cand.numero_ced}
                  </td>
                  <td className="py-2 px-3">
                    {readOnly ? (
                      <span className="font-mono text-slate-700">
                        {cand.telefono || 'Sin Registro'}
                      </span>
                    ) : (
                      <input
                        type="tel"
                        value={cand.telefono || ''}
                        onChange={(e) =>
                          handleUpdateCandidateField(cand.numero_ced, 'telefono', e.target.value)
                        }
                        placeholder="0981 000 000"
                        className="w-32 px-2 py-1 border border-slate-300 rounded text-xs font-mono text-slate-900 bg-white focus:border-[#B91C1C] focus:outline-none"
                      />
                    )}
                  </td>
                  <td className="py-2 px-3 space-y-1">
                    {!rowElig.ageValid && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Edad {rowElig.ageYears !== null ? `${rowElig.ageYears} años` : 's/d'} (&lt;{' '}
                        {eligibilityRules.minAge} años)
                      </span>
                    )}
                    {!rowElig.seccionalValid && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Figura en Seccional {padronSource.codigo_sec || 's/d'} (
                        {padronSource.desc_dep || 'Sin Dpto.'}
                        {padronSource.desc_dis ? ` · ${padronSource.desc_dis}` : ''})
                      </span>
                    )}
                    {readOnly ? (
                      <span
                        className={`block ${
                          hasManualObs || hasRowAutoObs
                            ? 'text-red-700 font-semibold'
                            : 'text-slate-700'
                        }`}
                      >
                        {cand.observacion || (!hasRowAutoObs ? 'Sin observación' : '')}
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={cand.observacion || ''}
                        onChange={(e) =>
                          handleUpdateCandidateField(cand.numero_ced, 'observacion', e.target.value)
                        }
                        placeholder={
                          !hasRowAutoObs ? 'Sin observación' : 'Nota adicional (opcional)...'
                        }
                        className={`w-44 px-2 py-1 border rounded text-xs bg-white focus:border-[#B91C1C] focus:outline-none ${
                          hasManualObs
                            ? 'border-red-300 text-red-700 font-medium'
                            : 'border-slate-200 text-slate-800'
                        }`}
                      />
                    )}
                  </td>
                  {!readOnly && (
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveCandidate(cand.numero_ced)}
                        title="Quitar candidato"
                        className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}

            {extraOrDuplicateCandidates.map((cand, idx) => (
              <tr key={`dup-${cand.numero_ced}-${idx}`} className="bg-red-50/60">
                <td className="py-2 px-3">
                  <input
                    type="number"
                    min={1}
                    max={sublist.requiredSeats}
                    disabled={readOnly}
                    value={cand.orden}
                    onChange={(e) => handleUpdateOrder(cand.numero_ced, e.target.value)}
                    className="w-16 px-2 py-1 rounded border border-red-500 bg-red-50 text-red-800 font-mono font-bold tabular-nums text-xs"
                  />
                </td>
                <td className="py-2 px-3 font-medium text-red-900">
                  {cand.nombre} {cand.apellido}
                </td>
                <td className="py-2 px-3 font-mono font-semibold text-red-900 tabular-nums">
                  {cand.numero_ced}
                </td>
                <td className="py-2 px-3 font-mono text-red-800">
                  {cand.telefono || 'Sin Registro'}
                </td>
                <td className="py-2 px-3 text-red-800 font-semibold">
                  Orden duplicado o fuera de rango
                </td>
                {!readOnly && (
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemoveCandidate(cand.numero_ced)}
                      className="p-1.5 text-red-700 hover:bg-red-100 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
