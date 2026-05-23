import { openDB } from 'idb';
import { useState, useEffect, useRef } from 'react';

const DB_NAME = 'cultivate-offline';
const DB_VERSION = 1;
const STORE = 'pending_writes';
const MAX_RETRIES = 3;

function openOfflineDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    },
  });
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isNetworkError(e) {
  const msg = e?.message ?? '';
  return msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('network error');
}

export async function enqueueWrite({ endpoint, payload, entity_type = 'unknown', method = 'POST' }) {
  const db = await openOfflineDB();
  await db.add(STORE, {
    id: genId(),
    created_at: new Date().toISOString(),
    method,
    endpoint,
    payload,
    entity_type,
    retry_count: 0,
    last_error: null,
    status: 'pending',
  });
}

export async function getQueueDepth() {
  try {
    const db = await openOfflineDB();
    const all = await db.getAll(STORE);
    return all.filter(r => r.status === 'pending').length;
  } catch {
    return 0;
  }
}

async function getQueueStats() {
  try {
    const db = await openOfflineDB();
    const all = await db.getAll(STORE);
    return {
      pending: all.filter(r => r.status === 'pending').length,
      failed: all.filter(r => r.status === 'failed').length,
    };
  } catch {
    return { pending: 0, failed: 0 };
  }
}

export async function flushQueue() {
  let db;
  try { db = await openOfflineDB(); } catch { return; }

  const all = await db.getAll(STORE);
  const pending = all
    .filter(r => r.status === 'pending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (const record of pending) {
    try {
      const token = localStorage.getItem('cv_token');
      const res = await fetch(record.endpoint, {
        method: record.method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(record.payload),
      });

      if (res.ok) {
        await db.delete(STORE, record.id);
      } else if (res.status >= 400 && res.status < 500) {
        // Permanent 4xx failure — don't retry
        await db.put(STORE, { ...record, status: 'failed', last_error: `HTTP ${res.status}` });
      } else {
        // 5xx — retry up to MAX_RETRIES
        const updated = { ...record, retry_count: record.retry_count + 1 };
        if (updated.retry_count >= MAX_RETRIES) {
          await db.put(STORE, { ...updated, status: 'failed', last_error: `Server error after ${MAX_RETRIES} retries` });
        } else {
          await db.put(STORE, updated);
        }
      }
    } catch (e) {
      // Network error — retry up to MAX_RETRIES
      const updated = { ...record, retry_count: record.retry_count + 1, last_error: e.message };
      if (updated.retry_count >= MAX_RETRIES) {
        await db.put(STORE, { ...updated, status: 'failed' });
      } else {
        await db.put(STORE, updated);
      }
    }
  }
}

/**
 * useOfflineSubmit — wraps any form submit with offline-queue behavior.
 *
 * Usage:
 *   const { submit, saving, pendingSync, syncError } = useOfflineSubmit({ draftKey, onSuccess, onError });
 *
 *   // In handleSave, call submit with the api function and a queue entry:
 *   await submit(
 *     () => api.createFertigationApplication(payload),
 *     { endpoint: '/api/applications/fertigation', payload, entity_type: 'fertigation' }
 *   );
 *
 * onSuccess(result, isOffline) — called on success (isOffline=true when queued locally)
 * onError(e) — called on non-network errors
 */
export function useOfflineSubmit({ draftKey, onSuccess, onError }) {
  const [saving, setSaving] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const [syncError, setSyncError] = useState(null);

  // Use refs so callbacks always call latest version without requiring useCallback in consumer
  const cbsRef = useRef({ onSuccess, onError });
  cbsRef.current = { onSuccess, onError };

  async function submit(submitFn, queueEntry) {
    setSaving(true);
    setSyncError(null);
    try {
      const result = await submitFn();
      if (draftKey) { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } }
      setPendingSync(false);
      cbsRef.current.onSuccess?.(result, false);
    } catch (e) {
      if (isNetworkError(e)) {
        if (queueEntry) {
          try { await enqueueWrite(queueEntry); } catch { /* ignore queue write failure */ }
        }
        setPendingSync(true);
        if (draftKey) { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } }
        cbsRef.current.onSuccess?.(null, true);
      } else {
        setSyncError(e.message || 'Failed to save.');
        cbsRef.current.onError?.(e);
      }
    } finally {
      setSaving(false);
    }
  }

  return { submit, saving, pendingSync, syncError };
}

/**
 * useSyncQueue — runs flushQueue on mount and whenever the browser comes online.
 * Call once at the app root (App.jsx).
 */
export function useSyncQueue() {
  useEffect(() => {
    flushQueue();
    function handleOnline() { flushQueue(); }
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);
}

/**
 * useSyncStatus — returns { pending, failed } queue counts for the NavBar badge.
 * Refreshes on mount, every 5 seconds, and on online/offline events.
 */
export function useSyncStatus() {
  const [stats, setStats] = useState({ pending: 0, failed: 0 });

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      const s = await getQueueStats();
      if (mounted) setStats(s);
    }
    refresh();
    const interval = setInterval(refresh, 5000);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  return stats;
}
