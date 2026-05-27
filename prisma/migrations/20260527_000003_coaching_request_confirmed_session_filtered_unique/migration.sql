IF EXISTS (
    SELECT 1
    FROM sys.key_constraints
    WHERE name = 'UQ__CoachingRequest__ConfirmedSessionID'
      AND parent_object_id = OBJECT_ID(N'[dbo].[CoachingRequest]')
)
BEGIN
  ALTER TABLE [dbo].[CoachingRequest]
    DROP CONSTRAINT [UQ__CoachingRequest__ConfirmedSessionID];
END

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UQ__CoachingRequest__ConfirmedSessionID'
      AND object_id = OBJECT_ID(N'[dbo].[CoachingRequest]')
)
BEGIN
  CREATE UNIQUE INDEX [UQ__CoachingRequest__ConfirmedSessionID]
    ON [dbo].[CoachingRequest]([ConfirmedSessionID])
    WHERE [ConfirmedSessionID] IS NOT NULL;
END
