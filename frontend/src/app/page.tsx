"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiRequest } from "../lib/api";
import Calendar from "@/components/calendar/calendar";

type User = {
  id: string;
  email: string;
  nickname: string;
  createdAt: string;
};

export default function Home() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const data = await apiRequest<{ user: User }>("/auth/me");

        if (active) {
          setUser(data.user);
        }
      } catch (error: unknown) {
        if (!active) return;

        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
          return;
        }

        setError(
          error instanceof Error
            ? error.message
            : "사용자 정보를 불러오지 못했습니다.",
        );
      }
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogout() {
    if (isLoggingOut) return;

    setError("");
    setIsLoggingOut(true);

    try {
      await apiRequest<{ message: string }>("/auth/logout", {
        method: "POST",
      });

      setUser(null);
      router.replace("/login");
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : "로그아웃에 실패했습니다.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <main className="flex-1 bg-zinc-50 px-4 py-6 text-zinc-900 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">개신프론티어</h1>
            {user && (
              <p className="mt-2 break-words text-sm text-zinc-500">
                <strong className="text-zinc-700">{user.nickname}</strong>님,
                안녕하세요!
                <span className="mt-1 block sm:ml-3 sm:mt-0 sm:inline">
                  {user.email}
                </span>
              </p>
            )}
          </div>
          {user && (
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
            >
              {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
            </button>
          )}
        </header>

        {!user && !error && (
          <p
            role="status"
            className="rounded-2xl border border-zinc-200 bg-white p-8 text-zinc-500"
          >
            로그인 상태를 확인하고 있습니다.
          </p>
        )}

        {error && (
          <div className="space-y-3 rounded-xl border border-red-100 bg-red-50 p-4">
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>

            {!user && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-sm font-semibold text-blue-600"
              >
                다시 시도
              </button>
            )}
          </div>
        )}
        {user && <Calendar />}
      </div>
    </main>
  );
}
