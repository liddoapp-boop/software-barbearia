-- Macro 235.2.2 - reconciliacao pre-baseline no banco principal local
-- Escopo: aplicar somente em localhost:5432/barbearia apos backup e restore aprovados.

BEGIN;

DO $$
DECLARE
  v_count integer;
BEGIN
  IF current_database() <> 'barbearia' THEN
    RAISE EXCEPTION 'recusado: este script deve rodar somente no banco principal local barbearia';
  END IF;

  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'estado inesperado: _prisma_migrations ja existe';
  END IF;

  IF to_regclass('public."AppointmentBlock"') IS NOT NULL THEN
    RAISE EXCEPTION 'estado inesperado: AppointmentBlock ja existe antes do deploy das migrations novas';
  END IF;

  PERFORM 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'FinancialEntry'
    AND column_name = 'updatedAt'
    AND is_nullable = 'NO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'estado inesperado: FinancialEntry.updatedAt ausente ou nullable';
  END IF;

  PERFORM 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'FinancialEntry'
    AND column_name = 'updatedAt'
    AND column_default IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'estado inesperado: FinancialEntry.updatedAt ja possui default ou nao esta no estado esperado';
  END IF;

  SELECT count(*) INTO v_count FROM "FinancialEntry" WHERE "updatedAt" IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'estado inesperado: % FinancialEntry.updatedAt nulos', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM "Appointment" WHERE "totalPriceSnapshot" < 0;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'violacao: % Appointment.totalPriceSnapshot negativos', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM "Appointment" WHERE "effectiveDurationMinSnapshot" <= 0;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'violacao: % Appointment.effectiveDurationMinSnapshot invalidos', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM "AppointmentServiceItem" WHERE "position" < 0;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'violacao: % AppointmentServiceItem.position negativos', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM "AppointmentServiceItem" WHERE "servicePriceSnapshot" < 0;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'violacao: % AppointmentServiceItem.servicePriceSnapshot negativos', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM "AppointmentServiceItem" WHERE "serviceDurationMinSnapshot" <= 0;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'violacao: % AppointmentServiceItem.serviceDurationMinSnapshot invalidos', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM "ServiceCombinationRule" WHERE "effectiveDurationMin" <= 0;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'violacao: % ServiceCombinationRule.effectiveDurationMin invalidos', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM "ServiceCombinationRuleItem"
  WHERE "position" IS NOT NULL AND "position" < 0;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'violacao: % ServiceCombinationRuleItem.position negativos', v_count;
  END IF;

  PERFORM 1
  FROM pg_index i
  JOIN pg_class idx ON idx.oid = i.indexrelid
  JOIN pg_class tbl ON tbl.oid = i.indrelid
  JOIN pg_attribute a1 ON a1.attrelid = tbl.oid AND a1.attnum = i.indkey[0]
  JOIN pg_attribute a2 ON a2.attrelid = tbl.oid AND a2.attnum = i.indkey[1]
  JOIN pg_attribute a3 ON a3.attrelid = tbl.oid AND a3.attnum = i.indkey[2]
  JOIN pg_attribute a4 ON a4.attrelid = tbl.oid AND a4.attnum = i.indkey[3]
  JOIN pg_attribute a5 ON a5.attrelid = tbl.oid AND a5.attnum = i.indkey[4]
  WHERE tbl.relname = 'StockMovement'
    AND i.indisunique
    AND i.indnkeyatts = 5
    AND a1.attname = 'unitId'
    AND a2.attname = 'productId'
    AND a3.attname = 'referenceType'
    AND a4.attname = 'referenceId'
    AND a5.attname = 'movementType'
    AND i.indpred IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'estado inesperado: indice unico funcional de StockMovement nao encontrado';
  END IF;
END $$;

ALTER TABLE "FinancialEntry"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_totalPriceSnapshot_check"
  CHECK ("totalPriceSnapshot" >= 0),
  ADD CONSTRAINT "Appointment_effectiveDurationMinSnapshot_check"
  CHECK ("effectiveDurationMinSnapshot" > 0);

ALTER TABLE "AppointmentServiceItem"
  ADD CONSTRAINT "AppointmentServiceItem_position_check"
  CHECK ("position" >= 0),
  ADD CONSTRAINT "AppointmentServiceItem_price_check"
  CHECK ("servicePriceSnapshot" >= 0),
  ADD CONSTRAINT "AppointmentServiceItem_duration_check"
  CHECK ("serviceDurationMinSnapshot" > 0);

ALTER TABLE "ServiceCombinationRule"
  ADD CONSTRAINT "ServiceCombinationRule_effectiveDurationMin_check"
  CHECK ("effectiveDurationMin" > 0);

ALTER TABLE "ServiceCombinationRuleItem"
  ADD CONSTRAINT "ServiceCombinationRuleItem_position_check"
  CHECK ("position" IS NULL OR "position" >= 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'BusinessSettings'
      AND column_name = 'bufferBetweenAppointmentsMinutes'
      AND column_default = '0'
  ) THEN
    RAISE EXCEPTION 'estado inesperado: BusinessSettings.bufferBetweenAppointmentsMinutes nao esta adiantado para default 0';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'BusinessSettings'
      AND column_name = 'themeMode'
      AND column_default = '''system''::text'
  ) THEN
    RAISE EXCEPTION 'estado inesperado: BusinessSettings.themeMode nao esta adiantado para default system';
  END IF;
END $$;

COMMIT;
