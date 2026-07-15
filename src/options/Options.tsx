import { CheckIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect } from "react";
import { openSignIn } from "@/auth/actions";
import { useAuth } from "@/auth/auth-provider";
import { AppBrand } from "@/components/app-brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { UserBadge } from "@/components/user-badge";
import { WEB_APP_URL } from "@/config/env";
import { useMemosConnection } from "@/hooks/use-memos-connection";
import { ErrorNotice, StepRow } from "./connection-controls";

function OptionsHeader({ sub, instanceUrl }: { sub: string; instanceUrl?: string }) {
  return (
    <div className="mb-8 flex items-center justify-between gap-4">
      <AppBrand size="md" sub={sub} />
      {instanceUrl ? (
        <Button variant="ghost" size="sm" render={<a href={instanceUrl} target="_blank" rel="noreferrer" />}>
          Open Memos
          <ExternalLinkIcon />
        </Button>
      ) : null}
    </div>
  );
}

function SignedOutSteps() {
  return (
    <div>
      <OptionsHeader sub="Set up your clipper" />

      <StepRow n={1} state="active" title="Sign in">
        <Card size="sm">
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Sign in with your usememos.com account. You'll come right back here.</p>
            <Button onClick={openSignIn}>Sign in with usememos.com</Button>
          </CardContent>
        </Card>
      </StepRow>

      {/* Locked steps stay quiet: the dashed mark and muted title already say "not yet". */}
      <StepRow n={2} state="locked" title="Connect your Memos instance" />
      <StepRow n={3} state="locked" title="Shape your clip template" last />
    </div>
  );
}

function SetupSteps() {
  const { signOut, reload } = useAuth();
  const { credentials, version, status, template, reverify } = useMemosConnection();
  const ready = status === "ready";
  const checking = status === "checking";
  const unsupported = status === "unsupported";
  const host = credentials ? new URL(credentials.instanceUrl).host : "";

  // Refresh the cached instance version on load so a server upgrade clears a stale "unsupported" gate.
  useEffect(() => {
    void reverify();
  }, [reverify]);

  return (
    <div>
      <OptionsHeader sub={ready ? `Connected · clipping to ${host}` : "Set up your clipper"} instanceUrl={credentials?.instanceUrl} />

      <StepRow n={1} state="done" title="Signed in">
        <div className="flex items-center justify-between gap-3">
          <UserBadge compact />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </StepRow>

      <StepRow
        n={2}
        state={ready ? "done" : "active"}
        title={ready ? "Instance connected" : "Connect your Memos instance"}
        summary={
          ready ? (
            <>
              <span className="text-fact">{`${host} · ${version}`}</span>
              <Badge variant="success">
                <CheckIcon className="size-3" />
                Supported
              </Badge>
            </>
          ) : undefined
        }
      >
        {checking ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            <span>
              Checking <span className="text-fact">{host}</span> and its version…
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {unsupported ? <ErrorNotice kind="unsupported-version" /> : null}
            <p className="text-sm text-muted-foreground">
              {ready
                ? "Connection details are managed on usememos.com and read here through OAuth."
                : "Connect a Memos instance on usememos.com, then refresh this page."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={ready ? "outline" : "default"}
                render={<a href={`${WEB_APP_URL}/dashboard`} target="_blank" rel="noreferrer" />}
              >
                {ready ? "Manage connection" : "Connect on usememos.com"}
                <ExternalLinkIcon />
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  void reload();
                  void reverify();
                }}
              >
                Refresh
              </Button>
            </div>
          </div>
        )}
      </StepRow>

      <StepRow n={3} state={ready ? "done" : "locked"} title="Clip template" last>
        {ready ? (
          <p className="text-sm text-muted-foreground">
            {template ? "Using the template saved with your account settings." : "Using the extension’s default clipping template."}
          </p>
        ) : null}
      </StepRow>
    </div>
  );
}

export function Options() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return (
      <div className="flex min-h-72 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">{isSignedIn ? <SetupSteps /> : <SignedOutSteps />}</div>;
}
