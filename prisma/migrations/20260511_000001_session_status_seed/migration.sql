IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[SessionStatus]
    WHERE [StatusName] = 'Pending_Approval'
)
BEGIN
    INSERT INTO [dbo].[SessionStatus] ([StatusName])
    VALUES ('Pending_Approval');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[SessionStatus]
    WHERE [StatusName] = 'Approved'
)
BEGIN
    INSERT INTO [dbo].[SessionStatus] ([StatusName])
    VALUES ('Approved');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[SessionStatus]
    WHERE [StatusName] = 'Rejected'
)
BEGIN
    INSERT INTO [dbo].[SessionStatus] ([StatusName])
    VALUES ('Rejected');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[SessionStatus]
    WHERE [StatusName] = 'Cancelled'
)
BEGIN
    INSERT INTO [dbo].[SessionStatus] ([StatusName])
    VALUES ('Cancelled');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[SessionStatus]
    WHERE [StatusName] = 'Cancelled_Justified'
)
BEGIN
    INSERT INTO [dbo].[SessionStatus] ([StatusName])
    VALUES ('Cancelled_Justified');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[SessionStatus]
    WHERE [StatusName] = 'Completion_Confirmation_Pending'
)
BEGIN
    INSERT INTO [dbo].[SessionStatus] ([StatusName])
    VALUES ('Completion_Confirmation_Pending');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[SessionStatus]
    WHERE [StatusName] = 'Finalization_Validation_Pending'
)
BEGIN
    INSERT INTO [dbo].[SessionStatus] ([StatusName])
    VALUES ('Finalization_Validation_Pending');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[SessionStatus]
    WHERE [StatusName] = 'Finalized'
)
BEGIN
    INSERT INTO [dbo].[SessionStatus] ([StatusName])
    VALUES ('Finalized');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[SessionStatus]
    WHERE [StatusName] = 'No_Show'
)
BEGIN
    INSERT INTO [dbo].[SessionStatus] ([StatusName])
    VALUES ('No_Show');
END;
