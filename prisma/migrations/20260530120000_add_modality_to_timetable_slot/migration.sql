BEGIN TRY

BEGIN TRAN;

-- AlterTable: add optional ModalityID to TimetableSlot
ALTER TABLE [dbo].[TimetableSlot] ADD [ModalityID] INT;

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_TimetableSlot_ModalityID] ON [dbo].[TimetableSlot]([ModalityID]);

-- AddForeignKey
ALTER TABLE [dbo].[TimetableSlot] ADD CONSTRAINT [FK_TimetableSlot_Modality] FOREIGN KEY ([ModalityID]) REFERENCES [dbo].[Modality]([ModalityID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
