import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import supabase from '../../lib/supabase';
import { CRUISE_REGIONS } from '../../../../shared/cruiseRegions.js';
import { FIELD, PRIMARY, SECONDARY, isPriceStale, send } from './cruise/cruiseAdminApi';

const PRICE_NOTE = 'All-in per person: fare plus port fees, taxes and every mandatory fee (California SB 478).';

const blankDay = (day) => ({ day, portId: '', arrive: '', depart: '' });

const resizeDays = (days, nights) => Array.from({ length: nights + 1 }, (_, i) => days[i] ?? blankDay(i + 1))
  .map((d, i) => ({ ...d, day: i + 1 }));

const EMPTY = {
  title: '', headline: '', region: 'caribbean', lineId: '', shipId: '', nights: '7', inclusions: '', status: 'draft',
  days: resizeDays([], 7), dates: [], fromPriceUsd: '', recheckedToday: false, photos: [],
};

export default function CruiseSailingEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [checkedOn, setCheckedOn] = useState(null);
  const [lines, setLines] = useState([]);
  const [ships, setShips] = useState([]);
  const [ports, setPorts] = useState([]);
  const [newDate, setNewDate] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      const [lineResult, portResult] = await Promise.all([send('lines'), send('ports')]);
      if (lineResult.body) setLines(lineResult.body.data ?? []);
      if (portResult.body) setPorts(portResult.body.data ?? []);
      const failed = lineResult.error || portResult.error;
      if (failed) setError(failed);
      if (isNew) return;
      const result = await send(`sailings/${encodeURIComponent(id)}`);
      if (result.error) { setError(result.error); return; }
      const s = result.body.data;
      setCheckedOn(s.price_checked_on);
      setForm({
        title: s.title ?? '', headline: s.headline ?? '', region: s.region, lineId: s.line_id ?? '', shipId: s.ship_id ?? '',
        nights: String(s.nights), inclusions: s.inclusions ?? '', status: s.status,
        days: resizeDays((s.days ?? []).map((d) => ({ day: d.day, portId: d.portId ?? '', arrive: d.arrive ?? '', depart: d.depart ?? '' })), s.nights),
        dates: s.dates ?? [], fromPriceUsd: s.from_price_usd ?? '', recheckedToday: false, photos: s.photos ?? [],
      });
    })();
  }, [id, isNew]);

  useEffect(() => {
    if (!form.lineId) { setShips([]); return; }
    send(`ships?lineId=${encodeURIComponent(form.lineId)}`).then((result) => {
      if (result.body) setShips(result.body.data ?? []);
    });
  }, [form.lineId]);

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const setNights = (value) => {
    const nights = Number(value);
    setForm((current) => ({
      ...current,
      nights: value,
      days: Number.isInteger(nights) && nights >= 1 && nights <= 60 ? resizeDays(current.days, nights) : current.days,
    }));
  };

  const setDay = (index, patch) => setForm((current) => ({
    ...current,
    days: current.days.map((d, i) => (i === index ? { ...d, ...patch } : d)),
  }));

  const addDate = () => {
    if (!newDate || form.dates.includes(newDate)) return;
    set({ dates: [...form.dates, newDate].sort() });
    setNewDate('');
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    const result = await send('photo-upload-url', { method: 'POST', body: JSON.stringify({ filename: file.name }) });
    if (result.error) { setError(result.error); setUploading(false); return; }
    const { path, token, publicUrl } = result.body.data;
    const { error: uploadError } = await supabase.storage.from('cruise-photos').uploadToSignedUrl(path, token, file);
    setUploading(false);
    if (uploadError) { setError('The photo could not be uploaded. Try again.'); return; }
    setForm((current) => ({ ...current, photos: [...current.photos, { url: publicUrl, credit: '' }] }));
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const body = {
      title: form.title,
      headline: form.headline,
      region: form.region,
      lineId: form.lineId,
      shipId: form.shipId || null,
      nights: Number(form.nights),
      inclusions: form.inclusions,
      status: form.status,
      days: form.days.map((d) => ({ day: d.day, portId: d.portId || null, arrive: d.arrive || null, depart: d.depart || null })),
      dates: form.dates,
      fromPriceUsd: form.fromPriceUsd === '' ? null : Number(form.fromPriceUsd),
      recheckedToday: form.recheckedToday,
      photos: form.photos,
    };
    const result = await send(isNew ? 'sailings' : `sailings/${encodeURIComponent(id)}`, {
      method: isNew ? 'POST' : 'PUT',
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    navigate('/admin/cruises');
  };

  return (
    <form onSubmit={save} className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#034457]">{isNew ? 'New sailing' : 'Edit sailing'}</h1>
        <Link to="/admin/cruises" className="text-sm text-[#055B75] hover:underline">Back to the catalog</Link>
      </div>

      <section className="grid gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">Title<input className={FIELD} value={form.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="text-sm sm:col-span-2">Headline (optional, plain and specific)<input className={FIELD} value={form.headline} onChange={(e) => set({ headline: e.target.value })} /></label>
        <label className="text-sm">Region
          <select className={FIELD} value={form.region} onChange={(e) => set({ region: e.target.value })}>
            {CRUISE_REGIONS.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Nights<input className={FIELD} type="number" min="1" max="60" value={form.nights} onChange={(e) => setNights(e.target.value)} /></label>
        <label className="text-sm">Cruise line
          <select className={FIELD} value={form.lineId} onChange={(e) => set({ lineId: e.target.value, shipId: '' })}>
            <option value="">Pick a cruise line</option>
            {lines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Ship (optional)
          <select className={FIELD} value={form.shipId} onChange={(e) => set({ shipId: e.target.value })} disabled={!form.lineId}>
            <option value="">No ship yet</option>
            {ships.map((ship) => <option key={ship.id} value={ship.id}>{ship.name}</option>)}
          </select>
        </label>
      </section>

      <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-[#034457]">Itinerary</h2>
        <p className="text-sm text-gray-500">One row per day. The first and last day must be a port. Add missing ports on the catalog's Ports tab.</p>
        {form.days.map((d, i) => (
          <div key={d.day} data-testid="day-row" className="grid items-end gap-2 sm:grid-cols-[4rem_1fr_7rem_7rem]">
            <span className="pb-2 text-sm font-semibold text-[#055B75]">Day {d.day}</span>
            <label className="text-xs">Port
              <select className={FIELD} value={d.portId} onChange={(e) => setDay(i, { portId: e.target.value })}>
                <option value="">At sea</option>
                {ports.map((port) => <option key={port.id} value={port.id}>{port.name}, {port.country}</option>)}
              </select>
            </label>
            <label className="text-xs">Arrive<input className={FIELD} type="time" value={d.arrive} onChange={(e) => setDay(i, { arrive: e.target.value })} disabled={!d.portId} /></label>
            <label className="text-xs">Depart<input className={FIELD} type="time" value={d.depart} onChange={(e) => setDay(i, { depart: e.target.value })} disabled={!d.portId} /></label>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-[#034457]">Sailing dates</h2>
        <div className="flex gap-2">
          <label className="text-sm">Add a date<input className={FIELD} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></label>
          <button type="button" className={`${SECONDARY} self-end`} onClick={addDate}>Add date</button>
        </div>
        <ul className="flex flex-wrap gap-2">
          {form.dates.map((date) => (
            <li key={date} className="flex items-center gap-2 rounded-full bg-[#F1FBFD] px-3 py-1 text-sm text-[#034457]">
              {date}
              <button type="button" aria-label={`Remove ${date}`} className="text-gray-500 hover:text-red-600" onClick={() => set({ dates: form.dates.filter((x) => x !== date) })}>×</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-[#034457]">Price</h2>
        <label className="text-sm">From price per person (USD)<input className={FIELD} inputMode="decimal" value={form.fromPriceUsd} onChange={(e) => set({ fromPriceUsd: e.target.value })} /></label>
        <p className="text-sm font-medium text-[#055B75]">{PRICE_NOTE}</p>
        {checkedOn && (
          <p className="text-xs text-gray-500">
            Checked {checkedOn}
            {isPriceStale(checkedOn) && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Price over 30 days old</span>}
          </p>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.recheckedToday} onChange={(e) => set({ recheckedToday: e.target.checked })} /> Price re-checked today</label>
        <label className="block text-sm">What's included (optional)<textarea className={FIELD} rows={3} value={form.inclusions} onChange={(e) => set({ inclusions: e.target.value })} /></label>
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-[#034457]">Photos</h2>
        <p className="text-sm text-gray-500">Only photos from the cruise line's agent photo library, or our own. Every photo needs a credit.</p>
        <label className="text-sm">Add photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => { uploadPhoto(e.target.files?.[0]); e.target.value = ''; }} className="mt-1 block" /></label>
        {uploading && <p className="text-sm text-gray-500">Uploading…</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {form.photos.map((photo, i) => (
            <li key={photo.url} className="space-y-2 rounded-lg border border-gray-200 p-2">
              <img src={photo.url} alt="" className="h-32 w-full rounded object-cover" />
              <label className="text-xs">Credit<input className={FIELD} value={photo.credit} onChange={(e) => set({ photos: form.photos.map((p, j) => (j === i ? { ...p, credit: e.target.value } : p)) })} /></label>
              <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => set({ photos: form.photos.filter((_, j) => j !== i) })}>Remove photo</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-gray-200 bg-white p-5">
        <label className="text-sm">Status
          <select className={FIELD} value={form.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
        <button type="submit" className={PRIMARY} disabled={saving}>Save</button>
        {error && <p role="alert" className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </section>
    </form>
  );
}
