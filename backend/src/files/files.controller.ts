import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  Header,
  Param,
  PayloadTooLargeException,
  Post,
  Put,
  Req,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { uploadOptions } from './disk-storage-engine';
import { removeStoredFiles } from './file-storage';
import { FileTagDto } from './file.dto';
import { FilesService, type StoredUpload } from './files.service';

/** multer의 영어 크기 초과 메시지를 화면에 보여줄 한국어 메시지로 바꾼다. */
@Catch(PayloadTooLargeException)
class FileTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(413).json({
      statusCode: 413,
      message: '파일은 20MB까지 올릴 수 있습니다.',
      error: 'Payload Too Large',
    });
  }
}

/** Content-Disposition 헤더. 한글 파일명은 filename*로, 구형 브라우저용 이름은 ASCII로 넣는다. */
function attachment(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\%;]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly service: FilesService) {}

  /** 저장한 뒤 검증·권한 확인에 실패하면 디스크에 쓴 파일을 지운다. */
  private async withUpload<T>(
    upload: StoredUpload | undefined,
    run: (upload: StoredUpload) => Promise<T>,
  ) {
    if (!upload) throw new BadRequestException('업로드할 파일을 선택해주세요.');
    try {
      return await run(upload);
    } catch (error) {
      await removeStoredFiles([upload.filename]);
      throw error;
    }
  }

  @Get('assignments/:id/files')
  @Header('Cache-Control', 'private, no-store')
  listForAssignment(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.listForAssignment(req.userId, id);
  }

  @Post('assignments/:id/files')
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadToAssignment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() upload?: StoredUpload,
  ) {
    return this.withUpload(upload, (file) =>
      this.service.uploadToAssignment(req.userId, id, file),
    );
  }

  @Get('teams/:teamId/files')
  @Header('Cache-Control', 'private, no-store')
  listForTeam(
    @Req() req: AuthenticatedRequest,
    @Param('teamId') teamId: string,
  ) {
    return this.service.listForTeam(req.userId, teamId);
  }

  /** multipart 필드: file(필수), teamAssignmentId(선택, 같은 팀 과제에 연결) */
  @Post('teams/:teamId/files')
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadToTeam(
    @Req() req: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @UploadedFile() upload?: StoredUpload,
  ) {
    return this.withUpload(upload, (file) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const extra = Object.keys(body).filter(
        (key) => key !== 'teamAssignmentId',
      );
      const value = body.teamAssignmentId;
      if (extra.length || (value !== undefined && typeof value !== 'string'))
        throw new BadRequestException('허용되지 않은 입력이 있습니다.');
      return this.service.uploadToTeam(req.userId, teamId, file, value);
    });
  }

  @Put('files/:id')
  updateTag(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: FileTagDto,
  ) {
    return this.service.updateTag(req.userId, id, dto.teamAssignmentId ?? null);
  }

  /** 형식과 관계없이 항상 내려받기로 응답해 브라우저가 파일을 열거나 실행하지 않게 한다. */
  @Get('files/:id/download')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const file = await this.service.download(req.userId, id);
    return new StreamableFile(createReadStream(file.path), {
      type: 'application/octet-stream',
      disposition: attachment(file.fileName),
      length: file.size,
    });
  }

  @Delete('files/:id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.userId, id);
  }
}
