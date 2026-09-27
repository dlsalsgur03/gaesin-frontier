BEGIN;

-- 기존 과제에는 알려진 시작일이 없으므로 NULL을 허용하고 기본값을 지정하지 않는다.
ALTER TABLE "assignments" ADD COLUMN "start_date" TIMESTAMP(3);

ALTER TABLE "team_assignments" ADD COLUMN "start_date" TIMESTAMP(3);

COMMIT;
