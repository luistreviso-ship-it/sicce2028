import React, { useMemo } from 'react';
import {
  Landmark,
  Flag,
  Building2,
  CalendarClock,
  FileCheck2,
  ArrowRight,
  Database,
  BarChart3,
  ClipboardCheck,
} from 'lucide-react';
import {
  AppRoute,
  Candidature,
  CandidatureModuleType,
  PadronRecord,
  SeatParameters,
  UserProfile,
} from '../types/electoral';

interface DashboardOverviewProps {
  currentUser: UserProfile;
  seatParams: SeatParameters;
  padronCatalog: PadronRecord[];
  candidatures: Candidature[];
  onNavigate: (route: AppRoute) => void;
}

const MODULE_LABELS: Record<CandidatureModuleType, string> = {
  NACIONAL_PRESIDENCIA: 'Presidente y Vicepresidente',
  NACIONAL_SENADORES: 'Senadores Nacionales',
  NACIONAL_DIPUTADOS: 'Diputados Nacionales',
  NACIONAL_GOBERNACION: 'Gobernador y Junta Dptal.',
  ANR_NACIONAL_REGIONAL: 'Autoridades Partidarias ANR',
  SECCIONAL_ANR: 'Seccionales ANR',
};

function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T23:59:59`);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  currentUser,
  seatParams,
  padronCatalog,
  candidatures,
  onNavigate,
}) => {
  const stats = useMemo(() => {
    const total = candidatures.length;
    const completas = candidatures.filter((c) => c.isComplete).length;
    const incompletas = candidatures.filter((c) => !c.isComplete).length;
    const aprobadas = candidatures.filter((c) => c.reviewStatus === 'APROBADA').length;
    const pendientes = candidatures.filter((c) => c.reviewStatus === 'PENDIENTE').length;
    const observadas = candidatures.filter((c) => c.reviewStatus === 'OBSERVADA').length;

    const totalCandidatos = candidatures.reduce((sum, c) => sum + c.totalCandidates, 0);
    const totalRequeridos = candidatures.reduce((sum, c) => sum + c.requiredCandidates, 0);
    const coberturaPct =
      totalRequeridos > 0 ? Math.round((totalCandidatos / totalRequeridos) * 100) : 0;

    let candidatosConTelefono = 0;
    candidatures.forEach((c) => {
      c.sublists.forEach((s) => {
        s.candidates.forEach((cand) => {
          if (cand.telefono && cand.telefono.trim().length > 0) {
            candidatosConTelefono++;
          }
        });
      });
    });

    const moduleRows = (Object.keys(MODULE_LABELS) as CandidatureModuleType[]).map((mod) => {
      const items = candidatures.filter((c) => c.moduleType === mod);
      const loaded = items.reduce((s, c) => s + c.totalCandidates, 0);
      const required = items.reduce((s, c) => s + c.requiredCandidates, 0);
      return {
        moduleType: mod,
        label: MODULE_LABELS[mod],
        total: items.length,
        completas: items.filter((c) => c.isComplete).length,
        incompletas: items.filter((c) => !c.isComplete).length,
        loaded,
        required,
      };
    });

    const listRows = ['A', 'B', 'C', 'D'].map((list) => {
      const items = candidatures.filter((c) => c.listNumber === list);
      return {
        list,
        total: items.length,
        candidatos: items.reduce((s, c) => s + c.totalCandidates, 0),
      };
    });

    const deptMap = new Map<
      string,
      { departamento: string; total: number; completas: number; incompletas: number; candidatos: number }
    >();
    candidatures.forEach((c) => {
      const key = c.departamento || 'Nacional';
      const prev = deptMap.get(key) || {
        departamento: key,
        total: 0,
        completas: 0,
        incompletas: 0,
        candidatos: 0,
      };
      prev.total += 1;
      if (c.isComplete) prev.completas += 1;
      else prev.incompletas += 1;
      prev.candidatos += c.totalCandidates;
      deptMap.set(key, prev);
    });

    const deptRows = Array.from(deptMap.values()).sort((a, b) => b.total - a.total);

    return {
      total,
      completas,
      incompletas,
      aprobadas,
      pendientes,
      observadas,
      totalCandidatos,
      totalRequeridos,
      coberturaPct,
      candidatosConTelefono,
      moduleRows,
      listRows,
      deptRows,
    };
  }, [candidatures]);

  const padronCount = padronCatalog.length;

  const moduleCards = [
    {
      title: 'Autoridades Nacionales',
      description: `Presidente/Vice, Senadores (${seatParams.senadoresTitulares}T/${seatParams.senadoresSuplentes}S), Diputados por Dpto. y Gobernador + Junta Dptal.`,
      date: seatParams.deadlineNacional,
      days: daysUntil(seatParams.deadlineNacional),
      route: 'nacional' as AppRoute,
      icon: Landmark,
      cta: 'Abrir Módulo Nacional',
    },
    {
      title: 'Candidaturas ANR',
      description: `Presidente ANR, Junta de Gobierno Nacional (${seatParams.juntaGobNacionalTitulares}T/${seatParams.juntaGobNacionalSuplentes}S) y 18 Segmentos Regionales.`,
      date: seatParams.deadlineAnr,
      days: daysUntil(seatParams.deadlineAnr),
      route: 'anr' as AppRoute,
      icon: Flag,
      cta: 'Abrir Módulo ANR',
    },
    {
      title: 'Seccionales ANR',
      description:
        'Cuerpo único: Presidente de Seccional, Miembros Titulares/Suplentes y Convencionales por Seccional.',
      date: seatParams.deadlineSeccional,
      days: daysUntil(seatParams.deadlineSeccional),
      route: 'seccionales' as AppRoute,
      icon: Building2,
      cta: 'Abrir Módulo Seccionales',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Candidaturas Cargadas</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {stats.total}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            <span className="text-emerald-700 font-semibold">{stats.completas} completas</span>
            {' · '}
            <span className="text-red-700 font-semibold">{stats.incompletas} incompletas</span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Estado de Revisión</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {stats.aprobadas}{' '}
            <span className="text-xs font-sans font-normal text-slate-500">aprobadas</span>
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {stats.pendientes} pendientes ·{' '}
            <span className={stats.observadas > 0 ? 'text-red-700 font-semibold' : ''}>
              {stats.observadas} observadas
            </span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Escaños Postulados</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {stats.totalCandidatos}{' '}
            <span className="text-sm font-normal text-slate-500">/ {stats.totalRequeridos}</span>
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {stats.coberturaPct}% cobertura · {stats.candidatosConTelefono} con teléfono
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Base PadronANR</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {padronCount.toLocaleString('es-PY')}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            afiliados indexados por cédula
          </p>
        </div>
      </div>

      {/* Unified Registration Modules & Electoral Deadlines */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[#B91C1C]" />
            Módulos de Carga y Calendario Electoral
          </h2>
          {currentUser.role === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate('parametros')}
              className="text-xs font-semibold text-[#B91C1C] hover:underline cursor-pointer"
            >
              Configurar Plazos y Escaños
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {moduleCards.map((card) => {
            const Icon = card.icon;
            const urgent = card.days <= 30;
            return (
              <div
                key={card.route}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Icon className="w-5 h-5 text-[#B91C1C]" />
                    <span
                      className={`text-[11px] font-mono font-bold tabular-nums ${
                        urgent ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {card.days > 0 ? `${card.days}d · ${card.date}` : `Vencido · ${card.date}`}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{card.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{card.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(card.route)}
                  className="w-full py-2 px-4 bg-[#B91C1C] text-white text-xs font-semibold rounded-lg hover:bg-[#991B1B] cursor-pointer whitespace-nowrap"
                >
                  {card.cta}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Candidatures Statistics Breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#B91C1C]" />
            Estadísticas por Módulo, Lista y Departamento
          </h2>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {stats.total} listas · {stats.totalCandidatos} candidatos
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* By Module */}
          <div className="lg:col-span-7 overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2 px-3">Módulo Electoral</th>
                  <th className="py-2 px-3 text-right">Listas</th>
                  <th className="py-2 px-3 text-right">Completas</th>
                  <th className="py-2 px-3 text-right">Incompletas</th>
                  <th className="py-2 px-3 text-right">Candidatos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.moduleRows.map((row) => (
                  <tr key={row.moduleType} className="hover:bg-slate-50/70">
                    <td className="py-2 px-3 font-medium text-slate-900">{row.label}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold tabular-nums">
                      {row.total}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-700 tabular-nums">
                      {row.completas}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-red-700 tabular-nums">
                      {row.incompletas}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700 tabular-nums">
                      {row.loaded}/{row.required}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* By Lista & By Department */}
          <div className="lg:col-span-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {stats.listRows.map((lr) => (
                <div
                  key={lr.list}
                  className="border border-slate-200 rounded-lg p-3 bg-slate-50/60"
                >
                  <p className="text-xs font-bold text-[#B91C1C]">Lista {lr.list}</p>
                  <p className="text-lg font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                    {lr.total}
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    {lr.candidatos} cand.
                  </p>
                </div>
              ))}
            </div>

            {stats.deptRows.length === 0 ? (
              <p className="text-xs text-slate-500 border border-slate-200 rounded-lg p-3">
                Sin candidaturas registradas por departamento todavía.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                {stats.deptRows.map((dr) => (
                  <div
                    key={dr.departamento}
                    className="px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <span className="font-medium text-slate-900 truncate">
                      {dr.departamento}
                    </span>
                    <span className="font-mono text-slate-700 tabular-nums shrink-0">
                      {dr.total} listas ({dr.candidatos} cand.)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Access Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('fiscalizacion')}
          className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-slate-300 transition-colors flex items-center justify-between gap-3 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-5 h-5 text-[#B91C1C] shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-900">Fiscalización Tribunal</p>
              <p className="text-[11px] text-slate-500">Checklist documental y recibo independiente</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('reportes')}
          className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-slate-300 transition-colors flex items-center justify-between gap-3 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <FileCheck2 className="w-5 h-5 text-slate-700 shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-900">Reportes e Informes</p>
              <p className="text-[11px] text-slate-500">Nóminas, recibos de candidaturas y Excel</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('padron')}
          className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-slate-300 transition-colors flex items-center justify-between gap-3 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-slate-700 shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-900">Base PadronANR</p>
              <p className="text-[11px] text-slate-500">Consulta de afiliados e importación</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </div>
    </div>
  );
};
