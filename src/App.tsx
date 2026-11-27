import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  Bell,
  Building2,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  Flag,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  Sliders,
  X,
} from 'lucide-react';
import { DashboardOverview } from './components/DashboardOverview';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginScreen } from './components/LoginScreen';
import { AnrModule } from './components/modules/AnrModule';
import { AuditAndVersionsView } from './components/modules/AuditAndVersionsView';
import { FiscalizacionView } from './components/modules/FiscalizacionView';
import { NationalModule } from './components/modules/NationalModule';
import { PadronView } from './components/modules/PadronView';
import { ReportsAndDocsView } from './components/modules/ReportsAndDocsView';
import { SeatParametersView } from './components/modules/SeatParametersView';
import { SeccionalModule } from './components/modules/SeccionalModule';
import { UsersRolesView } from './components/modules/UsersRolesView';
import { createDefaultSeatParameters } from './data/paraguayElectoralData';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './lib/firebase';
import {
  ensureUserProfile,
  fetchAllCandidaturesViaDirectory,
  fetchAllStaffProfiles,
  fetchAllUserInvitations,
  fetchAuditLogs,
  fetchListVersionsByCandidatures,
  fetchPadronCatalogFromIndex,
  getEffectivePermissions,
  markNotificationRead,
  PadronCatalogDoc,
  seedInitialDataIfNeeded,
} from './services/firestoreService';
import {
  AppRoute,
  AuditLog,
  Candidature,
  DEFAULT_MOVEMENT_NAME,
  ListVersion,
  NotificationItem,
  PadronRecord,
  SeatParameters,
  SYSTEM_NAME,
  SystemDirectory,
  UserInvitation,
  UserProfile,
} from './types/electoral';

const ROUTE_LABELS: Record<AppRoute, string> = {
  dashboard: 'Panel General',
  nacional: 'Autoridades Nacionales',
  anr: 'Candidaturas ANR',
  seccionales: 'Seccionales ANR',
  fiscalizacion: 'Fiscalización Tribunal',
  parametros: 'Parámetros de Escaños',
  padron: 'Base PadronANR',
  reportes: 'Reportes e Informes',
  auditoria: 'Auditoría y Versiones',
  usuarios: 'Roles y Permisos',
};

function AppContent() {
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [route, setRoute] = useState<AppRoute>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [crestFailed, setCrestFailed] = useState(false);

  const [seatParams, setSeatParams] = useState<SeatParameters>(() =>
    createDefaultSeatParameters('system')
  );
  const [padronCatalog, setPadronCatalog] = useState<PadronRecord[]>([]);
  const [directory, setDirectory] = useState<SystemDirectory | null>(null);
  const [candidatures, setCandidatures] = useState<Candidature[]>([]);
  const [listVersions, setListVersions] = useState<ListVersion[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<UserProfile[]>([]);
  const [userInvitations, setUserInvitations] = useState<UserInvitation[]>([]);

  const [editingCandidature, setEditingCandidature] = useState<Candidature | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setCurrentUser(null);
        setAuthReady(true);
        return;
      }
      setDataLoading(true);
      try {
        const profile = await ensureUserProfile(fbUser);
        setCurrentUser(profile);
        const seeded = await seedInitialDataIfNeeded(profile);
        if (seeded.seatParams) setSeatParams(seeded.seatParams);
        if (seeded.padronRecords.length > 0) setPadronCatalog(seeded.padronRecords);
      } catch (err) {
        setLoginError(
          err instanceof Error ? err.message : 'Error al inicializar perfil de usuario.'
        );
      } finally {
        setAuthReady(true);
        setDataLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const isBootAdmin =
    currentUser?.email.toLowerCase() === 'fcinmobiliariapy@gmail.com';

  // Real-time listeners for core configuration, catalog, directory, and notifications
  useEffect(() => {
    if (!currentUser || !currentUser.active) return;

    const unsubSeats = onSnapshot(
      doc(db, 'seat_parameters', 'anr_2027'),
      (snap) => {
        if (snap.exists()) {
          setSeatParams(snap.data() as SeatParameters);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'seat_parameters/anr_2027')
    );

    let catalogSyncSeq = 0;
    const unsubCatalog = onSnapshot(
      doc(db, 'padron_catalog', 'index_v1'),
      (snap) => {
        if (snap.exists()) {
          const seq = ++catalogSyncSeq;
          const data = snap.data() as PadronCatalogDoc;
          void fetchPadronCatalogFromIndex(data).then((allRecords) => {
            if (seq === catalogSyncSeq) {
              setPadronCatalog(allRecords);
            }
          });
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'padron_catalog/index_v1')
    );

    const unsubDir = onSnapshot(
      doc(db, 'system_directory', 'main'),
      (snap) => {
        if (snap.exists()) {
          setDirectory(snap.data() as SystemDirectory);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'system_directory/main')
    );

    const notifQuery = query(
      collection(db, 'notifications'),
      where('targetUid', '==', currentUser.uid)
    );
    const unsubNotifs = onSnapshot(
      notifQuery,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as NotificationItem);
        items.sort((a, b) => {
          const sa = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          const sb = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          return sb - sa;
        });
        setNotifications(items);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
    );

    return () => {
      unsubSeats();
      unsubCatalog();
      unsubDir();
      unsubNotifs();
    };
  }, [currentUser]);

  const refreshCollections = useCallback(async () => {
    if (!currentUser || !currentUser.active) return;
    const [cands, vers, logs] = await Promise.all([
      fetchAllCandidaturesViaDirectory(directory),
      fetchListVersionsByCandidatures(currentUser.uid, isBootAdmin),
      fetchAuditLogs(currentUser.uid, isBootAdmin),
    ]);
    setCandidatures(cands);
    setListVersions(vers);
    setAuditLogs(logs);

    if (currentUser.role === 'admin') {
      const [profiles, invites] = await Promise.all([
        fetchAllStaffProfiles(directory, currentUser),
        fetchAllUserInvitations(directory, currentUser),
      ]);
      setStaffProfiles(profiles);
      setUserInvitations(invites);
    }
  }, [currentUser, directory, isBootAdmin]);

  useEffect(() => {
    void refreshCollections();
  }, [refreshCollections]);

  const padronMap = useMemo(() => {
    const map = new Map<string, PadronRecord>();
    for (const r of padronCatalog) {
      if (r.numero_ced) map.set(r.numero_ced, r);
    }
    return map;
  }, [padronCatalog]);

  const staffUids = useMemo(() => {
    if (directory?.staffUids && directory.staffUids.length > 0) {
      return directory.staffUids;
    }
    return currentUser ? [currentUser.uid] : [];
  }, [directory, currentUser]);

  const handleSignIn = async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : 'No se pudo completar el inicio de sesión.'
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setRoute('dashboard');
  };

  const handleEditCandidature = (cand: Candidature) => {
    setEditingCandidature(cand);
    if (
      cand.moduleType === 'NACIONAL_PRESIDENCIA' ||
      cand.moduleType === 'NACIONAL_SENADORES' ||
      cand.moduleType === 'NACIONAL_DIPUTADOS' ||
      cand.moduleType === 'NACIONAL_GOBERNACION'
    ) {
      setRoute('nacional');
    } else if (cand.moduleType === 'ANR_NACIONAL_REGIONAL') {
      setRoute('anr');
    } else if (cand.moduleType === 'SECCIONAL_ANR') {
      setRoute('seccionales');
    }
  };

  const handleRouteChange = (next: AppRoute) => {
    if (next !== route) {
      setEditingCandidature(null);
    }
    setRoute(next);
    setMobileMenuOpen(false);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (!authReady || dataLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl px-8 py-6 text-center space-y-2">
          <p className="text-sm font-bold text-slate-900">
            {SYSTEM_NAME}
          </p>
          <p className="text-xs text-slate-500">
            {DEFAULT_MOVEMENT_NAME} · Sincronizando PadronANR y parámetros electorales...
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginScreen
        onSignIn={handleSignIn}
        loading={loginLoading}
        errorMsg={loginError}
      />
    );
  }

  if (!currentUser.active) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4">
          <h1 className="text-lg font-bold text-slate-900">Cuenta Suspendida</h1>
          <p className="text-sm text-slate-600">
            Tu acceso al sistema electoral ANR 2027 ha sido desactivado por un Administrador.
          </p>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  const navGroups: {
    title: string;
    items: {
      id: AppRoute;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      adminOnly?: boolean;
    }[];
  }[] = [
    {
      title: 'Principal',
      items: [{ id: 'dashboard', label: 'Panel General', icon: LayoutDashboard }],
    },
    {
      title: 'Carga de Candidaturas',
      items: [
        { id: 'nacional', label: 'Autoridades Nacionales', icon: Landmark },
        { id: 'anr', label: 'Candidaturas ANR', icon: Flag },
        { id: 'seccionales', label: 'Seccionales ANR', icon: Building2 },
      ],
    },
    {
      title: 'Control y Documentación',
      items: [
        { id: 'fiscalizacion', label: 'Fiscalización Tribunal', icon: ClipboardCheck },
        { id: 'reportes', label: 'Reportes e Informes', icon: FileSpreadsheet },
        { id: 'padron', label: 'Base PadronANR', icon: Database },
      ],
    },
    {
      title: 'Administración',
      items: [
        { id: 'parametros', label: 'Parámetros de Escaños', icon: Sliders },
        { id: 'auditoria', label: 'Auditoría y Versiones', icon: History },
        { id: 'usuarios', label: 'Roles y Permisos', icon: Shield, adminOnly: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Sidebar Navigation (260px desktop) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[260px] bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="overflow-y-auto">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {!crestFailed ? (
                <img
                  src="/src/assets/images/anr_institutional_crest_1795626748289.jpg"
                  alt="ANR 2027"
                  referrerPolicy="no-referrer"
                  onError={() => setCrestFailed(true)}
                  className="w-8 h-8 object-contain rounded border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-[#B91C1C] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  ANR
                </div>
              )}
              <div className="min-w-0">
                <span className="text-sm font-bold text-slate-900 block truncate">
                  SICCE · ANR
                </span>
                <span className="text-[10px] font-medium text-[#B91C1C] block truncate">
                  Colorado Añeteté 2028
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1 text-slate-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="p-3 space-y-4">
            {navGroups.map((group) => {
              const visible = group.items.filter(
                (item) => !item.adminOnly || currentUser.role === 'admin'
              );
              if (visible.length === 0) return null;
              return (
                <div key={group.title} className="space-y-1">
                  <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {group.title}
                  </p>
                  {visible.map((item) => {
                    const Icon = item.icon;
                    const active = route === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleRouteChange(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[#B91C1C] text-white'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="text-xs">
            <p className="font-bold text-slate-900 truncate">{currentUser.displayName}</p>
            <p className="text-slate-500 truncate">
              {currentUser.email}
            </p>
            <p className="font-mono font-semibold text-[#B91C1C] capitalize mt-0.5">
              Perfil: {currentUser.role}
            </p>
            {(() => {
              const perms = getEffectivePermissions(currentUser);
              const flags = [
                perms.alta ? 'Alta' : null,
                perms.modificacion ? 'Mod.' : null,
                perms.baja ? 'Baja' : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                  Permisos: {flags || 'Solo lectura'}
                </p>
              );
            })()}
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on left — Notification & Primary Action on right */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-700 border border-slate-200 rounded-lg"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-bold text-slate-900 truncate">
                {ROUTE_LABELS[route]}
              </h1>
              <span className="hidden md:inline text-xs text-slate-400">·</span>
              <span className="hidden md:inline text-xs text-slate-500 truncate">
                {DEFAULT_MOVEMENT_NAME}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 relative">
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="relative inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Bell className="w-4 h-4" />
              <span>Alertas</span>
              {unreadCount > 0 && (
                <span className="font-mono font-bold text-[#B91C1C] tabular-nums">
                  ({unreadCount})
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Notificaciones del Sistema
                  </span>
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Sin notificaciones pendientes.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          if (!n.read) void markNotificationRead(n);
                        }}
                        className={`w-full text-left p-3.5 hover:bg-slate-50 cursor-pointer block ${
                          n.read ? 'bg-white' : 'bg-red-50/40'
                        }`}
                      >
                        <p className="text-xs font-bold text-slate-900">{n.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                        <p className="text-[11px] font-mono text-slate-400 mt-1">
                          {n.category} · {n.read ? 'Leída' : 'Nueva'}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Viewport Workspace */}
        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {padronCatalog.length === 0 && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3">
              <span>
                La base de datos PadronANR se encuentra vacía (0 registros). Importe un archivo CSV/Excel o restaure la base desde el módulo Base PadronANR.
              </span>
              <button
                type="button"
                onClick={() => handleRouteChange('padron')}
                className="px-3 py-1.5 bg-amber-900 text-white text-xs font-semibold rounded-lg hover:bg-amber-800 cursor-pointer whitespace-nowrap"
              >
                Ir a Base PadronANR
              </button>
            </div>
          )}

          {route === 'dashboard' && (
            <DashboardOverview
              currentUser={currentUser}
              seatParams={seatParams}
              padronCatalog={padronCatalog}
              candidatures={candidatures}
              onNavigate={handleRouteChange}
            />
          )}

          {route === 'nacional' && (
            <NationalModule
              seatParams={seatParams}
              padronCatalog={padronCatalog}
              padronMap={padronMap}
              currentUser={currentUser}
              staffUids={staffUids}
              editingCandidature={editingCandidature}
              onClearEditing={() => setEditingCandidature(null)}
              onSaved={() => void refreshCollections()}
            />
          )}

          {route === 'anr' && (
            <AnrModule
              seatParams={seatParams}
              padronCatalog={padronCatalog}
              padronMap={padronMap}
              currentUser={currentUser}
              staffUids={staffUids}
              editingCandidature={editingCandidature}
              onClearEditing={() => setEditingCandidature(null)}
              onSaved={() => void refreshCollections()}
            />
          )}

          {route === 'seccionales' && (
            <SeccionalModule
              seatParams={seatParams}
              padronCatalog={padronCatalog}
              padronMap={padronMap}
              currentUser={currentUser}
              staffUids={staffUids}
              editingCandidature={editingCandidature}
              onClearEditing={() => setEditingCandidature(null)}
              onSaved={() => void refreshCollections()}
            />
          )}

          {route === 'parametros' && (
            <SeatParametersView
              seatParams={seatParams}
              currentUser={currentUser}
              staffUids={staffUids}
              onUpdated={(updated) => {
                setSeatParams(updated);
                void refreshCollections();
              }}
            />
          )}

          {route === 'padron' && (
            <PadronView
              padronCatalog={padronCatalog}
              currentUser={currentUser}
              staffUids={staffUids}
              onCatalogUpdated={(next) => {
                setPadronCatalog(next);
                void refreshCollections();
              }}
            />
          )}

          {route === 'fiscalizacion' && (
            <FiscalizacionView
              candidatures={candidatures}
              currentUser={currentUser}
              staffUids={staffUids}
              onRefresh={() => void refreshCollections()}
              onNavigate={handleRouteChange}
            />
          )}

          {route === 'reportes' && (
            <ReportsAndDocsView
              candidatures={candidatures}
              currentUser={currentUser}
              staffUids={staffUids}
              onEditCandidature={handleEditCandidature}
              onRefresh={() => void refreshCollections()}
              onNavigate={handleRouteChange}
            />
          )}

          {route === 'auditoria' && (
            <AuditAndVersionsView
              auditLogs={auditLogs}
              listVersions={listVersions}
            />
          )}

          {route === 'usuarios' && currentUser.role === 'admin' && (
            <UsersRolesView
              users={staffProfiles}
              invitations={userInvitations}
              currentUser={currentUser}
              staffUids={staffUids}
              onRefresh={() => void refreshCollections()}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
