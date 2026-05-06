CREATE TABLE [dbo].[AuditLog] (
    [AuditLogID] INT IDENTITY(1,1) NOT NULL,
    [AuditTimestamp] DATETIME2 NOT NULL CONSTRAINT [DF_AuditLog_AuditTimestamp] DEFAULT SYSDATETIME(),
    [UserID] INT NULL,
    [UserName] VARCHAR(100) NULL,
    [UserRole] VARCHAR(50) NULL,
    [Action] VARCHAR(80) NOT NULL,
    [Module] VARCHAR(50) NOT NULL,
    [TargetType] VARCHAR(100) NULL,
    [TargetID] VARCHAR(100) NULL,
    [Result] VARCHAR(20) NOT NULL,
    [Detail] VARCHAR(255) NULL,
    CONSTRAINT [PK_AuditLog] PRIMARY KEY ([AuditLogID])
);

CREATE INDEX [IX_AuditLog_AuditTimestamp] ON [dbo].[AuditLog]([AuditTimestamp]);
CREATE INDEX [IX_AuditLog_Module] ON [dbo].[AuditLog]([Module]);
CREATE INDEX [IX_AuditLog_Action] ON [dbo].[AuditLog]([Action]);
CREATE INDEX [IX_AuditLog_UserID] ON [dbo].[AuditLog]([UserID]);
CREATE INDEX [IX_AuditLog_Result] ON [dbo].[AuditLog]([Result]);

ALTER TABLE [dbo].[AuditLog] ADD CONSTRAINT [FK_AuditLog_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]);