IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[TeacherAvailabilityStatus]
    WHERE [StatusName] = 'Pending'
)
BEGIN
    INSERT INTO [dbo].[TeacherAvailabilityStatus] ([StatusName])
    VALUES ('Pending');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[TeacherAvailabilityStatus]
    WHERE [StatusName] = 'Approved'
)
BEGIN
    INSERT INTO [dbo].[TeacherAvailabilityStatus] ([StatusName])
    VALUES ('Approved');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[TeacherAvailabilityStatus]
    WHERE [StatusName] = 'Rejected'
)
BEGIN
    INSERT INTO [dbo].[TeacherAvailabilityStatus] ([StatusName])
    VALUES ('Rejected');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[TeacherAbsenceStatus]
    WHERE [StatusName] = 'Pending'
)
BEGIN
    INSERT INTO [dbo].[TeacherAbsenceStatus] ([StatusName])
    VALUES ('Pending');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[TeacherAbsenceStatus]
    WHERE [StatusName] = 'Approved'
)
BEGIN
    INSERT INTO [dbo].[TeacherAbsenceStatus] ([StatusName])
    VALUES ('Approved');
END;

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[TeacherAbsenceStatus]
    WHERE [StatusName] = 'Rejected'
)
BEGIN
    INSERT INTO [dbo].[TeacherAbsenceStatus] ([StatusName])
    VALUES ('Rejected');
END;
