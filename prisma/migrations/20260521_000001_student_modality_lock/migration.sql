BEGIN TRY
  BEGIN TRAN;
  
  -- AlterTable
  ALTER TABLE [dbo].[StudentAccount] ADD [IsModalityLocked] BIT NOT NULL CONSTRAINT [StudentAccount_IsModalityLocked_df] DEFAULT 0;

  -- CreateTable
  CREATE TABLE [dbo].[StudentAllowedModality] (
      [StudentAccountID] INT NOT NULL,
      [ModalityID] INT NOT NULL,
      CONSTRAINT [StudentAllowedModality_pkey] PRIMARY KEY CLUSTERED ([StudentAccountID], [ModalityID])
  );

  -- AddForeignKey
  ALTER TABLE [dbo].[StudentAllowedModality] ADD CONSTRAINT [StudentAllowedModality_ModalityID_fkey] FOREIGN KEY ([ModalityID]) REFERENCES [dbo].[Modality]([ModalityID]) ON DELETE CASCADE ON UPDATE NO ACTION;

  -- AddForeignKey
  ALTER TABLE [dbo].[StudentAllowedModality] ADD CONSTRAINT [StudentAllowedModality_StudentAccountID_fkey] FOREIGN KEY ([StudentAccountID]) REFERENCES [dbo].[StudentAccount]([StudentAccountID]) ON DELETE CASCADE ON UPDATE NO ACTION;

  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
  BEGIN
      ROLLBACK TRAN;
  END;
  THROW;
END CATCH