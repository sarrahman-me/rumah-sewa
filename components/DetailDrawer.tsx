"use client";
import * as React from "react";
import { supabase } from "@/lib/supabase";
import { idr } from "@/lib/format";
import { monthToISOFirst, isoToMonth } from "@/lib/period";

type RentStatus = {
  period: string;
  rent_bill: number;
  rent_paid: number;
  rent_due: number;
};

type WaterStatus = {
  period: string;
  water_bill: number;
  water_paid: number;
  water_due: number;
};

type Payment = {
  id: string;
  period: string;
  kind: "rent" | "water" | "repair_contrib" | "other";
  amount: number;
  paid_at: string | null;
  method: string | null;
  note: string | null;
  created_at: string;
};

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  house: { id: string; code: string; owner: string } | null;
  mode: "single" | "range";
  singlePeriodISO: string;
  range: { from: string; to: string };
  rentStatus: Record<string, Record<string, RentStatus>>;
  waterStatus: Record<string, Record<string, WaterStatus>>;
  onRefresh: () => Promise<void>;
}

function toDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID");
}

function toDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

export function DetailDrawer({
  open,
  onClose,
  house,
  mode,
  singlePeriodISO,
  range,
  rentStatus,
  waterStatus,
  onRefresh,
}: DetailDrawerProps) {
  const [tab, setTab] = React.useState<"rent" | "water">("rent");
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    periodMonth: "",
    paidAt: "",
    amount: "",
    method: "",
    note: "",
  });
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const defaultMonth = React.useMemo(() => {
    if (mode === "single") return isoToMonth(singlePeriodISO);
    return isoToMonth(range.from);
  }, [mode, singlePeriodISO, range.from]);

  const periodBounds = React.useMemo(() => {
    if (mode === "single") return { from: singlePeriodISO, to: singlePeriodISO };
    return range;
  }, [mode, range, singlePeriodISO]);

  const statusMap = tab === "rent" ? rentStatus : waterStatus;

  const availablePeriods = React.useMemo(() => {
    if (!house) return [];
    const map = statusMap[house.id] || {};
    const filtered = Object.keys(map).filter((p) => {
      if (!periodBounds.from || !periodBounds.to) return true;
      return p >= periodBounds.from && p <= periodBounds.to;
    });
    if (filtered.length > 0) return filtered.sort();
    const fallback = [periodBounds.from];
    if (periodBounds.to && periodBounds.to !== periodBounds.from) {
      fallback.push(periodBounds.to);
    }
    return fallback;
  }, [house, statusMap, periodBounds]);

  React.useEffect(() => {
    if (!open || !house) return;
    const defaultPeriod = availablePeriods[0] ?? periodBounds.from;
    setForm({
      periodMonth: isoToMonth(defaultPeriod),
      paidAt: today,
      amount: "",
      method: "",
      note: "",
    });
  }, [open, house, availablePeriods, periodBounds.from, today]);

  const loadPayments = React.useCallback(async () => {
    if (!open || !house) return;
    setLoading(true);
    const query = supabase
      .from("v_payments_clean")
      .select("*")
      .eq("house_id", house.id)
      .order("created_at", { ascending: false });
    if (mode === "single") {
      query.eq("period", singlePeriodISO);
    } else {
      query.gte("period", range.from).lte("period", range.to);
    }
    const { data, error } = await query;
    if (!error && data) {
      setPayments(
        data.map((p: any) => ({
          ...p,
          amount: Number(p.amount ?? 0),
        })) as Payment[]
      );
    }
    setLoading(false);
  }, [open, house, mode, singlePeriodISO, range.from, range.to]);

  React.useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  React.useEffect(() => {
    if (!open) setPayments([]);
  }, [open]);

  if (!open || !house) return null;

  const selectedPeriodISO = monthToISOFirst(form.periodMonth || defaultMonth);
  const dueRecord =
    statusMap[house!.id]?.[selectedPeriodISO] ??
    ((tab === "rent"
      ? { rent_due: 0 }
      : { water_due: 0 }) as Partial<RentStatus & WaterStatus>);
  const dueValue =
    tab === "rent"
      ? Number((dueRecord as RentStatus)?.rent_due ?? 0)
      : Number((dueRecord as WaterStatus)?.water_due ?? 0);

  async function submitPayment() {
    const amount = Number(form.amount);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      alert("Nominal harus diisi dan lebih besar dari 0.");
      return;
    }
    if (dueValue > 0 && amount > dueValue + 0.0001) {
      const proceed = confirm(
        "Nominal melebihi tunggakan. Lanjutkan tetap menyimpan?"
      );
      if (!proceed) return;
    }
    const payload: any = {
      house_id: house!.id,
      period: selectedPeriodISO,
      kind: tab,
      amount,
    };
    if (form.paidAt) payload.paid_at = form.paidAt;
    if (form.method) payload.method = form.method;
    if (form.note) payload.note = form.note;
    const { error } = await supabase.from("payments").insert(payload);
    if (error) {
      alert(error.message);
      return;
    }
    alert("Pembayaran tersimpan.");
    setForm((prev) => ({ ...prev, amount: "", note: "" }));
    await onRefresh();
    await loadPayments();
  }

  async function markLunas() {
    if (dueValue <= 0) {
      alert("Tidak ada tunggakan.");
      return;
    }
    const proceed = confirm(
      `Tandai ${tab === "rent" ? "sewa" : "air"} lunas sebesar ${idr(
        dueValue
      )}?`
    );
    if (!proceed) return;
    const payload: any = {
      house_id: house!.id,
      period: selectedPeriodISO,
      kind: tab,
      amount: dueValue,
    };
    if (form.paidAt) payload.paid_at = form.paidAt;
    const { error } = await supabase.from("payments").insert(payload);
    if (error) {
      alert(error.message);
      return;
    }
    alert("Tunggakan ditandai lunas.");
    await onRefresh();
    await loadPayments();
  }

  async function voidPayment(id: string) {
    const proceed = confirm("Batalkan pembayaran ini?");
    if (!proceed) return;
    const { error } = await supabase.rpc("void_payment", {
      p_id: id,
      p_reason: "void via detail drawer",
    });
    if (error) {
      alert(error.message);
      return;
    }
    alert("Pembayaran dibatalkan.");
    await onRefresh();
    await loadPayments();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl sm:max-w-lg">
        <div className="flex flex-col gap-3 border-b border-blue-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-blue-500">
              Detail Rumah
            </p>
            <h2 className="text-lg font-semibold text-blue-700">
              {house.code} · {house.owner}
            </h2>
            <p className="text-xs text-slate-500">
              Mode: {mode === "single" ? "Satu Periode" : "Rentang"}{" "}
              {mode === "single"
                ? isoToMonth(singlePeriodISO)
                : `${isoToMonth(range.from)} → ${isoToMonth(range.to)}`}
            </p>
          </div>
          <button
            className="self-start rounded-full border border-blue-200 px-3 py-1 text-sm text-blue-600 transition hover:bg-blue-50 sm:self-auto"
            onClick={onClose}
            type="button"
          >
            Tutup
          </button>
        </div>

        <div className="flex divide-x divide-blue-100 border-b border-blue-100">
          {(["rent", "water"] as const).map((key) => (
            <button
              key={key}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                tab === key
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
              type="button"
              onClick={() => setTab(key)}
            >
              {key === "rent" ? "Sewa" : "Air"}
            </button>
          ))}
        </div>

        <div className="space-y-6 px-4 py-6 sm:px-6">
          <section className="rounded-xl border border-blue-100 bg-blue-50/30 p-4">
            <h3 className="text-sm font-semibold text-blue-700">
              Tambah Pembayaran {tab === "rent" ? "Sewa" : "Air"}
            </h3>
            <div className="mt-3 grid gap-3 text-sm text-slate-600">
              <label className="grid gap-1">
                <span>Periode</span>
                <input
                  type="month"
                  value={form.periodMonth}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, periodMonth: e.target.value }))
                  }
                  className="rounded-lg border border-blue-200 px-3 py-2"
                />
              </label>
              <label className="grid gap-1">
                <span>Tanggal Bayar</span>
                <input
                  type="date"
                  value={form.paidAt}
                  max={today}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, paidAt: e.target.value }))
                  }
                  className="rounded-lg border border-blue-200 px-3 py-2"
                />
              </label>
              <label className="grid gap-1">
                <span>Nominal (maks {idr(dueValue)})</span>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  className="rounded-lg border border-blue-200 px-3 py-2"
                  min="0"
                  step="0.01"
                />
              </label>
              <label className="grid gap-1">
                <span>Metode (opsional)</span>
                <input
                  type="text"
                  value={form.method}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, method: e.target.value }))
                  }
                  className="rounded-lg border border-blue-200 px-3 py-2"
                  placeholder="Transfer / Tunai / ... "
                />
              </label>
              <label className="grid gap-1">
                <span>Catatan (opsional)</span>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, note: e.target.value }))
                  }
                  className="rounded-lg border border-blue-200 px-3 py-2"
                  placeholder="Catatan internal"
                />
              </label>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={submitPayment}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Simpan Pembayaran
                </button>
                <button
                  type="button"
                  onClick={markLunas}
                  className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                >
                  Bayar Lunas ({idr(dueValue)})
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold text-blue-700">
                Riwayat Pembayaran
              </h3>
              {loading && (
                <span className="text-xs text-slate-400">Memuat…</span>
              )}
            </div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-blue-100">
              <table className="min-w-full text-sm sm:text-base">
                <thead className="bg-blue-50/60 text-blue-600">
                <tr>
                  <th className="px-3 py-2 text-left">Periode</th>
                  <th className="px-3 py-2 text-left">Nominal</th>
                  <th className="px-3 py-2 text-left">Dibayar</th>
                  <th className="px-3 py-2 text-left">Metode</th>
                  <th className="px-3 py-2 text-left">Catatan</th>
                  <th className="px-3 py-2 text-left">Aksi</th>
                </tr>
                </thead>
                <tbody>
                  {payments.map((pay) => (
                    <tr key={pay.id} className="border-t border-blue-100">
                      <td className="px-3 py-2 text-slate-600">
                        <div className="font-medium text-slate-800">
                          {isoToMonth(pay.period)}
                        </div>
                        <div className="text-xs text-slate-400">
                          dibuat {toDateTime(pay.created_at)}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-semibold text-blue-700">
                        {idr(pay.amount)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {toDate(pay.paid_at)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {pay.method ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {pay.note ?? "-"}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => voidPayment(pay.id)}
                          className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          Undo
                        </button>
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-6 text-center text-sm text-slate-400"
                      >
                        Belum ada pembayaran aktif pada rentang ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
