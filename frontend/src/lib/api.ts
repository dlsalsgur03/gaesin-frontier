const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.",
    );
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    let message = "요청을 처리하지 못했습니다. 다시 시도해주세요.";

    if (
      response.status < 500 &&
      typeof data === "object" &&
      data !== null &&
      "message" in data
    ) {
      const serverMessage = data.message;

      if (typeof serverMessage === "string") {
        message = serverMessage;
      } else if (Array.isArray(serverMessage)) {
        const messages = serverMessage.filter(
          (item): item is string => typeof item === "string",
        );

        if (message.length > 0) {
          message = messages.join(" ");
        }
      }
    }

    throw new ApiError(response.status, message);
  }

  return data as T;
}