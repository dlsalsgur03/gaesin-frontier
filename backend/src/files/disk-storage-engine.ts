import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { MAX_FILE_SIZE, ensureUploadDir, newStorageKey } from './file-storage';

type IncomingFile = { stream: Readable };
type Stored = { filename: string; path: string; size: number };
type Callback<T> = (error: Error | null, info?: T) => void;

/**
 * multer 저장소 엔진. 업로드 스트림을 무작위 키 이름으로 업로드 폴더에 바로 쓴다.
 * 크기 제한 초과 등으로 multer가 요청을 거부하면 _removeFile로 쓴 파일을 지운다.
 */
const diskStorageEngine = {
  _handleFile(_req: unknown, file: IncomingFile, callback: Callback<Stored>) {
    void (async () => {
      const filename = newStorageKey();
      const target = path.join(await ensureUploadDir(), filename);
      let size = 0;
      file.stream.on('data', (chunk: Buffer) => (size += chunk.length));
      try {
        await pipeline(file.stream, createWriteStream(target, { flags: 'wx' }));
        callback(null, { filename, path: target, size });
      } catch (error) {
        await rm(target, { force: true });
        throw error;
      }
    })().catch((error: Error) => callback(error));
  },

  _removeFile(_req: unknown, file: Partial<Stored>, callback: Callback<void>) {
    if (!file.path) return callback(null);
    rm(file.path, { force: true }).then(
      () => callback(null),
      (error: Error) => callback(error),
    );
  },
};

/** multipart의 `file` 필드 하나만 받는다. 형식은 제한하지 않는다. */
export const uploadOptions: MulterOptions = {
  storage: diskStorageEngine,
  // 브라우저는 한글 파일명을 UTF-8 그대로 보낸다(multer 기본값 latin1이면 깨진다).
  defParamCharset: 'utf8',
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 5, parts: 6 },
};
