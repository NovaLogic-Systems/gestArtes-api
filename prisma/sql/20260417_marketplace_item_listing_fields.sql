/*
  MarketplaceItem schema alignment.
  Adds category relation, image path, location and creation timestamp.
  This script is idempotent and can be rerun safely.
*/

IF OBJECT_ID(N'dbo.MarketplaceItem', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.MarketplaceItem', 'CategoryID') IS NULL
  BEGIN
    ALTER TABLE [dbo].[MarketplaceItem]
      ADD [CategoryID] INT NULL;
  END;

  IF COL_LENGTH('dbo.MarketplaceItem', 'PhotoURL') IS NULL
  BEGIN
    ALTER TABLE [dbo].[MarketplaceItem]
      ADD [PhotoURL] VARCHAR(255) NULL;
  END;

  IF COL_LENGTH('dbo.MarketplaceItem', 'Location') IS NULL
  BEGIN
    ALTER TABLE [dbo].[MarketplaceItem]
      ADD [Location] VARCHAR(100) NULL;
  END;

  IF COL_LENGTH('dbo.MarketplaceItem', 'CreatedAt') IS NULL
  BEGIN
    ALTER TABLE [dbo].[MarketplaceItem]
      ADD [CreatedAt] DATETIME NULL;
  END;

  IF COL_LENGTH('dbo.MarketplaceItem', 'CreatedAt') IS NOT NULL
  BEGIN
    EXEC sys.sp_executesql N'
      UPDATE [dbo].[MarketplaceItem]
      SET [CreatedAt] = GETDATE()
      WHERE [CreatedAt] IS NULL;
    ';

    EXEC sys.sp_executesql N'
      ALTER TABLE [dbo].[MarketplaceItem]
      ALTER COLUMN [CreatedAt] DATETIME NOT NULL;
    ';
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
      ON c.object_id = dc.parent_object_id
      AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.MarketplaceItem')
      AND c.name = 'CreatedAt'
  )
  BEGIN
    ALTER TABLE [dbo].[MarketplaceItem]
      ADD CONSTRAINT [DF_MarketplaceItem_CreatedAt] DEFAULT (GETDATE()) FOR [CreatedAt];
  END;

  IF OBJECT_ID(N'dbo.ItemCategory', N'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM sys.foreign_key_columns fkc
       INNER JOIN sys.columns pc
         ON pc.object_id = fkc.parent_object_id
         AND pc.column_id = fkc.parent_column_id
       WHERE fkc.parent_object_id = OBJECT_ID('dbo.MarketplaceItem')
         AND fkc.referenced_object_id = OBJECT_ID('dbo.ItemCategory')
         AND pc.name = 'CategoryID'
     )
  BEGIN
    ALTER TABLE [dbo].[MarketplaceItem] WITH CHECK
      ADD CONSTRAINT [FKMarketplac_CategoryID]
        FOREIGN KEY ([CategoryID]) REFERENCES [dbo].[ItemCategory]([CategoryID]);
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.MarketplaceItem')
      AND name = 'IX_MarketplaceItem_CategoryID'
  )
  BEGIN
    CREATE INDEX [IX_MarketplaceItem_CategoryID]
      ON [dbo].[MarketplaceItem] ([CategoryID]);
  END;
END;
