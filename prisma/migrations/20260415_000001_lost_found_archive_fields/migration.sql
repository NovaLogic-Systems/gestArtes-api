IF COL_LENGTH('dbo.LostAndFoundItem', 'IsArchived') IS NULL
BEGIN
    ALTER TABLE [dbo].[LostAndFoundItem]
    ADD [IsArchived] BIT NOT NULL CONSTRAINT [DF_LostAndFoundItem_IsArchived] DEFAULT ((0));
END;

IF COL_LENGTH('dbo.LostAndFoundItem', 'AdminNotes') IS NULL
BEGIN
    ALTER TABLE [dbo].[LostAndFoundItem]
    ADD [AdminNotes] VARCHAR(255) NULL;
END;

IF COL_LENGTH('dbo.LostAndFoundItem', 'ArchivedAt') IS NULL
BEGIN
    ALTER TABLE [dbo].[LostAndFoundItem]
    ADD [ArchivedAt] DATETIME NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_LostAndFoundItem_IsArchived_FoundDate'
      AND object_id = OBJECT_ID('dbo.LostAndFoundItem')
)
BEGIN
    CREATE INDEX [IX_LostAndFoundItem_IsArchived_FoundDate]
        ON [dbo].[LostAndFoundItem] ([IsArchived], [FoundDate]);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_LostAndFoundItem_RegisteredByUserID'
      AND object_id = OBJECT_ID('dbo.LostAndFoundItem')
)
BEGIN
    CREATE INDEX [IX_LostAndFoundItem_RegisteredByUserID]
        ON [dbo].[LostAndFoundItem] ([RegisteredByUserID]);
END;
