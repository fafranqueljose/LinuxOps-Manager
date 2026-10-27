import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';
import {
  Users,
  Plus,
  Shield,
  UserCheck,
  UserX,
  X,
  Edit2,
  Trash2,
  KeyRound,
  Search,
  Lock,
  Mail,
  User as UserIcon,
} from 'lucide-react';

export const UsersView: React.FC = () => {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  // Estados de búsqueda
  const [search, setSearch] = useState('');

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isChangeOwnPasswordOpen, setIsChangeOwnPasswordOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [resettingPasswordUser, setResettingPasswordUser] = useState<any | null>(null);

  // Formulario Crear Usuario
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');

  // Formulario Editar Usuario
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editRoleId, setEditRoleId] = useState('');

  // Formulario Admin Reset Password
  const [adminNewPassword, setAdminNewPassword] = useState('');

  const { data: users, isLoading } = useQuery<any[]>({
    queryKey: ['users'],
    queryFn: () => api.get<any[]>('/users'),
  });

  const { data: roles } = useQuery<any[]>({
    queryKey: ['roles'],
    queryFn: () => api.get<any[]>('/roles'),
  });

  // Mutación Crear Usuario
  const createUserMutation = useMutation({
    mutationFn: (data: any) => api.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsCreateModalOpen(false);
      setUsername('');
      setEmail('');
      setPassword('');
      setFullName('');
      setSelectedRoleId('');
    },
    onError: (err: any) => alert(err.message || 'Error al crear usuario'),
  });

  // Mutación Editar Usuario
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
    },
    onError: (err: any) => alert(err.message || 'Error al actualizar usuario'),
  });

  // Mutación Eliminar Usuario
  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => alert(err.message || 'Error al eliminar usuario'),
  });

  // Mutación Admin Reset Password
  const adminResetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      api.post(`/users/${id}/reset-password`, { new_password: newPassword }),
    onSuccess: (res: any) => {
      alert(res.message || 'Contraseña restablecida con éxito.');
      setResettingPasswordUser(null);
      setAdminNewPassword('');
    },
    onError: (err: any) => alert(err.message || 'Error al restablecer la contraseña'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate({
      username,
      email,
      password,
      full_name: fullName,
      role_ids: selectedRoleId ? [selectedRoleId] : [],
    });
  };

  const handleStartEdit = (u: any) => {
    setEditingUser(u);
    setEditFullName(u.full_name || '');
    setEditEmail(u.email || '');
    setEditIsActive(u.is_active);

    // Buscar ID del rol asignado si existe
    const assignedRole = roles?.find((r) => u.roles?.includes(r.name));
    setEditRoleId(assignedRole ? assignedRole.id : '');
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    updateUserMutation.mutate({
      id: editingUser.id,
      data: {
        full_name: editFullName,
        email: editEmail,
        is_active: editIsActive,
        role_ids: editRoleId ? [editRoleId] : [],
      },
    });
  };

  const handleDelete = (u: any) => {
    if (u.id === currentUser?.id) {
      alert('No puedes eliminar tu propia cuenta.');
      return;
    }
    if (confirm(`¿Estás seguro de que deseas eliminar al usuario "${u.username}"?\nEsta acción es irreversible.`)) {
      deleteUserMutation.mutate(u.id);
    }
  };

  const handleAdminResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingPasswordUser) return;
    if (adminNewPassword.length < 8) {
      alert('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    adminResetPasswordMutation.mutate({
      id: resettingPasswordUser.id,
      newPassword: adminNewPassword,
    });
  };

  const filteredUsers = (users || []).filter((u) => {
    const s = search.toLowerCase();
    return (
      u.username.toLowerCase().includes(s) ||
      (u.email || '').toLowerCase().includes(s) ||
      (u.full_name || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="flex-1 flex flex-col">
      <Header
        title="Usuarios y Control de Acceso (RBAC)"
        subtitle="Administración de cuentas, roles del sistema y seguridad de credenciales"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsChangeOwnPasswordOpen(true)}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-700 transition-colors"
              title="Cambiar tu propia contraseña de acceso"
            >
              <KeyRound className="h-4 w-4 text-brand-400" />
              <span>Cambiar mi Password</span>
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Crear Usuario</span>
            </button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* Barra de Búsqueda */}
        <div className="flex items-center justify-between">
          <div className="relative w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por usuario, correo o nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div className="text-xs text-slate-400 font-medium">
            Total: <span className="font-bold text-slate-200">{filteredUsers.length}</span> usuarios
          </div>
        </div>

        {/* Tabla de Usuarios */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400">
              <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <span className="text-xs">Cargando usuarios...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No se encontraron usuarios registrados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Usuario</th>
                    <th className="py-3 px-4">Nombre Completo</th>
                    <th className="py-3 px-4">Correo Electrónico</th>
                    <th className="py-3 px-4">Roles Asignados</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4">Fecha de Alta</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredUsers.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    return (
                      <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-200">
                          <div className="flex items-center gap-2">
                            <span>{u.username}</span>
                            {isSelf && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-brand-500/10 text-brand-400 border border-brand-500/20">
                                tú
                              </span>
                            )}
                            {u.is_superuser && (
                              <span className="px-1.5 py-0.5 text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">
                                Superadmin
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">{u.full_name || '—'}</td>
                        <td className="py-3.5 px-4 text-slate-400">{u.email}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex gap-1.5 flex-wrap">
                            {u.roles && u.roles.length > 0 ? (
                              u.roles.map((r: string) => (
                                <span
                                  key={r}
                                  className="px-2 py-0.5 rounded-full text-[10px] bg-brand-500/10 text-brand-400 border border-brand-500/20 font-mono"
                                >
                                  {r}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-500 italic text-[10px]">Sin rol</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {u.is_active ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Activo
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Inactivo
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                          {formatDate(u.created_at)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setResettingPasswordUser(u);
                                setAdminNewPassword('');
                              }}
                              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded-lg transition-colors"
                              title="Restablecer contraseña de este usuario"
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>

                            <button
                              onClick={() => handleStartEdit(u)}
                              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-brand-400 rounded-lg transition-colors"
                              title="Editar usuario"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>

                            <button
                              onClick={() => handleDelete(u)}
                              disabled={isSelf}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isSelf
                                  ? 'text-slate-600 cursor-not-allowed'
                                  : 'hover:bg-slate-800 text-slate-400 hover:text-red-400'
                              }`}
                              title={isSelf ? 'No puedes eliminar tu propia cuenta' : 'Eliminar usuario'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Cambiar Mi Propia Contraseña */}
      <ChangePasswordModal
        isOpen={isChangeOwnPasswordOpen}
        onClose={() => setIsChangeOwnPasswordOpen(false)}
      />

      {/* Modal: Crear Usuario */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="font-bold text-slate-100 text-base mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4 text-brand-400" />
              <span>Crear Nuevo Usuario</span>
            </h3>

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nombre de usuario *</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ej. operador1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Correo Electrónico *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@linuxops.local"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nombre Completo</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan Pérez"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Contraseña Inicial *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Rol Inicial</label>
                <select
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-brand-500"
                >
                  <option value="">Sin Rol asignado</option>
                  {roles?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} - {r.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-semibold disabled:opacity-50"
                >
                  {createUserMutation.isPending ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Usuario */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setEditingUser(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="font-bold text-slate-100 text-base mb-1 flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-brand-400" />
              <span>Editar Usuario: {editingUser.username}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">Modifica los detalles y roles de acceso</p>

            <form onSubmit={handleUpdate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nombre Completo</label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Correo Electrónico *</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Rol del Sistema</label>
                <select
                  value={editRoleId}
                  onChange={(e) => setEditRoleId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-brand-500"
                >
                  <option value="">Sin Rol asignado</option>
                  {roles?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} - {r.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-brand-600 focus:ring-0"
                  />
                  <span className="text-slate-200 font-semibold">Cuenta Activa</span>
                </label>
                <span className="text-[11px] text-slate-500 block ml-6">
                  Si se desmarca, el usuario no podrá iniciar sesión en la plataforma.
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-semibold disabled:opacity-50"
                >
                  {updateUserMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Admin Restablecer Contraseña */}
      {resettingPasswordUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setResettingPasswordUser(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="font-bold text-slate-100 text-base mb-1 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-400" />
              <span>Restablecer Contraseña</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Asignar una nueva contraseña al usuario <strong>{resettingPasswordUser.username}</strong>
            </p>

            <form onSubmit={handleAdminResetPassword} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nueva Contraseña *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={adminNewPassword}
                  onChange={(e) => setAdminNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setResettingPasswordUser(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adminResetPasswordMutation.isPending}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-semibold disabled:opacity-50"
                >
                  {adminResetPasswordMutation.isPending ? 'Restableciendo...' : 'Asignar Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
