IF OBJECT_ID(N'dbo.Sessions', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[Sessions](
    [sid] NVARCHAR(255) NOT NULL PRIMARY KEY,
    [session] NVARCHAR(MAX) NOT NULL,
    [expires] DATETIME NOT NULL
  );

  CREATE INDEX [IX_Sessions_Expires] ON [dbo].[Sessions] ([expires]);
END;
