import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Shield, Save, Trash2, UserX } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/ui/DataTable';
import Modal from '../components/ui/Modal';
import PasswordInput from '../components/ui/PasswordInput';
import { usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Users() {
  const { t, i18n } = useTranslation();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const roleLabel = (name) => t(`permissions.roles.${name}`, { defaultValue: name?.replace(/_/g, ' ') ?? '' });
  const moduleLabel = (module) => t(`permissions.modules.${module}`, { defaultValue: module });
  const permissionLabel = (code) => {
    const [mod, action] = code.split('.');
    return mod && action
      ? t(`permissions.codes.${mod}.${action}`, { defaultValue: code })
      : code;
  };

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [editedPermissions, setEditedPermissions] = useState([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [form, setForm] = useState({
    username: '', email: '', password: '', full_name: '', full_name_ar: '', phone: '', role_id: '',
  });
  const [editForm, setEditForm] = useState({
    username: '', email: '', full_name: '', full_name_ar: '', phone: '', role_id: '', password: '', is_active: true,
  });

  const load = () => {
    setLoading(true);
    usersAPI.list().then(({ data }) => setUsers(data.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();
    usersAPI.roles().then(({ data }) => setRoles(data.data));
    usersAPI.allPermissions().then(({ data }) => setAllPermissions(data.data));
  }, [isAdmin]);

  const viewPermissions = async (role) => {
    setSelectedRole(role);
    const { data } = await usersAPI.permissions(role.id);
    const codes = data.data.map((p) => p.code);
    setRolePermissions(data.data);
    setEditedPermissions(codes);
  };

  const togglePermission = (code) => {
    setEditedPermissions((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const saveRolePermissions = async () => {
    if (!selectedRole || selectedRole.name === 'admin') return;
    setSavingPerms(true);
    try {
      await usersAPI.updateRolePermissions(selectedRole.id, editedPermissions);
      toast.success(t('users.permsSaved'));
      await viewPermissions(selectedRole);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    } finally {
      setSavingPerms(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await usersAPI.create({ ...form, role_id: Number(form.role_id) });
      toast.success(t('users.created'));
      setCreateOpen(false);
      setForm({ username: '', email: '', password: '', full_name: '', full_name_ar: '', phone: '', role_id: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setEditForm({
      username: user.username || '',
      email: user.email || '',
      full_name: user.full_name || '',
      full_name_ar: user.full_name_ar || '',
      phone: user.phone || '',
      role_id: String(user.role_id || ''),
      password: '',
      is_active: user.is_active !== false,
    });
    setEditOpen(true);
  };

  const handleRemove = async (user) => {
    if (user.role_name === 'admin') return;
    if (!window.confirm(t('users.confirmRemove'))) return;
    try {
      await usersAPI.remove(user.id);
      toast.success(t('users.removed'));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const handlePurgeDemo = async () => {
    if (!window.confirm(`${t('users.purgeDemo')}\n\n${t('users.purgeDemoHint')}`)) return;
    try {
      const { data } = await usersAPI.purgeDemo();
      toast.success(t('users.demoPurged', { count: data.data.count }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const payload = {
        full_name: editForm.full_name,
        full_name_ar: editForm.full_name_ar,
        phone: editForm.phone,
        is_active: editForm.is_active,
      };
      if (editingUser.role_name !== 'admin') {
        if (editForm.username) payload.username = editForm.username;
        if (editForm.email) payload.email = editForm.email;
      }
      if (editForm.password) payload.password = editForm.password;
      if (editingUser.role_name !== 'admin' && editForm.role_id) {
        payload.role_id = Number(editForm.role_id);
      }
      await usersAPI.update(editingUser.id, payload);
      toast.success(t('users.updated'));
      setEditOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'خطأ');
    }
  };

  const groupedPermissions = allPermissions.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  const sortedPermissionGroups = useMemo(
    () => Object.entries(groupedPermissions).sort(([a], [b]) =>
      moduleLabel(a).localeCompare(moduleLabel(b), i18n.language)
    ),
    [groupedPermissions, i18n.language, t]
  );

  const columns = [
    { key: 'full_name', label: t('common.name') },
    { key: 'username', label: t('users.username') },
    { key: 'email', label: t('users.email') },
    { key: 'role_name', label: t('users.role'), render: (r) => <span>{roleLabel(r.role_name)}</span> },
    { key: 'phone', label: t('common.phone') },
    { key: 'is_active', label: t('common.status'), render: (r) => (r.is_active ? t('users.active') : t('users.inactive')) },
    { key: 'last_login', label: t('users.lastLogin'), render: (r) => (r.last_login ? new Date(r.last_login).toLocaleString(i18n.language === 'ar' ? 'ar-SA' : 'en-US') : '-') },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (r) => (
        <div className="flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="text-primary-600 text-sm flex items-center gap-1">
            <Pencil size={14} /> {t('common.edit')}
          </button>
          {r.role_name !== 'admin' && r.id !== currentUser?.id && (
            <button onClick={(e) => { e.stopPropagation(); handleRemove(r); }} className="text-red-600 text-sm flex items-center gap-1">
              <Trash2 size={14} /> {t('users.removeUser')}
            </button>
          )}
        </div>
      ),
    },
  ];

  if (!isAdmin) {
    return (
      <div className="card text-center py-12">
        <Shield size={40} className="mx-auto mb-3 text-primary-400" />
        <p className="text-primary-700">{t('users.adminOnly')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t('users.title')}</h1>
          <p className="text-sm text-primary-500 mt-1">{t('users.adminOnlyHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handlePurgeDemo} className="btn-secondary flex items-center gap-2 text-red-700 border-red-200">
            <UserX size={18} /> {t('users.purgeDemo')}
          </button>
          <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> {t('users.newUser')}
          </button>
        </div>
      </div>
      <p className="text-xs text-primary-500 -mt-4 mb-6">{t('users.purgeDemoHint')}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DataTable columns={columns} data={users} loading={loading} onRowClick={openEdit} />
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Shield size={18} /> {t('users.permissions')}
          </h3>
          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => viewPermissions(role)}
                className={`w-full text-start px-3 py-2 rounded-lg text-sm ${
                  selectedRole?.id === role.id
                    ? 'bg-primary-100 text-primary-800 border border-primary-300'
                    : 'hover:bg-primary-50'
                }`}
              >
                <span>{roleLabel(role.name)}</span>
              </button>
            ))}
          </div>

          {selectedRole && (
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">{roleLabel(selectedRole.name)}</p>
              {selectedRole.name === 'admin' ? (
                <p className="text-xs text-primary-500">{t('users.adminPermsLocked')}</p>
              ) : (
                <>
                  <div className="space-y-3 max-h-64 overflow-y-auto mb-3">
                    {sortedPermissionGroups.map(([module, perms]) => (
                      <div key={module}>
                        <p className="text-xs font-semibold text-primary-600 mb-1">{moduleLabel(module)}</p>
                        <div className="space-y-1">
                          {perms.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editedPermissions.includes(p.code)}
                                onChange={() => togglePermission(p.code)}
                              />
                              <span>{permissionLabel(p.code)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={saveRolePermissions} disabled={savingPerms} className="btn-primary w-full text-sm flex items-center justify-center gap-2">
                    <Save size={16} /> {t('users.savePermissions')}
                  </button>
                </>
              )}
              {rolePermissions.length > 0 && selectedRole.name !== 'admin' && (
                <p className="text-xs text-primary-500 mt-2">{rolePermissions.length} {t('users.activePerms')}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={t('users.newUser')}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('users.username')}</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="input-field font-mono"
              required
              minLength={2}
              maxLength={50}
              pattern="[A-Za-z0-9._-]+"
              placeholder={t('users.usernamePlaceholder')}
              autoComplete="username"
            />
            <p className="text-xs text-primary-500 mt-1">{t('users.usernameHint')}</p>
          </div>
          {[
            { key: 'full_name', label: t('common.name') },
            { key: 'full_name_ar', label: t('users.fullNameAr') },
            { key: 'email', label: t('users.email'), type: 'email', optional: true },
            { key: 'phone', label: t('common.phone'), optional: true },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium mb-1">{f.label}</label>
              <input
                type={f.type || 'text'}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="input-field"
                required={f.key === 'full_name'}
                placeholder={f.key === 'email' ? t('users.emailPlaceholder') : undefined}
                autoComplete={f.key === 'email' ? 'email' : undefined}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1">{t('users.password')}</label>
            <PasswordInput
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('users.role')}</label>
            <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} className="input-field" required>
              <option value="">{t('users.selectRole')}</option>
              {roles.filter((r) => r.name !== 'admin').map((r) => (
                <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title={t('users.editUser')}>
        {editingUser && (
          <form onSubmit={handleUpdate} className="space-y-4">
            {editingUser.role_name === 'admin' ? (
              <p className="text-sm text-primary-500">{editingUser.username} — {editingUser.email}</p>
            ) : (
              [
                { key: 'username', label: t('users.username') },
                { key: 'email', label: t('users.email'), type: 'email', optional: true },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1">{f.label}</label>
                  <input
                    type={f.type || 'text'}
                    value={editForm[f.key]}
                    onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })}
                    className={`input-field ${f.key === 'username' ? 'font-mono' : ''}`}
                    required={f.key === 'username'}
                    minLength={f.key === 'username' ? 2 : undefined}
                    maxLength={f.key === 'username' ? 50 : undefined}
                    pattern={f.key === 'username' ? '[A-Za-z0-9._-]+' : undefined}
                    placeholder={f.key === 'email' ? t('users.emailPlaceholder') : t('users.usernamePlaceholder')}
                  />
                  {f.key === 'username' && (
                    <p className="text-xs text-primary-500 mt-1">{t('users.usernameHint')}</p>
                  )}
                </div>
              ))
            )}
            {[
              { key: 'full_name', label: t('common.name') },
              { key: 'full_name_ar', label: t('users.fullNameAr') },
              { key: 'phone', label: t('common.phone') },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium mb-1">{f.label}</label>
                <input
                  type="text"
                  value={editForm[f.key]}
                  onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })}
                  className="input-field"
                  required={f.key === 'full_name'}
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium mb-1">{t('users.newPassword')}</label>
              <PasswordInput
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                autoComplete="new-password"
              />
            </div>
            {editingUser.role_name !== 'admin' && (
              <div>
                <label className="block text-sm font-medium mb-1">{t('users.role')}</label>
                <select value={editForm.role_id} onChange={(e) => setEditForm({ ...editForm, role_id: e.target.value })} className="input-field" required>
                  {roles.map((r) => <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                </select>
              </div>
            )}
            {editingUser.role_name !== 'admin' && editingUser.id !== currentUser?.id && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                />
                {t('users.activeAccount')}
              </label>
            )}
            {editingUser.role_name === 'admin' && (
              <p className="text-xs text-amber-600">{t('users.adminAccountLocked')}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
              <button type="submit" className="btn-primary">{t('common.save')}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
