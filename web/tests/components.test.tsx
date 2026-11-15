import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { Readiness } from "../src/components/Map";
import { Practice } from "../src/components/Practice";

afterEach(cleanup);

describe("accessible study components", () => {
  it.each([
    [null, false, "Untested"], [39, false, "Weak"], [40, false, "Developing"],
    [69, false, "Developing"], [70, false, "Strong"], [null, true, "Cleared"],
  ] as const)("gives readiness %s a text label and no axe violations", async (value, cleared, label) => {
    const { container } = render(<Readiness value={value} cleared={cleared}/>);
    expect(screen.getByText(label)).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
  });

  it.each(["quiz", "battle"] as const)("renders %s with accessible controls", async mode => {
    const { container } = render(<Practice mode={mode} moduleId="m" concepts={[]} resources={[]}
      findConceptModule={() => undefined} run={() => {}} busy={false} onAttempt={vi.fn()}
      onClear={vi.fn()} onEvidence={vi.fn()} onTrace={vi.fn()}/>);
    expect(screen.getByRole("heading", { name: mode === "quiz" ? "Practice quiz" : "Boss battle" })).toBeTruthy();
    expect((await axe(container)).violations).toEqual([]);
  });
});
