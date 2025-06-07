import { render, screen } from "@testing-library/react"
import { Label } from "../ui/label"

describe("Label", () => {
  it("renders with children", () => {
    render(<Label>Test Label</Label>)
    expect(screen.getByText("Test Label")).toBeInTheDocument()
  })

  it("applies default classes", () => {
    render(<Label>Test</Label>)
    const label = screen.getByText("Test")
    expect(label).toHaveClass(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
    )
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
        <Label htmlFor="input-id">Test</Label>
        <input id="input-id" />
      </div>
    )
    const input = screen.getByRole("textbox")
    const label = screen.getByText("Test")
    expect(label).toHaveAttribute("for", "input-id")
    expect(label).toHaveAttribute("id")
    expect(input).toHaveAttribute("aria-labelledby", label.getAttribute("id"))
  })
})
