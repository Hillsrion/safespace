import { vi, describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { DEFAULT_CLASS, Label } from "~/components/ui/label"

describe("Label", () => {
  it("renders with children", () => {
    render(<Label>Test Label</Label>)
    expect(screen.getByText("Test Label")).toBeInTheDocument()
  })

  it("applies default classes", () => {
    render(<Label>Test</Label>)
    const label = screen.getByText("Test")
    expect(label).toHaveClass(DEFAULT_CLASS)
  })

  it("merges custom className", () => {
    render(<Label className="custom-class">Test</Label>)
    const label = screen.getByText("Test")
    expect(label).toHaveClass("custom-class")
  })

  it("forwards ref to the label element", () => {
    const ref = { current: null }
    render(<Label ref={ref}>Test</Label>)
    expect(ref.current).toBeInstanceOf(HTMLLabelElement)
  })

  it("passes through additional props", () => {
    render(
      <div>
        <Label htmlFor="input-id" data-testid="test-label">Test</Label>
        <input id="input-id" data-testid="test-input" />
      </div>
    )
    const input = screen.getByTestId("test-input")
    const label = screen.getByTestId("test-label")
    expect(label).toHaveAttribute("for", "input-id")
    expect(input).toHaveAttribute("id", "input-id")
    // Verify the label is properly associated with the input via htmlFor
    expect(label.getAttribute("for")).toBe(input.getAttribute("id"))
  })
})
