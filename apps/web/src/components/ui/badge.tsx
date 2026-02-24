import * as React from "react";
import { cn } from "@/lib/utils";
import type { PostFormat } from "@repo/shared-types";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "format";
  format?: PostFormat;
}

const formatColors: Record<PostFormat, string> = {
  carousel: "bg-blue-100 text-blue-700",
  "text-post": "bg-purple-100 text-purple-700",
  poll: "bg-green-100 text-green-700",
  "video-script": "bg-red-100 text-red-700",
  list: "bg-orange-100 text-orange-700",
};

export function Badge({
  className,
  variant = "default",
  format,
  children,
  ...props
}: BadgeProps) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";
  const variantClass =
    variant === "format" && format
      ? formatColors[format]
      : "bg-gray-100 text-gray-700";

  return (
    <span className={cn(base, variantClass, className)} {...props}>
      {children}
    </span>
  );
}
