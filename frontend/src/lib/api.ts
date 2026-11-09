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

/** 서버 오류 응답을 화면에 보여줄 메시지로 바꾼다. 500대는 내부 내용을 보이지 않는다. */
function toApiError(status: number, data: unknown) {
  let message = "요청을 처리하지 못했습니다. 다시 시도해주세요.";

  if (
    status < 500 &&
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

      if (messages.length > 0) {
        message = messages.join(" ");
      }
    }
  }

  return new ApiError(status, message);
}

async function send(path: string, options: RequestInit) {
  try {
    return await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  // FormData는 브라우저가 boundary가 포함된 multipart Content-Type을 직접 붙인다.
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await send(path, { ...options, headers });
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw toApiError(response.status, data);
  }

  return data as T;
}

/**
 * 인증 쿠키를 붙여 파일을 받은 뒤 브라우저의 내려받기로 저장한다.
 * 링크로 바로 이동하지 않아 실패해도 화면을 벗어나지 않고 오류를 보여줄 수 있다.
 */
export async function apiDownload(path: string, fileName: string) {
  const response = await send(path, {});

  if (!response.ok) {
    throw toApiError(response.status, await response.json().catch(() => null));
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
