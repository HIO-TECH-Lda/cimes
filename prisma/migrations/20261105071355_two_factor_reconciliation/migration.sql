BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[TwoFactor] ADD [failedVerificationCount] INT CONSTRAINT [TwoFactor_failedVerificationCount_df] DEFAULT 0,
[lockedUntil] DATETIME2,
[verified] BIT CONSTRAINT [TwoFactor_verified_df] DEFAULT 1;

-- CreateIndex
CREATE NONCLUSTERED INDEX [TwoFactor_secret_idx] ON [dbo].[TwoFactor]([secret]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
