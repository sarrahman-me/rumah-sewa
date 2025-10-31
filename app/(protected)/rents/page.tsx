"use client";
import * as React from "react";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/lib/supabase";
import { currentPeriodISO, isoToMonth, monthToISOFirst } from "@/lib/period";
import { idr } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";

type RentRow = { id: string; house_id: string; code: string; amount: number; };

function nextPeriodISO(yyyyMm01: string): string {
  const d = new Date(yyyyMm01);
  const nd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const yyyy = nd.getFullYear();
  const mm = String(nd.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function RentsPageInner() {
  const [period, setPeriod] = React.useState(currentPeriodISO());
  const [rows, setRows] = React.useState<RentRow[]>([]);
  const [msg, setMsg] = React.useState<string | null>(null);
  const np = React.useMemo(() => nextPeriodISO(period), [period]);
  const periodMonth = isoToMonth(period);
  const nextPeriodMonth = isoToMonth(np);

  async function load() {
    const { data, error } = await supabase
      .from("rents")
      .select("id, amount, house_id, houses:house_id ( code )")
      .eq("period", period)
      .order("house_id");
    if (error) { setMsg(error.message); return; }
    const mapped = (data||[]).map((r:any)=>({ id:r.id, house_id:r.house_id, code:r.houses?.code ?? "-", amount:r.amount })) as RentRow[];
    setRows(mapped);
    setMsg(null);
  }

  React.useEffect(()=>{ load(); }, [period]);

  async function copyToNext() {
    setMsg(null);
    const { error } = await supabase.rpc("copy_rents_to_next", { p_current: period });
    if (error) {
      setMsg(error.message);
    } else {
      setMsg(`Tarif disalin ke periode ${np}.`);
    }
  }

  return (
    <div className="page-stack">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Sewa</h1>
          <p className="subtle">
            Tarif sewa rumah untuk periode {periodMonth || "-"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="field-label" htmlFor="rents-period">
            Periode
          </label>
          <Input
            id="rents-period"
            type="month"
            value={periodMonth}
            onChange={(e) => setPeriod(monthToISOFirst(e.target.value))}
          />
          <Button size="sm" variant="ghost" onClick={copyToNext}>
            Salin ke {nextPeriodMonth || "-"}
          </Button>
        </div>
      </div>
      {msg && (
        <div className="card card-pad text-sm text-[var(--primary)]">
          {msg}
        </div>
      )}
      <TableContainer>
        <Table className="text-sm">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Rumah</TableHeaderCell>
              <TableHeaderCell className="text-right">Nominal</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.house_id}>
                <TableCell className="font-medium text-[var(--ink)]">
                  {r.code}
                </TableCell>
                <TableCell className="text-right font-semibold text-[var(--primary)]">
                  {idr(r.amount)}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={2}
                  className="py-6 text-center text-[var(--muted)]"
                >
                  Tidak ada tarif untuk periode ini.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
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
