import { Avatar } from "@usememos/ui";

export type AccountIdentity = { displayName: string; imageUrl?: string; email?: string };

export function AccountBadge({ identity, compact = false }: { identity: AccountIdentity; compact?: boolean }) {
  const fallback = identity.displayName.trim().charAt(0).toUpperCase() || "A";
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Avatar.Root size={compact ? "sm" : "lg"}>
        {identity.imageUrl ? <Avatar.Image src={identity.imageUrl} alt="" /> : null}
        <Avatar.Fallback>{fallback}</Avatar.Fallback>
      </Avatar.Root>
      <div className="min-w-0">
        <p className="truncate font-medium">{identity.displayName}</p>
        {!compact && identity.email ? <p className="truncate text-sm text-ink-muted">{identity.email}</p> : null}
      </div>
    </div>
  );
}
