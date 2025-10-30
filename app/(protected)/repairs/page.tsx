"use client";

import * as React from "react";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/lib/supabase";
import { currentPeriodISO } from "@/lib/period";
import { idr } from "@/lib/format";

type HouseOption = { id: string; code: string; owner: string };

type RepairRow = {
  id: string;
  period: string;
  house_id: string | null;
  description: string;
  amount: number;
  deleted_at: string | null;
  house_code: string | null;
  house_owner: string | null;
};

function isoFirstDayFromMonth(value: string): string {
  if (!value) return currentPeriodISO();
  const [year, month] = value.split("-");
  if (!year || !month) return currentPeriodISO();
  return `${year}-${month.padStart(2, "0")}-01`;
}

function toDisplayDate(periodISO: string): string {
  return new Date(periodISO).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function parseNumberLoose(value: string): number | null {
  if (!value) return null;
  const numeric = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

export default function RepairsPage() {
  return (
    <AuthGate>
      <RepairsView />
    </AuthGate>
  );
}

function RepairsView() {
  const [filterMonth, setFilterMonth] = React.useState(
    () => currentPeriodISO().slice(0, 7),
  );
  const [formMonth, setFormMonth] = React.useState(
    () => currentPeriodISO().slice(0, 7),
  );
  const [houses, setHouses] = React.useState<HouseOption[]>([]);
  const [rows, setRows] = React.useState<RepairRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    house_id: "",
    description: "",
    amount: "",
  });

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState({
    month: "",
    house_id: "",
    description: "",
    amount: "",
  });

  const periodISO = React.useMemo(
    () => isoFirstDayFromMonth(filterMonth),
    [filterMonth],
  );

  React.useEffect(() => {
    setFormMonth(filterMonth);
  }, [filterMonth]);

  React.useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("houses")
        .select("id,code,owner")
        .order("code");
      if (!error && data) {
        setHouses(data as any);
      }
    })();
  }, []);

  React.useEffect(() => {
    loadRepairs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodISO]);

  async function loadRepairs() {
    setLoading(true);
    const { data, error } = await supabase
      .from("repairs")
      .select(
        "id, period, house_id, description, amount, deleted_at, houses:house_id(code, owner)",
      )
      .eq("period", periodISO)
      .order("created_at", { ascending: false });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage(null);
      setRows(
        (data as any[])?.map((row) => ({
          id: row.id,
          period: row.period,
          house_id: row.house_id,
          description: row.description,
          amount: Number(row.amount ?? 0),
          deleted_at: row.deleted_at,
          house_code: row.houses?.code ?? null,
          house_owner: row.houses?.owner ?? null,
        })) ?? [],
      );
    }
    setLoading(false);
  }

  const totalActive = React.useMemo(
    () =>
      rows
        .filter((row) => !row.deleted_at)
        .reduce((sum, row) => sum + row.amount, 0),
    [rows],
  );

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const iso = isoFirstDayFromMonth(formMonth);
    const amountNum = parseNumberLoose(form.amount);
    if (amountNum == null || amountNum <= 0) {
      setMessage("Nominal harus lebih besar dari 0.");
      return;
    }
    if (!form.description.trim()) {
      setMessage("Deskripsi wajib diisi.");
      return;
    }

    const payload: any = {
      period: iso,
      description: form.description.trim(),
      amount: amountNum,
    };
    if (form.house_id) payload.house_id = form.house_id;

    const { error } = await supabase.from("repairs").insert(payload);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Pengeluaran ditambahkan.");
    setForm({ house_id: "", description: "", amount: "" });
    await loadRepairs();
  }

  function startEdit(row: RepairRow) {
    setEditingId(row.id);
    setEditForm({
      month: row.period.slice(0, 7),
      house_id: row.house_id ?? "",
      description: row.description,
      amount: String(row.amount),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ month: "", house_id: "", description: "", amount: "" });
  }

  async function submitEdit(id: string) {
    const iso = isoFirstDayFromMonth(editForm.month || filterMonth);
    const amountNum = parseNumberLoose(editForm.amount);
    if (amountNum == null || amountNum <= 0) {
      setMessage("Nominal harus lebih besar dari 0.");
      return;
    }
    if (!editForm.description.trim()) {
      setMessage("Deskripsi wajib diisi.");
      return;
    }
    const pSet: Record<string, any> = {
      period: iso,
      description: editForm.description.trim(),
      amount: amountNum,
      house_id: editForm.house_id || null,
    };
    const { error } = await supabase.rpc("update_repair", {
      p_id: id,
      p_set: pSet,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Pengeluaran diperbarui.");
    setEditingId(null);
    await loadRepairs();
  }

  async function softDelete(id: string) {
    const confirmDelete = window.confirm(
      "Hapus pengeluaran ini? Tindakan ini hanya bisa dibatalkan dengan pulihkan.",
    );
    if (!confirmDelete) return;
    const { error } = await supabase.rpc("soft_delete_repair", {
      p_id: id,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Pengeluaran dihapus.");
    await loadRepairs();
  }

  async function restore(id: string) {
    const confirmRestore = window.confirm("Pulihkan pengeluaran ini?");
    if (!confirmRestore) return;
    const { error } = await supabase.rpc("restore_repair", { p_id: id });
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Pengeluaran dipulihkan.");
    await loadRepairs();
  }

  const houseLabel = (row: RepairRow) =>
    row.house_code ? `${row.house_code}` : "Umum";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
        <h1 className="text-xl font-semibold text-blue-700">Dana Perbaikan</h1>
        <p className="text-xs text-slate-500">
          Catat setiap pengeluaran yang diambil dari dana perbaikan bersama.
        </p>
        <form
          onSubmit={handleCreate}
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>Periode</span>
            <input
              type="month"
              value={formMonth}
              onChange={(e) => setFormMonth(e.target.value)}
              className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>Rumah</span>
            <select
              value={form.house_id}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, house_id: e.target.value }))
              }
              className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            >
              <option value="">Umum</option>
              {houses.map((house) => (
                <option key={house.id} value={house.id}>
                  {house.code} · {house.owner}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600 lg:col-span-2">
            <span>Deskripsi</span>
            <input
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Contoh: Banner sewa lingkungan"
              className="rounded-lg border border-blue-200 bg-white px-3 py-2"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            <span>Nominal</span>
            <input
              type="number"
              min="0"
              value={form.amount}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, amount: e.target.value }))
              }
              placeholder="100000"
              className="rounded-lg border border-blue-200 bg-white px-3 py-2"
              required
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Tambah
            </button>
          </div>
        </form>
        {message && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
            {message}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-blue-700">
              Riwayat Pengeluaran
            </h2>
            <p className="text-xs text-slate-500">
              Total aktif bulan {filterMonth}:{" "}
              <span className="font-semibold text-blue-700">
                {idr(totalActive)}
              </span>
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span>Bulan</span>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="rounded-lg border border-blue-200 bg-white px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm sm:text-base">
            <thead className="bg-blue-50/60 text-blue-600">
              <tr>
                <th className="px-3 py-2 text-left">Tanggal</th>
                <th className="px-3 py-2 text-left">Rumah</th>
                <th className="px-3 py-2 text-left">Deskripsi</th>
                <th className="px-3 py-2 text-right">Nominal</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-4 text-center text-slate-400"
                  >
                    Memuat data pengeluaran...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-4 text-center text-slate-400"
                  >
                    Belum ada pengeluaran pada bulan ini.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => {
                  const isEditing = editingId === row.id;
                  const statusBadge = row.deleted_at ? (
                    <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-600">
                      Dihapus
                    </span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-600">
                      Aktif
                    </span>
                  );
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-blue-100 text-slate-700"
                    >
                      <td className="px-3 py-3">{toDisplayDate(row.period)}</td>
                      <td className="px-3 py-3">
                        {houseLabel(row)}
                        {row.house_owner && (
                          <span className="ml-2 text-xs text-slate-400">
                            ({row.house_owner})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <input
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                description: e.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-blue-200 px-2 py-1"
                          />
                        ) : (
                          row.description
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-blue-700">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editForm.amount}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                amount: e.target.value,
                              }))
                            }
                            className="w-28 rounded-lg border border-blue-200 px-2 py-1 text-right"
                          />
                        ) : (
                          idr(row.amount)
                        )}
                      </td>
                      <td className="px-3 py-3">{statusBadge}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          {isEditing ? (
                            <>
                              <input
                                type="month"
                                value={editForm.month}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    month: e.target.value,
                                  }))
                                }
                                className="rounded-lg border border-blue-200 px-2 py-1 text-sm"
                              />
                              <select
                                value={editForm.house_id}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    house_id: e.target.value,
                                  }))
                                }
                                className="rounded-lg border border-blue-200 px-2 py-1 text-sm"
                              >
                                <option value="">Umum</option>
                                {houses.map((house) => (
                                  <option key={house.id} value={house.id}>
                                    {house.code} · {house.owner}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => submitEdit(row.id)}
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
                          ) : row.deleted_at ? (
                            <button
                              onClick={() => restore(row.id)}
                              className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                            >
                              Pulihkan
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(row)}
                                className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => softDelete(row.id)}
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
      </section>
    </div>
  );
}
