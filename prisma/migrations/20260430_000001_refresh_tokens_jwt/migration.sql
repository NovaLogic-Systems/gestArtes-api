-- CreateTable
CREATE TABLE [dbo].[RefreshToken] (
    [RefreshTokenID] INT NOT NULL IDENTITY(1,1),
    [UserID] INT NOT NULL,
    [TokenJti] VARCHAR(128) NOT NULL,
    [TokenHash] CHAR(64) NOT NULL,
    [CreatedAt] DATETIME NOT NULL,
    [ExpiresAt] DATETIME NOT NULL,
    [RevokedAt] DATETIME,
    [CreatedByIp] VARCHAR(45),
    [CreatedByUserAgent] VARCHAR(255),
    CONSTRAINT [PK__RefreshT__0D3C4A0B1E72A5BE] PRIMARY KEY CLUSTERED ([RefreshTokenID]),
    CONSTRAINT [UQ__RefreshT__7C8FE9B5C2A4B6AF] UNIQUE ([TokenJti]),
    CONSTRAINT [UQ__RefreshT__A7B3B5AE6C9A4B13] UNIQUE ([TokenHash])
);

-- CreateIndex
CREATE INDEX [IX_RefreshToken_UserID] ON [dbo].[RefreshToken]([UserID]);

-- CreateIndex
CREATE INDEX [IX_RefreshToken_ExpiresAt] ON [dbo].[RefreshToken]([ExpiresAt]);

-- CreateIndex
CREATE INDEX [IX_RefreshToken_RevokedAt] ON [dbo].[RefreshToken]([RevokedAt]);

-- AddForeignKey
ALTER TABLE [dbo].[RefreshToken] ADD CONSTRAINT [FKRefreshTok_User] FOREIGN KEY ([UserID]) REFERENCES [dbo].[User]([UserID]) ON DELETE CASCADE ON UPDATE NO ACTION;