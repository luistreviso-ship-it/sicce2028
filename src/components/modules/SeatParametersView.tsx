import React, { useEffect, useMemo, useState } from 'react';
import { Save, CheckCircle2, Plus, Lock, Search } from 'lucide-react';
import {
  DEPARTAMENTOS_CON_CAPITAL,
  DEPARTAMENTOS_SIN_CAPITAL,
} from '../../data/paraguayElectoralData';
import { updateSeatParameters } from '../../services/firestoreService';
import { SeatParameters, SeccionalSeatConfig, UserProfile } from '../../types/electoral';

interface SeatParametersViewProps {
  seatParams: SeatParameters;
  currentUser: UserProfile;
  staffUids: string[];
  onUpdated: (updated: SeatParameters) => void;
}

export const SeatParametersView: React.FC<SeatParametersViewProps> = ({
  seatParams,
  currentUser,
  staffUids,
  onUpdated,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const [activeTab, setActiveTab] = useState<'nacionales' | 'departamentos' | 'seccionales'>(
    'nacionales'
  );
  const [draft, setDraft] = useState<SeatParameters>(seatParams);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Filters for the 389 Seccionales table
  const [secSearch, setSecSearch] = useState('');
  const [secDeptoFilter, setSecDeptoFilter] = useState('TODOS');
  const [secDistritoFilter, setSecDistritoFilter] = useState('TODOS');

  // New Seccional form state
  const [newSecNro, setNewSecNro] = useState('');
  const [newSecNombre, setNewSecNombre] = useState('');
  const [newSecDepto, setNewSecDepto] = useState('Capital');
  const [newSecDistrito, setNewSecDistrito] = useState('Asunción');

  useEffect(() => {
    setDraft(seatParams);
  }, [seatParams]);

  const allSeccionales = useMemo(() => {
    return Object.values(draft.seccionalesConfig).sort((a, b) => {
      const deptCmp = a.departamento.localeCompare(b.departamento);
      if (deptCmp !== 0) return deptCmp;
      const distCmp = a.distrito.localeCompare(b.distrito);
      if (distCmp !== 0) return distCmp;
      return Number(a.nroSeccional || 0) - Number(b.nroSeccional || 0) || a.nombre.localeCompare(b.nombre);
    });
  }, [draft.seccionalesConfig]);

  const availableDistritos = useMemo(() => {
    const set = new Set<string>();
    allSeccionales
      .filter((s) => secDeptoFilter === 'TODOS' || s.departamento === secDeptoFilter)
      .forEach((s) => set.add(s.distrito));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allSeccionales, secDeptoFilter]);

  const filteredSeccionales = useMemo(() => {
    const q = secSearch.trim().toLowerCase();
    return allSeccionales.filter((sec) => {
      if (secDeptoFilter !== 'TODOS' && sec.departamento !== secDeptoFilter) return false;
      if (secDistritoFilter !== 'TODOS' && sec.distrito !== secDistritoFilter) return false;
      if (!q) return true;
      return (
        sec.nombre.toLowerCase().includes(q) ||
        sec.distrito.toLowerCase().includes(q) ||
        sec.departamento.toLowerCase().includes(q) ||
        (sec.nroSeccional || '').toLowerCase().includes(q) ||
        sec.id.toLowerCase().includes(q)
      );
    });
  }, [allSeccionales, secSearch, secDeptoFilter, secDistritoFilter]);

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setSavedNotice(null);
    try {
      await updateSeatParameters(draft, currentUser, staffUids);
      onUpdated(draft);
      setSavedNotice('Parámetros de escaños y plazos electorales actualizados correctamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSeccional = () => {
    const cleanNro = newSecNro.trim().replace(/[^a-zA-Z0-9]/g, '');
    if (!cleanNro || !newSecNombre.trim() || !newSecDistrito.trim()) return;
    const codIdx = DEPARTAMENTOS_CON_CAPITAL.indexOf(newSecDepto);
    const codDepto = String(Math.max(0, codIdx)).padStart(2, '0');
    const cleanId = `SEC-${codDepto}-${cleanNro.padStart(3, '0')}`;
    const entry: SeccionalSeatConfig = {
      id: cleanId,
      codDepto,
      nroSeccional: cleanNro,
      nombre: newSecNombre.trim(),
      departamento: newSecDepto,
      distrito: newSecDistrito.trim(),
      miembrosTitulares: 10,
      miembrosSuplentes: 10,
      convencionalesTitulares: 4,
      convencionalesSuplentes: 4,
    };
    setDraft((prev) => ({
      ...prev,
      seccionalesConfig: { ...prev.seccionalesConfig, [cleanId]: entry },
    }));
    setNewSecNro('');
    setNewSecNombre('');
  };

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-2.5 text-xs text-amber-900">
          <Lock className="w-4 h-4 shrink-0" />
          <span>
            Vista de solo lectura. Solo un usuario con perfil <strong>Administrador</strong> puede modificar los parámetros de escaños y fechas límite.
          </span>
        </div>
      )}

      {/* Unified Header, Tabs & Single Save Action */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('nacionales')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                activeTab === 'nacionales'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Plazos y Escaños Nacionales
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('departamentos')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                activeTab === 'departamentos'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Matriz Departamental (18)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('seccionales')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                activeTab === 'seccionales'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Seccionales ANR ({allSeccionales.length})
            </button>
          </div>

          {isAdmin && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#B91C1C] text-white text-xs font-semibold rounded-lg hover:bg-[#991B1B] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar Parámetros'}
            </button>
          )}
        </div>

        {savedNotice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{savedNotice}</span>
          </div>
        )}

        {activeTab === 'nacionales' && (
          <div className="space-y-5">

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Fecha Límite Autoridades Nacionales
            </label>
            <input
              type="date"
              disabled={!isAdmin}
              value={draft.deadlineNacional}
              onChange={(e) => setDraft({ ...draft, deadlineNacional: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Fecha Límite Candidaturas ANR
            </label>
            <input
              type="date"
              disabled={!isAdmin}
              value={draft.deadlineAnr}
              onChange={(e) => setDraft({ ...draft, deadlineAnr: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Fecha Límite Seccionales ANR
            </label>
            <input
              type="date"
              disabled={!isAdmin}
              value={draft.deadlineSeccional}
              onChange={(e) => setDraft({ ...draft, deadlineSeccional: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums disabled:bg-slate-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Senadores Titulares
            </label>
            <input
              type="number"
              min={1}
              max={200}
              disabled={!isAdmin}
              value={draft.senadoresTitulares}
              onChange={(e) =>
                setDraft({ ...draft, senadoresTitulares: Math.max(1, Number(e.target.value) || 1) })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Senadores Suplentes
            </label>
            <input
              type="number"
              min={1}
              max={200}
              disabled={!isAdmin}
              value={draft.senadoresSuplentes}
              onChange={(e) =>
                setDraft({ ...draft, senadoresSuplentes: Math.max(1, Number(e.target.value) || 1) })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Junta Gob. Nacional Titulares
            </label>
            <input
              type="number"
              min={1}
              max={200}
              disabled={!isAdmin}
              value={draft.juntaGobNacionalTitulares}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  juntaGobNacionalTitulares: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Junta Gob. Nacional Suplentes
            </label>
            <input
              type="number"
              min={1}
              max={200}
              disabled={!isAdmin}
              value={draft.juntaGobNacionalSuplentes}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  juntaGobNacionalSuplentes: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tabular-nums disabled:bg-slate-50"
            />
          </div>
          </div>
          </div>
        )}

        {/* Departmental Matrices */}
        {activeTab === 'departamentos' && (
          <div className="space-y-4">
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <th className="py-2.5 px-3">Departamento / Capital</th>
                <th className="py-2.5 px-3">Diputados (Tit / Sup)</th>
                <th className="py-2.5 px-3">Junta Departamental (Tit / Sup)</th>
                <th className="py-2.5 px-3">Junta Gob. Regional ANR (Tit / Sup)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DEPARTAMENTOS_CON_CAPITAL.map((dept) => {
                const dip = draft.diputadosByDept[dept] || { titulares: 2, suplentes: 2 };
                const jDept = draft.juntaDeptByDept[dept];
                const jReg = draft.juntaGobRegionalByDept[dept] || { titulares: 1, suplentes: 1 };
                const hasGov = DEPARTAMENTOS_SIN_CAPITAL.includes(dept);

                return (
                  <tr key={dept} className="hover:bg-slate-50/70">
                    <td className="py-2 px-3 font-semibold text-slate-900">{dept}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={50}
                          disabled={!isAdmin}
                          value={dip.titulares}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              diputadosByDept: {
                                ...draft.diputadosByDept,
                                [dept]: {
                                  ...dip,
                                  titulares: Math.max(1, Number(e.target.value) || 1),
                                },
                              },
                            })
                          }
                          className="w-14 px-2 py-1 border border-slate-300 rounded font-mono tabular-nums disabled:bg-slate-50"
                        />
                        <span>/</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          disabled={!isAdmin}
                          value={dip.suplentes}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              diputadosByDept: {
                                ...draft.diputadosByDept,
                                [dept]: {
                                  ...dip,
                                  suplentes: Math.max(1, Number(e.target.value) || 1),
                                },
                              },
                            })
                          }
                          className="w-14 px-2 py-1 border border-slate-300 rounded font-mono tabular-nums disabled:bg-slate-50"
                        />
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      {hasGov && jDept ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={50}
                            disabled={!isAdmin}
                            value={jDept.titulares}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                juntaDeptByDept: {
                                  ...draft.juntaDeptByDept,
                                  [dept]: {
                                    ...jDept,
                                    titulares: Math.max(1, Number(e.target.value) || 1),
                                  },
                                },
                              })
                            }
                            className="w-14 px-2 py-1 border border-slate-300 rounded font-mono tabular-nums disabled:bg-slate-50"
                          />
                          <span>/</span>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            disabled={!isAdmin}
                            value={jDept.suplentes}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                juntaDeptByDept: {
                                  ...draft.juntaDeptByDept,
                                  [dept]: {
                                    ...jDept,
                                    suplentes: Math.max(1, Number(e.target.value) || 1),
                                  },
                                },
                              })
                            }
                            className="w-14 px-2 py-1 border border-slate-300 rounded font-mono tabular-nums disabled:bg-slate-50"
                          />
                        </div>
                      ) : (
                        <span className="text-slate-400">No aplica (Distrito Capital)</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={30}
                          disabled={!isAdmin}
                          value={jReg.titulares}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              juntaGobRegionalByDept: {
                                ...draft.juntaGobRegionalByDept,
                                [dept]: {
                                  ...jReg,
                                  titulares: Math.max(1, Number(e.target.value) || 1),
                                },
                              },
                            })
                          }
                          className="w-14 px-2 py-1 border border-slate-300 rounded font-mono tabular-nums disabled:bg-slate-50"
                        />
                        <span>/</span>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          disabled={!isAdmin}
                          value={jReg.suplentes}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              juntaGobRegionalByDept: {
                                ...draft.juntaGobRegionalByDept,
                                [dept]: {
                                  ...jReg,
                                  suplentes: Math.max(1, Number(e.target.value) || 1),
                                },
                              },
                            })
                          }
                          className="w-14 px-2 py-1 border border-slate-300 rounded font-mono tabular-nums disabled:bg-slate-50"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          </div>
        )}

        {/* Seccionales Parameters */}
        {activeTab === 'seccionales' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 tabular-nums">
              Mostrando {filteredSeccionales.length} de {allSeccionales.length} seccionales oficiales.
            </p>

        {/* Search & Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={secSearch}
              onChange={(e) => setSecSearch(e.target.value)}
              placeholder="Buscar N.º Seccional, descripción o distrito..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
            />
          </div>
          <select
            value={secDeptoFilter}
            onChange={(e) => {
              setSecDeptoFilter(e.target.value);
              setSecDistritoFilter('TODOS');
            }}
            className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
          >
            <option value="TODOS">Todos los Departamentos</option>
            {DEPARTAMENTOS_CON_CAPITAL.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={secDistritoFilter}
            onChange={(e) => setSecDistritoFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
          >
            <option value="TODOS">Todos los Distritos ({availableDistritos.length})</option>
            {availableDistritos.map((dist) => (
              <option key={dist} value={dist}>
                {dist}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto max-h-[520px] overflow-y-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
              <tr>
                <th className="py-2.5 px-3">N.º Secc.</th>
                <th className="py-2.5 px-3">Departamento</th>
                <th className="py-2.5 px-3">Distrito</th>
                <th className="py-2.5 px-3">Descripción de la Seccional</th>
                <th className="py-2.5 px-3">Miembros Secc. (Tit / Sup)</th>
                <th className="py-2.5 px-3">Convencionales (Tit / Sup)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSeccionales.map((sec) => (
                <tr key={sec.id} className="hover:bg-slate-50/70">
                  <td className="py-2 px-3 font-mono font-bold text-slate-800 tabular-nums whitespace-nowrap">
                    {sec.nroSeccional || sec.id}
                  </td>
                  <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                    {sec.departamento}
                  </td>
                  <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap">
                    {sec.distrito}
                  </td>
                  <td className="py-2 px-3 font-medium text-slate-900">
                    {sec.nombre}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={40}
                        disabled={!isAdmin}
                        value={sec.miembrosTitulares}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            seccionalesConfig: {
                              ...draft.seccionalesConfig,
                              [sec.id]: {
                                ...sec,
                                miembrosTitulares: Math.max(1, Number(e.target.value) || 1),
                              },
                            },
                          })
                        }
                        className="w-14 px-2 py-1 border border-slate-300 rounded font-mono tabular-nums disabled:bg-slate-50"
                      />
                      <span>/</span>
                      <input
                        type="number"
                        min={1}
                        max={40}
                        disabled={!isAdmin}
                        value={sec.miembrosSuplentes}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            seccionalesConfig: {
                              ...draft.seccionalesConfig,
                              [sec.id]: {
                                ...sec,
                                miembrosSuplentes: Math.max(1, Number(e.target.value) || 1),
                              },
                            },
                          })
                        }
                        className="w-14 px-2 py-1 border border-slate-300 rounded font-mono tabular-nums disabled:bg-slate-50"
                      />
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        disabled={!isAdmin}
                        value={sec.convencionalesTitulares}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            seccionalesConfig: {
                              ...draft.seccionalesConfig,
                              [sec.id]: {
                                ...sec,
                                convencionalesTitulares: Math.max(1, Number(e.target.value) || 1),
                              },
                            },
                          })
                        }
                        className="w-14 px-2 py-1 border border-slate-300 rounded font-mono tabular-nums disabled:bg-slate-50"
                      />
                      <span>/</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        disabled={!isAdmin}
                        value={sec.convencionalesSuplentes}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            seccionalesConfig: {
                              ...draft.seccionalesConfig,
                              [sec.id]: {
                                ...sec,
                                convencionalesSuplentes: Math.max(1, Number(e.target.value) || 1),
                              },
                            },
                          })
                        }
                        className="w-14 px-2 py-1 border border-slate-300 rounded font-mono tabular-nums disabled:bg-slate-50"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isAdmin && (
          <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">N.º Seccional</label>
              <input
                type="text"
                value={newSecNro}
                onChange={(e) => setNewSecNro(e.target.value)}
                placeholder="Ej: 471"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Departamento</label>
              <select
                value={newSecDepto}
                onChange={(e) => {
                  setNewSecDepto(e.target.value);
                  setNewSecDistrito(e.target.value === 'Capital' ? 'Asunción' : '');
                }}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
              >
                {DEPARTAMENTOS_CON_CAPITAL.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Distrito</label>
              <input
                type="text"
                value={newSecDistrito}
                onChange={(e) => setNewSecDistrito(e.target.value)}
                placeholder="Ej: Asunción"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Descripción de Seccional
              </label>
              <input
                type="text"
                value={newSecNombre}
                onChange={(e) => setNewSecNombre(e.target.value)}
                placeholder="Ej: Seccional Colorada N.º 471"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <button
              type="button"
              onClick={handleAddSeccional}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar
            </button>
          </div>
        )}
          </div>
        )}
      </div>
    </div>
  );
};
