IF NOT EXISTS (SELECT 1 FROM dbo.NotificationType WHERE TypeName = 'system')
BEGIN
    INSERT INTO dbo.NotificationType (TypeName) VALUES ('system');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.NotificationType WHERE TypeName = 'coaching')
BEGIN
    INSERT INTO dbo.NotificationType (TypeName) VALUES ('coaching');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.NotificationType WHERE TypeName = 'marketplace')
BEGIN
    INSERT INTO dbo.NotificationType (TypeName) VALUES ('marketplace');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.NotificationType WHERE TypeName = 'schedule')
BEGIN
    INSERT INTO dbo.NotificationType (TypeName) VALUES ('schedule');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.NotificationType WHERE TypeName = 'penalty')
BEGIN
    INSERT INTO dbo.NotificationType (TypeName) VALUES ('penalty');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.NotificationType WHERE TypeName = 'join_request')
BEGIN
    INSERT INTO dbo.NotificationType (TypeName) VALUES ('join_request');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.NotificationType WHERE TypeName = 'inventory')
BEGIN
    INSERT INTO dbo.NotificationType (TypeName) VALUES ('inventory');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.NotificationType WHERE TypeName = 'account')
BEGIN
    INSERT INTO dbo.NotificationType (TypeName) VALUES ('account');
END;