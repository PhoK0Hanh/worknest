import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Adapted from ReUI c-avatar-14: use real account initials instead of demo names.
export function AccountAvatar({ name }: { name: string }) {
  return <Avatar className="size-9 shrink-0 after:border-primary/10"><AvatarFallback className="bg-primary/10 text-primary">{name.trim().slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>;
}
