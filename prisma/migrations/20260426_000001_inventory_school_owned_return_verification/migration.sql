IF COL_LENGTH('dbo.InventoryItem', 'IsSchoolOwned') IS NULL
BEGIN
  ALTER TABLE dbo.InventoryItem
  ADD IsSchoolOwned bit NOT NULL
    CONSTRAINT DF_InventoryItem_IsSchoolOwned DEFAULT (1);
END;

IF COL_LENGTH('dbo.InventoryTransaction', 'ReturnConditionStatus') IS NULL
BEGIN
  ALTER TABLE dbo.InventoryTransaction
  ADD ReturnConditionStatus varchar(50) NULL;
END;

IF COL_LENGTH('dbo.InventoryTransaction', 'ReturnConditionNotes') IS NULL
BEGIN
  ALTER TABLE dbo.InventoryTransaction
  ADD ReturnConditionNotes varchar(255) NULL;
END;

IF COL_LENGTH('dbo.InventoryTransaction', 'ReturnVerifiedAt') IS NULL
BEGIN
  ALTER TABLE dbo.InventoryTransaction
  ADD ReturnVerifiedAt datetime NULL;
END;
