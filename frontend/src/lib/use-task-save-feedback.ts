"use client";

import { useEffect, useRef, useState } from "react";

export function useTaskSaveFeedback() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function markSaved(id: string) {
    // Only an acknowledged edit triggers feedback, never polling or a realtime refetch.
    if (timer.current) clearTimeout(timer.current);
    setTaskId(id);
    timer.current = setTimeout(() => setTaskId(null), 2000);
  }
  return { taskId, markSaved };
}
