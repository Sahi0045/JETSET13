/**
 * resources/js/hooks/useAutosave.js
 * Phase 5 — Auto-Save Draft Applications
 * 
 * Usage:
 *   const { saveStatus, lastSaved, clearDraft } = useAutosave(formData, 'visa');
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '../config/supabase';

const DEBOUNCE_MS   = 2000;   // save 2s after last keystroke
const LOCAL_PREFIX  = 'jetset_draft_';

/**
 * @param {object}  formData   - The current form state to persist
 * @param {string}  formType   - Key: 'visa' | 'inquiry' | 'package' | 'flight'
 * @param {object}  [options]
 * @param {number}  [options.debounceMs]  - Override debounce delay
 * @param {boolean} [options.localOnly]   - Skip Supabase, use localStorage only
 */
export function useAutosave(formData, formType, options = {}) {
  const { debounceMs = DEBOUNCE_MS, localOnly = false } = options;

  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle'|'saving'|'saved'|'error'
  const [lastSaved,  setLastSaved]  = useState(null);
  const timerRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // ── Save to localStorage (instant, always) ──────────────
  const saveLocal = useCallback((data) => {
    try {
      localStorage.setItem(LOCAL_PREFIX + formType, JSON.stringify({
        data,
        savedAt: new Date().toISOString(),
      }));
    } catch (_) { /* quota exceeded? ignore */ }
  }, [formType]);

  // ── Save to Supabase (debounced) ─────────────────────────
  const saveRemote = useCallback(async (data) => {
    if (!isMounted.current) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // not logged in, local-only is fine

      const { error } = await supabase.from('application_drafts').upsert({
        user_id:    user.id,
        form_type:  formType,
        form_data:  data,
        last_saved: new Date().toISOString(),
      }, { onConflict: 'user_id,form_type' });

      if (!isMounted.current) return;
      if (error) throw error;
      setSaveStatus('saved');
      setLastSaved(new Date());
    } catch (err) {
      if (!isMounted.current) return;
      console.warn('[AutoSave] Remote save failed:', err.message);
      setSaveStatus('error');
    }
  }, [formType]);

  // ── Debounced save trigger ────────────────────────────────
  useEffect(() => {
    if (!formData || Object.keys(formData).length === 0) return;

    // Always save locally (instant)
    saveLocal(formData);
    setSaveStatus('saving');

    // Clear previous timer
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!localOnly) {
      timerRef.current = setTimeout(() => {
        saveRemote(formData);
      }, debounceMs);
    } else {
      setSaveStatus('saved');
      setLastSaved(new Date());
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [formData, saveLocal, saveRemote, debounceMs, localOnly]);

  // ── Load saved draft ──────────────────────────────────────
  const loadDraft = useCallback(async () => {
    // Try Supabase first
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('application_drafts')
          .select('form_data, last_saved')
          .eq('user_id', user.id)
          .eq('form_type', formType)
          .single();

        if (!error && data) return { data: data.form_data, savedAt: data.last_saved, source: 'remote' };
      }
    } catch (_) { /* fall through to local */ }

    // Fallback to localStorage
    try {
      const raw = localStorage.getItem(LOCAL_PREFIX + formType);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { data: parsed.data, savedAt: parsed.savedAt, source: 'local' };
      }
    } catch (_) { /* ignore */ }

    return null;
  }, [formType]);

  // ── Clear draft ───────────────────────────────────────────
  const clearDraft = useCallback(async () => {
    localStorage.removeItem(LOCAL_PREFIX + formType);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('application_drafts')
          .delete()
          .eq('user_id', user.id)
          .eq('form_type', formType);
      }
    } catch (_) { /* ignore */ }
    setSaveStatus('idle');
    setLastSaved(null);
  }, [formType]);

  return { saveStatus, lastSaved, loadDraft, clearDraft };
}

/**
 * AutoSave Status Badge — drop into any form
 * <AutoSaveBadge saveStatus={saveStatus} lastSaved={lastSaved} />
 */
export function AutoSaveBadge({ saveStatus, lastSaved }) {
  if (saveStatus === 'idle') return null;

  const config = {
    saving: { icon: '⟳', text: 'Saving draft…',  color: '#60a5fa' },
    saved:  { icon: '✓', text: lastSaved ? `Draft saved ${formatRelative(lastSaved)}` : 'Draft saved', color: '#34d399' },
    error:  { icon: '⚠', text: 'Save failed — check connection', color: '#f87171' },
  };

  const c = config[saveStatus] || config.saved;

  return (
    <span style={{
      fontSize: '0.72rem', color: c.color, display: 'inline-flex',
      alignItems: 'center', gap: '4px', transition: 'color 0.3s',
    }}>
      <span style={{ fontSize: '0.85rem' }}>{c.icon}</span>
      {c.text}
    </span>
  );
}

function formatRelative(date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60)  return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
