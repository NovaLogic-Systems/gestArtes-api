-- Migration: add_group_coaching_proposal (idempotent, uses EXEC for deferred parsing)

-- 1. GroupCoachingProposal table
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[GroupCoachingProposal]') AND type = N'U')
    EXEC('CREATE TABLE [GroupCoachingProposal] (
        [ProposalID]         INT            NOT NULL IDENTITY(1,1),
        [TeacherUserID]      INT            NOT NULL,
        [ModalityID]         INT            NOT NULL,
        [StudioID]           INT            NULL,
        [ConfirmedSessionID] INT            NULL,
        [StartTime]          DATETIME       NOT NULL,
        [EndTime]            DATETIME       NOT NULL,
        [Status]             NVARCHAR(50)   NOT NULL,
        [Notes]              NVARCHAR(500)  NULL,
        [AdminResponseNotes] NVARCHAR(255)  NULL,
        [RequestedAt]        DATETIME       NOT NULL,
        [UpdatedAt]          DATETIME       NULL,
        [ResolvedAt]         DATETIME       NULL,
        CONSTRAINT [PK__GroupCoachingProposal] PRIMARY KEY ([ProposalID])
    )');

-- 2. GroupCoachingParticipant table
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[GroupCoachingParticipant]') AND type = N'U')
    EXEC('CREATE TABLE [GroupCoachingParticipant] (
        [ParticipantID]   INT       NOT NULL IDENTITY(1,1),
        [ProposalID]      INT       NOT NULL,
        [StudentUserID]   INT       NOT NULL,
        [SourceRequestID] INT       NULL,
        [AddedAt]         DATETIME  NOT NULL,
        CONSTRAINT [PK__GroupCoachingParticipant] PRIMARY KEY ([ParticipantID])
    )');

-- 3. Add GroupProposalID column to CoachingRequest
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[CoachingRequest]') AND name = 'GroupProposalID'
)
    EXEC('ALTER TABLE [CoachingRequest] ADD [GroupProposalID] INT NULL');

-- 4. Indexes on GroupCoachingProposal
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[GroupCoachingProposal]') AND name = 'UQ__GroupCoachingProposal__ConfirmedSessionID')
    EXEC('CREATE UNIQUE INDEX [UQ__GroupCoachingProposal__ConfirmedSessionID] ON [GroupCoachingProposal]([ConfirmedSessionID]) WHERE [ConfirmedSessionID] IS NOT NULL');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[GroupCoachingProposal]') AND name = 'IX_GroupCoachingProposal_TeacherUserID')
    EXEC('CREATE INDEX [IX_GroupCoachingProposal_TeacherUserID] ON [GroupCoachingProposal]([TeacherUserID])');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[GroupCoachingProposal]') AND name = 'IX_GroupCoachingProposal_Status')
    EXEC('CREATE INDEX [IX_GroupCoachingProposal_Status] ON [GroupCoachingProposal]([Status])');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[GroupCoachingProposal]') AND name = 'IX_GroupCoachingProposal_StartTime')
    EXEC('CREATE INDEX [IX_GroupCoachingProposal_StartTime] ON [GroupCoachingProposal]([StartTime])');

-- 5. Indexes on GroupCoachingParticipant
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[GroupCoachingParticipant]') AND name = 'UQ__GroupCoachingParticipant__ProposalID_StudentUserID')
    EXEC('CREATE UNIQUE INDEX [UQ__GroupCoachingParticipant__ProposalID_StudentUserID] ON [GroupCoachingParticipant]([ProposalID], [StudentUserID])');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[GroupCoachingParticipant]') AND name = 'IX_GroupCoachingParticipant_ProposalID')
    EXEC('CREATE INDEX [IX_GroupCoachingParticipant_ProposalID] ON [GroupCoachingParticipant]([ProposalID])');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[GroupCoachingParticipant]') AND name = 'IX_GroupCoachingParticipant_StudentUserID')
    EXEC('CREATE INDEX [IX_GroupCoachingParticipant_StudentUserID] ON [GroupCoachingParticipant]([StudentUserID])');

-- 6. Filtered index on CoachingRequest.GroupProposalID (uses EXEC to defer column validation)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[CoachingRequest]') AND name = 'IX_CoachingRequest_GroupProposalID')
    EXEC('CREATE INDEX [IX_CoachingRequest_GroupProposalID] ON [CoachingRequest]([GroupProposalID]) WHERE [GroupProposalID] IS NOT NULL');

-- 7. Foreign keys on GroupCoachingProposal
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_GroupCoachingProposal_TeacherUser')
    EXEC('ALTER TABLE [GroupCoachingProposal] ADD CONSTRAINT [FK_GroupCoachingProposal_TeacherUser] FOREIGN KEY ([TeacherUserID]) REFERENCES [User]([UserID])');

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_GroupCoachingProposal_Modality')
    EXEC('ALTER TABLE [GroupCoachingProposal] ADD CONSTRAINT [FK_GroupCoachingProposal_Modality] FOREIGN KEY ([ModalityID]) REFERENCES [Modality]([ModalityID])');

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_GroupCoachingProposal_Studio')
    EXEC('ALTER TABLE [GroupCoachingProposal] ADD CONSTRAINT [FK_GroupCoachingProposal_Studio] FOREIGN KEY ([StudioID]) REFERENCES [Studio]([StudioID])');

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_GroupCoachingProposal_ConfirmedSession')
    EXEC('ALTER TABLE [GroupCoachingProposal] ADD CONSTRAINT [FK_GroupCoachingProposal_ConfirmedSession] FOREIGN KEY ([ConfirmedSessionID]) REFERENCES [CoachingSession]([SessionID])');

-- 8. Foreign keys on GroupCoachingParticipant
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_GroupCoachingParticipant_Proposal')
    EXEC('ALTER TABLE [GroupCoachingParticipant] ADD CONSTRAINT [FK_GroupCoachingParticipant_Proposal] FOREIGN KEY ([ProposalID]) REFERENCES [GroupCoachingProposal]([ProposalID]) ON DELETE CASCADE');

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_GroupCoachingParticipant_StudentUser')
    EXEC('ALTER TABLE [GroupCoachingParticipant] ADD CONSTRAINT [FK_GroupCoachingParticipant_StudentUser] FOREIGN KEY ([StudentUserID]) REFERENCES [User]([UserID])');

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_GroupCoachingParticipant_SourceRequest')
    EXEC('ALTER TABLE [GroupCoachingParticipant] ADD CONSTRAINT [FK_GroupCoachingParticipant_SourceRequest] FOREIGN KEY ([SourceRequestID]) REFERENCES [CoachingRequest]([RequestID])');

-- 9. FK on CoachingRequest.GroupProposalID (uses EXEC to defer column validation)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CoachingRequest_GroupProposal')
    EXEC('ALTER TABLE [CoachingRequest] ADD CONSTRAINT [FK_CoachingRequest_GroupProposal] FOREIGN KEY ([GroupProposalID]) REFERENCES [GroupCoachingProposal]([ProposalID])');
