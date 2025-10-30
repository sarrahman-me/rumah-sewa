"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase";

export default function AuthDebugPage() {
  const [sessionInfo, setSessionInfo] = React.useState<any>(null);
  const [cookiesString, setCookiesString] = React.useState("");

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSessionInfo({
        hasSession: Boolean(data.session),
        accessTokenLength: data.session?.access_token?.length ?? 0,
        providerToken: data.session?.provider_token ?? null,
        expiresAt: data.session?.expires_at ?? null,
      });
      setCookiesString(document.cookie);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <h1 className="text-xl font-semibold text-blue-700">
        Auth Debug (Client)
      </h1>
      <pre className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-sm text-slate-700">
        {JSON.stringify(sessionInfo, null, 2)}
      </pre>
      <div>
        <h2 className="text-sm font-semibold text-blue-600">document.cookie</h2>
        <pre className="mt-2 rounded-lg border border-blue-200 bg-white p-3 text-xs text-slate-600">
          {cookiesString || "(empty)"}
        </pre>
      </div>
    </div>
  );
}
