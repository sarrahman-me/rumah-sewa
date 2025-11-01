'use client';

// Reports page compiles monthly summaries; presentation-only adjustments, no behavior changes.

import * as React from 'react';

import { AuthGate } from '@/components/AuthGate';

import { idr } from '@/lib/format';
import { currentPeriodISO } from '@/lib/period';
import { supabase } from '@/lib/supabase';

const OWNER_LIST = ['Rahman', 'Dival', 'Fadel'] as const;
const OWNER_FILTER_OPTIONS = ['Semua', ...OWNER_LIST] as const;

type OwnerSummaryRow = {
  owner: string;
  rent_bill: number;
  rent_paid: number;
  rent_due: number;
  water_bill: number;
  water_paid: number;
  water_due: number;
};

type FundSummary = {
  contrib: number;
  spent: number;
  balance: number;
};

type HouseDetail = {
  house_id: string;
  code: string;
  owner: string;
  is_repair_fund: boolean;
  rent_bill: number;
  rent_paid: number;
  rent_due: number;
  water_bill: number;
  water_paid: number;
  water_due: number;
};

function isoFirstDayFromMonth(value: string): string {
  if (!value) return currentPeriodISO();
  const [year, month] = value.split('-');
  if (!year || !month) return currentPeriodISO();
  return `${year}-${month.padStart(2, '0')}-01`;
}

function formatDueAccent(value: number): string {
  return value > 0 ? `text-red-600 font-semibold` : 'text-blue-600';
}

export default function ReportsPage() {
  return (
    <AuthGate>
      <ReportsView />
    </AuthGate>
  );
}

function ReportsView() {
  const [fromMonth, setFromMonth] = React.useState(() => currentPeriodISO().slice(0, 7));
  const [toMonth, setToMonth] = React.useState(() => currentPeriodISO().slice(0, 7));
  const [ownerFilter, setOwnerFilter] =
    React.useState<(typeof OWNER_FILTER_OPTIONS)[number]>('Semua');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [ownerRows, setOwnerRows] = React.useState<OwnerSummaryRow[]>([]);
  const [fundRow, setFundRow] = React.useState<FundSummary>({
    contrib: 0,
    spent: 0,
    balance: 0,
  });
  const [details, setDetails] = React.useState<HouseDetail[]>([]);

  React.useEffect(() => {
    if (fromMonth > toMonth) {
      setToMonth(fromMonth);
    }
  }, [fromMonth, toMonth]);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromMonth, toMonth]);

  async function load() {
    setLoading(true);
    setMessage(null);
    const fromISO = isoFirstDayFromMonth(fromMonth);
    const toISO = isoFirstDayFromMonth(toMonth);
    try {
      const [
        housesRes,
        rentSummaryRes,
        waterSummaryRes,
        contribRes,
        spentRes,
        rentStatusRes,
        waterStatusRes,
      ] = await Promise.all([
        supabase.from('houses').select('id,code,owner,is_repair_fund').order('code'),
        supabase.rpc('v_owner_rent_summary', {
          range_from: fromISO,
          range_to: toISO,
        }),
        supabase.rpc('v_owner_water_summary', {
          range_from: fromISO,
          range_to: toISO,
        }),
        supabase.rpc('v_repair_fund_contrib', {
          range_from: fromISO,
          range_to: toISO,
        }),
        supabase.rpc('v_repair_fund_spent', {
          range_from: fromISO,
          range_to: toISO,
        }),
        supabase
          .from('v_rent_status')
          .select('house_id,period,rent_bill,rent_paid,rent_due')
          .gte('period', fromISO)
          .lte('period', toISO),
        supabase
          .from('v_water_status')
          .select('house_id,period,water_bill,water_paid,water_due')
          .gte('period', fromISO)
          .lte('period', toISO),
      ]);

      const rentMap = new Map<string, { rent_bill: number; rent_paid: number; rent_due: number }>();
      (rentSummaryRes.data as any[] | null)?.forEach((row) => {
        rentMap.set(row.owner, {
          rent_bill: Number(row.rent_bill ?? 0),
          rent_paid: Number(row.rent_paid ?? 0),
          rent_due: Number(row.rent_due ?? 0),
        });
      });

      const waterMap = new Map<
        string,
        { water_bill: number; water_paid: number; water_due: number }
      >();
      (waterSummaryRes.data as any[] | null)?.forEach((row) => {
        waterMap.set(row.owner, {
          water_bill: Number(row.water_bill ?? 0),
          water_paid: Number(row.water_paid ?? 0),
          water_due: Number(row.water_due ?? 0),
        });
      });

      const mergedOwnerRows: OwnerSummaryRow[] = OWNER_LIST.map((owner) => ({
        owner,
        rent_bill: rentMap.get(owner)?.rent_bill ?? 0,
        rent_paid: rentMap.get(owner)?.rent_paid ?? 0,
        rent_due: rentMap.get(owner)?.rent_due ?? 0,
        water_bill: waterMap.get(owner)?.water_bill ?? 0,
        water_paid: waterMap.get(owner)?.water_paid ?? 0,
        water_due: waterMap.get(owner)?.water_due ?? 0,
      }));
      setOwnerRows(mergedOwnerRows);

      const pickNumber = (input: any, key?: string): number => {
        if (input == null) return 0;
        if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
        if (!Array.isArray(input) && key && typeof input === 'object') {
          const value = (input as any)[key];
          const num = typeof value === 'number' ? value : Number(value ?? 0);
          return Number.isFinite(num) ? num : 0;
        }
        if (Array.isArray(input)) {
          return input.reduce((sum, row) => {
            const value = key ? (row?.[key] as any) : row;
            const num = typeof value === 'number' ? value : Number(value ?? 0);
            return sum + (Number.isFinite(num) ? num : 0);
          }, 0);
        }
        const fallback = Number(input);
        return Number.isFinite(fallback) ? fallback : 0;
      };

      if (contribRes.error) console.warn('contrib error', contribRes.error);
      if (spentRes.error) console.warn('spent error', spentRes.error);

      const contrib = pickNumber(contribRes.data, 'contrib');
      const spent = pickNumber(spentRes.data, 'spent');
      setFundRow({
        contrib,
        spent,
        balance: contrib - spent,
      });

      const rentByHouse = new Map<
        string,
        { rent_bill: number; rent_paid: number; rent_due: number }
      >();
      (rentStatusRes.data as any[] | null)?.forEach((row) => {
        const entry = rentByHouse.get(row.house_id) ?? {
          rent_bill: 0,
          rent_paid: 0,
          rent_due: 0,
        };
        entry.rent_bill += Number(row.rent_bill ?? 0);
        entry.rent_paid += Number(row.rent_paid ?? 0);
        entry.rent_due += Number(row.rent_due ?? 0);
        rentByHouse.set(row.house_id, entry);
      });

      const waterByHouse = new Map<
        string,
        { water_bill: number; water_paid: number; water_due: number }
      >();
      (waterStatusRes.data as any[] | null)?.forEach((row) => {
        const entry = waterByHouse.get(row.house_id) ?? {
          water_bill: 0,
          water_paid: 0,
          water_due: 0,
        };
        entry.water_bill += Number(row.water_bill ?? 0);
        entry.water_paid += Number(row.water_paid ?? 0);
        entry.water_due += Number(row.water_due ?? 0);
        waterByHouse.set(row.house_id, entry);
      });

      const houseRows: HouseDetail[] =
        (housesRes.data as any[] | null)
          ?.map((house) => {
            const rent = rentByHouse.get(house.id) ?? {
              rent_bill: 0,
              rent_paid: 0,
              rent_due: 0,
            };
            const water = waterByHouse.get(house.id) ?? {
              water_bill: 0,
              water_paid: 0,
              water_due: 0,
            };
            return {
              house_id: house.id,
              code: house.code,
              owner: house.owner,
              is_repair_fund: Boolean(house.is_repair_fund),
              rent_bill: rent.rent_bill,
              rent_paid: rent.rent_paid,
              rent_due: rent.rent_due,
              water_bill: water.water_bill,
              water_paid: water.water_paid,
              water_due: water.water_due,
            };
          })
          .sort((a, b) => a.code.localeCompare(b.code)) ?? [];

      setDetails(houseRows);
    } catch (error) {
      console.error(error);
      setMessage('Gagal memuat data ringkasan.');
    } finally {
      setLoading(false);
    }
  }

  const displayedOwners =
    ownerFilter === 'Semua' ? ownerRows : ownerRows.filter((row) => row.owner === ownerFilter);

  const balanceAccent =
    fundRow.balance < 0 ? 'text-red-600 font-semibold' : 'text-blue-600 font-semibold';

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>Dari (bulan)</span>
            <input
              type="month"
              value={fromMonth}
              onChange={(e) => setFromMonth(e.target.value)}
              className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>Hingga (bulan)</span>
            <input
              type="month"
              value={toMonth}
              min={fromMonth}
              onChange={(e) => setToMonth(e.target.value)}
              className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>Pemilik</span>
            <select
              value={ownerFilter}
              onChange={(e) =>
                setOwnerFilter(e.target.value as (typeof OWNER_FILTER_OPTIONS)[number])
              }
              className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            >
              {OWNER_FILTER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end text-xs text-slate-500">
            Rentang: {fromMonth} → {toMonth}
          </div>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {message}
        </div>
      )}

      <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-blue-700">Ringkasan Pemilik & Dana</h2>
        <p className="text-xs text-slate-500">
          Sewa dan air dijumlahkan berdasarkan periode yang dipilih. Dana perbaikan dilaporkan
          terpisah.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm sm:text-base">
            <thead className="bg-blue-50/60 text-blue-600">
              <tr>
                <th className="px-3 py-2 text-left">Pemilik</th>
                <th className="px-3 py-2 text-right">Sewa (tagih / bayar / tunggak)</th>
                <th className="px-3 py-2 text-right">Air (tagih / bayar / tunggak)</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-slate-400">
                    Memuat ringkasan...
                  </td>
                </tr>
              )}
              {!loading && displayedOwners.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-slate-400">
                    Tidak ada data untuk filter ini.
                  </td>
                </tr>
              )}
              {!loading &&
                displayedOwners.map((row) => (
                  <tr key={row.owner} className="border-t border-blue-100">
                    <td className="px-3 py-3 font-semibold text-slate-800">{row.owner}</td>
                    <td className="px-3 py-3 text-right">
                      {idr(row.rent_bill)} / {idr(row.rent_paid)}{' '}
                      <span className={formatDueAccent(row.rent_due)}>/ {idr(row.rent_due)}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {idr(row.water_bill)} / {idr(row.water_paid)}{' '}
                      <span className={formatDueAccent(row.water_due)}>/ {idr(row.water_due)}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-base font-semibold text-blue-700">Ringkasan Dana Perbaikan</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm sm:text-base">
            <thead className="bg-blue-50/60 text-blue-600">
              <tr>
                <th className="px-3 py-2 text-left">Dana</th>
                <th className="px-3 py-2 text-right">Kontribusi</th>
                <th className="px-3 py-2 text-right">Pengeluaran</th>
                <th className="px-3 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-blue-100">
                <td className="px-3 py-3 font-semibold text-slate-800">Dana Perbaikan</td>
                <td className="px-3 py-3 text-right">{idr(fundRow.contrib)}</td>
                <td className="px-3 py-3 text-right">{idr(fundRow.spent)}</td>
                <td className={`px-3 py-3 text-right ${balanceAccent}`}>{idr(fundRow.balance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-base font-semibold text-blue-700">Detail Rumah</h3>
        <p className="text-xs text-slate-500">
          Sewa dan air untuk setiap rumah dalam rentang terpilih.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm sm:text-base">
            <thead className="bg-blue-50/60 text-blue-600">
              <tr>
                <th className="px-3 py-2 text-left">Rumah</th>
                <th className="px-3 py-2 text-left">Pemilik</th>
                <th className="px-3 py-2 text-right">Sewa (tagih / bayar / tunggak)</th>
                <th className="px-3 py-2 text-right">Air (tagih / bayar / tunggak)</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-slate-400">
                    Memuat detail rumah...
                  </td>
                </tr>
              )}
              {!loading &&
                details.map((row) => (
                  <tr key={row.house_id} className="border-t border-blue-100">
                    <td className="px-3 py-3 font-semibold text-slate-800">
                      {row.code}
                      {row.is_repair_fund && (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600">
                          Dana Perbaikan
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.owner}</td>
                    <td className="px-3 py-3 text-right">
                      {idr(row.rent_bill)} / {idr(row.rent_paid)}{' '}
                      <span className={formatDueAccent(row.rent_due)}>/ {idr(row.rent_due)}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {idr(row.water_bill)} / {idr(row.water_paid)}{' '}
                      <span className={formatDueAccent(row.water_due)}>/ {idr(row.water_due)}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
