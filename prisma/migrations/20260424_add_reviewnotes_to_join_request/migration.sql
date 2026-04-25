IF COL_LENGTH('dbo.CoachingSession', 'ReviewNotes') IS NULL
BEGIN
    ALTER TABLE [dbo].[CoachingSession]
    ADD [ReviewNotes] VARCHAR(255) NULL;
END;
