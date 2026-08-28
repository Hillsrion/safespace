import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModerationTemplatePicker } from "./moderation-template-picker";
import { MODERATION_TEMPLATES } from "../lib/moderation-templates";
import { appealDecisionSchema, createDisciplineSchema } from "../lib/moderation-governance";
import { sensitiveReviewDecisionSchema } from "../lib/sensitive-review";

describe("moderation communication templates", () => {
  it("adds an editable draft without replacing existing text or automatically deciding", () => {
    const onChange = vi.fn();
    render(<ModerationTemplatePicker category="appeal" value="Mon analyse existante" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter au brouillon" }));
    expect(onChange).toHaveBeenCalledWith(`Mon analyse existante\n\n${MODERATION_TEMPLATES.appeal[0].text}`);
  });
  it("does not truncate a draft to make room for a template", () => {
    render(<ModerationTemplatePicker category="discipline" value={"a".repeat(1990)} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Ajouter au brouillon" })).toBeDisabled();
  });
  it("rejects unfilled template fields at the API validation boundary", () => {
    expect(appealDecisionSchema.safeParse({ status: "upheld", decisionNote: MODERATION_TEMPLATES.appeal[0].text }).success).toBe(false);
    expect(createDisciplineSchema.safeParse({ userId: "00000000-0000-4000-8000-000000000001", reason: MODERATION_TEMPLATES.discipline[0].text }).success).toBe(false);
    expect(sensitiveReviewDecisionSchema.safeParse({ revision: 1, stage: 1, outcome: "approve", note: MODERATION_TEMPLATES.review[0].text }).success).toBe(false);
    expect(appealDecisionSchema.safeParse({ status: "upheld", decisionNote: "Éléments réexaminés et justification rédigée par la personne responsable." }).success).toBe(true);
  });
});
