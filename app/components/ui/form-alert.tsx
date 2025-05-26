import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "~/lib/utils";

type FormAlertProps = {
  type?: "error" | "success" | "warning" | "info";
  title?: string;
  message?: string | string[];
  errors?: Record<string, string[]>;
  className?: string;
};

export function FormAlert({
  type = "error",
  title,
  message,
  errors,
  className,
}: FormAlertProps) {
  const alertConfig = {
    error: {
      variant: "destructive" as const,
      icon: AlertCircle,
      defaultTitle: "Error",
    },
    success: {
      variant: "default" as const,
      icon: CheckCircle,
      defaultTitle: "Success",
    },
    warning: {
      variant: "default" as const,
      icon: AlertCircle,
      defaultTitle: "Warning",
    },
    info: {
      variant: "default" as const,
      icon: AlertCircle,
      defaultTitle: "Info",
    },
  }[type];

  const Icon = alertConfig.icon;
  const displayTitle = title || alertConfig.defaultTitle;
  const messages = message ? (Array.isArray(message) ? message : [message]) : [];
  const hasErrors = errors && Object.keys(errors).length > 0;
  const hasMessages = messages.length > 0;

  if (!hasMessages && !hasErrors) {
    return null;
  }

  return (
    <Alert
      variant={alertConfig.variant}
      className={cn("mb-4", className)}
    >
      <Icon className="h-4 w-4" />
      <AlertTitle className="font-medium">{displayTitle}</AlertTitle>
      {hasMessages && messages.map((msg, index) => (
        <AlertDescription key={`msg-${index}`} className="mt-1">
          {msg}
        </AlertDescription>
      ))}
      {hasErrors && Object.entries(errors).map(([field, fieldErrors]) => (
        <AlertDescription key={field} className="mt-1">
          {fieldErrors.map((error, i) => (
            <div key={`${field}-${i}`} className="flex items-start gap-2">
              <span className="font-medium capitalize">{field}:</span>
              <span>{error}</span>
            </div>
          ))}
        </AlertDescription>
      ))}
    </Alert>
  );
}
