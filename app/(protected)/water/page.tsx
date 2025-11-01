'use client';

// Water page handles meter readings and billing; formatting only, no behavior changes.

import * as React from 'react';

import { AuthGate } from '@/components/AuthGate';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateField } from '@/components/ui/DateField';
import { Input } from '@/components/ui/Input';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui/Table';
import { cx } from '@/components/ui/utils';

import { idr } from '@/lib/format';
import { currentPeriodISO, isoToMonth } from '@/lib/period';
import { supabase } from '@/lib/supabase';

type HouseRow = {
  house_id: string;
  code: string;
  owner: string;
  prev_reading: number | null;
  curr_reading: number | null;
  usage: number;
  share: number;
  meter: string;
};

type HouseFormRow = HouseRow & {
  input_value: string;
  input_date: string;
  warning: string | null;
};

type FormChangeHandler = (houseId: string, field: 'value' | 'date', value: string) => void;

const todayISO = new Date().toISOString().slice(0, 10);

const PDAM_ACCOUNT_LABELS = {
  m1: 'Tagihan PDAM 2214825 (H01–H04)',
  m2: 'Tagihan PDAM 2214826 (H05–H08)',
} as const;

function isoFirstDayFromMonth(value: string): string {
  if (!value) return currentPeriodISO();
  const [year, month] = value.split('-');
  if (!year || !month) return currentPeriodISO();
  return `${year}-${month.padStart(2, '0')}-01`;
}

function prevMonthIso(isoFirst: string): string {
  const [yearStr, monthStr] = isoFirst.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() - 1);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

function WaterPageInner() {
  const [month, setMonth] = React.useState(() => isoToMonth(currentPeriodISO()));
  const [rows, setRows] = React.useState<HouseRow[]>([]);
  const [formRows, setFormRows] = React.useState<HouseFormRow[]>([]);
  const [billM1, setBillM1] = React.useState<number>(0);
  const [billM2, setBillM2] = React.useState<number>(0);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [savingReadings, setSavingReadings] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [meterBills, setMeterBills] = React.useState<{ meter: string; total_amount: number }[]>([]);
  const [meterIdByCode, setMeterIdByCode] = React.useState<Record<string, string>>({});
  const [readingDate, setReadingDate] = React.useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  const periodISO = isoFirstDayFromMonth(month);
  const prevISO = React.useMemo(() => prevMonthIso(periodISO), [periodISO]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMsg(null);
    const [{ data: housesData, error: housesErr }] = await Promise.all([
      supabase.from('houses').select('id,code,owner').order('code'),
    ]);
    if (housesErr) {
      setMsg(housesErr.message);
      setLoading(false);
      return;
    }

    const [readingsRes, sharesRes, meterBillsRes, meterMapRes, metersRes] = await Promise.all([
      supabase
        .from('water_readings')
        .select('house_id, period, reading_m3')
        .in('period', [prevISO, periodISO]),
      supabase.from('water_shares').select('house_id, share_amount').eq('period', periodISO),
      supabase
        .from('meter_bills')
        .select('meter_id, total_amount, period, meters(code)')
        .eq('period', periodISO),
      supabase.from('meter_house_map').select('meter_id, house_id, meters(code)'),
      supabase.from('meters').select('id, code'),
    ]);

    if (
      readingsRes.error ||
      sharesRes.error ||
      meterBillsRes.error ||
      meterMapRes.error ||
      metersRes.error
    ) {
      setMsg(
        readingsRes.error?.message ||
          sharesRes.error?.message ||
          meterBillsRes.error?.message ||
          meterMapRes.error?.message ||
          metersRes.error?.message ||
          'Gagal memuat data.'
      );
      setLoading(false);
      return;
    }

    const meterByHouse: Record<string, string> = {};
    for (const map of (meterMapRes.data as Array<{
      house_id: string;
      meters?: { code?: string | null } | null;
    }> | null) || []) {
      meterByHouse[map.house_id] = map.meters?.code ?? '';
    }

    const readingsMap: Record<string, Record<string, number>> = {};
    for (const r of readingsRes.data || []) {
      if (!readingsMap[r.period]) readingsMap[r.period] = {};
      readingsMap[r.period][r.house_id] = Number(r.reading_m3 ?? 0);
    }

    const shareMap: Record<string, number> = {};
    for (const s of sharesRes.data || []) {
      shareMap[s.house_id] = Number(s.share_amount ?? 0);
    }

    const billMap: Record<string, number> = {};
    for (const bill of (meterBillsRes.data as Array<{
      meters?: { code?: string | null } | null;
      total_amount?: number | null;
    }> | null) || []) {
      const code = bill.meters?.code;
      if (!code) continue;
      billMap[code] = Number(bill.total_amount ?? 0);
    }
    setMeterBills(
      Object.entries(billMap).map(([meter, total_amount]) => ({
        meter,
        total_amount,
      }))
    );
    setBillM1(billMap['M1'] ?? 0);
    setBillM2(billMap['M2'] ?? 0);
    const ids: Record<string, string> = {};
    for (const meter of metersRes.data || []) {
      ids[meter.code] = meter.id;
    }
    setMeterIdByCode(ids);

    const nextRows: HouseRow[] = (housesData || []).map((h: any) => {
      const prevReading = readingsMap[prevISO]?.[h.id] ?? null;
      const currReading = readingsMap[periodISO]?.[h.id] ?? null;
      const usage =
        prevReading !== null && currReading !== null ? Math.max(currReading - prevReading, 0) : 0;
      return {
        house_id: h.id,
        code: h.code,
        owner: h.owner,
        prev_reading: prevReading,
        curr_reading: currReading,
        usage,
        share: shareMap[h.id] ?? 0,
        meter: meterByHouse[h.id] ?? '-',
      };
    });

    setRows(nextRows);
    setFormRows(
      nextRows.map((row) => ({
        ...row,
        input_value: row.curr_reading != null ? String(row.curr_reading) : '',
        input_date: readingDate,
        warning:
          row.prev_reading != null &&
          row.curr_reading != null &&
          row.curr_reading < row.prev_reading
            ? 'KM turun'
            : null,
      }))
    );
    setLoading(false);
  }, [periodISO, prevISO, readingDate]);

  React.useEffect(() => {
    load();
  }, [load]);

  const usageByMeter = React.useMemo(() => {
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.meter] = (result[row.meter] ?? 0) + row.usage;
    }
    return result;
  }, [rows]);

  const shareByMeter = React.useMemo(() => {
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.meter] = (result[row.meter] ?? 0) + row.share;
    }
    return result;
  }, [rows]);

  const hasWarnings = React.useMemo(() => formRows.some((row) => Boolean(row.warning)), [formRows]);

  async function handleGenerate() {
    if (!month.trim()) {
      alert('Pilih periode terlebih dahulu.');
      return;
    }
    if (!meterIdByCode['M1'] || !meterIdByCode['M2']) {
      alert('Data meter belum siap. Muat ulang halaman.');
      return;
    }
    setSaving(true);
    setMsg(null);
    const payloads = [
      { code: 'M1', amount: billM1 ?? 0 },
      { code: 'M2', amount: billM2 ?? 0 },
    ].map(({ code, amount }) => ({
      meter_id: meterIdByCode[code],
      period: periodISO,
      total_amount: amount,
    }));

    const { error: billError } = await supabase
      .from('meter_bills')
      .upsert(payloads, { onConflict: 'meter_id,period' });
    if (billError) {
      setMsg(billError.message);
      setSaving(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc('generate_water_shares', {
      p_period: periodISO,
    });
    if (rpcError) {
      setMsg(rpcError.message);
      setSaving(false);
      return;
    }
    setMsg('Pembagian air berhasil dihitung.');
    setSaving(false);
    await load();
  }

  function parseNumberLoose(v: string): number | null {
    if (!v) return null;
    const cleaned = String(v).replace(/\./g, '').replace(',', '.');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function handleFormChange(houseId: string, field: 'value' | 'date', value: string) {
    setFormRows((prev) =>
      prev.map((row) => {
        if (row.house_id !== houseId) return row;
        if (field === 'value') {
          const parsed = parseNumberLoose(value);
          return {
            ...row,
            input_value: value,
            warning:
              parsed != null && row.prev_reading != null && parsed < row.prev_reading
                ? 'KM turun'
                : null,
          };
        }
        return {
          ...row,
          input_date: value,
        };
      })
    );
  }

  const stickyCell = React.useCallback(
    (extra?: string) => cx('sticky left-0 z-[2] bg-white shadow-[1px_0_0_0_var(--border)]', extra),
    []
  );

  const prevLabel = isoToMonth(prevISO);
  const currentLabel = isoToMonth(periodISO);

  async function handleSaveReadings() {
    if (hasWarnings) {
      setMsg('Periksa nilai yang turun sebelum menyimpan.');
      return;
    }
    setSavingReadings(true);
    const pairs = formRows
      .map((row) => {
        const parsed = parseNumberLoose(row.input_value);
        if (parsed == null) return null;
        return {
          house_id: row.house_id,
          reading_m3: parsed,
          reading_date: row.input_date || null,
        };
      })
      .filter(Boolean);
    if (!pairs.length) {
      alert('Isi minimal satu KM terlebih dahulu.');
      setSavingReadings(false);
      return;
    }
    const { error } = await supabase.rpc('bulk_upsert_water_readings', {
      p_period: periodISO,
      p_default_date: readingDate,
      p_pairs: pairs,
    });
    if (error) {
      alert(error.message);
      setSavingReadings(false);
      return;
    }
    setMsg('KM tersimpan.');
    await load();
    await supabase.rpc('generate_water_shares', { p_period: periodISO });
    await load();
    setSavingReadings(false);
  }

  return (
    <div className="page-stack">
      <div className="flex flex-col gap-2">
        <h1>Pembacaan &amp; Pembagian Air</h1>
        <p className="subtle">
          Periode {prevLabel} → {currentLabel}
        </p>
      </div>

      <Card>
        <div className="card-pad space-y-4">
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field-group">
                <label className="field-label" htmlFor="water-period">
                  Periode (bulan)
                </label>
                <Input
                  id="water-period"
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="water-date">
                  Tanggal pencatatan
                </label>
                <DateField
                  id="water-date"
                  value={readingDate}
                  max={todayISO}
                  onChange={(event) => setReadingDate(event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="primary"
                onClick={handleSaveReadings}
                disabled={savingReadings || hasWarnings}
              >
                {savingReadings ? 'Menyimpan...' : 'Simpan KM Bulan Ini'}
              </Button>
            </div>
          </div>
          {hasWarnings && (
            <p className="text-sm text-[#dc2626]">Periksa nilai yang turun sebelum menyimpan.</p>
          )}
        </div>
      </Card>

      {msg && (
        <Card>
          <div className="card-pad text-sm text-[var(--primary)]">{msg}</div>
        </Card>
      )}

      <Card padded={false}>
        <div className="card-pad hidden sm:block">
          <TableContainer>
            <Table className="text-sm">
              <caption className="sr-only">Formulir pencatatan KM air per rumah</caption>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className={stickyCell('px-4 py-3')}>Rumah</TableHeaderCell>
                  <TableHeaderCell className="px-4 py-3">Pemilik</TableHeaderCell>
                  <TableHeaderCell className="px-4 py-3">KM {prevLabel}</TableHeaderCell>
                  <TableHeaderCell className="px-4 py-3">KM {currentLabel}</TableHeaderCell>
                  <TableHeaderCell className="px-4 py-3">Tanggal</TableHeaderCell>
                  <TableHeaderCell className="px-4 py-3">Meter</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {formRows.map((row) => (
                  <WaterTableRow
                    key={row.house_id}
                    row={row}
                    stickyCell={stickyCell}
                    onChange={handleFormChange}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
        <div className="card-pad space-y-3 sm:hidden">
          {formRows.map((row) => (
            <WaterMobileCard key={row.house_id} row={row} onChange={handleFormChange} />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <Card>
          <div className="card-pad space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field-group">
                <label className="field-label" htmlFor="bill-m1">
                  {PDAM_ACCOUNT_LABELS.m1}
                </label>
                <Input
                  id="bill-m1"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={billM1 || ''}
                  onChange={(event) => setBillM1(Number(event.target.value || 0))}
                  placeholder="400000"
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="bill-m2">
                  {PDAM_ACCOUNT_LABELS.m2}
                </label>
                <Input
                  id="bill-m2"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={billM2 || ''}
                  onChange={(event) => setBillM2(Number(event.target.value || 0))}
                  placeholder="450000"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-[var(--muted)]">
                <p className="tabular-nums">
                  Usage 2214825 (M1): {(usageByMeter['M1'] ?? 0).toFixed(2)} m³ · Share{' '}
                  {idr(shareByMeter['M1'] ?? 0)}
                </p>
                <p className="tabular-nums">
                  Usage 2214826 (M2): {(usageByMeter['M2'] ?? 0).toFixed(2)} m³ · Share{' '}
                  {idr(shareByMeter['M2'] ?? 0)}
                </p>
              </div>
              <Button variant="primary" onClick={handleGenerate} disabled={saving}>
                {saving ? 'Memproses...' : 'Simpan Tagihan & Hitung'}
              </Button>
            </div>
          </div>
        </Card>
        <Card>
          <div className="card-pad space-y-2">
            <h2 className="text-sm font-semibold text-[var(--ink)]">
              Riwayat Tagihan ({currentLabel})
            </h2>
            {meterBills.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Belum ada tagihan tersimpan.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {meterBills.map((bill) => (
                  <li
                    key={bill.meter}
                    className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[#f8fafc] px-3 py-2"
                  >
                    <span className="font-semibold text-[var(--primary)]">{bill.meter}</span>
                    <span className="tabular-nums">{idr(bill.total_amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="card-pad">
          <TableContainer>
            <Table className="text-sm">
              <caption className="sr-only">Ringkasan pembagian air per rumah</caption>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Rumah</TableHeaderCell>
                  <TableHeaderCell>Pemilik</TableHeaderCell>
                  <TableHeaderCell>KM {prevLabel}</TableHeaderCell>
                  <TableHeaderCell>KM {currentLabel}</TableHeaderCell>
                  <TableHeaderCell>Pemakaian (m³)</TableHeaderCell>
                  <TableHeaderCell>Meter</TableHeaderCell>
                  <TableHeaderCell>Tagihan (Rp)</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-[var(--muted)]">
                      Memuat...
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  rows.map((row) => (
                    <TableRow key={row.house_id}>
                      <TableCell className="font-semibold text-[var(--ink)]">{row.code}</TableCell>
                      <TableCell>{row.owner}</TableCell>
                      <TableCell className="tabular-nums">
                        {row.prev_reading !== null ? row.prev_reading : '-'}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.curr_reading !== null ? row.curr_reading : '-'}
                      </TableCell>
                      <TableCell className="tabular-nums">{row.usage.toFixed(2)}</TableCell>
                      <TableCell>{row.meter}</TableCell>
                      <TableCell className="tabular-nums font-semibold text-[var(--primary)]">
                        {idr(row.share)}
                      </TableCell>
                    </TableRow>
                  ))}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-[var(--muted)]">
                      Tidak ada data.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-[#eef2ff] font-medium text-[var(--primary)]">
                  <TableCell colSpan={4}>Total M1</TableCell>
                  <TableCell className="tabular-nums">
                    {(usageByMeter['M1'] ?? 0).toFixed(2)} m³
                  </TableCell>
                  <TableCell>M1</TableCell>
                  <TableCell className="tabular-nums">{idr(shareByMeter['M1'] ?? 0)}</TableCell>
                </TableRow>
                <TableRow className="bg-[#eef2ff] font-medium text-[var(--primary)]">
                  <TableCell colSpan={4}>Total M2</TableCell>
                  <TableCell className="tabular-nums">
                    {(usageByMeter['M2'] ?? 0).toFixed(2)} m³
                  </TableCell>
                  <TableCell>M2</TableCell>
                  <TableCell className="tabular-nums">{idr(shareByMeter['M2'] ?? 0)}</TableCell>
                </TableRow>
                <TableRow className="bg-[#dbeafe] font-semibold text-[var(--primary)]">
                  <TableCell colSpan={4}>Grand Total</TableCell>
                  <TableCell className="tabular-nums">
                    {((usageByMeter['M1'] ?? 0) + (usageByMeter['M2'] ?? 0)).toFixed(2)} m³
                  </TableCell>
                  <TableCell>-</TableCell>
                  <TableCell className="tabular-nums">
                    {idr((shareByMeter['M1'] ?? 0) + (shareByMeter['M2'] ?? 0))}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </TableContainer>
        </div>
      </Card>
    </div>
  );
}

type WaterRowProps = {
  row: HouseFormRow;
  onChange: FormChangeHandler;
  stickyCell: (extra?: string) => string;
};

const WaterTableRow = React.memo(function WaterTableRow({
  row,
  onChange,
  stickyCell,
}: WaterRowProps) {
  return (
    <TableRow className="align-top">
      <TableCell className={stickyCell('px-4 py-3 font-semibold text-[var(--ink)]')}>
        {row.code}
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-[var(--muted)]">{row.owner}</TableCell>
      <TableCell className="px-4 py-3 tabular-nums">
        {row.prev_reading !== null ? row.prev_reading : '-'}
      </TableCell>
      <TableCell className="px-4 py-3">
        <div className="flex flex-col gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            className="tabular-nums w-full max-w-[140px]"
            value={row.input_value}
            onChange={(event) => onChange(row.house_id, 'value', event.target.value)}
            aria-label={`KM ${row.code} bulan ini`}
          />
          {row.warning && (
            <Badge variant="danger" className="w-fit text-[11px] uppercase tracking-wide">
              Turun
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="px-4 py-3">
        <DateField
          value={row.input_date}
          max={todayISO}
          onChange={(event) => onChange(row.house_id, 'date', event.target.value)}
          aria-label={`Tanggal pencatatan ${row.code}`}
        />
      </TableCell>
      <TableCell className="px-4 py-3 text-[var(--muted)]">{row.meter}</TableCell>
    </TableRow>
  );
});

const WaterMobileCard = React.memo(function WaterMobileCard({
  row,
  onChange,
}: {
  row: HouseFormRow;
  onChange: FormChangeHandler;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">{row.code}</p>
          <p className="text-sm text-[var(--muted)]">{row.owner}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            KM sebelumnya:{' '}
            <span className="tabular-nums">
              {row.prev_reading !== null ? row.prev_reading : '-'}
            </span>
          </p>
        </div>
        {row.warning && (
          <Badge variant="danger" className="text-[11px] uppercase tracking-wide">
            Turun
          </Badge>
        )}
      </div>
      <div className="mt-3 grid gap-3">
        <div className="field-group">
          <label className="field-label" htmlFor={`mobile-value-${row.house_id}`}>
            KM {row.code}
          </label>
          <Input
            id={`mobile-value-${row.house_id}`}
            type="number"
            inputMode="decimal"
            min="0"
            className="tabular-nums"
            value={row.input_value}
            onChange={(event) => onChange(row.house_id, 'value', event.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor={`mobile-date-${row.house_id}`}>
            Tanggal pencatatan
          </label>
          <DateField
            id={`mobile-date-${row.house_id}`}
            value={row.input_date}
            max={todayISO}
            onChange={(event) => onChange(row.house_id, 'date', event.target.value)}
          />
        </div>
        <p className="text-xs text-[var(--muted)]">Meter: {row.meter}</p>
      </div>
    </div>
  );
});

export default function WaterPage() {
  return (
    <AuthGate>
      <WaterPageInner />
    </AuthGate>
  );
}
