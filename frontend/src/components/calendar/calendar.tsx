"use client";

import { useState } from "react";
import { createMockAssignments } from "@/lib/calendar/mock-assignments";
import MonthCalendar from "./month-calendar";

export default function Calendar() {
  // 실제 API 연결 시 이 데이터 공급 부분을 교체한다. 월 이동과 표시 로직은 독립적이다.
  const [assignments] = useState(() => createMockAssignments(new Date()));

  return <MonthCalendar assignments={assignments} />;
}
