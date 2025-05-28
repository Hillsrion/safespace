import { render, screen, act } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import React from "react";
import { expect, describe, it, vi, beforeEach, afterEach } from "vitest";

import { Toaster } from "~/components/ui/toaster";
import { useToast, toast as globalToast } from "./use-toast"; // Assuming globalToast might be used or can be tested too
import type { ToastVariant } from "./use-toast";

// Mock setTimeout and clearTimeout
vi.useFakeTimers();

const TestComponent: React.FC<{
  toastVariant?: ToastVariant;
  toastTitle?: string;
  toastDescription?: string;
}> = ({
  toastVariant,
  toastTitle = "Test Title",
  toastDescription = "Test Description",
}) => {
  const { toast } = useToast();

  const showToast = () => {
    toast({
      title: toastTitle,
      description: toastDescription,
      variant: toastVariant,
    });
  };

  return <button onClick={showToast}>Show Toast</button>;
};

// A component to test the global toast instance if needed
const GlobalToastTestComponent: React.FC<{
  toastVariant?: ToastVariant;
  toastTitle?: string;
  toastDescription?: string;
}> = ({
  toastVariant,
  toastTitle = "Global Test Title",
  toastDescription = "Global Test Description",
}) => {
  const showGlobalToast = () => {
    globalToast({
      title: toastTitle,
      description: toastDescription,
      variant: toastVariant,
    });
  };

  return <button onClick={showGlobalToast}>Show Global Toast</button>;
};


describe("useToast Hook and Toaster", () => {
  afterEach(() => {
    // Clear all toasts by advancing timers past TOAST_REMOVE_DELAY
    // This ensures no toasts bleed into other tests
    act(() => {
      vi.runAllTimers();
    });
  });

  const variantsToTest: Array<{ variant?: ToastVariant; expectedClasses: string[] }> = [
    {
      variant: undefined, // Default
      expectedClasses: ["border", "bg-background", "text-foreground"],
    },
    {
      variant: "destructive",
      expectedClasses: [
        "border-red-500",
        "bg-red-100",
        "text-red-700",
        "dark:border-red-700",
        "dark:bg-red-900",
        "dark:text-red-200",
      ],
    },
    {
      variant: "success",
      expectedClasses: [
        "border-green-500",
        "bg-green-100",
        "text-green-700",
        "dark:border-green-700",
        "dark:bg-green-900",
        "dark:text-green-200",
      ],
    },
    {
      variant: "warning",
      expectedClasses: [
        "border-yellow-500",
        "bg-yellow-100",
        "text-yellow-700",
        "dark:border-yellow-700",
        "dark:bg-yellow-900",
        "dark:text-yellow-200",
      ],
    },
    {
      variant: "info",
      expectedClasses: [
        "border-blue-500",
        "bg-blue-100",
        "text-blue-700",
        "dark:border-blue-700",
        "dark:bg-blue-900",
        "dark:text-blue-200",
      ],
    },
  ];

  variantsToTest.forEach(({ variant, expectedClasses }) => {
    it(`should display a toast with ${
      variant || "default"
    } variant classes using useToast`, async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const title = `Test ${variant || "Default"} Toast`;
      render(
        <>
          <Toaster />
          <TestComponent toastVariant={variant} toastTitle={title} />
        </>
      );

      await user.click(screen.getByRole("button", { name: "Show Toast" }));

      // Advance timers slightly to allow toast to appear and animations to start
      act(() => {
        vi.advanceTimersByTime(100);
      });
      
      const toastElement = await screen.findByText(title);
      const toastRoot = toastElement.closest('[data-radix-toast-root]');

      expect(toastRoot).not.toBeNull();
      expectedClasses.forEach((cls) => {
        expect(toastRoot).toHaveClass(cls);
      });
    });

    it(`should display a toast with ${
      variant || "default"
    } variant classes using global toast function`, async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const title = `Global Test ${variant || "Default"} Toast`;
      render(
        <>
          <Toaster />
          <GlobalToastTestComponent toastVariant={variant} toastTitle={title} />
        </>
      );

      await user.click(screen.getByRole("button", { name: "Show Global Toast" }));
      
      act(() => {
        vi.advanceTimersByTime(100);
      });

      const toastElement = await screen.findByText(title);
      const toastRoot = toastElement.closest('[data-radix-toast-root]');
      
      expect(toastRoot).not.toBeNull();
      expectedClasses.forEach((cls) => {
        expect(toastRoot).toHaveClass(cls);
      });
    });
  });
});
