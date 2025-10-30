"use client";
import * as React from "react";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/lib/supabase";
import { currentPeriodISO, isoToMonth } from "@/lib/period";
import { idr } from "@/lib/format";

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

function isoFirstDayFromMonth(value: string): string {
  if (!value) return currentPeriodISO();
  const [year, month] = value.split("-");
  if (!year || !month) return currentPeriodISO();
  return `${year}-${month.padStart(2, "0")}-01`;
}

function prevMonthIso(isoFirst: string): string {
  const [yearStr, monthStr] = isoFirst.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() - 1);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function WaterPageInner() {
  const [month, setMonth] = React.useState(() =>
    isoToMonth(currentPeriodISO()),
  );
  const [rows, setRows] = React.useState<HouseRow[]>([]);
  const [formRows, setFormRows] = React.useState<HouseFormRow[]>([]);
  const [billM1, setBillM1] = React.useState<number>(0);
  const [billM2, setBillM2] = React.useState<number>(0);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [meterBills, setMeterBills] = React.useState<
    { meter: string; total_amount: number }[]
  >([]);
  const [meterIdByCode, setMeterIdByCode] = React.useState<Record<string, string>>(
    {},
  );
  const [readingDate, setReadingDate] = React.useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [showPaste, setShowPaste] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");
  const [pasteSummary, setPasteSummary] = React.useState<string | null>(null);

  const periodISO = isoFirstDayFromMonth(month);
  const prevISO = React.useMemo(() => prevMonthIso(periodISO), [periodISO]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMsg(null);
    const [{ data: housesData, error: housesErr }] = await Promise.all([
      supabase.from("houses").select("id,code,owner").order("code"),
    ]);
    if (housesErr) {
      setMsg(housesErr.message);
      setLoading(false);
      return;
    }

    const [
      readingsRes,
      sharesRes,
      meterBillsRes,
      meterMapRes,
      metersRes,
    ] = await Promise.all([
      supabase
        .from("water_readings")
        .select("house_id, period, reading_m3")
        .in("period", [prevISO, periodISO]),
      supabase
        .from("water_shares")
        .select("house_id, share_amount")
        .eq("period", periodISO),
      supabase
        .from("meter_bills")
        .select("meter_id, total_amount, period, meters(code)")
        .eq("period", periodISO),
      supabase
        .from("meter_house_map")
        .select("meter_id, house_id, meters(code)"),
      supabase.from("meters").select("id, code"),
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
          "Gagal memuat data.",
      );
      setLoading(false);
      return;
    }

    const meterByHouse: Record<string, string> = {};
    for (const map of (meterMapRes.data as Array<{
      house_id: string;
      meters?: { code?: string | null } | null;
    }> | null) || []) {
      meterByHouse[map.house_id] = map.meters?.code ?? "";
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
      })),
    );
    setBillM1(billMap["M1"] ?? 0);
    setBillM2(billMap["M2"] ?? 0);
    const ids: Record<string, string> = {};
    for (const meter of metersRes.data || []) {
      ids[meter.code] = meter.id;
    }
    setMeterIdByCode(ids);

    const nextRows: HouseRow[] = (housesData || []).map((h: any) => {
      const prevReading = readingsMap[prevISO]?.[h.id] ?? null;
      const currReading = readingsMap[periodISO]?.[h.id] ?? null;
      const usage =
        prevReading !== null && currReading !== null
          ? Math.max(currReading - prevReading, 0)
          : 0;
      return {
        house_id: h.id,
        code: h.code,
        owner: h.owner,
        prev_reading: prevReading,
        curr_reading: currReading,
        usage,
        share: shareMap[h.id] ?? 0,
        meter: meterByHouse[h.id] ?? "-",
      };
    });

    setRows(nextRows);
    setFormRows(
      nextRows.map((row) => ({
        ...row,
        input_value: row.curr_reading != null ? String(row.curr_reading) : "",
        input_date: readingDate,
        warning:
          row.prev_reading != null &&
          row.curr_reading != null &&
          row.curr_reading < row.prev_reading
            ? "KM turun"
            : null,
      })),
    );
    setLoading(false);
  }, [periodISO, prevISO]);

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

  async function handleGenerate() {
    if (!month.trim()) {
      alert("Pilih periode terlebih dahulu.");
      return;
    }
    if (!meterIdByCode["M1"] || !meterIdByCode["M2"]) {
      alert("Data meter belum siap. Muat ulang halaman.");
      return;
    }
    setSaving(true);
    setMsg(null);
    const payloads = [
      { code: "M1", amount: billM1 ?? 0 },
      { code: "M2", amount: billM2 ?? 0 },
    ].map(({ code, amount }) => ({
      meter_id: meterIdByCode[code],
      period: periodISO,
      total_amount: amount,
    }));

    const { error: billError } = await supabase
      .from("meter_bills")
      .upsert(payloads, { onConflict: "meter_id,period" });
    if (billError) {
      setMsg(billError.message);
      setSaving(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc("generate_water_shares", {
      p_period: periodISO,
    });
    if (rpcError) {
      setMsg(rpcError.message);
      setSaving(false);
      return;
    }
    setMsg("Pembagian air berhasil dihitung.");
    setSaving(false);
    await load();
  }

  function parseNumberLoose(v: string): number | null {
    if (!v) return null;
    const cleaned = String(v).replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function applyPaste() {
    if (!pasteText.trim()) {
      setPasteSummary("Tidak ada data tempel.");
      return;
    }
    const lines = pasteText.trim().split(/\r?\n/);
    const map: Record<string, string> = {};
    let matched = 0;
    const unmatched: string[] = [];
    for (const line of lines) {
      const [houseCodeRaw, valueRaw] = line.split(/\s*[,\t]\s*|\s+/);
      if (!houseCodeRaw || valueRaw == null) continue;
      const houseCode = houseCodeRaw.trim().toUpperCase();
      const row = rows.find((r) => r.code === houseCode);
      if (!row) {
        unmatched.push(houseCode);
        continue;
      }
      map[row.house_id] = valueRaw.trim();
      matched++;
    }
    setFormRows((prev) =>
      prev.map((row) => {
        if (map[row.house_id]) {
          const parsed = parseNumberLoose(map[row.house_id]);
          return {
            ...row,
            input_value: map[row.house_id],
            warning:
              parsed != null &&
              row.prev_reading != null &&
              parsed < row.prev_reading
                ? "KM turun"
                : null,
          };
        }
        return row;
      }),
    );
    setPasteSummary(
      `Baris diterapkan: ${matched}${
        unmatched.length ? ` · Tidak dikenal: ${unmatched.join(", ")}` : ""
      }`,
    );
  }

  function handleFormChange(
    houseId: string,
    field: "value" | "date",
    value: string,
  ) {
    setFormRows((prev) =>
      prev.map((row) => {
        if (row.house_id !== houseId) return row;
        if (field === "value") {
          const parsed = parseNumberLoose(value);
          return {
            ...row,
            input_value: value,
            warning:
              parsed != null &&
              row.prev_reading != null &&
              parsed < row.prev_reading
                ? "KM turun"
                : null,
          };
        }
        return {
          ...row,
          input_date: value,
        };
      }),
    );
  }

  async function handleSaveReadings() {
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
      alert("Isi minimal satu KM terlebih dahulu.");
      return;
    }
    const { error } = await supabase.rpc("bulk_upsert_water_readings", {
      p_period: periodISO,
      p_default_date: readingDate,
      p_pairs: pairs,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setMsg("KM tersimpan.");
    await load();
    await supabase.rpc("generate_water_shares", { p_period: periodISO });
    await load();
  }

  return (
    <AuthGate>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-blue-700">
              Pembacaan & Pembagian Air
            </h1>
            <p className="text-sm text-slate-500">
              Periode {isoToMonth(prevISO)} → {isoToMonth(periodISO)}
            </p>
          </div>
          <label className="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center">
            <span className="font-medium text-blue-700">Periode</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            />
          </label>
        </div>

        <div className="space-y-4 rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-blue-700">
                Pencatatan KM Bulan Ini
              </h2>
              <p className="text-xs text-slate-500">
                Periode {isoToMonth(periodISO)} dibanding {isoToMonth(prevISO)}
              </p>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span>Tanggal Pencatatan</span>
                <input
                  type="date"
                  value={readingDate}
                  onChange={(e) => setReadingDate(e.target.value)}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2"
                />
              </label>
              <div className="flex flex-col gap-2 sm:items-end">
                <button
                  type="button"
                  onClick={handleSaveReadings}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Simpan KM Bulan Ini
                </button>
                <button
                  type="button"
                  onClick={() => setShowPaste((v) => !v)}
                  className="text-xs text-blue-600 underline"
                >
                  {showPaste ? "Tutup tempel CSV/TSV" : "Tempel dari CSV/TSV"}
                </button>
              </div>
            </div>
          </div>
          {showPaste && (
            <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/40 p-3 text-sm">
              <textarea
                className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2"
                rows={4}
                placeholder={"H01\t1750\nH02\t1898"}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={applyPaste}
                  className="rounded-lg border border-blue-200 px-3 py-1 text-blue-600 transition hover:bg-blue-100"
                >
                  Terapkan ke tabel
                </button>
                {pasteSummary && <span className="text-blue-500">{pasteSummary}</span>}
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-blue-100">
            <table className="min-w-full text-sm sm:text-base">
              <thead className="bg-blue-50/60 text-blue-600">
                <tr>
                  <th className="px-3 py-2 text-left">Rumah</th>
                  <th className="px-3 py-2 text-left">Pemilik</th>
                  <th className="px-3 py-2 text-left">KM {isoToMonth(prevISO)}</th>
                  <th className="px-3 py-2 text-left">KM {isoToMonth(periodISO)}</th>
                  <th className="px-3 py-2 text-left">Tanggal</th>
                  <th className="px-3 py-2 text-left">Meter</th>
                  <th className="px-3 py-2 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {formRows.map((row) => (
                  <tr key={row.house_id} className="border-t border-blue-100 text-slate-700">
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.code}</td>
                    <td className="px-3 py-2">{row.owner}</td>
                    <td className="px-3 py-2">{row.prev_reading ?? "-"}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        className="w-32 rounded-lg border border-blue-200 px-2 py-1"
                        value={row.input_value}
                        onChange={(e) =>
                          handleFormChange(row.house_id, "value", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        className="rounded-lg border border-blue-200 px-2 py-1 text-sm"
                        value={row.input_date}
                        onChange={(e) =>
                          handleFormChange(row.house_id, "date", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.meter}</td>
                    <td className="px-3 py-2 text-xs text-red-600">
                      {row.warning ? `⚠︎ ${row.warning}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-slate-600">
                <span>Tagihan PDAM M1 (H01–H04)</span>
                <input
                  type="number"
                  min="0"
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2"
                  value={billM1 || ""}
                  onChange={(e) => setBillM1(Number(e.target.value || 0))}
                  placeholder="400000"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-600">
                <span>Tagihan PDAM M2 (H05–H08)</span>
                <input
                  type="number"
                  min="0"
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2"
                  value={billM2 || ""}
                  onChange={(e) => setBillM2(Number(e.target.value || 0))}
                  placeholder="450000"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-between sm:gap-3">
              <div className="text-xs text-blue-500 sm:text-sm">
                <p>
                  Pengukuran: {isoToMonth(prevISO)} → {isoToMonth(periodISO)}
                </p>
                <p>
                  Usage M1: {(usageByMeter["M1"] ?? 0).toFixed(2)} m³ · Share:{" "}
                  {idr(shareByMeter["M1"] ?? 0)}
                </p>
                <p>
                  Usage M2: {(usageByMeter["M2"] ?? 0).toFixed(2)} m³ · Share:{" "}
                  {idr(shareByMeter["M2"] ?? 0)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Memproses…" : "Simpan Tagihan & Hitung"}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-semibold text-blue-700">
              Riwayat Tagihan
            </h2>
            <p className="text-xs text-slate-500">
              Periode {isoToMonth(periodISO)}
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {meterBills.length === 0 && (
                <li className="text-slate-400">Belum ada tagihan tersimpan.</li>
              )}
              {meterBills.map((bill) => (
                <li
                  key={bill.meter}
                  className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2"
                >
                  <span className="font-semibold text-blue-700">
                    {bill.meter}
                  </span>
                  <span>{idr(bill.total_amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {msg && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {msg}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-blue-100 bg-white shadow-sm">
          <table className="min-w-full text-sm sm:text-base">
            <thead className="bg-blue-50/70 text-blue-600">
              <tr>
                <th className="px-3 py-3 text-left">Rumah</th>
                <th className="px-3 py-3 text-left">Pemilik</th>
                <th className="px-3 py-3 text-left">
                  KM {isoToMonth(prevISO)}
                </th>
                <th className="px-3 py-3 text-left">
                  KM {isoToMonth(periodISO)}
                </th>
                <th className="px-3 py-3 text-left">Pemakaian (m³)</th>
                <th className="px-3 py-3 text-left">Meter</th>
                <th className="px-3 py-3 text-left">Tagihan (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-sm text-slate-400"
                  >
                    Memuat…
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => (
                  <tr
                    key={row.house_id}
                    className="border-t border-blue-100 text-slate-700"
                  >
                    <td className="px-3 py-3 font-semibold text-slate-800">
                      {row.code}
                    </td>
                    <td className="px-3 py-3">{row.owner}</td>
                    <td className="px-3 py-3">
                      {row.prev_reading !== null ? row.prev_reading : "-"}
                    </td>
                    <td className="px-3 py-3">
                      {row.curr_reading !== null ? row.curr_reading : "-"}
                    </td>
                    <td className="px-3 py-3">{row.usage.toFixed(2)}</td>
                    <td className="px-3 py-3 text-slate-600">{row.meter}</td>
                    <td className="px-3 py-3 font-semibold text-blue-700">
                      {idr(row.share)}
                    </td>
                  </tr>
                ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-sm text-slate-400"
                  >
                    Tidak ada data.
                  </td>
                </tr>
              )}
              {!loading && rows.length > 0 && (
                <>
                  <tr className="border-t border-blue-100 bg-blue-50/40 font-semibold text-blue-700">
                    <td className="px-3 py-3" colSpan={4}>
                      Total M1
                    </td>
                    <td className="px-3 py-3">
                      {(usageByMeter["M1"] ?? 0).toFixed(2)} m³
                    </td>
                    <td className="px-3 py-3">M1</td>
                    <td className="px-3 py-3">
                      {idr(shareByMeter["M1"] ?? 0)}
                    </td>
                  </tr>
                  <tr className="border-t border-blue-100 bg-blue-50/40 font-semibold text-blue-700">
                    <td className="px-3 py-3" colSpan={4}>
                      Total M2
                    </td>
                    <td className="px-3 py-3">
                      {(usageByMeter["M2"] ?? 0).toFixed(2)} m³
                    </td>
                    <td className="px-3 py-3">M2</td>
                    <td className="px-3 py-3">
                      {idr(shareByMeter["M2"] ?? 0)}
                    </td>
                  </tr>
                  <tr className="border-t border-blue-100 bg-blue-100/50 font-semibold text-blue-800">
                    <td className="px-3 py-3" colSpan={4}>
                      Grand Total
                    </td>
                    <td className="px-3 py-3">
                      {(
                        (usageByMeter["M1"] ?? 0) + (usageByMeter["M2"] ?? 0)
                      ).toFixed(2)}{" "}
                      m³
                    </td>
                    <td className="px-3 py-3">-</td>
                    <td className="px-3 py-3">
                      {idr(
                        (shareByMeter["M1"] ?? 0) + (shareByMeter["M2"] ?? 0),
                      )}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AuthGate>
  );
}

export default function WaterPage() {
  return (
    <AuthGate>
      <WaterPageInner />
    </AuthGate>
  );
}
