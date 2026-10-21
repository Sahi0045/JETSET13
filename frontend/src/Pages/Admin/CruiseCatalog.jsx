import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { regionByKey } from '../../../../shared/cruiseRegions.js';
import { useRegisterRefresh } from './shell/RefreshContext';
import { FIELD, PRIMARY, SECONDARY, isPriceStale, send, usd } from './cruise/cruiseAdminApi';

const TABS = [
  { key: 'sailings', label: 'Sailings' },
  { key: 'lines', label: 'Lines & ships' },
  { key: 'ports', label: 'Ports' },
];

function Notice({ notice }) {
  if (!notice) return null;
  const tone = notice.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700';
  return <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>{notice.text}</p>;
}

function Sailings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await send('sailings');
    setError(result.error || null);
    if (result.body) setRows(Array.isArray(result.body.data) ? result.body.data : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useRegisterRefresh(load);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Sailings customers see on /cruises once published.</p>
        <Link to="/admin/cruises/new" className={PRIMARY}>New sailing</Link>
      </div>
      {error && <Notice notice={{ tone: 'error', text: error }} />}
      {loading ? <p className="text-sm text-gray-500">Loading sailings…</p> : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">No sailings yet. Add the first one with “New sailing”.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F1FBFD] text-left text-xs uppercase tracking-wide text-[#034457]">
              <tr>
                <th className="px-4 py-3">Sailing</th><th className="px-4 py-3">Region</th><th className="px-4 py-3">Line</th>
                <th className="px-4 py-3">Nights</th><th className="px-4 py-3">Next date</th><th className="px-4 py-3">From price</th><th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-semibold text-[#034457]"><Link to={`/admin/cruises/${row.id}`} className="hover:underline">{row.title}</Link></td>
                  <td className="px-4 py-3">{regionByKey(row.region)?.name ?? row.region}</td>
                  <td className="px-4 py-3">{row.line_name}</td>
                  <td className="px-4 py-3">{row.nights}</td>
                  <td className="px-4 py-3">{row.next_date ?? <span className="text-amber-700">No future date</span>}</td>
                  <td className="px-4 py-3">
                    {row.from_price_usd ? usd(row.from_price_usd) : '—'}
                    {row.price_checked_on && <span className="block text-xs text-gray-500">checked {row.price_checked_on}</span>}
                    {isPriceStale(row.price_checked_on) && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Price over 30 days old</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                      {row.status === 'published' ? 'Published' : 'Draft'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LinesAndShips() {
  const [lines, setLines] = useState([]);
  const [lineId, setLineId] = useState('');
  const [ships, setShips] = useState([]);
  const [lineName, setLineName] = useState('');
  const [shipName, setShipName] = useState('');
  const [notice, setNotice] = useState(null);

  const loadLines = useCallback(async () => {
    const result = await send('lines');
    if (result.error) setNotice({ tone: 'error', text: result.error });
    else setLines(result.body.data ?? []);
  }, []);
  useEffect(() => { loadLines(); }, [loadLines]);

  const loadShips = useCallback(async (id) => {
    if (!id) { setShips([]); return; }
    const result = await send(`ships?lineId=${encodeURIComponent(id)}`);
    if (result.error) setNotice({ tone: 'error', text: result.error });
    else setShips(result.body.data ?? []);
  }, []);
  useEffect(() => { loadShips(lineId); }, [lineId, loadShips]);

  const addLine = async (event) => {
    event.preventDefault();
    const result = await send('lines', { method: 'POST', body: JSON.stringify({ name: lineName }) });
    if (result.error) { setNotice({ tone: 'error', text: result.error }); return; }
    setNotice({ tone: 'ok', text: `${result.body.data.name} added.` });
    setLineName('');
    loadLines();
  };

  const addShip = async (event) => {
    event.preventDefault();
    const result = await send('ships', { method: 'POST', body: JSON.stringify({ lineId, name: shipName }) });
    if (result.error) { setNotice({ tone: 'error', text: result.error }); return; }
    setNotice({ tone: 'ok', text: `${result.body.data.name} added.` });
    setShipName('');
    loadShips(lineId);
  };

  return (
    <section className="grid gap-6 md:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-[#034457]">Cruise lines</h3>
        <ul className="divide-y divide-gray-100 text-sm">
          {lines.map((line) => (
            <li key={line.id}>
              <button type="button" onClick={() => setLineId(line.id)} className={`w-full py-2 text-left ${lineId === line.id ? 'font-semibold text-[#055B75]' : ''}`}>{line.name}</button>
            </li>
          ))}
        </ul>
        <form onSubmit={addLine} className="flex gap-2">
          <label className="flex-1 text-sm">New cruise line<input className={FIELD} value={lineName} onChange={(e) => setLineName(e.target.value)} /></label>
          <button type="submit" className={`${SECONDARY} self-end`}>Add line</button>
        </form>
      </div>
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-[#034457]">Ships {lineId ? `of ${lines.find((l) => l.id === lineId)?.name ?? ''}` : ''}</h3>
        {!lineId ? <p className="text-sm text-gray-500">Pick a cruise line to see and add its ships.</p> : (
          <>
            <ul className="divide-y divide-gray-100 text-sm">{ships.map((ship) => <li key={ship.id} className="py-2">{ship.name}</li>)}</ul>
            <form onSubmit={addShip} className="flex gap-2">
              <label className="flex-1 text-sm">New ship<input className={FIELD} value={shipName} onChange={(e) => setShipName(e.target.value)} /></label>
              <button type="submit" className={`${SECONDARY} self-end`}>Add ship</button>
            </form>
          </>
        )}
      </div>
      <div className="md:col-span-2"><Notice notice={notice} /></div>
    </section>
  );
}

const EMPTY_PORT = { name: '', country: '', lat: '', lon: '', unlocode: null };

function Ports() {
  const [ports, setPorts] = useState([]);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [form, setForm] = useState(EMPTY_PORT);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    const result = await send('ports');
    if (result.error) setNotice({ tone: 'error', text: result.error });
    else setPorts(result.body.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const search = async (event) => {
    event.preventDefault();
    const result = await send(`port-search?q=${encodeURIComponent(query)}`);
    if (result.error) { setNotice({ tone: 'error', text: result.error }); return; }
    setMatches(result.body.data ?? []);
    if (!result.body.data?.length) setNotice({ tone: 'error', text: `No port called “${query}” in the list. Add it by hand below.` });
  };

  const add = async (port) => {
    const result = await send('ports', { method: 'POST', body: JSON.stringify(port) });
    if (result.error) { setNotice({ tone: 'error', text: result.error }); return; }
    setNotice({ tone: 'ok', text: `${result.body.data.name} added.` });
    setForm(EMPTY_PORT);
    load();
  };

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-[#034457]">Add a port</h3>
        <form onSubmit={search} className="mt-3 flex gap-2">
          <label className="flex-1 text-sm">Search 1,600 ports by name<input className={FIELD} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <button type="submit" className={`${SECONDARY} self-end`}>Search</button>
        </form>
        {matches.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100 text-sm">
            {matches.map((port) => (
              <li key={port.unlocode} className="flex items-center justify-between py-2">
                <span>{port.name}, {port.country} <span className="text-gray-400">({port.lat.toFixed(2)}, {port.lon.toFixed(2)})</span></span>
                <button type="button" className={SECONDARY} onClick={() => add(port)}>Add</button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={(e) => { e.preventDefault(); add({ ...form, lat: Number(form.lat), lon: Number(form.lon) }); }} className="mt-4 grid gap-2 sm:grid-cols-5">
          <label className="text-sm sm:col-span-2">Port name<input className={FIELD} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="text-sm">Country<input className={FIELD} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></label>
          <label className="text-sm">Latitude<input className={FIELD} inputMode="decimal" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} /></label>
          <label className="text-sm">Longitude<input className={FIELD} inputMode="decimal" value={form.lon} onChange={(e) => setForm({ ...form, lon: e.target.value })} /></label>
          <div className="sm:col-span-5"><button type="submit" className={SECONDARY}>Add by hand</button></div>
        </form>
      </div>
      <Notice notice={notice} />
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-[#F1FBFD] text-left text-xs uppercase tracking-wide text-[#034457]"><tr><th className="px-4 py-3">Port</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">Position</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {ports.map((port) => (
              <tr key={port.id}><td className="px-4 py-2">{port.name}</td><td className="px-4 py-2">{port.country}</td><td className="px-4 py-2 text-gray-500">{Number(port.lat).toFixed(2)}, {Number(port.lon).toFixed(2)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function CruiseCatalog() {
  const [tab, setTab] = useState('sailings');
  return (
    <div className="space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-[#034457]">Cruise Catalog</h1>
        <p className="text-sm text-gray-600">Sailings our team books, entered from the cruise lines' agent portals.</p>
      </div>
      <div role="tablist" className="flex gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === t.key ? 'border-[#055B75] text-[#055B75]' : 'border-transparent text-gray-500 hover:text-[#034457]'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'sailings' && <Sailings />}
      {tab === 'lines' && <LinesAndShips />}
      {tab === 'ports' && <Ports />}
    </div>
  );
}
