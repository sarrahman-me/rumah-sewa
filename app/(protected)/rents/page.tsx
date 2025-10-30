"use client";
import * as React from "react";
import { AuthGate } from "@/components/AuthGate";
import { supabase } from "@/lib/supabase";
import { currentPeriodISO } from "@/lib/period";
import { idr } from "@/lib/format";

type RentRow = { id: string; house_id: string; code: string; amount: number; };

function nextPeriodISO(yyyyMm01: string): string {
  const d = new Date(yyyyMm01);
  const nd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const yyyy = nd.getFullYear();
  const mm = String(nd.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function RentsPageInner() {
  const [period,setPeriod] = React.useState(currentPeriodISO());
  const [rows,setRows] = React.useState<RentRow[]>([]);
  const [msg,setMsg] = React.useState<string|null>(null);
  const np = React.useMemo(()=>nextPeriodISO(period), [period]);

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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Rents</h1>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-neutral-600">Periode</label>
          <input className="rounded-lg border px-2 py-1 text-sm" value={period} onChange={e=>setPeriod(e.target.value)} />
          <button className="rounded-lg border px-3 py-1 text-sm" onClick={copyToNext}>Copy ke {np}</button>
        </div>
      </div>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      <div className="rounded-xl border bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr><th className="px-3 py-2 text-left">Rumah</th><th className="px-3 py-2 text-left">Nominal</th></tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.house_id} className="border-t">
                  <td className="px-3 py-2">{r.code}</td>
                  <td className="px-3 py-2">{idr(r.amount)}</td>
                </tr>
              ))}
              {rows.length===0 && (
                <tr><td colSpan={2} className="px-3 py-6 text-center text-neutral-500">Tidak ada tarif untuk periode ini.</td></tr>
              )}
            </tbody>
          </table>
      </div>
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
