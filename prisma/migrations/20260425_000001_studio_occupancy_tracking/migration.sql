IF OBJECT_ID('dbo.StudioBlock', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[StudioBlock] (
        [StudioBlockID] INT IDENTITY(1,1) NOT NULL,
        [StudioID] INT NOT NULL,
        [StartsAt] DATETIME NOT NULL,
        [EndsAt] DATETIME NOT NULL,
        [Reason] VARCHAR(255) NULL,
        [BlockType] VARCHAR(50) NOT NULL,
        [CreatedByUserID] INT NOT NULL,
        [CreatedAt] DATETIME NOT NULL,
        [IsActive] BIT NOT NULL CONSTRAINT [DF_StudioBlock_IsActive] DEFAULT (1),
        CONSTRAINT [PK_StudioBlock] PRIMARY KEY CLUSTERED ([StudioBlockID] ASC),
        CONSTRAINT [FK_StudioBlock_Studio] FOREIGN KEY ([StudioID]) REFERENCES [dbo].[Studio]([StudioID]),
        CONSTRAINT [FK_StudioBlock_User] FOREIGN KEY ([CreatedByUserID]) REFERENCES [dbo].[User]([UserID]),
        CONSTRAINT [CK_StudioBlock_Interval] CHECK ([EndsAt] > [StartsAt])
    );
END;

IF OBJECT_ID('dbo.StudioStatusOverride', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[StudioStatusOverride] (
        [StudioStatusOverrideID] INT IDENTITY(1,1) NOT NULL,
        [StudioID] INT NOT NULL,
        [Status] VARCHAR(50) NOT NULL,
        [Reason] VARCHAR(255) NULL,
        [StartsAt] DATETIME NOT NULL,
        [EndsAt] DATETIME NULL,
        [SetByUserID] INT NOT NULL,
        [CreatedAt] DATETIME NOT NULL,
        [UpdatedAt] DATETIME NULL,
        [IsActive] BIT NOT NULL CONSTRAINT [DF_StudioStatusOverride_IsActive] DEFAULT (1),
        CONSTRAINT [PK_StudioStatusOverride] PRIMARY KEY CLUSTERED ([StudioStatusOverrideID] ASC),
        CONSTRAINT [FK_StudioStatusOverride_Studio] FOREIGN KEY ([StudioID]) REFERENCES [dbo].[Studio]([StudioID]),
        CONSTRAINT [FK_StudioStatusOverride_User] FOREIGN KEY ([SetByUserID]) REFERENCES [dbo].[User]([UserID]),
        CONSTRAINT [CK_StudioStatusOverride_Interval] CHECK ([EndsAt] IS NULL OR [EndsAt] > [StartsAt])
    );
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_StudioBlock_StudioID_StartsAt_EndsAt'
      AND object_id = OBJECT_ID('dbo.StudioBlock')
)
BEGIN
    CREATE INDEX [IX_StudioBlock_StudioID_StartsAt_EndsAt]
        ON [dbo].[StudioBlock] ([StudioID], [StartsAt], [EndsAt]);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_StudioBlock_StudioID_IsActive'
      AND object_id = OBJECT_ID('dbo.StudioBlock')
)
BEGIN
    CREATE INDEX [IX_StudioBlock_StudioID_IsActive]
        ON [dbo].[StudioBlock] ([StudioID], [IsActive]);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_StudioStatusOverride_StudioID_IsActive'
      AND object_id = OBJECT_ID('dbo.StudioStatusOverride')
)
BEGIN
    CREATE INDEX [IX_StudioStatusOverride_StudioID_IsActive]
        ON [dbo].[StudioStatusOverride] ([StudioID], [IsActive]);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_StudioStatusOverride_Status_IsActive'
      AND object_id = OBJECT_ID('dbo.StudioStatusOverride')
)
BEGIN
    CREATE INDEX [IX_StudioStatusOverride_Status_IsActive]
        ON [dbo].[StudioStatusOverride] ([Status], [IsActive]);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_StudioStatusOverride_StudioID_StartsAt_EndsAt'
      AND object_id = OBJECT_ID('dbo.StudioStatusOverride')
)
BEGIN
    CREATE INDEX [IX_StudioStatusOverride_StudioID_StartsAt_EndsAt]
        ON [dbo].[StudioStatusOverride] ([StudioID], [StartsAt], [EndsAt]);
END;
