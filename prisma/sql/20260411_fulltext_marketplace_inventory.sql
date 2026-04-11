/*
  Full-text index setup for Marketplace and Inventory.
  This script is idempotent and can be rerun safely.
*/

IF ISNULL(CONVERT(int, FULLTEXTSERVICEPROPERTY('IsFullTextInstalled')), 0) = 1
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM sys.fulltext_catalogs
    WHERE name = 'ft_gestArtes'
  )
  BEGIN
    CREATE FULLTEXT CATALOG ft_gestArtes AS DEFAULT;
  END;
END;
GO

IF ISNULL(CONVERT(int, FULLTEXTSERVICEPROPERTY('IsFullTextInstalled')), 0) = 1
BEGIN
  DECLARE @marketplacePkIndex sysname;
  DECLARE @inventoryPkIndex sysname;
  DECLARE @sql NVARCHAR(MAX);

  SELECT @marketplacePkIndex = i.name
  FROM sys.indexes i
  INNER JOIN sys.key_constraints kc
    ON kc.parent_object_id = i.object_id
    AND kc.unique_index_id = i.index_id
  WHERE kc.parent_object_id = OBJECT_ID('dbo.MarketplaceItem')
    AND kc.type = 'PK';

  SELECT @inventoryPkIndex = i.name
  FROM sys.indexes i
  INNER JOIN sys.key_constraints kc
    ON kc.parent_object_id = i.object_id
    AND kc.unique_index_id = i.index_id
  WHERE kc.parent_object_id = OBJECT_ID('dbo.InventoryItem')
    AND kc.type = 'PK';

  IF OBJECT_ID('dbo.MarketplaceItem', 'U') IS NOT NULL
     AND @marketplacePkIndex IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM sys.columns c
       WHERE c.object_id = OBJECT_ID('dbo.MarketplaceItem')
         AND c.name = 'Title'
     )
     AND EXISTS (
       SELECT 1
       FROM sys.columns c
       WHERE c.object_id = OBJECT_ID('dbo.MarketplaceItem')
         AND c.name = 'Description'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM sys.fulltext_indexes fi
       WHERE fi.object_id = OBJECT_ID('dbo.MarketplaceItem')
     )
  BEGIN
      SET @sql = N'CREATE FULLTEXT INDEX ON dbo.MarketplaceItem
      (
        Title LANGUAGE 2070,
        Description LANGUAGE 2070
      )
        KEY INDEX [' + REPLACE(@marketplacePkIndex, N']', N']]') + N']
      WITH CHANGE_TRACKING AUTO;';

    EXEC sys.sp_executesql @sql;
  END;

  IF OBJECT_ID('dbo.InventoryItem', 'U') IS NOT NULL
     AND @inventoryPkIndex IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM sys.columns c
       WHERE c.object_id = OBJECT_ID('dbo.InventoryItem')
         AND c.name = 'ItemName'
     )
     AND EXISTS (
       SELECT 1
       FROM sys.columns c
       WHERE c.object_id = OBJECT_ID('dbo.InventoryItem')
         AND c.name = 'Description'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM sys.fulltext_indexes fi
       WHERE fi.object_id = OBJECT_ID('dbo.InventoryItem')
     )
  BEGIN
      SET @sql = N'CREATE FULLTEXT INDEX ON dbo.InventoryItem
      (
        ItemName LANGUAGE 2070,
        Description LANGUAGE 2070
      )
        KEY INDEX [' + REPLACE(@inventoryPkIndex, N']', N']]') + N']
      WITH CHANGE_TRACKING AUTO;';

    EXEC sys.sp_executesql @sql;
  END;
END;
GO
