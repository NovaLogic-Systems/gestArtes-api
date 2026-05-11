-- ============================================================================
-- Seed SQL: ValidationStep table
-- File: prisma/sql/20260511_seed_validation_steps.sql
-- Author: NovaLogic System
-- Institution: IPCA
-- Project: GestArtes - Projeto 50+10 para Entartes
-- Description: Inserts the required validation steps for session validation flow
-- ============================================================================

-- Check if ValidationStep table exists and create if not
IF OBJECT_ID('ValidationStep', 'U') IS NULL
BEGIN
    CREATE TABLE ValidationStep (
        StepID INT IDENTITY(1,1) PRIMARY KEY,
        StepName NVARCHAR(50) UNIQUE NOT NULL
    );
END

-- Insert TeacherConfirmation step if not exists
IF OBJECT_ID('ValidationStep', 'U') IS NOT NULL
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ValidationStep WHERE StepName = 'TeacherConfirmation')
    BEGIN
        INSERT INTO ValidationStep (StepName) VALUES ('TeacherConfirmation');
    END

    -- Insert StudentConfirmation step if not exists
    IF NOT EXISTS (SELECT 1 FROM ValidationStep WHERE StepName = 'StudentConfirmation')
    BEGIN
        INSERT INTO ValidationStep (StepName) VALUES ('StudentConfirmation');
    END

    -- Insert AdminFinalValidation step if not exists
    IF NOT EXISTS (SELECT 1 FROM ValidationStep WHERE StepName = 'AdminFinalValidation')
    BEGIN
        INSERT INTO ValidationStep (StepName) VALUES ('AdminFinalValidation');
    END
END
