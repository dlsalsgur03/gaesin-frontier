-- AlterTable
ALTER TABLE "team_members" ADD COLUMN "last_read_message_id" BIGINT;

-- 기존 멤버는 지금까지의 메시지를 모두 읽은 것으로 본다(배포 직후 안 읽은 메시지가 쏟아지지 않게).
UPDATE "team_members" AS tm
SET "last_read_message_id" = (
  SELECT MAX(m."id") FROM "messages" AS m WHERE m."team_id" = tm."team_id"
);
