import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";

interface PasswordInputProps {
  field: {
    value: string;
    onChange: (value: string) => void;
    name: string;
  };
  placeholder?: string;
  className?: string;
}

export function PasswordInput({ field, placeholder, className }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <Input
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        value={field.value}
        name={field.name}
        onChange={(e) => field.onChange(e.target.value)}
        className={className}
      />
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
        onClick={() => setShowPassword(!showPassword)}
      >
        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
