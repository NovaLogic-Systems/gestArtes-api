BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[InventoryItem] ALTER COLUMN [Description] VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE [dbo].[ItemCategory] ALTER COLUMN [Description] VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE [dbo].[LostAndFoundItem] ALTER COLUMN [Description] VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE [dbo].[MarketplaceItem] ALTER COLUMN [Description] VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE [dbo].[Role] ALTER COLUMN [Description] VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE [dbo].[SchoolEvent] ALTER COLUMN [Description] VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE [dbo].[SessionPricingRate] ALTER COLUMN [Description] VARCHAR(500) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
