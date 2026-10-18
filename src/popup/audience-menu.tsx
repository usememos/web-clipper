import { Menu } from "@base-ui/react/menu";
import {
  AstroidIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EarthIcon,
  LockIcon,
  PlusIcon,
  UserLockIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import type { SaveErrorKind } from "@/lib/errors";
import { t } from "@/lib/i18n";
import type { SpaceSummary, Visibility } from "@/lib/memos-client";
import { cn } from "@/lib/utils";

const ITEM =
  "flex min-w-0 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50";
const POPUP =
  "max-h-(--available-height) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none";

function SpaceMark({ space }: { space?: SpaceSummary }) {
  return (
    <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-muted text-sm">
      {space?.icon?.emoji || <AstroidIcon className="size-3.5 text-muted-foreground" strokeWidth={1.8} />}
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

function MenuPopup({ className, ...props }: ComponentProps<typeof Menu.Popup>) {
  return <Menu.Popup className={cn(POPUP, className)} {...props} />;
}

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
        render={
          <Button
            variant="outline"
            className="min-w-0 max-w-52 shrink justify-start gap-1.5 bg-muted/60 px-2 hover:bg-muted"
            disabled={disabled}
          />
        }
        title={summary}
        aria-label={t("popupAudienceLabel", [t("popupVisibility"), summary])}
      >
        {destination && (
          <>
            <SpaceMark space={selectedSpace} />
            <span className="min-w-0 truncate">{destination}</span>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
          </>
        )}
        <SelectedIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="shrink-0">{selected.label}</span>
        <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" sideOffset={4} align="start" collisionPadding={8} className="z-50">
          {/* Intrinsic width: descriptions stay on one line and wrap only when the popup window is narrower. */}
          <MenuPopup className="w-max min-w-44 max-w-(--available-width)" aria-label={t("popupVisibility")}>
            <Menu.RadioGroup value={visibility} onValueChange={(value) => onVisibilityChange(value as Visibility)}>
              {values.map((value) => {
                const option = options[value];
                const Icon = option.icon;
                return (
                  <Menu.RadioItem key={value} value={value} closeOnClick label={option.label} className={`${ITEM} items-start`}>
                    <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="break-words font-medium leading-4">{option.label}</span>
                      <span className="text-pretty text-[11px] leading-4 text-muted-foreground">{option.description}</span>
                    </span>
                    <span aria-hidden="true" className="size-4 shrink-0">
                      <Menu.RadioItemIndicator>
                        <CheckIcon className="size-4 text-muted-foreground" />
                      </Menu.RadioItemIndicator>
                    </span>
                  </Menu.RadioItem>
                );
              })}
            </Menu.RadioGroup>
            {showSpace && (
              <>
                <Menu.Separator className="-mx-1 my-1 h-px bg-border" />
                <Menu.SubmenuRoot>
                  <Menu.SubmenuTrigger className={ITEM} label={destination ?? t("popupAddToSpace")}>
                    {space ? (
                      <SpaceMark space={selectedSpace} />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex size-5 shrink-0 items-center justify-center rounded-[5px] border border-dashed border-muted-foreground/50"
                      >
                        <PlusIcon className="size-3.5 text-muted-foreground" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={destination}>
                      {destination ?? t("popupAddToSpace")}
                    </span>
                    <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground rtl:rotate-180" />
                  </Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner
                      side="inline-end"
                      sideOffset={4}
                      align="start"
                      collisionPadding={8}
                      // The 380px popup rarely fits a second column beside a content-sized menu; sliding the
                      // submenu over the parent's edge keeps it at its row instead of dropping it on top of the items.
                      collisionAvoidance={{ side: "shift", align: "shift" }}
                      className="z-50"
                    >
                      <MenuPopup className="w-44" aria-label={t("popupChooseSpace")}>
                        {choices.map((item) => {
                          const isSelected = item.name === space;
                          const name = label(item);
                          return (
                            <Menu.Item
                              key={item.name}
                              className={`${ITEM} group`}
                              label={name}
                              title={name}
                              aria-label={isSelected ? t("popupRemoveFromSpace", name) : name}
                              onClick={() => onSpaceChange(isSelected ? undefined : item.name)}
                            >
                              <SpaceMark space={item} />
                              <span className="min-w-0 flex-1 truncate">{name}</span>
                              {isSelected && (
                                <span aria-hidden="true" className="size-3.5 shrink-0">
                                  <CheckIcon className="size-3.5 group-data-highlighted:hidden pointer-coarse:hidden" />
                                  <XIcon className="hidden size-3.5 group-data-highlighted:block pointer-coarse:block" />
                                </span>
                              )}
                            </Menu.Item>
                          );
                        })}
                        {spaces.status === "loading" && (
                          <Menu.Item disabled className={ITEM}>
                            {t("popupSpacesLoading")}
                          </Menu.Item>
                        )}
                        {spaces.status === "error" && (
                          <Menu.Item
                            className={cn(ITEM, tokenRejected && "flex-col items-start")}
                            closeOnClick={tokenRejected}
                            onClick={tokenRejected ? onOpenSettings : onRetry}
                          >
                            <span className="flex-1 text-destructive">
                              {t(tokenRejected ? "errorUnauthorizedTitle" : "popupSpacesLoadError")}
                            </span>
                            <span className="text-muted-foreground">{t(tokenRejected ? "commonOpenSettings" : "popupRetry")}</span>
                          </Menu.Item>
                        )}
                      </MenuPopup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.SubmenuRoot>
              </>
            )}
          </MenuPopup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
