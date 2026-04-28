type Row = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  country: string | null;
  createdAt: Date;
  closedAt: Date | null;
  durationSec: number | null;
};

function fmt(d: Date) {
  return new Date(d).toLocaleString();
}

function fmtDuration(sec: number | null) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h ${r}m`;
}

export function LoginHistoryTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">No login history yet.</p>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-1">When</th>
            <th className="px-3 py-1">Duration</th>
            <th className="px-3 py-1">IP</th>
            <th className="px-3 py-1">User-Agent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2 whitespace-nowrap">{fmt(r.createdAt)}</td>
              <td className="px-3 py-2">{fmtDuration(r.durationSec)}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {r.ip ?? "—"}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate">
                {r.userAgent ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
