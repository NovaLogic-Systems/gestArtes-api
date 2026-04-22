IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UQ_FinancialSummary_Period'
      AND object_id = OBJECT_ID('dbo.FinancialSummary')
)
BEGIN
    CREATE UNIQUE INDEX [UQ_FinancialSummary_Period]
        ON [dbo].[FinancialSummary] ([PeriodStart], [PeriodEnd]);
END;
