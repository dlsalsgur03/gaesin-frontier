import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

/** 파일 한 개의 최대 크기(20MB). 형식은 제한하지 않고 항상 다운로드로만 내려준다. */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

const KEY_PATTERN = /^[0-9a-f-]{36}$/;
const logger = new Logger('FileStorage');

/**
 * 업로드 파일은 백엔드 서버의 디스크에 저장한다. Docker는 backend_data 볼륨(/data/uploads),
 * Node로 직접 실행하면 backend/uploads가 기본값이다. DB의 file_url에는 이 폴더 안의 키만 저장한다.
 * 저장소를 S3 등으로 바꿀 때는 이 파일만 고치면 된다.
 */
export function uploadDir() {
  return path.resolve(process.env.UPLOAD_DIR || 'uploads');
}

export async function ensureUploadDir() {
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

/** 원본 파일명과 무관한 무작위 키. 경로 조작이나 이름 충돌을 막는다. */
export const newStorageKey = () => randomUUID();

/** 키 형식이 아니면 null을 돌려준다. DB 값이 잘못되어도 폴더 밖을 읽지 않는다. */
export function storagePath(key: string) {
  return KEY_PATTERN.test(key) ? path.join(uploadDir(), key) : null;
}

/**
 * DB 행을 지운 뒤 실제 파일을 지운다. 실패해도 요청은 성공으로 두고 기록만 남긴다
 * (이미 DB에서 사라진 파일은 다운로드할 수 없다).
 */
export async function removeStoredFiles(keys: string[]) {
  await Promise.all(
    keys.map(async (key) => {
      const target = storagePath(key);
      if (!target) return;
      try {
        await rm(target, { force: true });
      } catch (error) {
        logger.warn(`파일을 지우지 못했습니다: ${key} (${String(error)})`);
      }
    }),
  );
}
