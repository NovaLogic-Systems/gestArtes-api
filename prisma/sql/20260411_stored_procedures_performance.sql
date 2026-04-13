/*
  Stored procedures for common heavy-read scenarios.
  This script is idempotent and can be rerun safely.
*/
GO

CREATE OR ALTER PROCEDURE dbo.usp_GetPendingFinancialEntries
  @StartDate DATETIME = NULL,
  @EndDate DATETIME = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    fe.EntryID,
    fe.SessionID,
    fe.Amount,
    fe.EntryTypeID,
    fe.CreatedAt,
    fe.FinancialSummaryID
  FROM dbo.FinancialEntry fe
  WHERE fe.IsExported = 0
    AND (@StartDate IS NULL OR fe.CreatedAt >= @StartDate)
    AND (@EndDate IS NULL OR fe.CreatedAt <= @EndDate)
  ORDER BY fe.CreatedAt ASC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_SearchMarketplaceItems
  @Query NVARCHAR(255) = NULL,
  @StatusID INT = NULL,
  @SellerID INT = NULL,
  @MinPrice DECIMAL(10, 2) = NULL,
  @MaxPrice DECIMAL(10, 2) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF @Query IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM sys.fulltext_indexes fi
       WHERE fi.object_id = OBJECT_ID('dbo.MarketplaceItem')
     )
  BEGIN
    SELECT
      mi.MarketplaceItemID,
      mi.SellerID,
      mi.Title,
      mi.Description,
      mi.Price,
      mi.ConditionID,
      mi.StatusID,
      mi.IsActive
    FROM dbo.MarketplaceItem mi
    WHERE mi.IsActive = 1
      AND (@StatusID IS NULL OR mi.StatusID = @StatusID)
      AND (@SellerID IS NULL OR mi.SellerID = @SellerID)
      AND (@MinPrice IS NULL OR mi.Price >= @MinPrice)
      AND (@MaxPrice IS NULL OR mi.Price <= @MaxPrice)
      AND CONTAINS((mi.Title, mi.Description), @Query)
    ORDER BY mi.MarketplaceItemID DESC;

    RETURN;
  END;

  SELECT
    mi.MarketplaceItemID,
    mi.SellerID,
    mi.Title,
    mi.Description,
    mi.Price,
    mi.ConditionID,
    mi.StatusID,
    mi.IsActive
  FROM dbo.MarketplaceItem mi
  WHERE mi.IsActive = 1
    AND (@StatusID IS NULL OR mi.StatusID = @StatusID)
    AND (@SellerID IS NULL OR mi.SellerID = @SellerID)
    AND (@MinPrice IS NULL OR mi.Price >= @MinPrice)
    AND (@MaxPrice IS NULL OR mi.Price <= @MaxPrice)
    AND (
      @Query IS NULL
      OR mi.Title LIKE '%' + @Query + '%'
      OR mi.Description LIKE '%' + @Query + '%'
    )
  ORDER BY mi.MarketplaceItemID DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_CheckInventoryAvailability
  @InventoryItemID INT,
  @StartDate DATETIME,
  @EndDate DATETIME
AS
BEGIN
  SET NOCOUNT ON;

  IF @StartDate IS NULL OR @EndDate IS NULL OR @StartDate >= @EndDate
  BEGIN
    RAISERROR('Invalid date range. StartDate must be less than EndDate.', 16, 1);
    RETURN;
  END;

  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM dbo.InventoryTransaction it
        WHERE it.InventoryItemID = @InventoryItemID
          AND it.IsCompleted = 0
          AND it.StartDate < @EndDate
          AND (it.EndDate IS NULL OR it.EndDate > @StartDate)
      ) THEN CAST(0 AS BIT)
      ELSE CAST(1 AS BIT)
    END AS IsAvailable;
END;
GO
