import { useEffect } from "react";
import { toast } from "~/hooks/use-toast";

export interface ToastData {
  title?: string;
  message: string;
}

export function useToastTrigger(toastData: ToastData | null) {
  useEffect(() => {
    if (toastData?.message) {
      toast({
        title: toastData.title,
        description: toastData.message,
      });
    }
  }, [toastData]);
}
