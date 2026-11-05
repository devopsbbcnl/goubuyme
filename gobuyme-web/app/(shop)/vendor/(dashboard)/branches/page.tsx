'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api, { setActiveLocationId } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';

interface Manager {
  id: string; name: string; email: string; phone: string | null; isActive: boolean; hasDevice: boolean;
}
interface Location {
  id: string; businessName: string; branchLabel: string | null;
  address: string; city: string; state: string; contactPhone: string | null;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  isOpen: boolean; rating: number; notifyOwnerOfOrders: boolean;
  manager: Manager | null; _count: { menuItems: number };
}
interface Draft { name: string; address: string; city: string; state: string; phone: string }
interface LoginDraft { name: string; email: string; phone: string; password: string }

const EMPTY: Draft = { name: '', address: '', city: '', state: '', phone: '' };
const EMPTY_LOGIN: LoginDraft = { name: '', email: '', phone: '', password: '' };
const PHONE_RE = /^[+]?[0-9]{10,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const apiMessage = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

export default function VendorLocationsPage() {
  const toast = useToast();
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [main, setMain] = useState<Location | null>(null);
  const [branches, setBranches] = useState<Location[]>([]);
  const [max, setMax] = useState(10);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<Location | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [copyMenu, setCopyMenu] = useState(false);
  const [withLogin, setWithLogin] = useState(false);
  const [loginDraft, setLoginDraft] = useState<LoginDraft>(EMPTY_LOGIN);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [loginFor, setLoginFor] = useState<Location | null>(null);
  // Shown once: the server never returns the password again.
  const [handover, setHandover] = useState<{ branch: string; email: string; password: string | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/vendors/me/branches');
      setMain(data.data.main);
      setBranches(data.data.branches);
      setMax(data.data.max);
    } catch (e: any) {
      // Branch managers have no access to this page.
      if (e?.response?.status === 403) router.replace('/vendor');
      else toast('Could not load your locations.', 'error');
    } finally { setLoading(false); }
  }, [toast, router]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setDraft({ ...EMPTY, city: main?.city ?? '', state: main?.state ?? '' });
    setCopyMenu(false); setWithLogin(false); setLoginDraft(EMPTY_LOGIN); setError('');
    setEditing('new');
  };

  const openEdit = (b: Location) => {
    setDraft({ name: b.branchLabel ?? '', address: b.address, city: b.city, state: b.state, phone: b.contactPhone ?? '' });
    setError('');
    setEditing(b);
  };

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => { setDraft(d => ({ ...d, [k]: e.target.value })); setError(''); };
  const setLogin = (k: keyof LoginDraft) => (e: React.ChangeEvent<HTMLInputElement>) => { setLoginDraft(d => ({ ...d, [k]: e.target.value })); setError(''); };

  const manage = (loc: Location, isMain: boolean) => {
    setActiveLocationId(isMain ? null : loc.id);
    router.push('/vendor');
  };

  const validateLogin = (): string | null => {
    if (loginDraft.name.trim().length < 2) return "Enter the manager's name.";
    if (!EMAIL_RE.test(loginDraft.email.trim())) return 'Enter a valid sign-in email address.';
    if (loginDraft.phone.trim() && !PHONE_RE.test(loginDraft.phone.trim())) return "Enter a valid phone number for the manager, digits only.";
    return null;
  };
  const loginBody = () => ({
    name: loginDraft.name.trim(),
    email: loginDraft.email.trim().toLowerCase(),
    ...(loginDraft.phone.trim() ? { phone: loginDraft.phone.trim() } : {}),
    ...(loginDraft.password.trim() ? { password: loginDraft.password.trim() } : {}),
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.name.trim().length < 2) { setError('Enter a branch name.'); return; }
    if (draft.address.trim().length < 3) { setError('Enter the street address.'); return; }
    if (draft.city.trim().length < 2) { setError('Enter the city.'); return; }
    if (draft.phone.trim() && !PHONE_RE.test(draft.phone.trim())) { setError('Enter a valid phone number, digits only, e.g. 08031234567.'); return; }
    if (editing === 'new' && withLogin) { const bad = validateLogin(); if (bad) { setError(bad); return; } }

    setSaving(true);
    try {
      const body = {
        name: draft.name.trim(), address: draft.address.trim(), city: draft.city.trim(),
        state: draft.state.trim() || undefined, phone: draft.phone.trim(),
      };
      if (editing === 'new') {
        const { data } = await api.post('/vendors/me/branches', { ...body, copyMenu, ...(withLogin ? { manager: loginBody() } : {}) });
        const created = data.data;
        toast('Branch added.', 'success');
        setEditing(null);
        if (created.login) setHandover({ branch: created.businessName, email: created.login.email, password: created.login.temporaryPassword });
      } else if (editing) {
        await api.patch(`/vendors/me/branches/${editing.id}`, body);
        toast('Branch updated.', 'success');
        setEditing(null);
      }
      await load();
      window.dispatchEvent(new CustomEvent('gbm:locations-changed'));
    } catch (err) {
      setError(apiMessage(err, 'Could not save the branch. Please try again.'));
    } finally { setSaving(false); }
  };

  const createLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginFor) return;
    const bad = validateLogin();
    if (bad) { setError(bad); return; }
    setSaving(true);
    try {
      const { data } = await api.post(`/vendors/me/branches/${loginFor.id}/login`, loginBody());
      setHandover({ branch: loginFor.businessName, email: data.data.email, password: data.data.temporaryPassword });
      setLoginFor(null);
      await load();
    } catch (err) {
      setError(apiMessage(err, 'Could not create the login. Please try again.'));
    } finally { setSaving(false); }
  };

  const resetPassword = async (b: Location) => {
    const ok = await confirmDialog(`This signs ${b.manager?.name} out everywhere and gives you a new temporary password to hand over.`, { confirmLabel: 'Reset password', danger: true });
    if (!ok) return;
    try {
      const { data } = await api.post(`/vendors/me/branches/${b.id}/login/reset-password`);
      setHandover({ branch: b.businessName, email: b.manager!.email, password: data.data.temporaryPassword });
    } catch (err) { toast(apiMessage(err, 'Could not reset the password.'), 'error'); }
  };

  const toggleAccess = async (b: Location) => {
    const turnOff = b.manager?.isActive !== false;
    try {
      await api.patch(`/vendors/me/branches/${b.id}/login`, { isActive: !turnOff });
      toast(turnOff ? 'Access turned off.' : 'Access turned on.', 'success');
      await load();
    } catch (err) { toast(apiMessage(err, 'Could not update access.'), 'error'); }
  };

  const removeLogin = async (b: Location) => {
    const ok = await confirmDialog(`${b.manager?.name} will lose access and the branch goes back to being run from your account.`, { confirmLabel: 'Remove login', danger: true });
    if (!ok) return;
    try { await api.delete(`/vendors/me/branches/${b.id}/login`); toast('Login removed.', 'success'); await load(); }
    catch (err) { toast(apiMessage(err, 'Could not remove the login.'), 'error'); }
  };

  const setNotifyOwner = async (b: Location, value: boolean) => {
    setBranches(prev => prev.map(x => (x.id === b.id ? { ...x, notifyOwnerOfOrders: value } : x)));
    try { await api.patch(`/vendors/me/branches/${b.id}`, { notifyOwnerOfOrders: value }); }
    catch (err) {
      setBranches(prev => prev.map(x => (x.id === b.id ? { ...x, notifyOwnerOfOrders: !value } : x)));
      toast(apiMessage(err, 'Could not update the setting.'), 'error');
    }
  };

  const remove = async (b: Location) => {
    const ok = await confirmDialog(
      `Remove ${b.businessName}? Customers will no longer see it${b.manager ? " and the manager's login will be closed" : ''}. Order history is kept.`,
      { confirmLabel: 'Remove', danger: true },
    );
    if (!ok) return;
    try {
      await api.delete(`/vendors/me/branches/${b.id}`);
      setActiveLocationId(null);
      toast('Branch removed.', 'success');
      await load();
      window.dispatchEvent(new CustomEvent('gbm:locations-changed'));
    } catch (err) { toast(apiMessage(err, 'Could not remove the branch.'), 'error'); }
  };

  const copy = async (value: string, what: string) => {
    try { await navigator.clipboard.writeText(value); toast(`${what} copied.`, 'success'); }
    catch { toast(`Select the ${what.toLowerCase()} and copy it manually.`, 'info'); }
  };

  const status = (l: Location) => {
    if (l.approvalStatus === 'APPROVED') return <span className={`badge ${l.isOpen ? 'badge-success' : 'badge-neutral'}`}>{l.isOpen ? 'Open' : 'Closed'}</span>;
    return <span className="badge badge-warning">{l.approvalStatus === 'PENDING' ? 'Pending approval' : l.approvalStatus.toLowerCase()}</span>;
  };

  const loginBlock = (l: Location) => (
    <div style={{ marginTop: 14, padding: 14, border: '1px solid var(--line)', borderRadius: 'var(--r)' }}>
      {l.manager ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>{l.manager.name}</strong>
            <span className={`badge ${!l.manager.isActive ? 'badge-error' : l.manager.hasDevice ? 'badge-success' : 'badge-warning'}`}>
              {!l.manager.isActive ? 'Access off' : l.manager.hasDevice ? 'Device connected' : 'No device yet'}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{l.manager.email}{l.manager.phone ? ` · ${l.manager.phone}` : ''}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={() => resetPassword(l)} style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 13 }}>Reset password</button>
            <button onClick={() => toggleAccess(l)} style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 13 }}>{l.manager.isActive ? 'Turn access off' : 'Turn access on'}</button>
            <button onClick={() => removeLogin(l)} style={{ color: 'var(--error)', fontWeight: 700, fontSize: 13 }}>Remove login</button>
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={l.notifyOwnerOfOrders} onChange={e => setNotifyOwner(l, e.target.checked)} style={{ accentColor: 'var(--brand)' }} />
            Also alert me about this branch&apos;s orders
          </label>
        </>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 13 }}>
            Run from your account. Create a login so a branch manager can use this branch on their own device and get its alerts there.
          </div>
          <button onClick={() => { setLoginDraft(EMPTY_LOGIN); setError(''); setLoginFor(l); }} style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 13, marginTop: 8 }}>
            Create branch login
          </button>
        </>
      )}
    </div>
  );

  const card = (l: Location, isMain: boolean) => (
    <div key={l.id} className="card card-pad" style={{ marginBottom: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong>{isMain ? `${l.businessName} (main)` : l.businessName}</strong>
        {status(l)}
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{l.address}, {l.city}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
        {l._count.menuItems} menu item{l._count.menuItems === 1 ? '' : 's'}
        {l.rating > 0 ? ` · ★ ${l.rating.toFixed(1)}` : ''}
        {!isMain && l.contactPhone ? ` · ${l.contactPhone}` : ''}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
        <button onClick={() => manage(l, isMain)} style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 13 }}>Manage this location</button>
        {!isMain && <button onClick={() => openEdit(l)} style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 13 }}>Details</button>}
        {!isMain && <button onClick={() => remove(l)} style={{ color: 'var(--error)', fontWeight: 700, fontSize: 13 }}>Remove</button>}
      </div>
      {!isMain && loginBlock(l)}
    </div>
  );

  const loginFields = (
    <>
      <div className="form-group"><label className="label" htmlFor="mg-name">Manager&apos;s name</label><input id="mg-name" className="input" value={loginDraft.name} onChange={setLogin('name')} placeholder="Ada Obi" /></div>
      <div className="form-group"><label className="label" htmlFor="mg-email">Sign-in email</label><input id="mg-email" className="input" type="email" value={loginDraft.email} onChange={setLogin('email')} placeholder="manager@example.com" /></div>
      <div className="form-group"><label className="label" htmlFor="mg-phone">Manager&apos;s phone (optional)</label><input id="mg-phone" className="input" type="tel" value={loginDraft.phone} onChange={setLogin('phone')} placeholder="08031234567" /></div>
      <div className="form-group"><label className="label" htmlFor="mg-pass">Password (optional)</label><input id="mg-pass" className="input" value={loginDraft.password} onChange={setLogin('password')} placeholder="Leave blank to generate one" autoComplete="off" /></div>
    </>
  );

  return (
    <div>
      <h1 className="t-page" style={{ marginBottom: 6 }}>Locations</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 24, maxWidth: 660 }}>
        Every branch is its own store: separate menu, stock, hours and orders, listed on its own to customers.
        You manage all of them from this account, and can give each branch manager their own login.
      </p>

      {loading ? <div className="sk" style={{ height: 160 }} /> : (
        <>
          {main && card(main, true)}
          {branches.map(b => card(b, false))}
          {branches.length === 0 && <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>No branches yet.</p>}
          {branches.length < max
            ? <button className="btn btn-primary" onClick={openNew}>Add a branch</button>
            : <p className="muted" style={{ fontSize: 13 }}>You have reached the limit of {max} branches.</p>}
        </>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => !saving && setEditing(null)}>
          <form className="modal" style={{ maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()} onSubmit={save}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>{editing === 'new' ? 'Add a branch' : 'Branch details'}</h3>
            <div className="form-group"><label className="label" htmlFor="br-name">Branch name</label><input id="br-name" className="input" value={draft.name} onChange={set('name')} placeholder="e.g. Rumuola" /></div>
            <div className="form-group"><label className="label" htmlFor="br-addr">Street address</label><input id="br-addr" className="input" value={draft.address} onChange={set('address')} placeholder="5 Rumuola Road" /></div>
            <div className="form-group"><label className="label" htmlFor="br-city">City</label><input id="br-city" className="input" value={draft.city} onChange={set('city')} /></div>
            <div className="form-group"><label className="label" htmlFor="br-state">State</label><input id="br-state" className="input" value={draft.state} onChange={set('state')} /></div>
            <div className="form-group"><label className="label" htmlFor="br-phone">Branch phone (optional)</label><input id="br-phone" className="input" type="tel" value={draft.phone} onChange={set('phone')} placeholder="08031234567" /></div>
            {editing === 'new' && (
              <>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 14 }}>
                  <input type="checkbox" checked={copyMenu} onChange={e => setCopyMenu(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--brand)' }} />
                  <span style={{ fontSize: 13 }}>
                    <strong>Start with my main menu</strong>
                    <span className="muted" style={{ display: 'block' }}>Copies items and prices. Stock starts at 0 so you set what this branch actually has.</span>
                  </span>
                </label>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 14 }}>
                  <input type="checkbox" checked={withLogin} onChange={e => setWithLogin(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--brand)' }} />
                  <span style={{ fontSize: 13 }}>
                    <strong>Create a login for the manager</strong>
                    <span className="muted" style={{ display: 'block' }}>They sign in on their own device and get this branch&apos;s alerts there. You can also do this later.</span>
                  </span>
                </label>
                {withLogin && loginFields}
              </>
            )}
            {error && <div className="input-error" style={{ marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {loginFor && (
        <div className="modal-overlay" onClick={() => !saving && setLoginFor(null)}>
          <form className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()} onSubmit={createLogin}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Branch login</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              For {loginFor.businessName}. The manager gets access to this branch only: its menu, stock, hours and orders.
            </p>
            {loginFields}
            {error && <div className="input-error" style={{ marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setLoginFor(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>{saving ? 'Creating…' : 'Create login'}</button>
            </div>
          </form>
        </div>
      )}

      {handover && (
        <div className="modal-overlay" onClick={() => setHandover(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Share these with the manager</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              {handover.password
                ? "This password is shown only now and can't be viewed again. If it is lost, reset it."
                : 'The manager signs in with the password you chose.'}
            </p>
            <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16 }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</div>
              <div style={{ fontWeight: 700, wordBreak: 'break-all', userSelect: 'all' }}>{handover.email}</div>
              {handover.password && (
                <>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 }}>Temporary password</div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 16, userSelect: 'all' }}>{handover.password}</div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => copy(handover.email, 'Email')}>Copy email</button>
              {handover.password && <button className="btn btn-ghost" onClick={() => copy(handover.password!, 'Password')}>Copy password</button>}
              <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setHandover(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
