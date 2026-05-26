import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "tertiary";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: string;
  rightIcon?: string;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-[#6b4c00] active:bg-[#5a3f00] shadow-sm",
  secondary:
    "bg-secondary-container text-secondary hover:bg-[#bbd4f0] active:bg-[#a8c8eb]",
  tertiary:
    "bg-tertiary text-white hover:bg-[#005466] active:bg-[#004552]",
  ghost:
    "bg-transparent text-ink hover:bg-surface-container active:bg-surface-containerHigh",
  outline:
    "bg-white text-ink border border-ink-outlineVariant hover:bg-surface-containerLow active:bg-surface-container",
  danger:
    "bg-danger text-white hover:bg-[#9c1616] active:bg-[#7e1212]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-body-sm rounded-md gap-1.5",
  md: "h-10 px-4 text-body-sm rounded-md gap-2",
  lg: "h-12 px-6 text-title-md rounded-xl gap-2",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    size = "md",
    loading,
    fullWidth,
    leftIcon,
    rightIcon,
    className,
    disabled,
    children,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150 select-none",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        leftIcon && <span className="icon text-[18px]">{leftIcon}</span>
      )}
      {children}
      {!loading && rightIcon && <span className="icon text-[18px]">{rightIcon}</span>}
    </button>
  );
});
