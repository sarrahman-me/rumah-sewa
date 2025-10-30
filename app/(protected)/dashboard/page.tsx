"use client";
import * as React from "react";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/lib/supabase";
import { currentPeriodISO, monthToISOFirst, isoToMonth } from "@/lib/period";
import { idr } from "@/lib/format";
import { DetailDrawer } from "@/components/DetailDrawer";

type Mode = "single" | "range";

type RentStatus = {
  house_id: string;
  period: string;
  rent_bill: number;
  rent_paid: number;
  rent_due: number;
};

type WaterStatus = {
  house_id: string;
  period: string;
  water_bill: number;
  water_paid: number;
  water_due: number;
};

type Row = {
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

type QuickFormState = {
  houseId: string;
  kind: "rent" | "water";
  periodMonth: string;
  paidAt: string;
  amount: string;
  method: string;
  note: string;
  label: string;
};

type UndoState = {
  houseId: string;
  periodMonth: string;
};

const todayISO = new Date().toISOString().slice(0, 10);

function num(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function DashboardInner() {
  const initialMonth = React.useMemo(
    () => isoToMonth(currentPeriodISO()),
    []
  );
  const [mode, setMode] = React.useState<Mode>("single");
  const [singleMonth, setSingleMonth] = React.useState(initialMonth);
  const [rangeFrom, setRangeFrom] = React.useState(initialMonth);
  const [rangeTo, setRangeTo] = React.useState(initialMonth);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [rentStatus, setRentStatus] = React.useState<
    Record<string, Record<string, RentStatus>>
  >({});
  const [waterStatus, setWaterStatus] = React.useState<
    Record<string, Record<string, WaterStatus>>
  >({});
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [quickForm, setQuickForm] = React.useState<QuickFormState | null>(null);
  const [undoState, setUndoState] = React.useState<UndoState | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailHouse, setDetailHouse] = React.useState<{
    id: string;
    code: string;
    owner: string;
  } | null>(null);

  React.useEffect(() => {
    if (rangeFrom > rangeTo) setRangeTo(rangeFrom);
  }, [rangeFrom, rangeTo]);

  const singlePeriodISO = monthToISOFirst(singleMonth);
  const rangeFromISO = monthToISOFirst(rangeFrom);
  const rangeToISO = monthToISOFirst(rangeTo);
  const isRange = mode === "range";

  const loadData = React.useCallback(async () => {
    setErr(null);
    setLoading(true);
    setQuickForm(null);
    setUndoState(null);
    const periodFilter =
      mode === "single"
        ? { eq: singlePeriodISO }
        : { gte: rangeFromISO, lte: rangeToISO };

    const housesPromise = supabase
      .from("houses")
      .select("id,code,owner,is_repair_fund")
      .order("code");

    let rentQuery = supabase
      .from("v_rent_status")
      .select("house_id,period,rent_bill,rent_paid,rent_due");
    if ("eq" in periodFilter) rentQuery = rentQuery.eq("period", periodFilter.eq);
    else
      rentQuery = rentQuery
        .gte("period", periodFilter.gte)
        .lte("period", periodFilter.lte);

    let waterQuery = supabase
      .from("v_water_status")
      .select("house_id,period,water_bill,water_paid,water_due");
    if ("eq" in periodFilter) waterQuery = waterQuery.eq("period", periodFilter.eq);
    else
      waterQuery = waterQuery
        .gte("period", periodFilter.gte)
        .lte("period", periodFilter.lte);

    const [{ data: houses, error: housesErr }, { data: rentv, error: rentErr }, { data: waterv, error: waterErr }] =
      await Promise.all([housesPromise, rentQuery, waterQuery]);

    if (housesErr || rentErr || waterErr) {
      setErr(
        housesErr?.message || rentErr?.message || waterErr?.message || "Gagal memuat data."
      );
      setLoading(false);
      return;
    }

    const base: Record<string, Row> = {};
    (houses || []).forEach((h: any) => {
      base[h.id] = {
        house_id: h.id,
        code: h.code,
        owner: h.owner,
        is_repair_fund: Boolean(h.is_repair_fund),
        rent_bill: 0,
        rent_paid: 0,
        rent_due: 0,
        water_bill: 0,
        water_paid: 0,
        water_due: 0,
      };
    });

    const rentMap: Record<string, Record<string, RentStatus>> = {};
    const waterMap: Record<string, Record<string, WaterStatus>> = {};
    const skipped: { source: "rent" | "water"; house_id: string | null }[] = [];

    for (const r of rentv || []) {
      const houseId = r.house_id;
      if (!houseId || !base[houseId]) {
        skipped.push({ source: "rent", house_id: houseId ?? null });
        continue;
      }
      base[houseId].rent_bill += num(r.rent_bill);
      base[houseId].rent_paid += num(r.rent_paid);
      base[houseId].rent_due += num(r.rent_due);
      if (!rentMap[houseId]) rentMap[houseId] = {};
      rentMap[houseId][r.period] = {
        house_id: houseId,
        period: r.period,
        rent_bill: num(r.rent_bill),
        rent_paid: num(r.rent_paid),
        rent_due: num(r.rent_due),
      };
    }

    for (const w of waterv || []) {
      const houseId = w.house_id;
      if (!houseId || !base[houseId]) {
        skipped.push({ source: "water", house_id: houseId ?? null });
        continue;
      }
      base[houseId].water_bill += num(w.water_bill);
      base[houseId].water_paid += num(w.water_paid);
      base[houseId].water_due += num(w.water_due);
      if (!waterMap[houseId]) waterMap[houseId] = {};
      waterMap[houseId][w.period] = {
        house_id: houseId,
        period: w.period,
        water_bill: num(w.water_bill),
        water_paid: num(w.water_paid),
        water_due: num(w.water_due),
      };
    }

    if (skipped.length > 0) {
      console.warn("⚠️ Orphan rent/water rows:", skipped);
    }

    setRows(
      Object.values(base).sort((a, b) => a.code.localeCompare(b.code))
    );
    setRentStatus(rentMap);
    setWaterStatus(waterMap);
    setLoading(false);
  }, [mode, rangeFromISO, rangeToISO, singlePeriodISO]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  function getDue(
    kind: "rent" | "water",
    houseId: string,
    periodISO: string
  ): number {
    if (kind === "rent") {
      return num(rentStatus[houseId]?.[periodISO]?.rent_due);
    }
    return num(waterStatus[houseId]?.[periodISO]?.water_due);
  }

  function openQuickForm(
    kind: "rent" | "water",
    row: Row,
    label: string,
    presetAmount?: number
  ) {
    const periodMonth = isRange ? rangeFrom : singleMonth;
    setQuickForm({
      houseId: row.house_id,
      kind,
      periodMonth,
      paidAt: todayISO,
      amount: presetAmount ? String(presetAmount) : "",
      method: "",
      note: "",
      label,
    });
    setUndoState(null);
  }

  async function submitQuickForm() {
    if (!quickForm) return;
    const periodISO = monthToISOFirst(quickForm.periodMonth);
    const amount = Number(quickForm.amount);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      alert("Nominal harus diisi dan lebih besar dari 0.");
      return;
    }
    const due = getDue(quickForm.kind, quickForm.houseId, periodISO);
    if (due > 0 && amount > due + 0.0001) {
      const proceed = confirm(
        "Nominal melebihi tunggakan. Lanjutkan tetap menyimpan?"
      );
      if (!proceed) return;
    }
    const payload: any = {
      house_id: quickForm.houseId,
      period: periodISO,
      kind: quickForm.kind,
      amount,
    };
    if (quickForm.paidAt) payload.paid_at = quickForm.paidAt;
    if (quickForm.method) payload.method = quickForm.method;
    if (quickForm.note) payload.note = quickForm.note;
    const { error } = await supabase.from("payments").insert(payload);
    if (error) {
      alert(error.message);
      return;
    }
    alert("Pembayaran tersimpan.");
    setQuickForm(null);
    await loadData();
  }

  function openUndo(row: Row) {
    const periodMonth = isRange ? rangeFrom : singleMonth;
    setUndoState({ houseId: row.house_id, periodMonth });
    setQuickForm(null);
  }

  async function triggerUndo(kind: "rent" | "water") {
    if (!undoState) return;
    const periodISO = monthToISOFirst(undoState.periodMonth);
    const { data, error } = await supabase.rpc("void_last_payment", {
      p_house: undoState.houseId,
      p_period: periodISO,
      p_kind: kind,
      p_reason: "undo via dashboard",
    });
    if (error) {
      alert(error.message);
      return;
    }
    if (!data) {
      alert("Tidak ada pembayaran untuk dibatalkan.");
      return;
    }
    alert("Pembayaran terakhir dibatalkan.");
    setUndoState(null);
    await loadData();
  }

  function openDetail(row: Row) {
    setDetailHouse({
      id: row.house_id,
      code: row.code,
      owner: row.owner,
    });
    setDetailOpen(true);
  }

  const ownerRows = rows.filter((r) => !r.is_repair_fund);
  const rentBillTotal = ownerRows.reduce((sum, r) => sum + r.rent_bill, 0);
  const rentPaidTotal = ownerRows.reduce((sum, r) => sum + r.rent_paid, 0);
  const rentDueTotal = ownerRows.reduce((sum, r) => sum + r.rent_due, 0);
  const waterBillTotal = ownerRows.reduce((sum, r) => sum + r.water_bill, 0);
  const waterPaidTotal = ownerRows.reduce((sum, r) => sum + r.water_paid, 0);
  const waterDueTotal = ownerRows.reduce((sum, r) => sum + r.water_due, 0);

  return (
    <AuthGate>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <h1 className="text-2xl font-semibold text-blue-700">Dashboard</h1>
          <div className="flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/40 px-3 py-1 text-xs font-semibold text-blue-600 sm:ml-auto sm:text-sm">
            <span>Mode:</span>
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`rounded-full px-3 py-1 transition ${
                mode === "single"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-blue-600 hover:bg-blue-100/70"
              }`}
            >
              Satu Periode
            </button>
            <button
              type="button"
              onClick={() => setMode("range")}
              className={`rounded-full px-3 py-1 transition ${
                mode === "range"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-blue-600 hover:bg-blue-100/70"
              }`}
            >
              Rentang
            </button>
          </div>
        </div>

        <div className="grid gap-4 rounded-xl border border-blue-100 bg-blue-50/30 p-4 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
          {mode === "single" ? (
            <label className="flex flex-col gap-1">
              <span>Periode (bulan)</span>
              <input
                type="month"
                value={singleMonth}
                onChange={(e) => setSingleMonth(e.target.value)}
                className="rounded-lg border border-blue-200 bg-white px-3 py-2"
              />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span>Dari (bulan)</span>
                <input
                  type="month"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>Hingga (bulan)</span>
                <input
                  type="month"
                  value={rangeTo}
                  min={rangeFrom}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2"
                />
              </label>
            </>
          )}
        </div>

        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {err}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-blue-100 bg-white shadow-sm">
          <table className="min-w-full text-sm sm:text-base">
            <thead className="bg-blue-50/70 text-blue-600">
              <tr>
                <th className="px-4 py-3 text-left">Rumah</th>
                <th className="px-4 py-3 text-left">Pemilik</th>
                <th className="px-4 py-3 text-left">Sewa</th>
                <th className="px-4 py-3 text-left">Air</th>
                <th className="px-4 py-3 text-left">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-slate-400"
                  >
                    Memuat data…
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => {
                  const rentDueCurrent = getDue(
                    "rent",
                    row.house_id,
                    isRange ? rangeFromISO : singlePeriodISO
                  );
                  const waterDueCurrent = getDue(
                    "water",
                    row.house_id,
                    isRange ? rangeFromISO : singlePeriodISO
                  );
                  return (
                    <tr key={row.house_id} className="border-t border-blue-100">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {row.code}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.owner}</td>
                      <td className="px-4 py-3">
                        {idr(row.rent_bill)} / {idr(row.rent_paid)} /{" "}
                        <span
                          className={
                            row.rent_due > 0 ? "text-red-600 font-semibold" : ""
                          }
                        >
                          {idr(row.rent_due)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {idr(row.water_bill)} / {idr(row.water_paid)} /{" "}
                        <span
                          className={
                            row.water_due > 0
                              ? "text-red-600 font-semibold"
                              : ""
                          }
                        >
                          {idr(row.water_due)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center sm:justify-end">
                          <button
                            type="button"
                            className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
                            onClick={() =>
                              openQuickForm(
                                "rent",
                                row,
                                "Bayar Sewa Lunas",
                                rentDueCurrent > 0 ? rentDueCurrent : undefined
                              )
                            }
                          >
                            Sewa Lunas ({idr(rentDueCurrent)})
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
                            onClick={() =>
                              openQuickForm(
                                "water",
                                row,
                                "Bayar Air Lunas",
                                waterDueCurrent > 0 ? waterDueCurrent : undefined
                              )
                            }
                          >
                            Air Lunas ({idr(waterDueCurrent)})
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                            onClick={() =>
                              openQuickForm(
                                "rent",
                                row,
                                "Bayar Sewa Sebagian",
                                rentDueCurrent > 0 ? rentDueCurrent : undefined
                              )
                            }
                          >
                            Bayar Sewa Sebagian
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                            onClick={() =>
                              openQuickForm(
                                "water",
                                row,
                                "Bayar Air Sebagian",
                                waterDueCurrent > 0 ? waterDueCurrent : undefined
                              )
                            }
                          >
                            Bayar Air Sebagian
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                            onClick={() => openUndo(row)}
                          >
                            Undo Terakhir
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                            onClick={() => openDetail(row)}
                          >
                            Detail
                          </button>
                        </div>
                        {quickForm && quickForm.houseId === row.house_id && (
                          <div className="mt-3 grid gap-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs text-slate-600 sm:text-sm">
                            <p className="font-semibold text-blue-700">
                              {quickForm.label}
                            </p>
                            <label className="grid gap-1">
                              <span>Periode</span>
                              <input
                                type="month"
                                value={quickForm.periodMonth}
                                readOnly={!isRange}
                                onChange={(e) =>
                                  setQuickForm((prev) =>
                                    prev
                                      ? { ...prev, periodMonth: e.target.value }
                                      : prev
                                  )
                                }
                                className="rounded-lg border border-blue-200 bg-white px-2 py-1"
                              />
                            </label>
                            <label className="grid gap-1">
                              <span>Tanggal Bayar</span>
                              <input
                                type="date"
                                value={quickForm.paidAt}
                                max={todayISO}
                                onChange={(e) =>
                                  setQuickForm((prev) =>
                                    prev
                                      ? { ...prev, paidAt: e.target.value }
                                      : prev
                                  )
                                }
                                className="rounded-lg border border-blue-200 bg-white px-2 py-1"
                              />
                            </label>
                            <label className="grid gap-1">
                              <span>Nominal</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={quickForm.amount}
                                onChange={(e) =>
                                  setQuickForm((prev) =>
                                    prev
                                      ? { ...prev, amount: e.target.value }
                                      : prev
                                  )
                                }
                                className="rounded-lg border border-blue-200 bg-white px-2 py-1"
                              />
                            </label>
                            <label className="grid gap-1">
                              <span>Metode (opsional)</span>
                              <input
                                type="text"
                                value={quickForm.method}
                                onChange={(e) =>
                                  setQuickForm((prev) =>
                                    prev
                                      ? { ...prev, method: e.target.value }
                                      : prev
                                  )
                                }
                                className="rounded-lg border border-blue-200 bg-white px-2 py-1"
                                placeholder="Transfer, Tunai, dll"
                              />
                            </label>
                            <label className="grid gap-1">
                              <span>Catatan (opsional)</span>
                              <input
                                type="text"
                                value={quickForm.note}
                                onChange={(e) =>
                                  setQuickForm((prev) =>
                                    prev
                                      ? { ...prev, note: e.target.value }
                                      : prev
                                  )
                                }
                                className="rounded-lg border border-blue-200 bg-white px-2 py-1"
                                placeholder="Catatan internal"
                              />
                            </label>
                            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
                              <button
                                type="button"
                                className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
                                onClick={submitQuickForm}
                              >
                                Simpan
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                                onClick={() => setQuickForm(null)}
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        )}
                        {undoState && undoState.houseId === row.house_id && (
                          <div className="mt-3 grid gap-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-xs text-slate-600 sm:text-sm">
                            <p className="font-semibold text-blue-700">
                              Undo Pembayaran Terakhir
                            </p>
                            <label className="grid gap-1">
                              <span>Periode</span>
                              <input
                                type="month"
                                value={undoState.periodMonth}
                                min={rangeFrom}
                                max={rangeTo}
                                onChange={(e) =>
                                  setUndoState((prev) =>
                                    prev
                                      ? { ...prev, periodMonth: e.target.value }
                                      : prev
                                  )
                                }
                                className="rounded-lg border border-blue-200 bg-white px-2 py-1"
                              />
                            </label>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                              <button
                                type="button"
                                className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                                onClick={() => triggerUndo("rent")}
                              >
                                Undo Sewa
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                                onClick={() => triggerUndo("water")}
                              >
                                Undo Air
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                                onClick={() => setUndoState(null)}
                              >
                                Tutup
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-slate-400"
                  >
                    Tidak ada data.
                  </td>
                </tr>
              )}
              {rows.length > 0 && (
                <tr className="border-t border-blue-100 bg-blue-50/40 font-semibold text-blue-700">
                  <td className="px-4 py-3" colSpan={2}>
                    Total
                  </td>
                  <td className="px-4 py-3">
                    {idr(rentBillTotal)} / {idr(rentPaidTotal)} /{" "}
                    <span className={rentDueTotal > 0 ? "text-red-600" : ""}>
                      {idr(rentDueTotal)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {idr(waterBillTotal)} / {idr(waterPaidTotal)} /{" "}
                    <span className={waterDueTotal > 0 ? "text-red-600" : ""}>
                      {idr(waterDueTotal)}
                    </span>
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <DetailDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        house={detailHouse}
        mode={mode}
        singlePeriodISO={singlePeriodISO}
        range={{ from: rangeFromISO, to: rangeToISO }}
        rentStatus={rentStatus}
        waterStatus={waterStatus}
        onRefresh={loadData}
      />
    </AuthGate>
  );
}

export default function Dashboard() {
  return (
    <AuthGate>
      <DashboardInner />
    </AuthGate>
  );
}
