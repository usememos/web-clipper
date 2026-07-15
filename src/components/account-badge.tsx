import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type AccountIdentity = { displayName: string; imageUrl?: string; email?: string };

export function AccountBadge({ identity, compact = false }: { identity: AccountIdentity; compact?: boolean }) {
  const fallback = identity.displayName.trim().charAt(0).toUpperCase() || "A";
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Avatar size={compact ? "sm" : "lg"}>
        {identity.imageUrl ? <AvatarImage src={identity.imageUrl} alt="" /> : null}
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">{identity.displayName}</p>
        {!compact && identity.email ? <p className="truncate text-sm text-muted-foreground">{identity.email}</p> : null}
      </div>
    </div>
  );
}
