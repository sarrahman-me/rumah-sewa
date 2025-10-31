"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase";
import { currentPeriodISO, isoToMonth } from "@/lib/period";
import { idr } from "@/lib/format";
import { AuthGate } from "@/components/AuthGate";

type PaymentRow = {
  id: string;
  house_id: string;
  period: string;
  kind: "rent" | "water" | "repair_contrib" | "other";
  amount: number;
  paid_at: string | null;
  method: string | null;
  note: string | null;
  voided_at: string | null;
  created_at: string;
  house?: {
    code?: string | null;
    owner?: string | null;
  };
};

type DueStatus = {
  bill: number;
  paid: number;
  due: number;
};

const KIND_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "rent", label: "Sewa" },
  { value: "water", label: "Air" },
  { value: "repair_contrib", label: "Dana Perbaikan" },
  { value: "other", label: "Lainnya" },
] as const;

const isAdmin =
  process.env.NEXT_PUBLIC_PAYMENTS_ALLOW_OVERPAY === "true" || false;

function isoFirstDayFromMonth(value: string): string {
  if (!value) return currentPeriodISO();
  const [year, month] = value.split("-");
  if (!year || !month) return currentPeriodISO();
  return `${year}-${month.padStart(2, "0")}-01`;
}

function parseNumberLoose(v: string): number | null {
  if (!v) return null;
  const cleaned = String(v).replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function PaymentsPageInner() {
  const [houses, setHouses] = React.useState<
    { id: string; code: string; owner: string }[]
  >([]);
  const [filterMonth, setFilterMonth] = React.useState(() =>
    currentPeriodISO().slice(0, 7),
  );
  const [filterKind, setFilterKind] =
    React.useState<(typeof KIND_OPTIONS)[number]["value"]>("all");
  const [includeVoided, setIncludeVoided] = React.useState(false);
  const [payments, setPayments] = React.useState<PaymentRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [rentStatus, setRentStatus] = React.useState<Record<string, DueStatus>>(
    {},
  );
  const [waterStatus, setWaterStatus] = React.useState<
    Record<string, DueStatus>
  >({});

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState({
    amount: "",
    paid_at: "",
    method: "",
    note: "",
  });

  const [addForm, setAddForm] = React.useState({
    house_id: "",
    kind: "rent" as PaymentRow["kind"],
    amount: "",
    paid_at: new Date().toISOString().slice(0, 10),
    method: "",
    note: "",
  });

  const periodISO = React.useMemo(
    () => isoFirstDayFromMonth(filterMonth),
    [filterMonth],
  );

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("houses")
        .select("id,code,owner")
        .order("code");
      if (data) setHouses(data as any);
    })();
  }, []);

  React.useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKind, includeVoided, periodISO]);

  async function reload() {
    setLoading(true);
    const query = supabase
      .from("payments")
      .select(
        "id,house_id,period,kind,amount,paid_at,method,note,voided_at,created_at, houses:house_id(code,owner)",
      )
      .eq("period", periodISO)
      .order("created_at", { ascending: false });

    const filteredQuery =
      filterKind === "all" ? query : query.eq("kind", filterKind);

    const finalQuery = includeVoided
      ? filteredQuery
      : filteredQuery.is("voided_at", null);

    const [paymentsRes, rentRes, waterRes] = await Promise.all([
      finalQuery,
      supabase
        .from("v_rent_status")
        .select("house_id,rent_bill,rent_paid,rent_due")
        .eq("period", periodISO),
      supabase
        .from("v_water_status")
        .select("house_id,water_bill,water_paid,water_due")
        .eq("period", periodISO),
    ]);

    if (!paymentsRes.error && paymentsRes.data) {
      setPayments(
        paymentsRes.data.map((row: any) => ({
          ...row,
          house: row.houses,
        })),
      );
    }
    if (!rentRes.error && rentRes.data) {
      const map: Record<string, DueStatus> = {};
      for (const row of rentRes.data as any[]) {
        map[row.house_id] = {
          bill: Number(row.rent_bill ?? 0),
          paid: Number(row.rent_paid ?? 0),
          due: Number(row.rent_due ?? 0),
        };
      }
      setRentStatus(map);
    }
    if (!waterRes.error && waterRes.data) {
      const map: Record<string, DueStatus> = {};
      for (const row of waterRes.data as any[]) {
        map[row.house_id] = {
          bill: Number(row.water_bill ?? 0),
          paid: Number(row.water_paid ?? 0),
          due: Number(row.water_due ?? 0),
        };
      }
      setWaterStatus(map);
    }
    setLoading(false);
  }

  function getHouseInfo(houseId: string | null | undefined) {
    if (!houseId) return { code: "-", owner: "-" };
    const house = houses.find((h) => h.id === houseId);
    return {
      code: house?.code ?? "-",
      owner: house?.owner ?? "-",
    };
  }

  function getLimit(row: {
    house_id: string;
    kind: PaymentRow["kind"];
    currentAmount?: number;
  }) {
    if (row.kind === "rent") {
      const status = rentStatus[row.house_id];
      if (!status) return Infinity;
      const base = status.due + (row.currentAmount ?? 0);
      return Math.max(base, 0);
    }
    if (row.kind === "water") {
      const status = waterStatus[row.house_id];
      if (!status) return Infinity;
      const base = status.due + (row.currentAmount ?? 0);
      return Math.max(base, 0);
    }
    return Infinity;
  }

  function startEdit(row: PaymentRow) {
    setEditingId(row.id);
    setEditForm({
      amount: String(row.amount),
      paid_at: row.paid_at?.slice(0, 10) ?? "",
      method: row.method ?? "",
      note: row.note ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({
      amount: "",
      paid_at: "",
      method: "",
      note: "",
    });
  }

  async function saveEdit(row: PaymentRow) {
    const amountNum = parseNumberLoose(editForm.amount);
    if (amountNum == null || amountNum <= 0) {
      alert("Nominal tidak valid.");
      return;
    }
    const limit = getLimit({
      house_id: row.house_id,
      kind: row.kind,
      currentAmount: row.amount,
    });
    if (limit !== Infinity && amountNum > limit + 0.0001) {
      const message = `Nominal melebihi tunggakan (${idr(limit)}).`;
      if (!isAdmin) {
        alert(message);
        return;
      }
      const proceed = confirm(`${message} Tetap simpan?`);
      if (!proceed) return;
    }
    const { error } = await supabase
      .from("payments")
      .update({
        amount: amountNum,
        paid_at: editForm.paid_at || null,
        method: editForm.method || null,
        note: editForm.note || null,
      })
      .eq("id", row.id);
    if (error) {
      alert(error.message);
      return;
    }
    setEditingId(null);
    await reload();
  }

  async function voidPayment(id: string) {
    const confirmVoid = confirm("Batalkan pembayaran ini?");
    if (!confirmVoid) return;
    const { error } = await supabase.rpc("void_payment", {
      p_id: id,
      p_reason: "void via payments page",
    });
    if (error) {
      alert(error.message);
      return;
    }
    await reload();
  }

  async function addPayment() {
    if (!addForm.house_id) {
      alert("Pilih rumah terlebih dahulu.");
      return;
    }
    const amountNum = parseNumberLoose(addForm.amount);
    if (amountNum == null || amountNum <= 0) {
      alert("Nominal tidak valid.");
      return;
    }
    const limit = getLimit({
      house_id: addForm.house_id,
      kind: addForm.kind,
      currentAmount: 0,
    });
    if (limit !== Infinity && amountNum > limit + 0.0001) {
      const message = `Nominal melebihi tunggakan (${idr(limit)}).`;
      if (!isAdmin) {
        alert(message);
        return;
      }
      const proceed = confirm(`${message} Tetap simpan?`);
      if (!proceed) return;
    }
    const { error } = await supabase.from("payments").insert({
      house_id: addForm.house_id,
      period: periodISO,
      kind: addForm.kind,
      amount: amountNum,
      paid_at: addForm.paid_at || null,
      method: addForm.method || null,
      note: addForm.note || null,
    });
    if (error) {
      alert(error.message);
      return;
    }
    setAddForm((prev) => ({
      ...prev,
      house_id: "",
      amount: "",
      method: "",
      note: "",
    }));
    await reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-blue-700">Pembayaran</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            <span>Periode</span>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2">
            <span>Jenis</span>
            <select
              value={filterKind}
              onChange={(e) =>
                setFilterKind(
                  e.target.value as (typeof KIND_OPTIONS)[number]["value"],
                )
              }
              className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            >
              {KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeVoided}
              onChange={(e) => setIncludeVoided(e.target.checked)}
            />
            <span>Termasuk yang dibatalkan</span>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-blue-700">
          Tambah Pembayaran
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <select
            className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            value={addForm.house_id}
            onChange={(e) =>
              setAddForm((prev) => ({ ...prev, house_id: e.target.value }))
            }
          >
            <option value="">Pilih Rumah</option>
            {houses.map((house) => (
              <option key={house.id} value={house.id}>
                {house.code} · {house.owner}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            value={addForm.kind}
            onChange={(e) =>
              setAddForm((prev) => ({
                ...prev,
                kind: e.target.value as PaymentRow["kind"],
              }))
            }
          >
            {KIND_OPTIONS.filter((opt) => opt.value !== "all").map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Nominal"
            className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            value={addForm.amount}
            onChange={(e) =>
              setAddForm((prev) => ({ ...prev, amount: e.target.value }))
            }
          />
          <input
            type="date"
            className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            value={addForm.paid_at}
            onChange={(e) =>
              setAddForm((prev) => ({ ...prev, paid_at: e.target.value }))
            }
          />
          <input
            type="text"
            placeholder="Metode (opsional)"
            className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            value={addForm.method}
            onChange={(e) =>
              setAddForm((prev) => ({ ...prev, method: e.target.value }))
            }
          />
          <input
            type="text"
            placeholder="Catatan (opsional)"
            className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            value={addForm.note}
            onChange={(e) =>
              setAddForm((prev) => ({ ...prev, note: e.target.value }))
            }
          />
        </div>
        <div className="mt-3">
          <button
            onClick={addPayment}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Simpan Pembayaran
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-blue-100 bg-white shadow-sm">
        <table className="min-w-full text-sm sm:text-base">
          <thead className="bg-blue-50/70 text-blue-600">
            <tr>
              <th className="px-3 py-2 text-left">Rumah</th>
              <th className="px-3 py-2 text-left">Periode</th>
              <th className="px-3 py-2 text-left">Jenis</th>
              <th className="px-3 py-2 text-left">Nominal</th>
              <th className="px-3 py-2 text-left">Tanggal Bayar</th>
              <th className="px-3 py-2 text-left">Metode</th>
              <th className="px-3 py-2 text-left">Catatan</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-4 text-center text-slate-400"
                >
                  Memuat...
                </td>
              </tr>
            )}
            {!loading && payments.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-4 text-center text-slate-400"
                >
                  Tidak ada pembayaran pada periode ini.
                </td>
              </tr>
            )}
            {!loading &&
              payments.map((row) => {
                const { code, owner } = getHouseInfo(row.house_id);
                const isVoided = Boolean(row.voided_at);
                const isEditing = editingId === row.id;
                const limit =
                  row.kind === "rent" || row.kind === "water"
                    ? getLimit({
                        house_id: row.house_id,
                        kind: row.kind,
                        currentAmount: row.amount,
                      })
                    : Infinity;

                return (
                  <tr
                    key={row.id}
                    className={`border-t border-blue-100 ${isVoided ? "bg-red-50/40 text-slate-500" : "text-slate-700"}`}
                  >
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      {code}
                      <div className="text-xs font-normal text-slate-500">
                        {owner}
                      </div>
                    </td>
                    <td className="px-3 py-2">{isoToMonth(row.period)}</td>
                    <td className="px-3 py-2 capitalize">{row.kind}</td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editForm.amount}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              amount: e.target.value,
                            }))
                          }
                          className="w-28 rounded-lg border border-blue-200 px-2 py-1"
                        />
                      ) : (
                        idr(row.amount)
                      )}
                      {isEditing && limit !== Infinity && (
                        <div className="text-xs text-blue-500">
                          Maks: {idr(limit)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editForm.paid_at}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              paid_at: e.target.value,
                            }))
                          }
                          className="rounded-lg border border-blue-200 px-2 py-1"
                        />
                      ) : row.paid_at ? (
                        new Date(row.paid_at).toLocaleDateString("id-ID")
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.method}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              method: e.target.value,
                            }))
                          }
                          className="rounded-lg border border-blue-200 px-2 py-1"
                        />
                      ) : (
                        (row.method ?? "-")
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.note}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              note: e.target.value,
                            }))
                          }
                          className="rounded-lg border border-blue-200 px-2 py-1"
                        />
                      ) : (
                        (row.note ?? "-")
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isVoided ? (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-600">
                          hapus
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-600">
                          aktif
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                        {!isVoided && (
                          <>
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(row)}
                                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
                                >
                                  Simpan
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                                >
                                  Batal
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => startEdit(row)}
                                className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                              >
                                Ubah
                              </button>
                            )}
                            <button
                              onClick={() => voidPayment(row.id)}
                              className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                            >
                              Hapus
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <AuthGate>
      <PaymentsPageInner />
    </AuthGate>
  );
}
