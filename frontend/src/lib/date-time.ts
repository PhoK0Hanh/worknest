// Keep Vietnamese day/month order while using English AM/PM for local time.
export function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString("vi-VN")} ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`;
}
