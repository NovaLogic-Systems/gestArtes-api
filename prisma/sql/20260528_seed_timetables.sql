-- ============================================================================
-- Seed SQL: Timetable tables
-- File: prisma/sql/20260528_seed_timetables.sql
-- Description: Idempotent baseline timetable seed for the admin timetable module
-- ============================================================================

SET NOCOUNT ON;

IF OBJECT_ID('dbo.Timetable', 'U') IS NULL OR OBJECT_ID('dbo.TimetableSlot', 'U') IS NULL
BEGIN
  RAISERROR('Timetable tables are not available. Run the timetable migration first.', 16, 1);
  RETURN;
END

DECLARE @SeedTimetables TABLE (
  Label NVARCHAR(100) NOT NULL,
  IsActive BIT NOT NULL
);

UPDATE dbo.Timetable SET Label = N'Ballet Clássico' WHERE Label = N'Horário Principal';
UPDATE dbo.Timetable SET Label = N'Jazz' WHERE Label = N'Horário Coaching';
UPDATE dbo.Timetable SET Label = N'Contemporâneo' WHERE Label = N'Horário Manhã';
UPDATE dbo.Timetable SET Label = N'Acrobática' WHERE Label = N'Horário Tarde';
UPDATE dbo.Timetable SET Label = N'Salão' WHERE Label = N'Horário Noite';
UPDATE dbo.Timetable SET Label = N'Hip Hop' WHERE Label = N'Horário Sábado';
UPDATE dbo.Timetable SET Label = N'Reserva de Modalidade' WHERE Label = N'Horário Reserva';

INSERT INTO @SeedTimetables (Label, IsActive)
VALUES
  (N'Ballet Clássico', 1),
  (N'Jazz', 0),
  (N'Contemporâneo', 0),
  (N'Acrobática', 0),
  (N'Salão', 0),
  (N'Hip Hop', 0),
  (N'Reserva de Modalidade', 0);

DECLARE @Label NVARCHAR(100);
DECLARE @IsActive BIT;
DECLARE @TimetableID INT;

DECLARE timetable_cursor CURSOR LOCAL FAST_FORWARD FOR
  SELECT Label, IsActive
  FROM @SeedTimetables;

OPEN timetable_cursor;
FETCH NEXT FROM timetable_cursor INTO @Label, @IsActive;

WHILE @@FETCH_STATUS = 0
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM dbo.Timetable
    WHERE Label = @Label
  )
  BEGIN
    INSERT INTO dbo.Timetable (Label, IsActive, CreatedBy)
    VALUES (@Label, @IsActive, NULL);
  END

  SELECT @TimetableID = TimetableID
  FROM dbo.Timetable
  WHERE Label = @Label;

  DELETE FROM dbo.TimetableSlot
  WHERE TimetableID = @TimetableID;

  IF @Label = N'Ballet Clássico'
  BEGIN
    INSERT INTO dbo.TimetableSlot (TimetableID, DayOfWeek, StartMinutes, EndMinutes, Title, TeacherUserID, StudioID, Color, Notes)
    VALUES
      (@TimetableID, 1, 1080, 1260, N'Ballet Clássico', NULL, NULL, N'#0F766E', N'Segunda-feira, 18:00-21:00'),
      (@TimetableID, 2, 1080, 1260, N'Ballet Clássico', NULL, NULL, N'#0F766E', N'Terça-feira, 18:00-21:00'),
      (@TimetableID, 3, 1080, 1260, N'Ballet Clássico', NULL, NULL, N'#0F766E', N'Quarta-feira, 18:00-21:00'),
      (@TimetableID, 4, 1080, 1260, N'Ballet Clássico', NULL, NULL, N'#0F766E', N'Quinta-feira, 18:00-21:00'),
      (@TimetableID, 5, 1080, 1260, N'Ballet Clássico', NULL, NULL, N'#0F766E', N'Sexta-feira, 18:00-21:00'),
      (@TimetableID, 6, 540, 750, N'Ballet Clássico', NULL, NULL, N'#0F766E', N'Sábado, 09:00-12:30');
  END
  ELSE IF @Label = N'Jazz'
  BEGIN
    INSERT INTO dbo.TimetableSlot (TimetableID, DayOfWeek, StartMinutes, EndMinutes, Title, TeacherUserID, StudioID, Color, Notes)
    VALUES
      (@TimetableID, 1, 1080, 1170, N'Jazz', NULL, NULL, N'#92400E', N'Segunda-feira, 18:00-19:30'),
      (@TimetableID, 2, 1080, 1170, N'Jazz', NULL, NULL, N'#92400E', N'Terça-feira, 18:00-19:30'),
      (@TimetableID, 3, 1080, 1170, N'Jazz', NULL, NULL, N'#92400E', N'Quarta-feira, 18:00-19:30'),
      (@TimetableID, 4, 1080, 1170, N'Jazz', NULL, NULL, N'#92400E', N'Quinta-feira, 18:00-19:30'),
      (@TimetableID, 5, 1080, 1170, N'Jazz', NULL, NULL, N'#92400E', N'Sexta-feira, 18:00-19:30');
  END
  ELSE IF @Label = N'Contemporâneo'
  BEGIN
    INSERT INTO dbo.TimetableSlot (TimetableID, DayOfWeek, StartMinutes, EndMinutes, Title, TeacherUserID, StudioID, Color, Notes)
    VALUES
      (@TimetableID, 1, 540, 660, N'Contemporâneo', NULL, NULL, N'#2563EB', N'09:00-11:00'),
      (@TimetableID, 2, 540, 660, N'Contemporâneo', NULL, NULL, N'#2563EB', N'09:00-11:00'),
      (@TimetableID, 3, 540, 660, N'Contemporâneo', NULL, NULL, N'#2563EB', N'09:00-11:00'),
      (@TimetableID, 4, 540, 660, N'Contemporâneo', NULL, NULL, N'#2563EB', N'09:00-11:00'),
      (@TimetableID, 5, 540, 660, N'Contemporâneo', NULL, NULL, N'#2563EB', N'09:00-11:00'),
      (@TimetableID, 6, 540, 750, N'Contemporâneo', NULL, NULL, N'#2563EB', N'09:00-12:30');
  END
  ELSE IF @Label = N'Acrobática'
  BEGIN
    INSERT INTO dbo.TimetableSlot (TimetableID, DayOfWeek, StartMinutes, EndMinutes, Title, TeacherUserID, StudioID, Color, Notes)
    VALUES
      (@TimetableID, 1, 840, 1020, N'Acrobática', NULL, NULL, N'#7C3AED', N'14:00-17:00'),
      (@TimetableID, 2, 840, 1020, N'Acrobática', NULL, NULL, N'#7C3AED', N'14:00-17:00'),
      (@TimetableID, 3, 840, 1020, N'Acrobática', NULL, NULL, N'#7C3AED', N'14:00-17:00'),
      (@TimetableID, 4, 840, 1020, N'Acrobática', NULL, NULL, N'#7C3AED', N'14:00-17:00'),
      (@TimetableID, 5, 840, 1020, N'Acrobática', NULL, NULL, N'#7C3AED', N'14:00-17:00');
  END
  ELSE IF @Label = N'Salão'
  BEGIN
    INSERT INTO dbo.TimetableSlot (TimetableID, DayOfWeek, StartMinutes, EndMinutes, Title, TeacherUserID, StudioID, Color, Notes)
    VALUES
      (@TimetableID, 1, 1080, 1260, N'Salão', NULL, NULL, N'#BE123C', N'18:00-21:00'),
      (@TimetableID, 2, 1080, 1260, N'Salão', NULL, NULL, N'#BE123C', N'18:00-21:00'),
      (@TimetableID, 3, 1080, 1260, N'Salão', NULL, NULL, N'#BE123C', N'18:00-21:00'),
      (@TimetableID, 4, 1080, 1260, N'Salão', NULL, NULL, N'#BE123C', N'18:00-21:00'),
      (@TimetableID, 5, 1080, 1260, N'Salão', NULL, NULL, N'#BE123C', N'18:00-21:00');
  END
  ELSE IF @Label = N'Hip Hop'
  BEGIN
    INSERT INTO dbo.TimetableSlot (TimetableID, DayOfWeek, StartMinutes, EndMinutes, Title, TeacherUserID, StudioID, Color, Notes)
    VALUES
      (@TimetableID, 6, 540, 750, N'Hip Hop', NULL, NULL, N'#0EA5E9', N'09:00-12:30');
  END

  FETCH NEXT FROM timetable_cursor INTO @Label, @IsActive;
END

CLOSE timetable_cursor;
DEALLOCATE timetable_cursor;
