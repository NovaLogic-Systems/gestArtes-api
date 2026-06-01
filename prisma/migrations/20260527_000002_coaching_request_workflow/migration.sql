IF OBJECT_ID(N'[dbo].[CoachingRequest]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CoachingRequest] (
        [RequestID] INT IDENTITY(1,1) NOT NULL,
        [StudentUserID] INT NOT NULL,
        [TeacherUserID] INT NOT NULL,
        [RequestedByUserID] INT NOT NULL,
        [ModalityID] INT NOT NULL,
        [StudioID] INT NULL,
        [ConfirmedSessionID] INT NULL,
        [PreferredStartTime] DATETIME NOT NULL,
        [PreferredEndTime] DATETIME NOT NULL,
        [CurrentStartTime] DATETIME NOT NULL,
        [CurrentEndTime] DATETIME NOT NULL,
        [SuggestedStartTime] DATETIME NULL,
        [SuggestedEndTime] DATETIME NULL,
        [Status] VARCHAR(50) NOT NULL,
        [RequestNotes] VARCHAR(255) NULL,
        [TeacherResponseNotes] VARCHAR(255) NULL,
        [StudentResponseNotes] VARCHAR(255) NULL,
        [AdminResponseNotes] VARCHAR(255) NULL,
        [RequestedAt] DATETIME NOT NULL CONSTRAINT [DF_CoachingRequest_RequestedAt] DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME NULL,
        [ResolvedAt] DATETIME NULL,
        CONSTRAINT [PK__CoachingRequest] PRIMARY KEY ([RequestID]),
        CONSTRAINT [UQ__CoachingRequest__ConfirmedSessionID] UNIQUE ([ConfirmedSessionID]),
        CONSTRAINT [FK_CoachingRequest_StudentUser] FOREIGN KEY ([StudentUserID]) REFERENCES [dbo].[User]([UserID]),
        CONSTRAINT [FK_CoachingRequest_TeacherUser] FOREIGN KEY ([TeacherUserID]) REFERENCES [dbo].[User]([UserID]),
        CONSTRAINT [FK_CoachingRequest_RequestedByUser] FOREIGN KEY ([RequestedByUserID]) REFERENCES [dbo].[User]([UserID]),
        CONSTRAINT [FK_CoachingRequest_Modality] FOREIGN KEY ([ModalityID]) REFERENCES [dbo].[Modality]([ModalityID]),
        CONSTRAINT [FK_CoachingRequest_Studio] FOREIGN KEY ([StudioID]) REFERENCES [dbo].[Studio]([StudioID]),
        CONSTRAINT [FK_CoachingRequest_ConfirmedSession] FOREIGN KEY ([ConfirmedSessionID]) REFERENCES [dbo].[CoachingSession]([SessionID])
    );
END;

IF OBJECT_ID(N'[dbo].[CoachingRequestAction]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CoachingRequestAction] (
        [RequestActionID] INT IDENTITY(1,1) NOT NULL,
        [RequestID] INT NOT NULL,
        [ActorUserID] INT NOT NULL,
        [ActionType] VARCHAR(50) NOT NULL,
        [PreviousStatus] VARCHAR(50) NULL,
        [NextStatus] VARCHAR(50) NULL,
        [Message] VARCHAR(255) NULL,
        [ProposedStartTime] DATETIME NULL,
        [ProposedEndTime] DATETIME NULL,
        [CreatedAt] DATETIME NOT NULL CONSTRAINT [DF_CoachingRequestAction_CreatedAt] DEFAULT GETUTCDATE(),
        CONSTRAINT [PK__CoachingRequestAction] PRIMARY KEY ([RequestActionID]),
        CONSTRAINT [FK_CoachingRequestAction_Request] FOREIGN KEY ([RequestID]) REFERENCES [dbo].[CoachingRequest]([RequestID]) ON DELETE CASCADE,
        CONSTRAINT [FK_CoachingRequestAction_User] FOREIGN KEY ([ActorUserID]) REFERENCES [dbo].[User]([UserID])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CoachingRequest_StudentUserID' AND object_id = OBJECT_ID(N'[dbo].[CoachingRequest]'))
    CREATE INDEX [IX_CoachingRequest_StudentUserID] ON [dbo].[CoachingRequest]([StudentUserID]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CoachingRequest_TeacherUserID' AND object_id = OBJECT_ID(N'[dbo].[CoachingRequest]'))
    CREATE INDEX [IX_CoachingRequest_TeacherUserID] ON [dbo].[CoachingRequest]([TeacherUserID]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CoachingRequest_Status' AND object_id = OBJECT_ID(N'[dbo].[CoachingRequest]'))
    CREATE INDEX [IX_CoachingRequest_Status] ON [dbo].[CoachingRequest]([Status]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CoachingRequest_RequestedAt' AND object_id = OBJECT_ID(N'[dbo].[CoachingRequest]'))
    CREATE INDEX [IX_CoachingRequest_RequestedAt] ON [dbo].[CoachingRequest]([RequestedAt]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CoachingRequest_CurrentStartTime_CurrentEndTime' AND object_id = OBJECT_ID(N'[dbo].[CoachingRequest]'))
    CREATE INDEX [IX_CoachingRequest_CurrentStartTime_CurrentEndTime] ON [dbo].[CoachingRequest]([CurrentStartTime], [CurrentEndTime]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CoachingRequestAction_RequestID' AND object_id = OBJECT_ID(N'[dbo].[CoachingRequestAction]'))
    CREATE INDEX [IX_CoachingRequestAction_RequestID] ON [dbo].[CoachingRequestAction]([RequestID]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CoachingRequestAction_ActorUserID' AND object_id = OBJECT_ID(N'[dbo].[CoachingRequestAction]'))
    CREATE INDEX [IX_CoachingRequestAction_ActorUserID] ON [dbo].[CoachingRequestAction]([ActorUserID]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CoachingRequestAction_CreatedAt' AND object_id = OBJECT_ID(N'[dbo].[CoachingRequestAction]'))
    CREATE INDEX [IX_CoachingRequestAction_CreatedAt] ON [dbo].[CoachingRequestAction]([CreatedAt]);
