'use client';

// Rents page manages tariff changes and listings; formatting only, no behavior changes.

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '@/components/AuthGate';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/Table';

import { writeAudit } from '@/lib/audit';
import { idr } from '@/lib/format';
import { currentPeriodISO, isoToMonth, monthToISOFirst } from '@/lib/period';
import { supabase } from '@/lib/supabase';

type RentRow = {
  house_id: string;
  code: string;
  owner: string;
  amount: number;
};

type EditState = {
  house_id: string;
  code: string;
  owner: string;
  currentAmount: number;
};

function RentsPageInner() {
  const [period, setPeriod] = useState(currentPeriodISO());
  const [rows, setRows] = useState<RentRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editForm, setEditForm] = useState({
    amount: '',
    startMonth: isoToMonth(currentPeriodISO()),
  });
  const [saving, setSaving] = useState(false);

  const periodMonth = isoToMonth(period);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const [{ data: houses, error: housesErr }, { data: effective, error: effectiveErr }] =
      await Promise.all([
        supabase.from('houses').select('id,code,owner').order('code'),
        supabase.rpc('rent_effective_all', { p_period: period }),
      ]);

    if (housesErr || effectiveErr) {
      setMessage(housesErr?.message || effectiveErr?.message || 'Gagal memuat data.');
      setLoading(false);
      return;
    }

    const effectiveMap = new Map<string, number>();
    for (const row of effective || []) {
      const houseId = (row as any).house_id as string | null;
      if (!houseId) continue;
      effectiveMap.set(houseId, Number((row as any).amount ?? 0));
    }

    const nextRows: RentRow[] = (houses || []).map((h: any) => ({
      house_id: h.id,
      code: h.code,
      owner: h.owner ?? '-',
      amount: effectiveMap.get(h.id) ?? 0,
    }));

    setRows(nextRows);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(row: RentRow) {
    setEditState({
      house_id: row.house_id,
      code: row.code,
      owner: row.owner,
      currentAmount: row.amount,
    });
    setEditForm({
      amount: row.amount > 0 ? String(row.amount) : '',
      startMonth: periodMonth,
    });
  }

  function closeEdit() {
    setEditState(null);
    setEditForm({
      amount: '',
      startMonth: periodMonth,
    });
  }

  async function submitEdit() {
    if (!editState) return;
    const amountValue = Number(editForm.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setMessage('Nominal harus lebih besar dari 0.');
      return;
    }
    if (!editForm.startMonth) {
      setMessage('Periode mulai harus dipilih.');
      return;
    }

    const startISO = monthToISOFirst(editForm.startMonth);
    setSaving(true);

    const { data: effective, error: effectiveErr } = await supabase.rpc('rent_effective_all', {
      p_period: startISO,
    });
    if (effectiveErr) {
      setMessage(effectiveErr.message);
      setSaving(false);
      return;
    }
    const currentEntry = (effective || []).find((row: any) => row.house_id === editState.house_id);
    const currentAmount = Number(currentEntry?.amount ?? 0);
    if (Math.abs(currentAmount - amountValue) < 0.0001) {
      setMessage('Harga tidak berubah.');
      setSaving(false);
      closeEdit();
      return;
    }

    const { error } = await supabase.from('rents').upsert(
      {
        house_id: editState.house_id,
        period: startISO,
        amount: amountValue,
      },
      { onConflict: 'house_id,period' }
    );
    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    await writeAudit({
      action: 'rent_price_change',
      house_id: editState.house_id,
      house_code: editState.code,
      period: startISO,
      kind: 'rent',
      amount: amountValue,
      note: 'Perubahan harga sewa',
    });

    setMessage(`Harga ${editState.code} diperbarui.`);
    setSaving(false);
    closeEdit();
    await load();
  }

  return (
    <div className="page-stack">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Sewa</h1>
          <p className="subtle">Tarif sewa rumah untuk periode {periodMonth || '-'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="field-label" htmlFor="rents-period">
            Periode
          </label>
          <Input
            id="rents-period"
            type="month"
            value={periodMonth}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              setPeriod(monthToISOFirst(value));
            }}
          />
        </div>
      </div>
      {message && <div className="card card-pad text-sm text-[var(--primary)]">{message}</div>}
      <TableContainer>
        <Table className="text-sm">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Rumah</TableHeaderCell>
              <TableHeaderCell>Pemilik</TableHeaderCell>
              <TableHeaderCell className="text-right">Nominal</TableHeaderCell>
              <TableHeaderCell className="text-right">Aksi</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.house_id}>
                <TableCell className="font-medium text-[var(--ink)]">{row.code}</TableCell>
                <TableCell className="text-[var(--muted)]">{row.owner}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-[var(--primary)]">
                  {idr(row.amount)}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                    Ubah harga
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-[var(--muted)]">
                  Tidak ada data.
                </TableCell>
              </TableRow>
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-[var(--muted)]">
                  Memuat data...
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Modal
        open={!!editState}
        onOpenChange={(open) => {
          if (!open) closeEdit();
        }}
        title={editState ? `Ubah harga ${editState.code}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={closeEdit}>
              Batal
            </Button>
            <Button variant="primary" onClick={submitEdit} disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </>
        }
      >
        {editState && (
          <div className="grid gap-4">
            <div className="field-group">
              <label className="field-label" htmlFor="rent-amount">
                Nominal
              </label>
              <Input
                id="rent-amount"
                type="number"
                inputMode="decimal"
                min="0"
                className="tabular-nums"
                value={editForm.amount}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, amount: event.target.value }))
                }
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="rent-start-month">
                Berlaku mulai
              </label>
              <Input
                id="rent-start-month"
                type="month"
                value={editForm.startMonth}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, startMonth: event.target.value }))
                }
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function RentsPage() {
  return (
    <AuthGate>
      <RentsPageInner />
    </AuthGate>
  );
}
