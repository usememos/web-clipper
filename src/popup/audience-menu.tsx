import { Button, Menu } from "@usememos/ui";
import { AstroidIcon, CheckIcon, ChevronDownIcon, EarthIcon, LockIcon, PlusIcon, UserLockIcon, UsersRoundIcon, XIcon } from "lucide-react";
import type { SaveErrorKind } from "@/lib/errors";
import { t } from "@/lib/i18n";
import type { SpaceSummary, Visibility } from "@/lib/memos-client";
import { cn } from "@/lib/utils";

function SpaceMark({ space }: { space?: SpaceSummary }) {
  return (
    <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center mu-body rounded-mu-sm bg-mu-well">
      {space?.icon?.emoji || <AstroidIcon className="mu-icon mu-s-sm text-mu-ink-muted" />}
    </span>
  );
}

type Props = {
  visibility: Visibility;
  space?: string;
  onVisibilityChange: (value: Visibility) => void;
  onSpaceChange: (space?: string) => void;
  spaces: { status: "loading" | "ready" | "error"; items: SpaceSummary[]; errorKind?: SaveErrorKind };
  supportsSpaces: boolean;
  onRetry: () => void;
  onOpenSettings: () => void;
  disabled?: boolean;
};

export function AudienceMenu({
  visibility,
  space,
  onVisibilityChange,
  onSpaceChange,
  spaces,
  supportsSpaces,
  onRetry,
  onOpenSettings,
  disabled,
}: Props) {
  const options = {
    PRIVATE: { label: t("commonPrivate"), description: t("popupPrivateDescription"), icon: LockIcon },
    PROTECTED: { label: t("commonProtected"), description: t("popupProtectedDescription"), icon: UsersRoundIcon },
    PUBLIC: { label: t("commonPublic"), description: t("popupPublicDescription"), icon: EarthIcon },
    SPACE: { label: t("commonSpaceVisibility"), description: t("popupSpaceDescription"), icon: UserLockIcon },
  };
  const selected = options[visibility];
  const SelectedIcon = selected.icon;
  const titleCounts = new Map<string, number>();
  for (const item of spaces.items) titleCounts.set(item.title, (titleCounts.get(item.title) ?? 0) + 1);
  const label = (item: SpaceSummary) => ((titleCounts.get(item.title) ?? 0) > 1 ? `${item.title} (${item.name.slice(7)})` : item.title);
  const selectedSpace = spaces.items.find((item) => item.name === space);
  const destination = selectedSpace ? label(selectedSpace) : space?.slice(7);
  const summary = destination ? t("popupAudienceSummary", [destination, selected.label]) : selected.label;
  const choices = space && !selectedSpace ? [{ name: space, title: destination ?? space }, ...spaces.items] : spaces.items;
  const showSpace = supportsSpaces && (Boolean(space) || spaces.status !== "ready" || spaces.items.length > 0);
  const values: Visibility[] = ["PRIVATE", ...(supportsSpaces && space ? ["SPACE" as const] : []), "PROTECTED", "PUBLIC"];
  const tokenRejected = spaces.errorKind === "unauthorized";

  return (
    <Menu.Root>
      <Menu.Trigger
        render={<Button className="min-w-0 max-w-52 shrink justify-start" disabled={disabled} />}
        title={summary}
        aria-label={t("popupAudienceLabel", [t("popupVisibility"), summary])}
      >
        {/* Button puts children in one label span; this keeps them on one line. */}
        <span className="flex min-w-0 items-center gap-1">
          {destination && (
            <>
              <SpaceMark space={selectedSpace} />
              <span className="min-w-0 truncate">{destination}</span>
              <span aria-hidden="true" className="text-mu-ink-muted">
                ·
              </span>
            </>
          )}
          <SelectedIcon aria-hidden="true" className="mu-icon text-mu-ink-muted" />
          <span className="shrink-0">{selected.label}</span>
          <ChevronDownIcon aria-hidden="true" className="mu-icon mu-s-sm text-mu-ink-muted" />
        </span>
      </Menu.Trigger>
      {/* Intrinsic width: descriptions stay on one line and wrap only when the popup window is narrower. */}
      <Menu.Popup side="top" align="start" className="w-max max-w-(--available-width)" aria-label={t("popupVisibility")}>
        <Menu.RadioGroup value={visibility} onValueChange={(value) => onVisibilityChange(value as Visibility)}>
          {values.map((value) => {
            const option = options[value];
            const Icon = option.icon;
            return (
              <Menu.RadioItem
                key={value}
                value={value}
                closeOnClick
                label={option.label}
                icon={<Icon />}
                className="h-auto items-start py-1 whitespace-normal [&>svg]:mt-(--mu-inset)"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="mu-label break-words">{option.label}</span>
                  <span className="mu-caption text-pretty text-mu-ink-muted">{option.description}</span>
                </span>
              </Menu.RadioItem>
            );
          })}
        </Menu.RadioGroup>
        {showSpace && (
          <>
            <Menu.Separator />
            <Menu.SubmenuRoot>
              <Menu.SubmenuTrigger label={destination ?? t("popupAddToSpace")}>
                <span className="flex min-w-0 items-center gap-2">
                  {space ? (
                    <SpaceMark space={selectedSpace} />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex size-5 shrink-0 items-center justify-center rounded-mu-sm border border-dashed border-mu-ink-muted/50"
                    >
                      <PlusIcon className="mu-icon mu-s-sm text-mu-ink-muted" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-mu-ink-muted" title={destination}>
                    {destination ?? t("popupAddToSpace")}
                  </span>
                </span>
              </Menu.SubmenuTrigger>
              <Menu.Popup
                side="inline-end"
                align="start"
                // The 380px popup rarely fits a second column beside a content-sized menu; sliding the
                // submenu over the parent's edge keeps it at its row instead of dropping it on top of the items.
                collisionAvoidance={{ side: "shift", align: "shift" }}
                className="w-44"
                aria-label={t("popupChooseSpace")}
              >
                {choices.map((item) => {
                  const isSelected = item.name === space;
                  const name = label(item);
                  return (
                    <Menu.Item
                      key={item.name}
                      className="group"
                      label={name}
                      title={name}
                      aria-label={isSelected ? t("popupRemoveFromSpace", name) : name}
                      onClick={() => onSpaceChange(isSelected ? undefined : item.name)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <SpaceMark space={item} />
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                        {isSelected && (
                          <span aria-hidden="true" className="mu-s-sm shrink-0">
                            <CheckIcon className="mu-icon group-data-highlighted:hidden pointer-coarse:hidden" />
                            <XIcon className="mu-icon hidden group-data-highlighted:block pointer-coarse:block" />
                          </span>
                        )}
                      </span>
                    </Menu.Item>
                  );
                })}
                {spaces.status === "loading" && <Menu.Item disabled>{t("popupSpacesLoading")}</Menu.Item>}
                {spaces.status === "error" && (
                  <Menu.Item
                    className={tokenRejected ? "h-auto py-1" : undefined}
                    closeOnClick={tokenRejected}
                    onClick={tokenRejected ? onOpenSettings : onRetry}
                  >
                    <span className={cn("flex min-w-0 gap-2", tokenRejected ? "flex-col" : "items-center")}>
                      <span className="flex-1 text-mu-danger">{t(tokenRejected ? "errorUnauthorizedTitle" : "popupSpacesLoadError")}</span>
                      <span className="text-mu-ink-muted">{t(tokenRejected ? "commonOpenSettings" : "popupRetry")}</span>
                    </span>
                  </Menu.Item>
                )}
              </Menu.Popup>
            </Menu.SubmenuRoot>
          </>
        )}
      </Menu.Popup>
    </Menu.Root>
  );
}
