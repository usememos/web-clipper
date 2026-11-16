import { Field, Fieldset, Radio, RadioGroup } from "@usememos/ui";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { type QuickSaveVisibility, readQuickSaveVisibility, writeQuickSaveVisibility } from "@/lib/quick-save-settings";

export function QuickSaveSettings() {
  const [visibility, setVisibility] = useState<QuickSaveVisibility>("PRIVATE");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"optionsQuickSaveReadError" | "optionsQuickSaveWriteError" | null>(null);

  useEffect(() => {
    let active = true;
    void readQuickSaveVisibility()
      .then((stored) => {
        if (active) {
          setVisibility(stored);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) setError("optionsQuickSaveReadError");
      });
    return () => {
      active = false;
    };
  }, []);

  const saveVisibility = async (value: unknown) => {
    if (value !== "PRIVATE" && value !== "PROTECTED" && value !== "PUBLIC") return;
    setSaving(true);
    setError(null);
    try {
      await writeQuickSaveVisibility(value);
      setVisibility(value);
    } catch {
      setError("optionsQuickSaveWriteError");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Field.Root name="quick-save-visibility">
      <Fieldset.Root
        render={
          <RadioGroup
            value={visibility}
            onValueChange={(value) => void saveVisibility(value)}
            disabled={!loaded || saving}
            aria-busy={(!loaded && !error) || saving}
          />
        }
      >
        <Fieldset.Legend>{t("optionsQuickSaveVisibility")}</Fieldset.Legend>
        <Field.Description>{t("optionsQuickSaveDescription")}</Field.Description>
        <Field.Item>
          <Field.Label>
            <Radio value="PRIVATE" /> {t("commonPrivate")}
          </Field.Label>
        </Field.Item>
        <Field.Item>
          <Field.Label>
            <Radio value="PROTECTED" /> {t("commonProtected")}
          </Field.Label>
        </Field.Item>
        <Field.Item>
          <Field.Label>
            <Radio value="PUBLIC" /> {t("commonPublic")}
          </Field.Label>
        </Field.Item>
      </Fieldset.Root>
      {error ? (
        <p role="alert" className="mu-caption mt-2 text-mu-danger">
          {t(error)}
        </p>
      ) : null}
    </Field.Root>
  );
}
