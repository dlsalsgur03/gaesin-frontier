"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiRequest } from "../lib/api";

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
        error instanceof Error
          ? error.message
          : "로그아웃에 실패했습니다.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-12 text-zinc-900">
      <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">개신프론티어</h1>

        {user ? (
          <div className="mt-6 space-y-4">
            <p className="text-lg">
              <strong>{user.nickname}</strong>님, 안녕하세요!
            </p>

            <p className="text-sm text-zinc-500">{user.email}</p>

            <p className="text-sm text-zinc-500">
              이곳에 캘린더와 과제 화면을 추가할 예정입니다.
            </p>

            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
            </button>
          </div>
        ) : (
          !error && (
            <p role="status" className="mt-6 text-zinc-500">
              로그인 상태를 확인하고 있습니다.
            </p>
          )
        )}

        {error && (
          <div className="mt-6 space-y-3">
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
      </section>
    </main>
  );
}