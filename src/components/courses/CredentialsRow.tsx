import { Award, Lock as LockIcon, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

type CredentialView = {
  id: string;
  kind: string; // WELCOME | COMPLETION
  title: string;
  description: string | null;
  imageUrl: string | null;
  earned: boolean;
  earnedAt: Date | string | null;
};

/**
 * CredentialsRow — small cards showing the welcome + completion credentials
 * for a course, with an "earned" state per viewer.
 */
export function CredentialsRow({
  credentials,
}: {
  credentials: CredentialView[];
}) {
  if (credentials.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Trophy className="h-4 w-4 text-primary" />
        Credentials
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {credentials.map((c) => (
          <CredentialCard key={c.id} credential={c} />
        ))}
      </div>
    </section>
  );
}

function CredentialCard({ credential: c }: { credential: CredentialView }) {
  const Icon = c.kind === "WELCOME" ? Award : Trophy;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 transition-colors",
        c.earned
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card opacity-70",
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
          c.earned
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {c.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.imageUrl}
            alt=""
            className="h-full w-full rounded-full object-cover"
          />
        ) : c.earned ? (
          <Icon className="h-6 w-6" />
        ) : (
          <LockIcon className="h-5 w-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{c.title}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {c.description ?? (c.kind === "WELCOME" ? "Awarded on enrollment" : "Awarded on course completion")}
        </p>
        {c.earned && c.earnedAt && (
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
            ✓ Earned {new Date(c.earnedAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}
