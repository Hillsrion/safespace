import { describe, expect, it } from "vitest";

import { prepareApiRequestBody } from "./use-api";

describe("prepareApiRequestBody", () => {
  it("preserves FormData and lets the browser set its multipart boundary", () => {
    const formData = new FormData();
    formData.set("_action", "hide");

    const prepared = prepareApiRequestBody(formData, {
      "Content-Type": "application/json",
      Accept: "application/json",
    });

    expect(prepared.body).toBe(formData);
    expect(prepared.headers).toEqual({ Accept: "application/json" });
  });

  it("serializes plain objects as JSON", () => {
    const prepared = prepareApiRequestBody(
      { description: "signalement" },
      { Accept: "application/json" }
    );

    expect(prepared.body).toBe('{"description":"signalement"}');
    expect(prepared.headers["Content-Type"]).toBe("application/json");
  });
});
