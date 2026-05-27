IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[SessionStatus]
    WHERE [StatusName] = 'Pending_Teacher'
)
BEGIN
    INSERT INTO [dbo].[SessionStatus] ([StatusName])
    VALUES ('Pending_Teacher');
END;
