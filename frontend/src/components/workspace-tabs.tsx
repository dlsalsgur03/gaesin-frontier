"use client";

import { useState } from "react";
import Calendar from "./calendar/calendar";
import PersonalAssignments from "./assignments/personal-assignments";
import Teams from "./teams/teams";

const tabs = [
  { id: "calendar", label: "캘린더" },
  { id: "personal", label: "개인 과제" },
  { id: "teams", label: "팀" },
] as const;

export default function WorkspaceTabs() {
  const [active, setActive] = useState<(typeof tabs)[number]["id"]>("calendar");
  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="작업 공간"
        className="flex gap-2 border-b border-zinc-200"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            aria-selected={active === tab.id}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : (index +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        tabs.length) %
                      tabs.length;
              setActive(tabs[next].id);
              document.getElementById(`tab-${tabs[next].id}`)?.focus();
            }}
            className={`min-h-12 border-b-2 px-5 font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 ${active === tab.id ? "border-blue-600 text-blue-700" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          hidden={active !== tab.id}
        >
          {active === tab.id &&
            (tab.id === "calendar" ? (
              <Calendar />
            ) : tab.id === "personal" ? (
              <PersonalAssignments />
            ) : (
              <Teams />
            ))}
        </div>
      ))}
    </div>
  );
}
