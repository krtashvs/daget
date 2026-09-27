import { Shield, ShieldCheck } from "lucide-react";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES = {
  admin: { label: "ADMIN", Icon: ShieldCheck, cls: "bg-amber-400/15 text-amber-300 ring-amber-300/25" },
  mod: { label: "MOD", Icon: Shield, cls: "bg-sky-400/15 text-sky-300 ring-sky-300/25" },
} as const;

export function RoleBadge({ role, className }: { role?: Role | null; className?: string }) {
  if (role !== "admin" && role !== "mod") return null;
  const { label, Icon, cls } = STYLES[role];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-px text-[10px] font-bold leading-4 tracking-wide ring-1 ring-inset",
        cls,
        className,
      )}
      title={role === "admin" ? "Admin" : "Moderator"}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
