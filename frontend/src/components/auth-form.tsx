"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, apiRequest } from "../lib/api";

type AuthFromProps = {
  mode: "login" | "signup";
};

const inputClass = 
  "mt-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 " +
  "text-zinc-900 outline-none focus:border-blue-600 focus:ring-2 " +
  "focus:ring-blue-100 disabled:bg-zinc-100";

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      try {
        await apiRequest<unknown>("/auth/me");

        if (active) {
          router.replace("/");
        }
      } catch (error: unknown) {
        if (!active) return;

        if (!(error instanceof ApiError && error.status === 401)) {
          setError(
            error instanceof Error
              ? error.message
              : "로그인 상태를 확인하지 못했습니다.",
          );
        }

        setIsCheckingAuth(false);
      }
    }

    void checkAuth();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    setError("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") ?? "");
    const nickname = String(formData.get("nickname") ?? "").trim();
    const passwordConfirm = String(
      formData.get("passwordConfirm") ?? "",
    );

    if (isSignup && nickname.length < 2) {
      setError("닉네임은 앞뒤 공백을 제외하고 2자 이상 입력해주세요.");
      return;
    }

    if (isSignup && password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      await apiRequest<{ message: string }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(
          isSignup
            ? { email, password, nickname }
            : { email, password },
        ),
      });

      if (isSignup) {
        setSignupComplete(true);
      } else {
        router.replace("/");
      }
    } catch (error: unknown) {
      setError(
        error instanceof Error
          ? error.message
          : "오류가 발생했습니다. 다시 시도해주세요.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isCheckingAuth) {
    return (
      <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-12 text-zinc-900">
        <p role="status" className="text-zinc-500">
          로그인 상태를 확인하고 있습니다.
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-12 text-zinc-900">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="mb-2 text-sm font-semibold text-blue-600">
          개신프론티어
        </p>

        <h1 className="text-2xl font-bold">
          {isSignup ? "회원가입" : "로그인"}
        </h1>

        {signupComplete ? (
          <div className="mt-6 space-y-6">
            <p role="status" className="text-zinc-600">
              회원가입이 완료되었습니다. 가입한 계정으로 로그인해주세요.
            </p>

            <Link
              href="/login"
              className="block rounded-xl bg-blue-600 px-4 py-3 text-center font-semibold text-white hover:bg-blue-700"
            >
              로그인하러 가기
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-zinc-500">
              {isSignup
                ? "과제와 팀 활동을 함께 관리해보세요."
                : "이메일과 비밀번호를 입력해주세요."}
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {isSignup && (
                <label className="block text-sm font-medium">
                  닉네임
                  <input
                    name="nickname"
                    type="text"
                    autoComplete="nickname"
                    placeholder="2~50자"
                    required
                    minLength={2}
                    maxLength={50}
                    disabled={isSubmitting}
                    className={inputClass}
                  />
                </label>
              )}

              <label className="block text-sm font-medium">
                이메일
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="example@email.com"
                  required
                  maxLength={255}
                  disabled={isSubmitting}
                  className={inputClass}
                />
              </label>

              <label className="block text-sm font-medium">
                비밀번호
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    isSignup ? "new-password" : "current-password"
                  }
                  placeholder="8~128자"
                  required
                  minLength={8}
                  maxLength={128}
                  disabled={isSubmitting}
                  className={inputClass}
                />
              </label>

              {isSignup && (
                <label className="block text-sm font-medium">
                  비밀번호 확인
                  <input
                    name="passwordConfirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="비밀번호를 다시 입력해주세요."
                    required
                    minLength={8}
                    maxLength={128}
                    disabled={isSubmitting}
                    className={inputClass}
                  />
                </label>
              )}

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting
                  ? "처리 중..."
                  : isSignup
                    ? "회원가입"
                    : "로그인"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-zinc-500">
              {isSignup ? "이미 계정이 있나요? " : "아직 계정이 없나요? "}
              <Link
                href={isSignup ? "/login" : "/signup"}
                className="font-semibold text-blue-600 hover:underline"
              >
                {isSignup ? "로그인" : "회원가입"}
              </Link>
            </p>
          </>
        )}
      </section>
    </main>
  );
}