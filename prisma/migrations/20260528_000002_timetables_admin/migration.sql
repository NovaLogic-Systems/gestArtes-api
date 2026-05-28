IF OBJECT_ID('dbo.Timetable', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Timetable] (
        [TimetableID] INT IDENTITY(1,1) NOT NULL,
        [Label] VARCHAR(150) NOT NULL,
        [IsActive] BIT NOT NULL CONSTRAINT [DF_Timetable_IsActive] DEFAULT (0),
        [CreatedBy] INT NULL,
        [CreatedAt] DATETIME NOT NULL CONSTRAINT [DF_Timetable_CreatedAt] DEFAULT (GETDATE()),
        CONSTRAINT [PK_Timetable] PRIMARY KEY CLUSTERED ([TimetableID] ASC),
        CONSTRAINT [FK_Timetable_CreatedBy] FOREIGN KEY ([CreatedBy]) REFERENCES [dbo].[User]([UserID])
    );
END;

IF OBJECT_ID('dbo.TimetableSlot', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[TimetableSlot] (
        [SlotID] INT IDENTITY(1,1) NOT NULL,
        [TimetableID] INT NOT NULL,
        [DayOfWeek] INT NOT NULL,
        [StartMinutes] INT NOT NULL,
        [EndMinutes] INT NOT NULL,
        [Title] VARCHAR(200) NOT NULL,
        [TeacherUserID] INT NULL,
        [StudioID] INT NULL,
        [Color] VARCHAR(20) NULL,
        [Notes] VARCHAR(255) NULL,
        CONSTRAINT [PK_TimetableSlot] PRIMARY KEY CLUSTERED ([SlotID] ASC),
        CONSTRAINT [FK_TimetableSlot_Timetable] FOREIGN KEY ([TimetableID]) REFERENCES [dbo].[Timetable]([TimetableID]) ON DELETE CASCADE,
        CONSTRAINT [FK_TimetableSlot_Teacher] FOREIGN KEY ([TeacherUserID]) REFERENCES [dbo].[User]([UserID]),
        CONSTRAINT [FK_TimetableSlot_Studio] FOREIGN KEY ([StudioID]) REFERENCES [dbo].[Studio]([StudioID]),
        CONSTRAINT [CK_TimetableSlot_DayOfWeek] CHECK ([DayOfWeek] BETWEEN 1 AND 7),
        CONSTRAINT [CK_TimetableSlot_Minutes] CHECK ([StartMinutes] >= 0 AND [StartMinutes] <= 1439 AND [EndMinutes] >= 1 AND [EndMinutes] <= 1440 AND [EndMinutes] > [StartMinutes])
    );
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Timetable_IsActive'
      AND object_id = OBJECT_ID('dbo.Timetable')
)
BEGIN
    CREATE INDEX [IX_Timetable_IsActive]
        ON [dbo].[Timetable] ([IsActive]);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_TimetableSlot_TimetableID'
      AND object_id = OBJECT_ID('dbo.TimetableSlot')
)
BEGIN
    CREATE INDEX [IX_TimetableSlot_TimetableID]
        ON [dbo].[TimetableSlot] ([TimetableID]);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_TimetableSlot_DayStartEnd'
      AND object_id = OBJECT_ID('dbo.TimetableSlot')
)
BEGIN
    CREATE INDEX [IX_TimetableSlot_DayStartEnd]
        ON [dbo].[TimetableSlot] ([DayOfWeek], [StartMinutes], [EndMinutes]);
END;
