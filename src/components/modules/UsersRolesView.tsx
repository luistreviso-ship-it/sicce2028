import React, { useState } from 'react';
import {
  Shield,
  CheckCircle2,
  UserPlus,
  Trash2,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import {
  createOrUpdateUserInvitation,
  deleteUserAccount,
  deleteUserInvitation,
  getEffectivePermissions,
  updateUserRoleAndStatus,
} from '../../services/firestoreService';
import {
  getDefaultPermissionsForRole,
  UserInvitation,
  UserPermissions,
  UserProfile,
  UserRole,
} from '../../types/electoral';

interface UsersRolesViewProps {
  users: UserProfile[];
  invitations: UserInvitation[];
  currentUser: UserProfile;
  staffUids: string[];
  onRefresh: () => void;
}

export const UsersRolesView: React.FC<UsersRolesViewProps> = ({
  users,
  invitations,
  currentUser,
  staffUids,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'activos' | 'invitaciones'>('activos');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [confirmDeleteInviteId, setConfirmDeleteInviteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New / Pre-authorized user form (Alta)
  const [newEmail, setNewEmail] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('operador');
  const [newPerms, setNewPerms] = useState<UserPermissions>(() =>
    getDefaultPermissionsForRole('operador')
  );
  const [newActive, setNewActive] = useState(true);
  const [creating, setCreating] = useState(false);

  // Inline name edit drafts per uid
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});

  const handleRoleSelectInForm = (role: UserRole) => {
    setNewRole(role);
    setNewPerms(getDefaultPermissionsForRole(role));
  };

  const handleCreateUserInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setErrorMsg(null);
    setCreating(true);
    try {
      const created = await createOrUpdateUserInvitation(
        {
          email: newEmail,
          displayName: newDisplayName,
          role: newRole,
          permissions: newPerms,
          active: newActive,
        },
        currentUser,
        staffUids
      );

      // If user already signed in earlier with same email, sync their active profile too
      const matchingExisting = users.find(
        (u) => u.email.toLowerCase() === created.email.toLowerCase()
      );
      if (matchingExisting && matchingExisting.uid !== currentUser.uid) {
        await updateUserRoleAndStatus(
          matchingExisting,
          created.role,
          created.active,
          currentUser,
          staffUids,
          created.permissions,
          created.displayName
        );
      }

      setNotice(
        `Usuario ${created.displayName} (${created.email}) dado de alta / autorizado con rol "${created.role}".`
      );
      setNewEmail('');
      setNewDisplayName('');
      setNewRole('operador');
      setNewPerms(getDefaultPermissionsForRole('operador'));
      setNewActive(true);
      onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo registrar el usuario.');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateUser = async (
    target: UserProfile,
    role: UserRole,
    active: boolean,
    permissions: UserPermissions,
    displayName?: string
  ) => {
    setUpdatingId(target.uid);
    setNotice(null);
    setErrorMsg(null);
    try {
      await updateUserRoleAndStatus(
        target,
        role,
        active,
        currentUser,
        staffUids,
        permissions,
        displayName
      );
      setNotice(
        `Usuario actualizado: ${displayName || target.displayName} (${role} · ${active ? 'Activo' : 'Suspendido'}).`
      );
      onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al actualizar usuario.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteUser = async (target: UserProfile) => {
    setUpdatingId(target.uid);
    setNotice(null);
    setErrorMsg(null);
    try {
      await deleteUserAccount(target, currentUser, staffUids);
      setConfirmDeleteUid(null);
      setNotice(`Baja definitiva aplicada al usuario ${target.displayName} (${target.email}).`);
      onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo dar de baja al usuario.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUpdateInvitation = async (
    inv: UserInvitation,
    role: UserRole,
    active: boolean,
    permissions: UserPermissions
  ) => {
    setUpdatingId(inv.id);
    setNotice(null);
    setErrorMsg(null);
    try {
      await createOrUpdateUserInvitation(
        {
          email: inv.email,
          displayName: inv.displayName,
          role,
          permissions,
          active,
        },
        currentUser,
        staffUids
      );
      setNotice(`Autorización actualizada para ${inv.email}.`);
      onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al actualizar autorización.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteInvitation = async (inv: UserInvitation) => {
    setUpdatingId(inv.id);
    setNotice(null);
    setErrorMsg(null);
    try {
      await deleteUserInvitation(inv.id, inv.email, currentUser, staffUids);
      setConfirmDeleteInviteId(null);
      setNotice(`Autorización eliminada para ${inv.email}.`);
      onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo eliminar la autorización.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('activos')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                activeTab === 'activos'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-[#B91C1C]" />
              Usuarios Registrados ({users.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('invitaciones')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                activeTab === 'invitaciones'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-[#B91C1C]" />
              Pre-Autorizados ({invitations.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#B91C1C] text-white text-xs font-semibold rounded-lg hover:bg-[#991B1B] cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {showCreateForm ? 'Ocultar Alta de Usuario' : 'Alta / Autorizar Usuario'}
          </button>
        </div>

        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {showCreateForm && (
          <form
            onSubmit={(e) => void handleCreateUserInvitation(e)}
            className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4"
          >
            <p className="text-xs text-slate-600">
              Autorice una cuenta de Google asignando su rol y permisos de{' '}
              <strong>Alta</strong>, <strong>Modificación</strong> y <strong>Baja</strong>.
            </p>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs items-end">
          <div className="md:col-span-4">
            <label className="block font-semibold text-slate-700 mb-1">
              Nombre Completo
            </label>
            <input
              type="text"
              required
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Ej: María González"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block font-semibold text-slate-700 mb-1">
              Correo Electrónico (Google)
            </label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="operador@gmail.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono text-slate-900"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">Rol</label>
            <select
              value={newRole}
              onChange={(e) => handleRoleSelectInForm(e.target.value as UserRole)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-900"
            >
              <option value="operador">operador</option>
              <option value="revisor">revisor</option>
              <option value="admin">admin</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">Estado Inicial</label>
            <select
              value={newActive ? 'activo' : 'suspendido'}
              onChange={(e) => setNewActive(e.target.value === 'activo')}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-900"
            >
              <option value="activo">Activo</option>
              <option value="suspendido">Suspendido</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex flex-wrap items-center gap-5 text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[#B91C1C]" />
              Permisos de Acceso:
            </span>
            <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-800">
              <input
                type="checkbox"
                disabled={newRole === 'admin'}
                checked={newRole === 'admin' ? true : newPerms.alta}
                onChange={(e) => setNewPerms((p) => ({ ...p, alta: e.target.checked }))}
                className="rounded border-slate-300 accent-[#B91C1C]"
              />
              Alta (Crear)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-800">
              <input
                type="checkbox"
                disabled={newRole === 'admin'}
                checked={newRole === 'admin' ? true : newPerms.modificacion}
                onChange={(e) => setNewPerms((p) => ({ ...p, modificacion: e.target.checked }))}
                className="rounded border-slate-300 accent-[#B91C1C]"
              />
              Modificación (Editar / Revisar)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-800">
              <input
                type="checkbox"
                disabled={newRole === 'admin'}
                checked={newRole === 'admin' ? true : newPerms.baja}
                onChange={(e) => setNewPerms((p) => ({ ...p, baja: e.target.checked }))}
                className="rounded border-slate-300 accent-[#B91C1C]"
              />
              Baja (Eliminar)
            </label>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#B91C1C] text-white text-xs font-semibold rounded-lg hover:bg-[#991B1B] disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            {creating ? 'Registrando...' : 'Registrar / Autorizar Usuario'}
          </button>
        </div>

          </form>
        )}

      {/* Active Registered Users Table */}
      {activeTab === 'activos' && (
        <div className="space-y-3">
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <th className="py-2.5 px-3">Usuario</th>
                <th className="py-2.5 px-3">Correo</th>
                <th className="py-2.5 px-3">Rol</th>
                <th className="py-2.5 px-3">Alta</th>
                <th className="py-2.5 px-3">Modificación</th>
                <th className="py-2.5 px-3">Baja</th>
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3 text-right">Baja / Eliminar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isSelf = u.uid === currentUser.uid;
                const isBusy = updatingId === u.uid;
                const perms = getEffectivePermissions(u);
                const draftName = nameDrafts[u.uid] ?? u.displayName;

                return (
                  <tr key={u.uid} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3">
                      {isSelf ? (
                        <span className="font-semibold text-slate-900">
                          {u.displayName}
                          <span className="text-slate-500 font-normal ml-1.5">· Tú</span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            disabled={isBusy}
                            value={draftName}
                            onChange={(e) =>
                              setNameDrafts((prev) => ({ ...prev, [u.uid]: e.target.value }))
                            }
                            onBlur={() => {
                              const trimmed = draftName.trim();
                              if (trimmed && trimmed !== u.displayName) {
                                void handleUpdateUser(u, u.role, u.active, perms, trimmed);
                              }
                            }}
                            className="w-36 px-2 py-1 border border-slate-200 rounded bg-white font-semibold text-slate-900"
                          />
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{u.email}</td>
                    <td className="py-2.5 px-3">
                      <select
                        disabled={isSelf || isBusy}
                        value={u.role}
                        onChange={(e) => {
                          const nextRole = e.target.value as UserRole;
                          void handleUpdateUser(
                            u,
                            nextRole,
                            u.active,
                            getDefaultPermissionsForRole(nextRole),
                            draftName
                          );
                        }}
                        className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white disabled:bg-slate-100"
                      >
                        <option value="admin">admin</option>
                        <option value="operador">operador</option>
                        <option value="revisor">revisor</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        disabled={isSelf || isBusy || u.role === 'admin'}
                        checked={perms.alta}
                        onChange={(e) =>
                          void handleUpdateUser(
                            u,
                            u.role,
                            u.active,
                            { ...perms, alta: e.target.checked },
                            draftName
                          )
                        }
                        className="accent-[#B91C1C] cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        disabled={isSelf || isBusy || u.role === 'admin'}
                        checked={perms.modificacion}
                        onChange={(e) =>
                          void handleUpdateUser(
                            u,
                            u.role,
                            u.active,
                            { ...perms, modificacion: e.target.checked },
                            draftName
                          )
                        }
                        className="accent-[#B91C1C] cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        disabled={isSelf || isBusy || u.role === 'admin'}
                        checked={perms.baja}
                        onChange={(e) =>
                          void handleUpdateUser(
                            u,
                            u.role,
                            u.active,
                            { ...perms, baja: e.target.checked },
                            draftName
                          )
                        }
                        className="accent-[#B91C1C] cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        disabled={isSelf || isBusy}
                        onClick={() =>
                          void handleUpdateUser(u, u.role, !u.active, perms, draftName)
                        }
                        className={`px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer disabled:opacity-50 ${
                          u.active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-red-200 bg-red-50 text-red-800'
                        }`}
                      >
                        {u.active ? 'Activo' : 'Suspendido'}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {!isSelf && (
                        confirmDeleteUid === u.uid ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDeleteUser(u)}
                              className="px-2.5 py-1 bg-red-700 text-white font-semibold rounded hover:bg-red-800 cursor-pointer"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUid(null)}
                              className="px-2 py-1 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteUid(u.uid)}
                            title="Dar de baja definitiva"
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-red-200 bg-red-50 text-red-700 rounded hover:bg-red-100 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Baja
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Pre-Authorized Invitations Table */}
      {activeTab === 'invitaciones' && (
        <div className="space-y-3">

        {invitations.length === 0 ? (
          <p className="text-xs text-slate-500">
            No hay cuentas pre-autorizadas pendientes registradas.
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <th className="py-2.5 px-3">Nombre</th>
                  <th className="py-2.5 px-3">Correo Autorizado</th>
                  <th className="py-2.5 px-3">Rol</th>
                  <th className="py-2.5 px-3">Alta</th>
                  <th className="py-2.5 px-3">Modificación</th>
                  <th className="py-2.5 px-3">Baja</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-right">Eliminar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.map((inv) => {
                  const isBusy = updatingId === inv.id;
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {inv.displayName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{inv.email}</td>
                      <td className="py-2.5 px-3">
                        <select
                          disabled={isBusy}
                          value={inv.role}
                          onChange={(e) => {
                            const r = e.target.value as UserRole;
                            void handleUpdateInvitation(
                              inv,
                              r,
                              inv.active,
                              getDefaultPermissionsForRole(r)
                            );
                          }}
                          className="px-2 py-1 border border-slate-300 rounded bg-white font-semibold"
                        >
                          <option value="admin">admin</option>
                          <option value="operador">operador</option>
                          <option value="revisor">revisor</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          disabled={isBusy || inv.role === 'admin'}
                          checked={inv.role === 'admin' ? true : inv.permissions.alta}
                          onChange={(e) =>
                            void handleUpdateInvitation(inv, inv.role, inv.active, {
                              ...inv.permissions,
                              alta: e.target.checked,
                            })
                          }
                          className="accent-[#B91C1C] cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          disabled={isBusy || inv.role === 'admin'}
                          checked={inv.role === 'admin' ? true : inv.permissions.modificacion}
                          onChange={(e) =>
                            void handleUpdateInvitation(inv, inv.role, inv.active, {
                              ...inv.permissions,
                              modificacion: e.target.checked,
                            })
                          }
                          className="accent-[#B91C1C] cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          disabled={isBusy || inv.role === 'admin'}
                          checked={inv.role === 'admin' ? true : inv.permissions.baja}
                          onChange={(e) =>
                            void handleUpdateInvitation(inv, inv.role, inv.active, {
                              ...inv.permissions,
                              baja: e.target.checked,
                            })
                          }
                          className="accent-[#B91C1C] cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleUpdateInvitation(
                              inv,
                              inv.role,
                              !inv.active,
                              inv.permissions
                            )
                          }
                          className={`px-2.5 py-1 rounded text-xs font-semibold border cursor-pointer ${
                            inv.active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-red-200 bg-red-50 text-red-800'
                          }`}
                        >
                          {inv.active ? 'Activo' : 'Suspendido'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {confirmDeleteInviteId === inv.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDeleteInvitation(inv)}
                              className="px-2.5 py-1 bg-red-700 text-white font-semibold rounded cursor-pointer"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteInviteId(null)}
                              className="px-2 py-1 border border-slate-300 rounded cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteInviteId(inv.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-red-200 bg-red-50 text-red-700 rounded hover:bg-red-100 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Quitar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      )}
      </div>
    </div>
  );
};
