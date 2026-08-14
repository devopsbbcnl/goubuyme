'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import ImageCropModal from '@/components/ui/ImageCropModal';
import api from '@/services/api';

const CLOUD_NAME   = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;

interface DrinkOption { id: string; name: string; price: number; isAvailable: boolean; }
interface OptionItem  { id: string; name: string; extraPrice: number; isAvailable: boolean; }
interface OptionGroup { id: string; name: string; required: boolean; items: OptionItem[]; }

interface Item {
  id: string; name: string; description?: string; price: number;
  image?: string; isAvailable: boolean; categoryTag?: string; stockQuantity: number;
  drinkOptions: DrinkOption[];
  optionGroups: OptionGroup[];
}

function VendorMenuCard({ item, toggleAvail, openDrinkModal, openOptModal, openModal, del }: {
  item: Item;
  toggleAvail: (item: Item) => void;
  openDrinkModal: (item: Item) => void;
  openOptModal: (item: Item) => void;
  openModal: (item?: Item) => void;
  del: (id: string) => void;
}) {
  const descRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showDrinkTooltip, setShowDrinkTooltip] = useState(false);
  const [showGroupsTooltip, setShowGroupsTooltip] = useState(false);
  const desc = item.description?.trim();
  const hasDesc = Boolean(desc);
  const descText = hasDesc ? desc! : 'No description added yet — customers see this text on the item page.';

  useEffect(() => {
    const el = descRef.current;
    if (el) setIsTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [descText]);

  const DRINK_PREVIEW = 3;
  const GROUP_ITEM_PREVIEW = 3;
  const drinkPreview = item.drinkOptions.slice(0, DRINK_PREVIEW);
  const drinkOverflow = item.drinkOptions.length - drinkPreview.length;
  const firstGroup = item.optionGroups[0];
  const groupItemPreview = firstGroup ? firstGroup.items.slice(0, GROUP_ITEM_PREVIEW) : [];
  const groupItemOverflow = firstGroup ? firstGroup.items.length - groupItemPreview.length : 0;
  const remainingGroups = item.optionGroups.slice(1);

  return (
    <div className="vmenu-card" style={{ opacity: item.isAvailable ? 1 : .6, position: 'relative' }}>
      {item.categoryTag && <span className="menu-featured-badge">{item.categoryTag}</span>}
      {item.image ? (
        <div className="img" style={{ position: 'relative' }}>
          <Image src={item.image} alt={item.name} fill sizes="(max-width: 560px) 50vw, 33vw" style={{ objectFit: 'cover' }} />
        </div>
      ) : <div className="img-ph">🍽️</div>}

      <div className="vmenu-body">
        <div className="vmenu-head">
          <div className="vmenu-name">{item.name}</div>
          <span className="vmenu-price">₦{item.price.toLocaleString()}</span>
        </div>

        <p style={{ fontSize: 12, fontWeight: 600, color: item.stockQuantity > 0 ? 'var(--muted)' : '#E23B3B', marginBottom: 4 }}>
          {item.stockQuantity > 0 ? `${item.stockQuantity} in stock` : 'Out of stock — hidden from customers'}
        </p>

        <div className="vmenu-desc-wrap">
          <p ref={descRef} className={`vmenu-desc${hasDesc ? '' : ' vmenu-desc-empty'}`}>{descText}</p>
          {isTruncated && (
            <span
              className="vmenu-desc-more"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              …more
            </span>
          )}
          {isTruncated && showTooltip && <span className="vmenu-desc-tooltip">{descText}</span>}
        </div>

        {/* Drink options — fixed-height preview, overflow revealed on hover */}
        <div className="vmenu-section">
          <div className="vmenu-section-title">
            🥤 Drink options · {item.drinkOptions.length > 0 ? `${item.drinkOptions.length} available` : 'none added'}
          </div>
          <div className="vmenu-chips-outer">
            <div className="vmenu-chips-fixed">
              {item.drinkOptions.length === 0 ? (
                <span className="vmenu-chips-empty">No drink options added</span>
              ) : (
                drinkPreview.map(opt => (
                  <span key={opt.id} className={`vmenu-chip${opt.isAvailable ? '' : ' unavailable'}`}>
                    {opt.name} · <b>₦{opt.price.toLocaleString()}</b>
                  </span>
                ))
              )}
            </div>
            {drinkOverflow > 0 && (
              <span
                className="vmenu-chip-more"
                onMouseEnter={() => setShowDrinkTooltip(true)}
                onMouseLeave={() => setShowDrinkTooltip(false)}
              >
                +{drinkOverflow} more
              </span>
            )}
            {drinkOverflow > 0 && showDrinkTooltip && (
              <span className="vmenu-tooltip">
                {item.drinkOptions.slice(DRINK_PREVIEW).map(opt => `${opt.name} (₦${opt.price.toLocaleString()})`).join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* Option groups — fixed-height preview of the first group, rest revealed on hover */}
        <div className="vmenu-section">
          <div className="vmenu-section-title">
            ⚙️ Add-on options · {item.optionGroups.length > 0 ? `${item.optionGroups.length} group${item.optionGroups.length > 1 ? 's' : ''}` : 'none added'}
          </div>
          <div className="vmenu-opt-preview">
            {!firstGroup ? (
              <span className="vmenu-chips-empty">No add-on groups added</span>
            ) : (
              <div className="vmenu-group">
                <div className="vmenu-group-head">
                  <span className="vmenu-group-name">{firstGroup.name}</span>
                  <span className={`badge ${firstGroup.required ? 'badge-warning' : 'badge-neutral'}`} style={{ fontSize: 10 }}>
                    {firstGroup.required ? 'Required' : 'Optional'}
                  </span>
                </div>
                <div className="vmenu-chips-fixed">
                  {firstGroup.items.length === 0 ? (
                    <span className="vmenu-chips-empty">No options added to this group yet</span>
                  ) : (
                    <>
                      {groupItemPreview.map(oi => (
                        <span key={oi.id} className={`vmenu-chip${oi.isAvailable ? '' : ' unavailable'}`}>
                          {oi.name}{oi.extraPrice > 0 && <> · <b>+₦{oi.extraPrice.toLocaleString()}</b></>}
                        </span>
                      ))}
                      {groupItemOverflow > 0 && <span className="vmenu-chip-more-static">+{groupItemOverflow} more</span>}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          {remainingGroups.length > 0 && (
            <div className="vmenu-groups-more-row">
              <span
                className="vmenu-groups-more"
                onMouseEnter={() => setShowGroupsTooltip(true)}
                onMouseLeave={() => setShowGroupsTooltip(false)}
              >
                +{remainingGroups.length} more group{remainingGroups.length > 1 ? 's' : ''}
              </span>
              {showGroupsTooltip && (
                <div className="vmenu-tooltip vmenu-groups-tooltip">
                  {remainingGroups.map(g => (
                    <div key={g.id} className="vmenu-tooltip-group">
                      <div className="vmenu-tooltip-group-name">
                        {g.name} <span className="vmenu-tooltip-req">({g.required ? 'Required' : 'Optional'})</span>
                      </div>
                      <div className="vmenu-tooltip-group-items">
                        {g.items.length === 0 ? 'No options added' : g.items.map(oi => `${oi.name}${oi.extraPrice > 0 ? ` (+₦${oi.extraPrice.toLocaleString()})` : ''}`).join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="vmenu-footer">
          {/* availability toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="switch" style={{ transform: 'scale(.85)', flexShrink: 0 }}>
              <input type="checkbox" checked={item.isAvailable} onChange={() => toggleAvail(item)} />
              <span className="track" />
            </label>
            <span style={{ fontSize: 13, fontWeight: 600, color: item.isAvailable ? 'var(--brand)' : 'var(--muted)' }}>
              {item.isAvailable ? 'Available to customers' : 'Currently turned off'}
            </span>
          </div>

          {/* action buttons */}
          <div className="vmenu-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => openDrinkModal(item)}>🥤 Drinks</button>
            <button className="btn btn-ghost btn-sm" onClick={() => openOptModal(item)}>⚙️ Add-ons</button>
            <button className="btn btn-ghost btn-sm" onClick={() => openModal(item)}>✏️ Edit</button>
            <button className="btn btn-danger btn-sm" onClick={() => del(item.id)}>Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function normalize(item: any): Item {
  return {
    ...item,
    categoryTag: item.categoryTag ?? item.category ?? undefined,
    stockQuantity: Number(item?.stockQuantity ?? 0),
    drinkOptions: item.drinkOptions ?? [],
    optionGroups: (item.optionGroups ?? []).map((g: any) => ({ ...g, items: g.items ?? [] })),
  };
}

type StatFilter = 'all' | 'live' | 'outOfStock';

export default function VendorMenuPage() {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [statFilter, setStatFilter] = useState<StatFilter>('all');

  // Add/edit modal
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', categoryTag: '', image: '', stockQuantity: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  // Drink options modal
  const [drinkItem, setDrinkItem] = useState<Item | null>(null);
  const [drinkName, setDrinkName] = useState('');
  const [drinkPrice, setDrinkPrice] = useState('');
  const [drinkSaving, setDrinkSaving] = useState(false);

  // Option groups modal
  const [optItem, setOptItem] = useState<Item | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupRequired, setNewGroupRequired] = useState(false);
  const [addingToGroupId, setAddingToGroupId] = useState<string | null>(null);
  const [newOptName, setNewOptName] = useState('');
  const [newOptPrice, setNewOptPrice] = useState('');
  const [optSaving, setOptSaving] = useState(false);

  useEffect(() => {
    api.get('/vendors/me/menu')
      .then(r => setItems((r.data.data ?? []).map(normalize)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Image upload ──────────────────────────────────────────────────────────

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', UPLOAD_PRESET);
      fd.append('folder', 'menu-items');
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: 'POST', body: fd },
      );
      if (!res.ok) throw new Error();
      const { secure_url } = await res.json();
      setForm(f => ({ ...f, image: secure_url }));
      toast('Image uploaded', 'success');
    } catch {
      toast('Image upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCropFile(file);
    e.target.value = '';
  };

  // ── Add / edit handlers ────────────────────────────────────────────────────

  const openModal = (item?: Item) => {
    if (item) {
      setEditing(item);
      setForm({ name: item.name, description: item.description ?? '', price: String(item.price), categoryTag: item.categoryTag ?? '', image: item.image ?? '', stockQuantity: String(item.stockQuantity ?? 0) });
    } else {
      setEditing(null);
      setForm({ name: '', description: '', price: '', categoryTag: '', image: '', stockQuantity: '' });
    }
    setUploading(false);
    setModal(true);
  };

  const save = async () => {
    if (!form.name || !form.price) { toast('Name and price required', 'error'); return; }
    const stockQuantity = Number(form.stockQuantity);
    if (!form.stockQuantity.trim() || !Number.isInteger(stockQuantity) || stockQuantity < 0) {
      toast('Enter a stock quantity of 0 or more', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name, description: form.description, price: Number(form.price), category: form.categoryTag, image: form.image || undefined, stockQuantity };
      if (editing) {
        const { data } = await api.patch(`/vendors/me/menu/${editing.id}`, payload);
        setItems(prev => prev.map(i => i.id === editing.id ? normalize(data.data) : i));
        toast('Item updated', 'success');
      } else {
        const { data } = await api.post('/vendors/me/menu', payload);
        setItems(prev => [...prev, normalize(data.data)]);
        toast('Item added', 'success');
      }
      setModal(false);
    } catch { toast('Save failed', 'error'); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!(await confirmDialog('Delete this item?', { confirmLabel: 'Delete' }))) return;
    try {
      await api.delete(`/vendors/me/menu/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
      toast('Item deleted', 'info');
    } catch { toast('Delete failed', 'error'); }
  };

  const toggleAvail = async (item: Item) => {
    try {
      const { data } = await api.patch(`/vendors/me/menu/${item.id}`, { isAvailable: !item.isAvailable });
      setItems(prev => prev.map(i => i.id === item.id ? normalize(data.data) : i));
    } catch { toast('Update failed', 'error'); }
  };

  // ── Drink option handlers ──────────────────────────────────────────────────

  const openDrinkModal = (item: Item) => {
    setDrinkItem(item);
    setDrinkName('');
    setDrinkPrice('');
  };

  const addDrink = async () => {
    if (!drinkItem) return;
    const name = drinkName.trim();
    const price = parseFloat(drinkPrice);
    if (!name) { toast('Drink name is required', 'error'); return; }
    if (isNaN(price) || price < 0) { toast('Enter a valid price (0 or more)', 'error'); return; }
    setDrinkSaving(true);
    try {
      const res = await api.post(`/vendors/me/menu/${drinkItem.id}/drink-options`, { name, price });
      const newOpt: DrinkOption = res.data.data;
      const update = (it: Item) => it.id === drinkItem.id
        ? { ...it, drinkOptions: [...it.drinkOptions, newOpt].sort((a, b) => a.price - b.price) }
        : it;
      setItems(prev => prev.map(update));
      setDrinkItem(prev => prev ? update(prev) : null);
      setDrinkName('');
      setDrinkPrice('');
      toast('Drink option added', 'success');
    } catch (err: any) { toast(err?.response?.data?.message ?? 'Could not add drink option', 'error'); }
    finally { setDrinkSaving(false); }
  };

  const toggleDrink = async (opt: DrinkOption) => {
    if (!drinkItem) return;
    const next = !opt.isAvailable;
    const update = (it: Item) => it.id === drinkItem.id
      ? { ...it, drinkOptions: it.drinkOptions.map(d => d.id === opt.id ? { ...d, isAvailable: next } : d) }
      : it;
    setItems(prev => prev.map(update));
    setDrinkItem(prev => prev ? update(prev) : null);
    try {
      await api.patch(`/vendors/me/menu/${drinkItem.id}/drink-options/${opt.id}`, { isAvailable: next });
    } catch {
      const revert = (it: Item) => it.id === drinkItem.id
        ? { ...it, drinkOptions: it.drinkOptions.map(d => d.id === opt.id ? { ...d, isAvailable: opt.isAvailable } : d) }
        : it;
      setItems(prev => prev.map(revert));
      setDrinkItem(prev => prev ? revert(prev) : null);
    }
  };

  const deleteDrink = async (opt: DrinkOption) => {
    if (!drinkItem) return;
    if (!(await confirmDialog(`Remove "${opt.name}"?`, { confirmLabel: 'Remove' }))) return;
    try {
      await api.delete(`/vendors/me/menu/${drinkItem.id}/drink-options/${opt.id}`);
      const remove = (it: Item) => it.id === drinkItem.id
        ? { ...it, drinkOptions: it.drinkOptions.filter(d => d.id !== opt.id) }
        : it;
      setItems(prev => prev.map(remove));
      setDrinkItem(prev => prev ? remove(prev) : null);
      toast('Drink option removed', 'info');
    } catch (err: any) { toast(err?.response?.data?.message ?? 'Could not remove drink option', 'error'); }
  };

  // ── Option group handlers ──────────────────────────────────────────────────

  const openOptModal = (item: Item) => {
    setOptItem(item);
    setNewGroupName('');
    setNewGroupRequired(false);
    setAddingToGroupId(null);
    setNewOptName('');
    setNewOptPrice('');
  };

  const addOptionGroup = async () => {
    if (!optItem) return;
    const name = newGroupName.trim();
    if (!name) { toast('Group name is required', 'error'); return; }
    setOptSaving(true);
    try {
      const res = await api.post(`/vendors/me/menu/${optItem.id}/option-groups`, { name, required: newGroupRequired });
      const newGroup: OptionGroup = { ...res.data.data, items: res.data.data.items ?? [] };
      const update = (it: Item) => it.id === optItem.id
        ? { ...it, optionGroups: [...it.optionGroups, newGroup] }
        : it;
      setItems(prev => prev.map(update));
      setOptItem(prev => prev ? update(prev) : null);
      setNewGroupName('');
      setNewGroupRequired(false);
      toast('Option group added', 'success');
    } catch (err: any) { toast(err?.response?.data?.message ?? 'Could not add option group', 'error'); }
    finally { setOptSaving(false); }
  };

  const deleteOptionGroup = async (group: OptionGroup) => {
    if (!optItem) return;
    if (!(await confirmDialog(`Remove "${group.name}" and all its options?`, { confirmLabel: 'Remove' }))) return;
    try {
      await api.delete(`/vendors/me/menu/${optItem.id}/option-groups/${group.id}`);
      const remove = (it: Item) => it.id === optItem.id
        ? { ...it, optionGroups: it.optionGroups.filter(g => g.id !== group.id) }
        : it;
      setItems(prev => prev.map(remove));
      setOptItem(prev => prev ? remove(prev) : null);
      toast('Group removed', 'info');
    } catch (err: any) { toast(err?.response?.data?.message ?? 'Could not remove group', 'error'); }
  };

  const addOptionItem = async (group: OptionGroup) => {
    if (!optItem) return;
    const name = newOptName.trim();
    const extraPrice = parseFloat(newOptPrice) || 0;
    if (!name) { toast('Option name is required', 'error'); return; }
    setOptSaving(true);
    try {
      const res = await api.post(`/vendors/me/menu/${optItem.id}/option-groups/${group.id}/items`, { name, extraPrice });
      const newOI: OptionItem = res.data.data;
      const update = (it: Item) => it.id === optItem.id
        ? { ...it, optionGroups: it.optionGroups.map(g => g.id === group.id ? { ...g, items: [...(g.items ?? []), newOI] } : g) }
        : it;
      setItems(prev => prev.map(update));
      setOptItem(prev => prev ? update(prev) : null);
      setNewOptName('');
      setNewOptPrice('');
      setAddingToGroupId(null);
      toast('Option added', 'success');
    } catch (err: any) { toast(err?.response?.data?.message ?? 'Could not add option', 'error'); }
    finally { setOptSaving(false); }
  };

  const toggleOptionItem = async (group: OptionGroup, oi: OptionItem) => {
    if (!optItem) return;
    const next = !oi.isAvailable;
    const apply = (it: Item) => it.id === optItem.id
      ? { ...it, optionGroups: it.optionGroups.map(g => g.id === group.id ? { ...g, items: g.items.map(x => x.id === oi.id ? { ...x, isAvailable: next } : x) } : g) }
      : it;
    setItems(prev => prev.map(apply));
    setOptItem(prev => prev ? apply(prev) : null);
    try {
      await api.patch(`/vendors/me/menu/${optItem.id}/option-groups/${group.id}/items/${oi.id}`, { isAvailable: next });
    } catch {
      const revert = (it: Item) => it.id === optItem.id
        ? { ...it, optionGroups: it.optionGroups.map(g => g.id === group.id ? { ...g, items: g.items.map(x => x.id === oi.id ? { ...x, isAvailable: oi.isAvailable } : x) } : g) }
        : it;
      setItems(prev => prev.map(revert));
      setOptItem(prev => prev ? revert(prev) : null);
    }
  };

  const deleteOptionItem = async (group: OptionGroup, oi: OptionItem) => {
    if (!optItem) return;
    if (!(await confirmDialog(`Remove "${oi.name}"?`, { confirmLabel: 'Remove' }))) return;
    try {
      await api.delete(`/vendors/me/menu/${optItem.id}/option-groups/${group.id}/items/${oi.id}`);
      const remove = (it: Item) => it.id === optItem.id
        ? { ...it, optionGroups: it.optionGroups.map(g => g.id === group.id ? { ...g, items: g.items.filter(x => x.id !== oi.id) } : g) }
        : it;
      setItems(prev => prev.map(remove));
      setOptItem(prev => prev ? remove(prev) : null);
      toast('Option removed', 'info');
    } catch (err: any) { toast(err?.response?.data?.message ?? 'Could not remove option', 'error'); }
  };

  // ── Stats ──────────────────────────────────────────────────────────────────

  const totalItems = items.length;
  const liveItems = items.filter(i => i.isAvailable).length;
  const outOfStockItems = items.filter(i => i.stockQuantity === 0).length;

  const toggleStatFilter = (f: StatFilter) => setStatFilter(prev => prev === f ? 'all' : f);

  const filteredItems = items.filter(item => {
    if (statFilter === 'live') return item.isAvailable;
    if (statFilter === 'outOfStock') return item.stockQuantity === 0;
    return true;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="between" style={{ marginBottom: 24 }}>
        <h1 className="t-page">Menu</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>+ Add Item</button>
      </div>

      {loading ? (
        <div className="kpi-grid">{[...Array(3)].map((_, i) => <div key={i} className="sk" style={{ height: 82 }} />)}</div>
      ) : (
        <div className="kpi-grid">
          <button
            type="button"
            className={`kpi-card clickable${statFilter === 'all' ? ' active' : ''}`}
            onClick={() => setStatFilter('all')}
          >
            <div className="kpi-label">Total Items</div>
            <div className="kpi-val">{totalItems}</div>
          </button>
          <button
            type="button"
            className={`kpi-card clickable${statFilter === 'live' ? ' active' : ''}`}
            onClick={() => toggleStatFilter('live')}
          >
            <div className="kpi-label">Live</div>
            <div className="kpi-val" style={{ color: 'var(--brand)' }}>{liveItems}</div>
          </button>
          <button
            type="button"
            className={`kpi-card clickable${statFilter === 'outOfStock' ? ' active' : ''}`}
            onClick={() => toggleStatFilter('outOfStock')}
          >
            <div className="kpi-label">Out of Stock</div>
            <div className="kpi-val" style={{ color: outOfStockItems > 0 ? '#E23B3B' : undefined }}>{outOfStockItems}</div>
          </button>
        </div>
      )}

      {loading ? (
        <div className="vmenu-grid">{[...Array(6)].map((_, i) => <div key={i} className="sk" style={{ height: 280 }} />)}</div>
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="emoji">🍽️</div>
          <h3>No menu items</h3>
          <p>Add your first item to get started.</p>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => openModal()}>+ Add Item</button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty">
          <div className="emoji">🔍</div>
          <h3>No items match this filter</h3>
          <p>{statFilter === 'live' ? 'None of your items are currently live.' : 'All your items are in stock.'}</p>
          <button className="btn btn-ghost" style={{ marginTop: 20 }} onClick={() => setStatFilter('all')}>Clear filter</button>
        </div>
      ) : (
        <div className="vmenu-grid">
          {filteredItems.map(item => (
            <VendorMenuCard
              key={item.id}
              item={item}
              toggleAvail={toggleAvail}
              openDrinkModal={openDrinkModal}
              openOptModal={openOptModal}
              openModal={openModal}
              del={del}
            />
          ))}
        </div>
      )}

      {/* hidden file inputs */}
      <input ref={fileInputRef}   type="file" accept="image/*"                    style={{ display: 'none' }} onChange={handleFile} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />

      {/* ── Add / Edit modal ── */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>{editing ? 'Edit Item' : 'Add Menu Item'}</h3><button onClick={() => setModal(false)}>✕</button></div>
            <div className="modal-body">
              {/* image upload */}
              <div className="form-group">
                <label className="label">Item Image</label>
                {/* preview */}
                <div style={{ width: '100%', height: 150, borderRadius: 4, border: '1.5px dashed var(--line)', background: 'var(--surface2)', overflow: 'hidden', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {uploading ? (
                    <span className="spin" style={{ borderColor: 'var(--line)', borderTopColor: 'var(--brand)', width: 28, height: 28 }} />
                  ) : form.image ? (
                    <>
                      <Image src={form.image} alt="preview" fill sizes="400px" style={{ objectFit: 'cover' }} />
                      <button
                        onClick={() => setForm(f => ({ ...f, image: '' }))}
                        style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,.55)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >✕</button>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                      <div style={{ fontSize: 30, marginBottom: 4 }}>🖼️</div>
                      <div style={{ fontSize: 12 }}>No image selected</div>
                    </div>
                  )}
                </div>
                {/* upload buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                    📁 Choose File
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={uploading} onClick={() => cameraInputRef.current?.click()}>
                    📷 Camera
                  </button>
                </div>
              </div>

              <div className="form-group"><label className="label">Name *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Price (₦) *</label><input className="input" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Stock Quantity *</label><input className="input" type="number" min={0} value={form.stockQuantity} onChange={e => setForm(f => ({ ...f, stockQuantity: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="e.g. 20" /></div>
              <div className="form-group"><label className="label">Category Tag</label><input className="input" value={form.categoryTag} onChange={e => setForm(f => ({ ...f, categoryTag: e.target.value }))} placeholder="e.g. Starters, Mains, Grills, Drinks" /></div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea className="textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe this item — include keywords customers might search for (e.g. ingredients, style, brand, flavour)" />
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5, lineHeight: 1.5 }}>
                  Tip: include searchable keywords — e.g. &quot;grilled chicken with jollof rice&quot;, &quot;Indomie noodles&quot;, &quot;Paracetamol 500mg&quot;. This helps customers discover your item.
                </p>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || uploading}>{saving ? <><span className="spin" />Saving…</> : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drink options modal ── */}
      {drinkItem && (
        <div className="modal-overlay" onClick={() => setDrinkItem(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>Drink Options</h3>
                <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>{drinkItem.name}</p>
              </div>
              <button onClick={() => setDrinkItem(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {drinkItem.drinkOptions.length === 0 ? (
                <p className="muted" style={{ textAlign: 'center', padding: '16px 0' }}>No drink options yet. Add one below.</p>
              ) : drinkItem.drinkOptions.map(opt => (
                <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{opt.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 700 }}>₦{opt.price.toLocaleString()}</div>
                  </div>
                  <label className="switch" style={{ transform: 'scale(.8)', flexShrink: 0 }}>
                    <input type="checkbox" checked={opt.isAvailable} onChange={() => toggleDrink(opt)} />
                    <span className="track" />
                  </label>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteDrink(opt)}>✕</button>
                </div>
              ))}

              <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 4 }}>
                <p className="label" style={{ marginBottom: 8 }}>Add a Drink Option</p>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <input className="input" placeholder="e.g. Can of Coke" value={drinkName} onChange={e => setDrinkName(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <input className="input" type="number" placeholder="Price (₦)" value={drinkPrice} onChange={e => setDrinkPrice(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setDrinkItem(null)}>Close</button>
              <button className="btn btn-primary" onClick={addDrink} disabled={drinkSaving}>
                {drinkSaving ? <><span className="spin" />Adding…</> : 'Add Drink'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Option groups modal ── */}
      {optItem && (
        <div className="modal-overlay" onClick={() => setOptItem(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>Add-on Options</h3>
                <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>{optItem.name}</p>
              </div>
              <button onClick={() => setOptItem(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {optItem.optionGroups.length === 0 && (
                <p className="muted" style={{ textAlign: 'center', padding: '12px 0' }}>No option groups yet. Add one below.</p>
              )}

              {optItem.optionGroups.map(group => (
                <div key={group.id} style={{ border: '1px solid var(--border)', borderRadius: 4, marginBottom: 12, overflow: 'hidden' }}>
                  {/* Group header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface)' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{group.name}</span>
                      {group.required && <span className="badge badge-warning" style={{ fontSize: 10, marginLeft: 8 }}>Required</span>}
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteOptionGroup(group)}>✕</button>
                  </div>

                  {/* Option items */}
                  {group.items.map(oi => (
                    <div key={oi.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{oi.name}</div>
                        {oi.extraPrice > 0 && <div style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 700 }}>+₦{oi.extraPrice.toLocaleString()}</div>}
                      </div>
                      <label className="switch" style={{ transform: 'scale(.8)', flexShrink: 0 }}>
                        <input type="checkbox" checked={oi.isAvailable} onChange={() => toggleOptionItem(group, oi)} />
                        <span className="track" />
                      </label>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteOptionItem(group, oi)}>✕</button>
                    </div>
                  ))}

                  {/* Inline add option */}
                  {addingToGroupId === group.id ? (
                    <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
                      <div className="form-group" style={{ marginBottom: 8 }}>
                        <input className="input" placeholder="Option name (e.g. Semo)" value={newOptName} onChange={e => setNewOptName(e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 8 }}>
                        <input className="input" type="number" placeholder="Extra price ₦ (0 if none)" value={newOptPrice} onChange={e => setNewOptPrice(e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setAddingToGroupId(null); setNewOptName(''); setNewOptPrice(''); }}>Cancel</button>
                        <button className="btn btn-primary btn-sm" onClick={() => addOptionItem(group)} disabled={optSaving}>
                          {optSaving ? <span className="spin" /> : 'Add Option'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      style={{ display: 'block', width: '100%', padding: '9px 12px', borderTop: '1px solid var(--border)', background: 'none', border: 'none', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)', color: 'var(--brand)', fontWeight: 600, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
                      onClick={() => { setAddingToGroupId(group.id); setNewOptName(''); setNewOptPrice(''); }}
                    >
                      + Add option
                    </button>
                  )}
                </div>
              ))}

              {/* Add group form */}
              <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 4, marginTop: 8 }}>
                <p className="label" style={{ marginBottom: 8 }}>Add Option Group</p>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <input className="input" placeholder="e.g. Choice of Swallow" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 4 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Required</div>
                    <div className="muted" style={{ fontSize: 11 }}>Customer must choose one</div>
                  </div>
                  <label className="switch" style={{ transform: 'scale(.85)', flexShrink: 0 }}>
                    <input type="checkbox" checked={newGroupRequired} onChange={e => setNewGroupRequired(e.target.checked)} />
                    <span className="track" />
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setOptItem(null)}>Close</button>
              <button className="btn btn-primary" onClick={addOptionGroup} disabled={optSaving}>
                {optSaving ? <><span className="spin" />Adding…</> : 'Add Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ImageCropModal
        file={cropFile}
        aspect={4 / 3}
        onCancel={() => setCropFile(null)}
        onConfirm={(croppedFile) => { setCropFile(null); uploadImage(croppedFile); }}
      />
    </div>
  );
}
