'use client';

// Audits page renders read-only activity history; formatting only, no behavior changes.

import * as React from 'react';

import { AuthGate } from '@/components/AuthGate';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/Table';

import { idr } from '@/lib/format';
import { monthToISOFirst } from '@/lib/period';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 50;

const ACTION_OPTIONS = [
  'rent_full',
  'water_full',
  'rent_partial',
  'water_partial',
  'undo',
  'occupancy_set',
  'occupancy_clear',
  'rent_price_change',
] as const;

type FilterState = {
  month: string;
  actor: string;
  house: string;
  action: string;
};

type VAudit = {
  id: string;
  created_at: string; // ISO
  actor_name: string | null;
  action: string;
  period: string | null;
  kind: string | null;
  amount: number | null;
  note: string | null;
  house_id: string;
  house_code: string;
  house_owner: string | null;
};

type HouseOpt = {
  id: string;
  code: string;
  owner: string | null;
};

async function fetchAudits(filters: FilterState, offset: number) {
  if (!filters.month) {
    throw new Error('Periode harus dipilih.');
  }
  const periodISO = monthToISOFirst(filters.month);
  const startDate = new Date(`${periodISO}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Periode tidak valid.');
  }
  const endDate = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);

  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();

  let query = supabase
    .from('v_audits')
    .select<string, VAudit>('*')
    .gte('created_at', startISO)
    .lt('created_at', endISO);

  if (filters.house) {
    query = query.eq('house_id', filters.house);
  }
  if (filters.actor) {
    query = query.ilike('actor_name', `%${filters.actor}%`);
  }
  if (filters.action) {
    query = query.eq('action', filters.action);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

function AuditsPageInner() {
  const defaultMonth = React.useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [month, setMonth] = React.useState(defaultMonth);
  const [actor, setActor] = React.useState('');
  const [house, setHouse] = React.useState('');
  const [action, setAction] = React.useState('');
  const [appliedFilters, setAppliedFilters] = React.useState<FilterState>({
    month: defaultMonth,
    actor: '',
    house: '',
    action: '',
  });
  const [rows, setRows] = React.useState<VAudit[]>([]);
  const [houses, setHouses] = React.useState<HouseOpt[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function loadHouses() {
      const { data, error } = await supabase
        .from('houses')
        .select<string, HouseOpt>('id,code,owner')
        .order('code');
      if (error) {
        console.error('Failed to load houses', error);
        return;
      }
      setHouses(data ?? []);
    }
    loadHouses();
  }, []);

  const applyFilters = React.useCallback(async (filters: FilterState) => {
    setAppliedFilters(filters);
    setLoading(true);
    setMessage(null);
    try {
      const data = await fetchAudits(filters, 0);
      setRows(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch (error) {
      setRows([]);
      setHasMore(false);
      setMessage(error instanceof Error ? error.message : 'Gagal memuat audit.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleApply = React.useCallback(async () => {
    const filters: FilterState = {
      month,
      actor: actor.trim(),
      house,
      action,
    };
    await applyFilters(filters);
  }, [month, actor, house, action, applyFilters]);

  const handleLoadMore = React.useCallback(async () => {
    if (!hasMore || loading || loadingMore) return;
    setLoadingMore(true);
    setMessage(null);
    try {
      const data = await fetchAudits(appliedFilters, rows.length);
      setRows((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat data tambahan.');
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loading, loadingMore, appliedFilters, rows.length]);

  React.useEffect(() => {
    const filters: FilterState = {
      month: defaultMonth,
      actor: '',
      house: '',
      action: '',
    };
    void applyFilters(filters);
  }, [applyFilters, defaultMonth]);

  return (
    <div className="page-stack">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Audit</h1>
        <p className="text-sm text-[var(--muted)]">
          Riwayat aksi pembayaran &amp; status hunian untuk transparansi.
        </p>
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-5">
          <div className="field-group">
            <label className="field-label">Periode (bulan)</label>
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </div>
          <div className="field-group">
            <label className="field-label">Rumah</label>
            <select
              className="input"
              value={house}
              onChange={(event) => setHouse(event.target.value)}
            >
              <option value="">Semua</option>
              {houses.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} · {row.owner ?? '-'}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">Aktor</label>
            <Input
              placeholder="rahman / dival / fadel"
              value={actor}
              onChange={(event) => setActor(event.target.value)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Jenis Aksi</label>
            <select
              className="input"
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              <option value="">Semua</option>
              {ACTION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="primary" onClick={handleApply} disabled={loading}>
              {loading ? 'Memuat...' : 'Terapkan'}
            </Button>
          </div>
        </div>
      </Card>

      {message && <div className="text-sm text-[var(--primary)]">{message}</div>}

      <TableContainer>
        <Table className="text-sm">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Waktu</TableHeaderCell>
              <TableHeaderCell>Aktor</TableHeaderCell>
              <TableHeaderCell>Aksi</TableHeaderCell>
              <TableHeaderCell>Rumah</TableHeaderCell>
              <TableHeaderCell>Periode</TableHeaderCell>
              <TableHeaderCell>Jenis</TableHeaderCell>
              <TableHeaderCell className="text-right">Nominal</TableHeaderCell>
              <TableHeaderCell>Catatan</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                <TableCell className="font-medium text-[var(--ink)]">{row.actor_name}</TableCell>
                <TableCell>{row.action}</TableCell>
                <TableCell>
                  {row.house_code}{' '}
                  <span className="text-[var(--muted)]">({row.house_owner ?? '-'})</span>
                </TableCell>
                <TableCell>{row.period ? row.period.slice(0, 7) : '-'}</TableCell>
                <TableCell>{row.kind ?? '-'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.amount ? idr(row.amount) : '-'}
                </TableCell>
                <TableCell className="max-w-[320px] truncate">{row.note || '-'}</TableCell>
              </TableRow>
            ))}
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-[var(--muted)]">
                  Memuat data...
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-[var(--muted)]">
                  Tidak ada data.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {hasMore && (
        <div>
          <Button onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Memuat...' : 'Muat lagi'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AuditsPage() {
  return (
    <AuthGate>
      <AuditsPageInner />
    </AuthGate>
  );
}
