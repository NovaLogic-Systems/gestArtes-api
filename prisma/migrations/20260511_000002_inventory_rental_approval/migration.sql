IF COL_LENGTH('dbo.InventoryTransaction', 'ApprovalStatus') IS NULL
BEGIN
    ALTER TABLE [dbo].[InventoryTransaction]
    ADD [ApprovalStatus] VARCHAR(20) NULL;
END;

IF COL_LENGTH('dbo.InventoryTransaction', 'ApprovedAt') IS NULL
BEGIN
    ALTER TABLE [dbo].[InventoryTransaction]
    ADD [ApprovedAt] DATETIME NULL;
END;

IF COL_LENGTH('dbo.InventoryTransaction', 'ApprovalNotes') IS NULL
BEGIN
    ALTER TABLE [dbo].[InventoryTransaction]
    ADD [ApprovalNotes] VARCHAR(255) NULL;
END;

UPDATE [dbo].[InventoryTransaction]
SET [ApprovalStatus] = 'approved', [ApprovedAt] = ISNULL([StartDate], GETUTCDATE())
WHERE [ApprovalStatus] IS NULL;
