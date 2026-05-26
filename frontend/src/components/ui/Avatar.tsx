import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  name?: string | null;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const sizes = { xs: "w-6 h-6 text-label", sm: "w-8 h-8 text-label", md: "w-10 h-10 text-body-sm", lg: "w-14 h-14 text-title-md" };

export function Avatar({ name, src, size = "md", className }: Props) {
  if (src) {
    return (
      <img
        src={src}
        alt={name || "avatar"}
        className={cn("rounded-full object-cover", sizes[size], className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full grid place-items-center bg-primary-container text-primary-onContainer font-semibold uppercase",
        sizes[size],
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
