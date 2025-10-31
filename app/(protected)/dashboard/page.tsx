"use client";

import * as React from "react";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/lib/supabase";
import { currentPeriodISO, isoToMonth, monthToISOFirst } from "@/lib/period";
import { idr } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableFooter,
} from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { DateField } from "@/components/ui/DateField";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/utils";

type Mode = "single" | "range";
type PaymentKind = "rent" | "water";
type ActionType = "rent-full" | "water-full" | "rent-partial" | "water-partial";

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

type ActionModalState = {
  type: ActionType;
  house: Row;
  periodMonth: string;
  paidAt: string;
  amount: string;
  method: string;
  note: string;
};

type UndoModalState = {
  house: Row;
  periodMonth: string;
  kind: PaymentKind;
};

type DetailModalState = {
  house: Row;
};

const todayISO = new Date().toISOString().slice(0, 10);
const allowOverpay =
  typeof window !== "undefined" &&
  (process.env.NEXT_PUBLIC_PAYMENTS_ALLOW_OVERPAY === "true" || false);

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthRange(fromISO: string, toISO: string) {
  const result: string[] = [];
  const start = new Date(fromISO);
  const end = new Date(toISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return result;
  }
  const current = new Date(start.getTime());
  current.setDate(1);
  end.setDate(1);
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    result.push(`${y}-${m}-01`);
    current.setMonth(current.getMonth() + 1);
  }
  return result;
}

function getActionLabel(type: ActionType) {
  switch (type) {
    case "rent-full":
      return "Sewa Lunas";
    case "water-full":
      return "Air Lunas";
    case "rent-partial":
      return "Bayar Sewa Sebagian";
    case "water-partial":
      return "Bayar Air Sebagian";
    default:
      return "Pembayaran";
  }
}

function typeToKind(type: ActionType): PaymentKind {
  return type.startsWith("rent") ? "rent" : "water";
}

function stickyCellClass(extra?: string) {
  return cx(
    "sticky left-0 z-[2] bg-white",
    "shadow-[1px_0_0_0_var(--border)]",
    extra,
  );
}

type StatusMaps = {
  rent: Record<string, Record<string, RentStatus>>;
  water: Record<string, Record<string, WaterStatus>>;
  vacancy: Record<string, Record<string, boolean>>;
};

function DashboardInner() {
  const initialMonth = React.useMemo(() => isoToMonth(currentPeriodISO()), []);
  const [mode, setMode] = React.useState<Mode>("single");
  const [singleMonth, setSingleMonth] = React.useState(initialMonth);
  const [rangeFrom, setRangeFrom] = React.useState(initialMonth);
  const [rangeTo, setRangeTo] = React.useState(initialMonth);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [statusMaps, setStatusMaps] = React.useState<StatusMaps>({
    rent: {},
    water: {},
    vacancy: {},
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const [actionModal, setActionModal] = React.useState<ActionModalState | null>(
    null,
  );
  const [undoModal, setUndoModal] = React.useState<UndoModalState | null>(null);
  const [detailModal, setDetailModal] = React.useState<DetailModalState | null>(
    null,
  );
  const [occupancyModal, setOccupancyModal] = React.useState<{
    house: Row;
    periodMonth: string;
    status: "vacant" | "occupied";
    note: string;
  } | null>(null);
  const [actionSubmitting, setActionSubmitting] = React.useState(false);
  const [undoSubmitting, setUndoSubmitting] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (rangeFrom > rangeTo) {
      setRangeTo(rangeFrom);
    }
  }, [rangeFrom, rangeTo]);

  const singlePeriodISO = monthToISOFirst(singleMonth);
  const rangeFromISO = monthToISOFirst(rangeFrom);
  const rangeToISO = monthToISOFirst(rangeTo);
  const isRange = mode === "range";

  const loadData = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    setFeedback(null);

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
    if ("eq" in periodFilter)
      rentQuery = rentQuery.eq("period", periodFilter.eq);
    else
      rentQuery = rentQuery
        .gte("period", periodFilter.gte)
        .lte("period", periodFilter.lte);

    let waterQuery = supabase
      .from("v_water_status")
      .select("house_id,period,water_bill,water_paid,water_due");
    if ("eq" in periodFilter)
      waterQuery = waterQuery.eq("period", periodFilter.eq);
    else
      waterQuery = waterQuery
        .gte("period", periodFilter.gte)
        .lte("period", periodFilter.lte);

    let vacancyQuery = supabase
      .from("house_vacancies")
      .select("house_id,period");
    if ("eq" in periodFilter)
      vacancyQuery = vacancyQuery.eq("period", periodFilter.eq);
    else
      vacancyQuery = vacancyQuery
        .gte("period", periodFilter.gte)
        .lte("period", periodFilter.lte);

    const [
      { data: houses, error: housesErr },
      { data: rentStatuses, error: rentErr },
      { data: waterStatuses, error: waterErr },
      { data: vacancyRows, error: vacancyErr },
    ] = await Promise.all([housesPromise, rentQuery, waterQuery, vacancyQuery]);

    if (housesErr || rentErr || waterErr || vacancyErr) {
      setError(
        housesErr?.message ||
          rentErr?.message ||
          waterErr?.message ||
          vacancyErr?.message ||
          "Gagal memuat data.",
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

    const rentMap: StatusMaps["rent"] = {};
    const waterMap: StatusMaps["water"] = {};

    for (const row of rentStatuses || []) {
      const houseId = row.house_id;
      if (!houseId || !base[houseId]) continue;
      const bill = num(row.rent_bill);
      const paid = num(row.rent_paid);
      const due = num(row.rent_due);
      base[houseId].rent_bill += bill;
      base[houseId].rent_paid += paid;
      base[houseId].rent_due += due;
      if (!rentMap[houseId]) rentMap[houseId] = {};
      rentMap[houseId][row.period] = {
        house_id: houseId,
        period: row.period,
        rent_bill: bill,
        rent_paid: paid,
        rent_due: due,
      };
    }

    for (const row of waterStatuses || []) {
      const houseId = row.house_id;
      if (!houseId || !base[houseId]) continue;
      const bill = num(row.water_bill);
      const paid = num(row.water_paid);
      const due = num(row.water_due);
      base[houseId].water_bill += bill;
      base[houseId].water_paid += paid;
      base[houseId].water_due += due;
      if (!waterMap[houseId]) waterMap[houseId] = {};
      waterMap[houseId][row.period] = {
        house_id: houseId,
        period: row.period,
        water_bill: bill,
        water_paid: paid,
        water_due: due,
      };
    }

    const vacancyMap: Record<string, Record<string, boolean>> = {};
    for (const v of vacancyRows || []) {
      const houseId = (v as any).house_id as string | null;
      const period = (v as any).period as string | null;
      if (!houseId || !period) continue;
      if (!vacancyMap[houseId]) vacancyMap[houseId] = {};
      vacancyMap[houseId][period] = true;
    }

    setRows(Object.values(base).sort((a, b) => a.code.localeCompare(b.code)));
    setStatusMaps({ rent: rentMap, water: waterMap, vacancy: vacancyMap });
    setLoading(false);
  }, [mode, rangeFromISO, rangeToISO, singlePeriodISO]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const ownerRows = React.useMemo(
    () => rows.filter((row) => !row.is_repair_fund),
    [rows],
  );
  const rentTotals = React.useMemo(
    () => ({
      bill: ownerRows.reduce((sum, row) => sum + row.rent_bill, 0),
      paid: ownerRows.reduce((sum, row) => sum + row.rent_paid, 0),
      due: ownerRows.reduce((sum, row) => sum + row.rent_due, 0),
    }),
    [ownerRows],
  );
  const waterTotals = React.useMemo(
    () => ({
      bill: ownerRows.reduce((sum, row) => sum + row.water_bill, 0),
      paid: ownerRows.reduce((sum, row) => sum + row.water_paid, 0),
      due: ownerRows.reduce((sum, row) => sum + row.water_due, 0),
    }),
    [ownerRows],
  );

  const currentPeriodMonth = isRange ? rangeFrom : singleMonth;
  const currentPeriodISOSelected = monthToISOFirst(currentPeriodMonth);

  const isHouseVacantForSelection = React.useCallback(
    (houseId: string) => {
      const vacancy = statusMaps.vacancy[houseId];
      if (!vacancy) return false;
      if (!isRange) {
        return Boolean(vacancy[singlePeriodISO]);
      }
      const months = monthRange(rangeFromISO, rangeToISO);
      if (months.length === 0) return false;
      return months.every((month) => Boolean(vacancy[month]));
    },
    [
      statusMaps.vacancy,
      isRange,
      singlePeriodISO,
      rangeFromISO,
      rangeToISO,
    ],
  );

  function getDueValue(
    houseId: string,
    kind: PaymentKind,
    periodISO: string,
  ): number {
    if (kind === "rent") {
      return num(statusMaps.rent[houseId]?.[periodISO]?.rent_due);
    }
    return num(statusMaps.water[houseId]?.[periodISO]?.water_due);
  }

  function openOccupancy(house: Row) {
    const periodMonth = currentPeriodMonth;
    const vacant = isHouseVacantForSelection(house.house_id);
    setOccupancyModal({
      house,
      periodMonth,
      status: vacant ? "vacant" : "occupied",
      note: "",
    });
  }

  function openAction(type: ActionType, house: Row) {
    const periodMonth = currentPeriodMonth;
    const paidAt = todayISO;
    const kind = typeToKind(type);
    const due = getDueValue(house.house_id, kind, currentPeriodISOSelected);
    const amount =
      type.endsWith("full") && due > 0 ? String(due.toFixed(0)) : "";
    setActionModal({
      type,
      house,
      periodMonth,
      paidAt,
      amount,
      method: "",
      note: "",
    });
  }

    async function saveOccupancy() {
    if (!occupancyModal) return;
    const periodISO = monthToISOFirst(occupancyModal.periodMonth);
    setFeedback(null);
    const payload = {
      house_id: occupancyModal.house.house_id,
      period: periodISO,
      note: occupancyModal.note ? occupancyModal.note : null,
    };
    if (occupancyModal.status === "vacant") {
      await supabase
        .from("house_vacancies")
        .upsert(payload, { onConflict: "house_id,period" });
    } else {
      await supabase
        .from("house_vacancies")
        .delete()
        .eq("house_id", occupancyModal.house.house_id)
        .eq("period", periodISO);
    }
    setOccupancyModal(null);
    setFeedback("Status hunian diperbarui.");
    startTransition(() => {
      loadData();
    });
  }

function openUndo(house: Row) {
    setUndoModal({
      house,
      periodMonth: currentPeriodMonth,
      kind: "rent",
    });
  }

  function openDetail(house: Row) {
    setDetailModal({ house });
  }

  // function closeModals() {
  //   setActionModal(null);
  //   setUndoModal(null);
  //   setDetailModal(null);
  // }

  function updateActionAmountForNewPeriod(periodMonth: string) {
    if (!actionModal) return;
    const periodISO = monthToISOFirst(periodMonth);
    const kind = typeToKind(actionModal.type);
    const due = getDueValue(actionModal.house.house_id, kind, periodISO);
    setActionModal((prev) =>
      prev
        ? {
            ...prev,
            periodMonth,
            amount:
              prev.type.endsWith("full") && due > 0
                ? String(due.toFixed(0))
                : prev.amount,
          }
        : prev,
    );
  }

  function optimisticApplyPayment(
    houseId: string,
    kind: PaymentKind,
    periodISO: string,
    amount: number,
  ) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.house_id !== houseId) return row;
        if (kind === "rent") {
          const due = Math.max(row.rent_due - amount, 0);
          return {
            ...row,
            rent_paid: row.rent_paid + amount,
            rent_due: due,
          };
        }
        const due = Math.max(row.water_due - amount, 0);
        return {
          ...row,
          water_paid: row.water_paid + amount,
          water_due: due,
        };
      }),
    );

    setStatusMaps((prev) => {
      const next = { ...prev };
      if (!next[kind][houseId]) {
        next[kind][houseId] = {};
      }
      const map = { ...next[kind][houseId] };
      const existing = { ...(map[periodISO] || {}) } as any;
      if (kind === "rent") {
        existing.house_id = houseId;
        existing.period = periodISO;
        existing.rent_bill = num(existing.rent_bill);
        existing.rent_paid = num(existing.rent_paid) + amount;
        existing.rent_due = Math.max(num(existing.rent_due) - amount, 0);
      } else {
        existing.house_id = houseId;
        existing.period = periodISO;
        existing.water_bill = num(existing.water_bill);
        existing.water_paid = num(existing.water_paid) + amount;
        existing.water_due = Math.max(num(existing.water_due) - amount, 0);
      }
      map[periodISO] = existing;
      next[kind][houseId] = map;
      return next;
    });
  }

  async function handleSubmitPayment() {
    if (!actionModal) return;
    const kind = typeToKind(actionModal.type);
    const periodISO = monthToISOFirst(actionModal.periodMonth);
    const amountValue = Number(actionModal.amount);

    if (!amountValue || Number.isNaN(amountValue) || amountValue <= 0) {
      setFeedback("Nominal harus diisi dan lebih besar dari 0.");
      return;
    }

    const dueValue = getDueValue(actionModal.house.house_id, kind, periodISO);
    if (!allowOverpay && amountValue > dueValue + 0.0001) {
      setFeedback("Nominal melebihi tunggakan yang tersisa.");
      return;
    }

    setActionSubmitting(true);
    setFeedback(null);

    const previousRows = rows;
    const previousStatus = statusMaps;

    optimisticApplyPayment(
      actionModal.house.house_id,
      kind,
      periodISO,
      amountValue,
    );

    const payload: Record<string, any> = {
      house_id: actionModal.house.house_id,
      period: periodISO,
      kind,
      amount: amountValue,
    };
    if (actionModal.paidAt) payload.paid_at = actionModal.paidAt;
    if (actionModal.method) payload.method = actionModal.method;
    if (actionModal.note) payload.note = actionModal.note;

    const { error } = await supabase.from("payments").insert(payload);

    if (error) {
      setRows(previousRows);
      setStatusMaps(previousStatus);
      setActionSubmitting(false);
      setFeedback(error.message || "Gagal menyimpan pembayaran.");
      return;
    }

    setActionSubmitting(false);
    setFeedback("Pembayaran berhasil disimpan.");
    setActionModal(null);
    startTransition(() => {
      loadData();
    });
  }

  async function handleUndo(kind: PaymentKind) {
    if (!undoModal) return;
    setUndoSubmitting(true);
    setFeedback(null);
    const periodISO = monthToISOFirst(undoModal.periodMonth);
    const { data, error } = await supabase.rpc("void_last_payment", {
      p_house: undoModal.house.house_id,
      p_period: periodISO,
      p_kind: kind,
      p_reason: "undo via dashboard modal",
    });
    if (error) {
      setUndoSubmitting(false);
      setFeedback(error.message || "Gagal membatalkan pembayaran.");
      return;
    }
    if (!data) {
      setUndoSubmitting(false);
      setFeedback("Tidak ada pembayaran untuk dibatalkan.");
      return;
    }
    setUndoSubmitting(false);
    setFeedback("Pembayaran terakhir dibatalkan.");
    setUndoModal(null);
    startTransition(() => {
      loadData();
    });
  }

  const tableCaption = "Status pembayaran sewa dan air untuk setiap rumah";

  return (
    <>
      <div className="page-stack">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-[var(--ink)]">
            Dashboard
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Ringkasan status sewa &amp; air. Perbarui pembayaran melalui modal
            aksi.
          </p>
        </div>

        <Card>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
            <div className="grid gap-3 md:grid-cols-2">
              {mode === "single" ? (
                <div className="field-group">
                  <label className="field-label" htmlFor="period-single">
                    Periode (bulan)
                  </label>
                  <Input
                    id="period-single"
                    type="month"
                    value={singleMonth}
                    onChange={(event) => setSingleMonth(event.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="field-group">
                    <label className="field-label" htmlFor="range-from">
                      Dari (bulan)
                    </label>
                    <Input
                      id="range-from"
                      type="month"
                      value={rangeFrom}
                      onChange={(event) => setRangeFrom(event.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="range-to">
                      Hingga (bulan)
                    </label>
                    <Input
                      id="range-to"
                      type="month"
                      min={rangeFrom}
                      value={rangeTo}
                      onChange={(event) => setRangeTo(event.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <span className="field-label">Mode tampilan</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={mode === "single" ? "primary" : "ghost"}
                  onClick={() => setMode("single")}
                >
                  Satu Periode
                </Button>
                <Button
                  size="sm"
                  variant={mode === "range" ? "primary" : "ghost"}
                  onClick={() => setMode("range")}
                >
                  Rentang
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {feedback && (
          <div className="card card-pad text-sm text-[var(--primary)]">
            {feedback}
          </div>
        )}
        {error && (
          <div className="card card-pad border border-[var(--danger)] text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:hidden">
          {rows.map((row) => {
            const vacant = isHouseVacantForSelection(row.house_id);
            const showRent = !vacant && row.rent_due > 0;
            const showWater = row.water_due > 0;
            return (
              <MobileRowCard
                key={row.house_id}
                row={row}
                vacant={vacant}
                showRent={showRent}
                showWater={showWater}
                onAction={openAction}
                onUndo={openUndo}
                onDetail={openDetail}
                onOccupancy={openOccupancy}
              />
            );
          })}
          {!loading && rows.length === 0 && (
            <Card>
              <p className="text-center text-sm text-[var(--muted)]">
                Tidak ada data untuk periode ini.
              </p>
            </Card>
          )}
          {loading && (
            <Card>
              <p className="text-center text-sm text-[var(--muted)]">
                Memuat data...
              </p>
            </Card>
          )}
        </div>

        <TableContainer className="hidden sm:block">
          <Table className="text-sm">
            <caption className="sr-only">{tableCaption}</caption>
            <TableHead>
              <TableRow>
                <TableHeaderCell className={cx(stickyCellClass("px-4 py-3"))}>
                  Rumah
                </TableHeaderCell>
                <TableHeaderCell className="px-4 py-3">Pemilik</TableHeaderCell>
                <TableHeaderCell className="px-4 py-3">Sewa</TableHeaderCell>
                <TableHeaderCell className="px-4 py-3">Air</TableHeaderCell>
                <TableHeaderCell className="px-4 py-3 text-right">
                  Aksi
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-6 text-center text-[var(--muted)]"
                  >
                    Memuat data...
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                rows.map((row) => {
                  const vacant = isHouseVacantForSelection(row.house_id);
                  const showRent = !vacant && row.rent_due > 0;
                  const showWater = row.water_due > 0;
                  return (
                    <DashboardRowTable
                      key={row.house_id}
                      row={row}
                      vacant={vacant}
                      showRent={showRent}
                      showWater={showWater}
                      onAction={openAction}
                      onUndo={openUndo}
                      onDetail={openDetail}
                      onOccupancy={openOccupancy}
                    />
                  );
                })}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-6 text-center text-[var(--muted)]"
                  >
                    Tidak ada data untuk periode ini.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-[#eef2ff] font-medium text-[var(--primary)]">
                <TableCell className={cx(stickyCellClass("px-4 py-3"))}>
                  Total
                </TableCell>
                <TableCell className="px-4 py-3" />
                <TableCell className="px-4 py-3">
                  <TotalsCell
                    label="Sewa"
                    bill={rentTotals.bill}
                    paid={rentTotals.paid}
                    due={rentTotals.due}
                  />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <TotalsCell
                    label="Air"
                    bill={waterTotals.bill}
                    paid={waterTotals.paid}
                    due={waterTotals.due}
                  />
                </TableCell>
                <TableCell className="px-4 py-3" />
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      </div>
      <Modal
        open={!!actionModal}
        onOpenChange={(open) => {
          if (!open) setActionModal(null);
        }}
        title={actionModal ? getActionLabel(actionModal.type) : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setActionModal(null)}>
              Batal
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmitPayment}
              disabled={actionSubmitting || isPending}
            >
              {actionSubmitting ? "Menyimpan..." : "Simpan Pembayaran"}
            </Button>
          </>
        }
      >
        {actionModal && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-[var(--ink)]">
                {actionModal.house.code} · {actionModal.house.owner}
              </p>
              <p className="text-xs text-[var(--muted)]">
                Periode bawaan:{" "}
                {isRange ? `${rangeFrom} → ${rangeTo}` : singleMonth}
              </p>
            </div>
            <div className="grid gap-4">
              <div className="field-group">
                <label className="field-label" htmlFor="modal-period">
                  Periode
                </label>
                <Input
                  id="modal-period"
                  type="month"
                  value={actionModal.periodMonth}
                  readOnly={!isRange}
                  disabled={!isRange}
                  onChange={(event) =>
                    updateActionAmountForNewPeriod(event.target.value)
                  }
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="modal-date">
                  Tanggal bayar
                </label>
                <DateField
                  id="modal-date"
                  value={actionModal.paidAt}
                  max={todayISO}
                  onChange={(event) =>
                    setActionModal((prev) =>
                      prev ? { ...prev, paidAt: event.target.value } : prev,
                    )
                  }
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="modal-amount">
                  Nominal
                </label>
                <Input
                  id="modal-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  className="tabular-nums"
                  value={actionModal.amount}
                  onChange={(event) =>
                    setActionModal((prev) =>
                      prev ? { ...prev, amount: event.target.value } : prev,
                    )
                  }
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="modal-method">
                  Metode (opsional)
                </label>
                <Input
                  id="modal-method"
                  value={actionModal.method}
                  onChange={(event) =>
                    setActionModal((prev) =>
                      prev ? { ...prev, method: event.target.value } : prev,
                    )
                  }
                  placeholder="Transfer, Tunai, dsb."
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="modal-note">
                  Catatan (opsional)
                </label>
                <Input
                  id="modal-note"
                  value={actionModal.note}
                  onChange={(event) =>
                    setActionModal((prev) =>
                      prev ? { ...prev, note: event.target.value } : prev,
                    )
                  }
                  placeholder="Catatan internal"
                />
              </div>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!undoModal}
        onOpenChange={(open) => {
          if (!open) setUndoModal(null);
        }}
        title="Undo pembayaran terakhir"
        footer={
          <>
            <Button variant="ghost" onClick={() => setUndoModal(null)}>
              Tutup
            </Button>
            <Button
              variant="primaryOutline"
              onClick={() => undoModal && handleUndo(undoModal.kind)}
              disabled={undoSubmitting || isPending}
            >
              {undoSubmitting ? "Memproses..." : "Undo Terakhir"}
            </Button>
          </>
        }
      >
        {undoModal && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-[var(--ink)]">
                {undoModal.house.code} · {undoModal.house.owner}
              </p>
              <p className="text-xs text-[var(--muted)]">
                Pilih periode dan jenis pembayaran yang ingin dibatalkan.
              </p>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="undo-period">
                Periode
              </label>
              <Input
                id="undo-period"
                type="month"
                value={undoModal.periodMonth}
                readOnly={!isRange}
                disabled={!isRange}
                min={rangeFrom}
                max={rangeTo}
                onChange={(event) =>
                  setUndoModal((prev) =>
                    prev ? { ...prev, periodMonth: event.target.value } : prev,
                  )
                }
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={undoModal.kind === "rent" ? "primary" : "ghost"}
                size="sm"
                onClick={() =>
                  setUndoModal((prev) =>
                    prev ? { ...prev, kind: "rent" } : prev,
                  )
                }
              >
                Sewa
              </Button>
              <Button
                variant={undoModal.kind === "water" ? "primary" : "ghost"}
                size="sm"
                onClick={() =>
                  setUndoModal((prev) =>
                    prev ? { ...prev, kind: "water" } : prev,
                  )
                }
              >
                Air
              </Button>
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={!!detailModal}
        onOpenChange={(open) => {
          if (!open) setDetailModal(null);
        }}
        title="Ringkasan detail"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDetailModal(null)}>
              Tutup
            </Button>
          </>
        }
      >
        {detailModal && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-[var(--ink)]">
                {detailModal.house.code} · {detailModal.house.owner}
              </p>
              <p className="text-xs text-[var(--muted)]">
                Menampilkan status per periode dalam rentang terpilih.
              </p>
            </div>
            <DetailBreakdown
              map={statusMaps}
              houseId={detailModal.house.house_id}
              range={{ from: rangeFromISO, to: rangeToISO }}
              mode={mode}
              single={singlePeriodISO}
            />
          </>
        )}
      </Modal>

      <Modal
        open={!!occupancyModal}
        onOpenChange={(open) => {
          if (!open) setOccupancyModal(null);
        }}
        title="Status Hunian"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOccupancyModal(null)}>
              Batal
            </Button>
            <Button
              variant="primary"
              onClick={saveOccupancy}
            >
              Simpan
            </Button>
          </>
        }
      >
        {occupancyModal && (
          <div className="grid gap-4">
            <div className="field-group">
              <label className="field-label" htmlFor="occupancy-period">
                Periode
              </label>
              <Input
                id="occupancy-period"
                type="month"
                value={occupancyModal.periodMonth}
                onChange={(event) =>
                  setOccupancyModal((prev) =>
                    prev
                      ? { ...prev, periodMonth: event.target.value }
                      : prev,
                  )
                }
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="occupancy-status">
                Status
              </label>
              <select
                id="occupancy-status"
                className="select focus-ring"
                value={occupancyModal.status}
                onChange={(event) =>
                  setOccupancyModal((prev) =>
                    prev
                      ? { ...prev, status: event.target.value as "vacant" | "occupied" }
                      : prev,
                  )
                }
              >
                <option value="vacant">Kosong</option>
                <option value="occupied">Terisi</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="occupancy-note">
                Catatan (opsional)
              </label>
              <Input
                id="occupancy-note"
                value={occupancyModal.note}
                onChange={(event) =>
                  setOccupancyModal((prev) =>
                    prev ? { ...prev, note: event.target.value } : prev,
                  )
                }
                placeholder="Mis. renovasi"
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

type RowActionHandlers = {
  onAction: (type: ActionType, row: Row) => void;
  onUndo: (row: Row) => void;
  onDetail: (row: Row) => void;
};

type DashboardRowTableProps = RowActionHandlers & {
  row: Row;
  vacant: boolean;
  showRent: boolean;
  showWater: boolean;
};

const DashboardRowTable = React.memo(function DashboardRowTable({
  row,
  vacant,
  showRent,
  showWater,
  onAction,
  onUndo,
  onDetail,
  onOccupancy,
}: DashboardRowTableProps & { onOccupancy: (row: Row) => void }) {
  return (
    <TableRow className="align-top">
      <TableCell className={cx(stickyCellClass("px-4 py-3 font-semibold"))}>
        {row.code}
      </TableCell>
      <TableCell className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <span>{row.owner}</span>
          {vacant && <Badge variant="warningSoft">Kosong</Badge>}
          {row.is_repair_fund && (
            <Badge variant="warningSoft">Dana Perbaikan</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="px-4 py-3">
        <StatusStack
          bill={row.rent_bill}
          paid={row.rent_paid}
          due={row.rent_due}
        />
      </TableCell>
      <TableCell className="px-4 py-3">
        <StatusStack
          bill={row.water_bill}
          paid={row.water_paid}
          due={row.water_due}
        />
      </TableCell>
      <TableCell className="px-4 py-3 text-right">
        <RowActions
          row={row}
          showRent={showRent}
          showWater={showWater}
          onAction={onAction}
          onUndo={onUndo}
          onDetail={onDetail}
          onOccupancy={onOccupancy}
        />
      </TableCell>
    </TableRow>
  );
});

type MobileRowCardProps = RowActionHandlers & {
  row: Row;
  vacant: boolean;
  showRent: boolean;
  showWater: boolean;
};

const MobileRowCard = React.memo(function MobileRowCard({
  row,
  vacant,
  showRent,
  showWater,
  onAction,
  onUndo,
  onDetail,
  onOccupancy,
}: MobileRowCardProps & { onOccupancy: (row: Row) => void }) {
  return (
    <Card padded={false}>
      <div className="card-pad flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">
              {row.code}
            </p>
            <p className="text-sm text-[var(--muted)]">{row.owner}</p>
            {vacant && (
              <div className="mt-1">
                <Badge variant="warningSoft">Kosong</Badge>
              </div>
            )}
            {row.is_repair_fund && (
              <div className="mt-1">
                <Badge variant="warningSoft">Dana Perbaikan</Badge>
              </div>
            )}
          </div>
          <RowMenu row={row} onUndo={onUndo} onDetail={onDetail} onOccupancy={onOccupancy} />
        </div>
        <div className="grid gap-3">
          <div>
            <p className="text-xs font-medium text-[var(--muted)]">Sewa</p>
            <StatusStack
              bill={row.rent_bill}
              paid={row.rent_paid}
              due={row.rent_due}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--muted)]">Air</p>
            <StatusStack
              bill={row.water_bill}
              paid={row.water_paid}
              due={row.water_due}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {showRent && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => onAction("rent-full", row)}
            >
              Sewa Lunas
            </Button>
          )}
          {showWater && (
            <Button
              size="sm"
              variant="primaryOutline"
              onClick={() => onAction("water-full", row)}
            >
              Air Lunas
            </Button>
          )}
          <PartialMenu
            row={row}
            onAction={onAction}
            showRent={showRent}
            showWater={showWater}
          />
        </div>
      </div>
    </Card>
  );
});

function StatusStack({
  bill,
  paid,
  due,
}: {
  bill: number;
  paid: number;
  due: number;
}) {
  const dueRounded = Number(due.toFixed(0));
  const showBadge = dueRounded <= 0;
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-[var(--muted)]">
        Tagih{" "}
        <span className="tabular-nums text-[var(--ink)]">{idr(bill)}</span>
      </span>
      <span className="text-[var(--muted)]">
        Bayar{" "}
        <span className="tabular-nums font-semibold text-[#047857]">
          {idr(paid)}
        </span>
      </span>
      <span className="text-[var(--muted)]">
        Tunggak{" "}
        {showBadge ? (
          <Badge variant="success">Lunas</Badge>
        ) : (
          <span className="tabular-nums font-semibold text-[#dc2626]">
            {idr(due)}
          </span>
        )}
      </span>
    </div>
  );
}

function TotalsCell({
  label,
  bill,
  paid,
  due,
}: {
  label: string;
  bill: number;
  paid: number;
  due: number;
}) {
  const showBadge = Number(due.toFixed(0)) <= 0;
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-[var(--muted)]">{label}</span>
      <span className="text-[var(--muted)]">
        Tagih{" "}
        <span className="tabular-nums text-[var(--ink)]">{idr(bill)}</span>
      </span>
      <span className="text-[var(--muted)]">
        Bayar{" "}
        <span className="tabular-nums font-semibold text-[#047857]">
          {idr(paid)}
        </span>
      </span>
      <span className="text-[var(--muted)]">
        Tunggak{" "}
        {showBadge ? (
          <Badge variant="success">Lunas</Badge>
        ) : (
          <span className="tabular-nums font-semibold text-[#dc2626]">
            {idr(due)}
          </span>
        )}
      </span>
    </div>
  );
}

function RowActions({
  row,
  showRent,
  showWater,
  onAction,
  onUndo,
  onDetail,
  onOccupancy,
}: {
  row: Row;
  showRent: boolean;
  showWater: boolean;
  onOccupancy: (row: Row) => void;
} & RowActionHandlers) {
  return (
    <div className="flex items-center justify-end gap-2">
      {showRent && (
        <Button
          size="sm"
          variant="primary"
          onClick={() => onAction("rent-full", row)}
        >
          Sewa Lunas
        </Button>
      )}
      {showWater && (
        <Button
          size="sm"
          variant="primaryOutline"
          onClick={() => onAction("water-full", row)}
        >
          Air Lunas
        </Button>
      )}
      <PartialMenu
        row={row}
        showRent={showRent}
        showWater={showWater}
        onAction={onAction}
      />
      <RowMenu row={row} onUndo={onUndo} onDetail={onDetail} onOccupancy={onOccupancy} />
    </div>
  );
}

function PartialMenu({
  row,
  showRent,
  showWater,
  onAction,
}: {
  row: Row;
  showRent: boolean;
  showWater: boolean;
  onAction: (type: ActionType, row: Row) => void;
}) {
  if (!showRent && !showWater) return null;

  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const canPartialRent = showRent;
  const canPartialWater = showWater;

  return (
    <div className="relative" ref={menuRef}>
      <Button
        size="sm"
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        Bayar Sebagian ▾
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-40 rounded-[var(--radius)] border border-[var(--border)] bg-white p-1 shadow-lg">
          {canPartialRent && (
            <button
              type="button"
              className="w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm hover:bg-[#eef2ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              onClick={() => {
                onAction("rent-partial", row);
                setOpen(false);
              }}
            >
              Sewa
            </button>
          )}
          {canPartialWater && (
            <button
              type="button"
              className="w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm hover:bg-[#eef2ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              onClick={() => {
                onAction("water-partial", row);
                setOpen(false);
              }}
            >
              Air
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RowMenu({
  row,
  onUndo,
  onDetail,
  onOccupancy,
}: {
  row: Row;
  onUndo: (row: Row) => void;
  onDetail: (row: Row) => void;
  onOccupancy: (row: Row) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu baris"
        className="btn btn-outline btn-sm px-2"
        onClick={() => setOpen((prev) => !prev)}
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 min-w-[160px] rounded-[var(--radius)] border border-[var(--border)] bg-white p-1 shadow-lg">
          <button
            type="button"
            className="w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm hover:bg-[#eef2ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            onClick={() => {
              onUndo(row);
              setOpen(false);
            }}
          >
            Undo Terakhir
          </button>
          <button
            type="button"
            className="w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm hover:bg-[#eef2ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            onClick={() => {
              onDetail(row);
              setOpen(false);
            }}
          >
            Detail
          </button>
        </div>
      )}
    </div>
  );
}

function DetailBreakdown({
  map,
  houseId,
  range,
  mode,
  single,
}: {
  map: StatusMaps;
  houseId: string;
  range: { from: string; to: string };
  mode: Mode;
  single: string;
}) {
  const rentEntries = React.useMemo(() => {
    const entries = Object.entries(map.rent[houseId] || {});
    return entries
      .filter(([period]) =>
        mode === "single"
          ? period === single
          : period >= range.from && period <= range.to,
      )
      .sort(([a], [b]) => (a > b ? 1 : -1));
  }, [map.rent, houseId, mode, range.from, range.to, single]);

  const waterEntries = React.useMemo(() => {
    const entries = Object.entries(map.water[houseId] || {});
    return entries
      .filter(([period]) =>
        mode === "single"
          ? period === single
          : period >= range.from && period <= range.to,
      )
      .sort(([a], [b]) => (a > b ? 1 : -1));
  }, [map.water, houseId, mode, range.from, range.to, single]);

  if (rentEntries.length === 0 && waterEntries.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Tidak ada data detail untuk rentang yang dipilih.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {rentEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            Sewa per periode
          </h3>
          <ul className="space-y-1 text-sm">
            {rentEntries.map(([period, value]) => (
              <li
                key={period}
                className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] px-3 py-2"
              >
                <div>
                  <p className="font-medium text-[var(--ink)]">
                    {isoToMonth(period)}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Tagih {idr(value.rent_bill)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#047857]">
                    Bayar {idr(value.rent_paid)}
                  </p>
                  {value.rent_due > 0 ? (
                    <p className="text-xs font-semibold text-[#dc2626]">
                      Tunggak {idr(value.rent_due)}
                    </p>
                  ) : (
                    <Badge variant="success">Lunas</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {waterEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            Air per periode
          </h3>
          <ul className="space-y-1 text-sm">
            {waterEntries.map(([period, value]) => (
              <li
                key={period}
                className="flex items-center justify-between rounded-[var(--radius)] border border-[var(--border)] px-3 py-2"
              >
                <div>
                  <p className="font-medium text-[var(--ink)]">
                    {isoToMonth(period)}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Tagih {idr(value.water_bill)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[#047857]">
                    Bayar {idr(value.water_paid)}
                  </p>
                  {value.water_due > 0 ? (
                    <p className="text-xs font-semibold text-[#dc2626]">
                      Tunggak {idr(value.water_due)}
                    </p>
                  ) : (
                    <Badge variant="success">Lunas</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardInner />
    </AuthGate>
  );
}
