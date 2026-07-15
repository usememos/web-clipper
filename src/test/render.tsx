import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

/** Render plus a pre-bound userEvent instance — the common per-test setup. */
export function renderWithUser(ui: ReactElement) {
  return { user: userEvent.setup(), ...render(ui) };
}

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
