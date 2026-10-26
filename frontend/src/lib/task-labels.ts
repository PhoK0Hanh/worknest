// Keep UI labels separate from the stable status/priority values sent to the API.
export const taskStatusLabels: Record<string, string> = {
  TODO: "Cần làm",
  IN_PROGRESS: "Đang thực hiện",
  DONE: "Đã hoàn thành",
};

export const taskPriorityLabels: Record<string, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
};
