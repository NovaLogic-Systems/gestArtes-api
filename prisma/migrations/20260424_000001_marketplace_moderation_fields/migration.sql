IF COL_LENGTH('dbo.MarketplaceItem', 'RejectionReason') IS NULL
BEGIN
    ALTER TABLE [dbo].[MarketplaceItem]
        ADD [RejectionReason] VARCHAR(255) NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[MarketplaceItemStatus]
    WHERE [StatusName] = 'Pending'
)
BEGIN
    INSERT INTO [dbo].[MarketplaceItemStatus] ([StatusName])
    VALUES ('Pending');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[MarketplaceItemStatus]
    WHERE [StatusName] = 'Approved'
)
BEGIN
    INSERT INTO [dbo].[MarketplaceItemStatus] ([StatusName])
    VALUES ('Approved');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[MarketplaceItemStatus]
    WHERE [StatusName] = 'Rejected'
)
BEGIN
    INSERT INTO [dbo].[MarketplaceItemStatus] ([StatusName])
    VALUES ('Rejected');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[MarketplaceItemStatus]
    WHERE [StatusName] = 'Removed'
)
BEGIN
    INSERT INTO [dbo].[MarketplaceItemStatus] ([StatusName])
    VALUES ('Removed');
END;