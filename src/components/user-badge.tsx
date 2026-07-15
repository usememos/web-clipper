import { useAuth } from "@/auth/auth-provider";
import { AccountBadge } from "@/components/account-badge";

/** Shows the signed-in Clerk user's avatar + name, mirroring dotcom's dashboard header. */
export function UserBadge({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <AccountBadge
      compact={compact}
      identity={{
        displayName: user.displayName,
        ...(user.imageUrl ? { imageUrl: user.imageUrl } : {}),
      }}
    />
  );
}
