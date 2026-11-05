BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[AppUser] (
    [id] VARCHAR(30) NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [email] VARCHAR(254) NOT NULL,
    [emailVerified] BIT NOT NULL CONSTRAINT [AppUser_emailVerified_df] DEFAULT 0,
    [image] VARCHAR(500),
    [twoFactorEnabled] BIT NOT NULL CONSTRAINT [AppUser_twoFactorEnabled_df] DEFAULT 0,
    [userType] VARCHAR(10) NOT NULL,
    [status] VARCHAR(10) NOT NULL CONSTRAINT [AppUser_status_df] DEFAULT 'ACTIVE',
    [lockedUntil] DATETIME2,
    [lastSeenAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AppUser_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [AppUser_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AppUser_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[Session] (
    [id] VARCHAR(30) NOT NULL,
    [token] VARCHAR(255) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [ipAddress] VARCHAR(45),
    [userAgent] NVARCHAR(500),
    [userId] VARCHAR(30) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Session_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Session_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Session_token_key] UNIQUE NONCLUSTERED ([token])
);

-- CreateTable
CREATE TABLE [dbo].[Account] (
    [id] VARCHAR(30) NOT NULL,
    [accountId] VARCHAR(255) NOT NULL,
    [providerId] VARCHAR(50) NOT NULL,
    [userId] VARCHAR(30) NOT NULL,
    [accessToken] NVARCHAR(max),
    [refreshToken] NVARCHAR(max),
    [idToken] NVARCHAR(max),
    [accessTokenExpiresAt] DATETIME2,
    [refreshTokenExpiresAt] DATETIME2,
    [scope] NVARCHAR(1000),
    [password] VARCHAR(255),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Account_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Account_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Verification] (
    [id] VARCHAR(30) NOT NULL,
    [identifier] VARCHAR(255) NOT NULL,
    [value] NVARCHAR(max) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Verification_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Verification_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TwoFactor] (
    [id] VARCHAR(30) NOT NULL,
    [secret] VARCHAR(255) NOT NULL,
    [backupCodes] NVARCHAR(max) NOT NULL,
    [userId] VARCHAR(30) NOT NULL,
    CONSTRAINT [TwoFactor_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RoleAssignment] (
    [id] VARCHAR(30) NOT NULL,
    [userId] VARCHAR(30) NOT NULL,
    [role] VARCHAR(20) NOT NULL,
    [departmentId] VARCHAR(30),
    [validFrom] DATETIME2 NOT NULL CONSTRAINT [RoleAssignment_validFrom_df] DEFAULT CURRENT_TIMESTAMP,
    [validTo] DATETIME2,
    [reason] NVARCHAR(300),
    [grantedById] VARCHAR(30) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RoleAssignment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RoleAssignment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[StaffProfile] (
    [id] VARCHAR(30) NOT NULL,
    [employeeNumber] VARCHAR(30) NOT NULL,
    [fullName] NVARCHAR(120) NOT NULL,
    [email] VARCHAR(254) NOT NULL,
    [departmentId] VARCHAR(30) NOT NULL,
    [jobTitle] NVARCHAR(120),
    [active] BIT NOT NULL CONSTRAINT [StaffProfile_active_df] DEFAULT 1,
    [userId] VARCHAR(30),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StaffProfile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [StaffProfile_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StaffProfile_employeeNumber_key] UNIQUE NONCLUSTERED ([employeeNumber]),
    CONSTRAINT [StaffProfile_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[Location] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(20) NOT NULL,
    [name] NVARCHAR(80) NOT NULL,
    [province] VARCHAR(20) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [Location_active_df] DEFAULT 1,
    CONSTRAINT [Location_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Location_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Department] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(20) NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [locationId] VARCHAR(30) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [Department_active_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Department_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Department_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Department_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Institution] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(30) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [acronym] NVARCHAR(30),
    [kind] VARCHAR(10) NOT NULL,
    [province] VARCHAR(20),
    [active] BIT NOT NULL CONSTRAINT [Institution_active_df] DEFAULT 1,
    CONSTRAINT [Institution_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Institution_code_key] UNIQUE NONCLUSTERED ([code]),
    CONSTRAINT [Institution_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[FieldOfStudy] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(40) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [FieldOfStudy_active_df] DEFAULT 1,
    CONSTRAINT [FieldOfStudy_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FieldOfStudy_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Course] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(40) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [level] VARCHAR(15) NOT NULL,
    [fieldOfStudyId] VARCHAR(30) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [Course_active_df] DEFAULT 1,
    CONSTRAINT [Course_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Course_code_key] UNIQUE NONCLUSTERED ([code]),
    CONSTRAINT [Course_name_level_key] UNIQUE NONCLUSTERED ([name],[level])
);

-- CreateTable
CREATE TABLE [dbo].[KeySubject] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(40) NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [synonymsJson] NVARCHAR(max) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [KeySubject_active_df] DEFAULT 1,
    CONSTRAINT [KeySubject_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [KeySubject_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Skill] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(40) NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [category] NVARCHAR(60),
    [synonymsJson] NVARCHAR(max) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [Skill_active_df] DEFAULT 1,
    CONSTRAINT [Skill_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Skill_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[RecruitmentCycle] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(20) NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [startDate] DATE NOT NULL,
    [endDate] DATE NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [RecruitmentCycle_active_df] DEFAULT 1,
    CONSTRAINT [RecruitmentCycle_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RecruitmentCycle_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[ChecklistTemplateItem] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(30) NOT NULL,
    [label] NVARCHAR(200) NOT NULL,
    [ownerRole] VARCHAR(20) NOT NULL,
    [sortOrder] INT NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [ChecklistTemplateItem_active_df] DEFAULT 1,
    CONSTRAINT [ChecklistTemplateItem_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ChecklistTemplateItem_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Holiday] (
    [id] VARCHAR(30) NOT NULL,
    [holidayDate] DATE NOT NULL,
    [observedDate] DATE NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [scope] VARCHAR(10) NOT NULL,
    [locationId] VARCHAR(30),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Holiday_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Holiday_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Setting] (
    [code] VARCHAR(100) NOT NULL,
    [valueJson] NVARCHAR(max) NOT NULL,
    [updatedById] VARCHAR(30),
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Setting_pkey] PRIMARY KEY CLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[SequenceCounter] (
    [code] VARCHAR(30) NOT NULL,
    [value] INT NOT NULL,
    CONSTRAINT [SequenceCounter_pkey] PRIMARY KEY CLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[CandidateProfile] (
    [id] VARCHAR(30) NOT NULL,
    [userId] VARCHAR(30) NOT NULL,
    [fullName] NVARCHAR(120) NOT NULL,
    [birthDate] DATE,
    [sex] VARCHAR(12),
    [biNumberEnc] VARCHAR(500),
    [biNumberHash] VARCHAR(64),
    [biExpiryDate] DATE,
    [nuitEnc] VARCHAR(500),
    [phoneE164] VARCHAR(16),
    [phoneAltE164] VARCHAR(16),
    [province] VARCHAR(20),
    [city] NVARCHAR(80),
    [neighbourhood] NVARCHAR(80),
    [institutionId] VARCHAR(30),
    [institutionOther] NVARCHAR(150),
    [courseId] VARCHAR(30),
    [courseOther] NVARCHAR(150),
    [academicStatus] VARCHAR(10),
    [graduationDate] DATE,
    [declaredAverage] DECIMAL(4,2),
    [languagesJson] NVARCHAR(max),
    [availableLocationsJson] NVARCHAR(max),
    [talentPoolConsent] BIT NOT NULL CONSTRAINT [CandidateProfile_talentPoolConsent_df] DEFAULT 0,
    [legalHold] BIT NOT NULL CONSTRAINT [CandidateProfile_legalHold_df] DEFAULT 0,
    [legalHoldReason] NVARCHAR(300),
    [profileCompletedAt] DATETIME2,
    [lastActivityAt] DATETIME2,
    [anonymizedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CandidateProfile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CandidateProfile_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CandidateProfile_userId_key] UNIQUE NONCLUSTERED ([userId])
);

-- CreateTable
CREATE TABLE [dbo].[CandidateSkill] (
    [candidateId] VARCHAR(30) NOT NULL,
    [skillId] VARCHAR(30) NOT NULL,
    [source] VARCHAR(5) NOT NULL,
    [confirmed] BIT NOT NULL CONSTRAINT [CandidateSkill_confirmed_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CandidateSkill_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CandidateSkill_pkey] PRIMARY KEY CLUSTERED ([candidateId],[skillId])
);

-- CreateTable
CREATE TABLE [dbo].[StoredFile] (
    [id] VARCHAR(30) NOT NULL,
    [storageKey] VARCHAR(200) NOT NULL,
    [purpose] VARCHAR(25) NOT NULL,
    [originalName] NVARCHAR(255) NOT NULL,
    [mimeType] VARCHAR(100) NOT NULL,
    [sizeBytes] INT NOT NULL,
    [sha256] VARCHAR(64) NOT NULL,
    [keyId] VARCHAR(40) NOT NULL,
    [pageCount] INT,
    [scanStatus] VARCHAR(12) NOT NULL CONSTRAINT [StoredFile_scanStatus_df] DEFAULT 'NOT_SCANNED',
    [uploadedById] VARCHAR(30),
    [expiresAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StoredFile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [deletedAt] DATETIME2,
    CONSTRAINT [StoredFile_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StoredFile_storageKey_key] UNIQUE NONCLUSTERED ([storageKey])
);

-- CreateTable
CREATE TABLE [dbo].[CandidateDocument] (
    [id] VARCHAR(30) NOT NULL,
    [candidateId] VARCHAR(30) NOT NULL,
    [type] VARCHAR(16) NOT NULL,
    [fileId] VARCHAR(30) NOT NULL,
    [status] VARCHAR(10) NOT NULL CONSTRAINT [CandidateDocument_status_df] DEFAULT 'UPLOADED',
    [rejectionReason] NVARCHAR(500),
    [validatedById] VARCHAR(30),
    [validatedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CandidateDocument_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CandidateDocument_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CandidateDocument_fileId_key] UNIQUE NONCLUSTERED ([fileId])
);

-- CreateTable
CREATE TABLE [dbo].[Transcript] (
    [id] VARCHAR(30) NOT NULL,
    [candidateId] VARCHAR(30) NOT NULL,
    [documentId] VARCHAR(30) NOT NULL,
    [source] VARCHAR(6) NOT NULL,
    [status] VARCHAR(25) NOT NULL,
    [institutionName] NVARCHAR(200),
    [courseName] NVARCHAR(200),
    [studentName] NVARCHAR(200),
    [detectedScale] VARCHAR(12),
    [computedAverage] DECIMAL(4,2),
    [averageMethod] VARCHAR(7),
    [declaredAverageOnDoc] DECIMAL(4,2),
    [flagsJson] NVARCHAR(max),
    [aiRunId] VARCHAR(30),
    [confirmedByCandidateAt] DATETIME2,
    [validatedById] VARCHAR(30),
    [validatedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Transcript_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Transcript_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Transcript_documentId_key] UNIQUE NONCLUSTERED ([documentId])
);

-- CreateTable
CREATE TABLE [dbo].[TranscriptSubject] (
    [id] VARCHAR(30) NOT NULL,
    [transcriptId] VARCHAR(30) NOT NULL,
    [sortOrder] INT NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [normalizedName] NVARCHAR(200) NOT NULL,
    [curricularYear] INT,
    [semester] INT,
    [credits] DECIMAL(5,1),
    [grade] DECIMAL(4,2),
    [result] VARCHAR(12) NOT NULL,
    [keySubjectId] VARCHAR(30),
    [confidence] DECIMAL(3,2),
    [aiOriginalJson] NVARCHAR(max),
    [correctedById] VARCHAR(30),
    [correctedAt] DATETIME2,
    CONSTRAINT [TranscriptSubject_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Opening] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(20) NOT NULL,
    [title] NVARCHAR(150) NOT NULL,
    [departmentId] VARCHAR(30) NOT NULL,
    [locationId] VARCHAR(30) NOT NULL,
    [cycleId] VARCHAR(30),
    [positions] INT NOT NULL,
    [description] NVARCHAR(4000) NOT NULL,
    [requirements] NVARCHAR(4000) NOT NULL,
    [acceptsFinalists] BIT NOT NULL,
    [acceptsGraduates] BIT NOT NULL,
    [maxMonthsSinceGraduation] INT NOT NULL CONSTRAINT [Opening_maxMonthsSinceGraduation_df] DEFAULT 24,
    [durationMonths] INT NOT NULL,
    [expectedStartDate] DATE NOT NULL,
    [stipendAmount] DECIMAL(12,2),
    [stipendVisible] BIT NOT NULL CONSTRAINT [Opening_stipendVisible_df] DEFAULT 0,
    [scoringWeightsJson] NVARCHAR(max),
    [proposedTutorUserId] VARCHAR(30),
    [status] VARCHAR(12) NOT NULL CONSTRAINT [Opening_status_df] DEFAULT 'DRAFT',
    [applicationOpenAt] DATETIME2,
    [applicationCloseAt] DATETIME2,
    [reviewComment] NVARCHAR(2000),
    [cancelReason] NVARCHAR(500),
    [createdById] VARCHAR(30) NOT NULL,
    [submittedAt] DATETIME2,
    [approvedById] VARCHAR(30),
    [approvedAt] DATETIME2,
    [publishedAt] DATETIME2,
    [closedAt] DATETIME2,
    [completedAt] DATETIME2,
    [cancelledAt] DATETIME2,
    [version] INT NOT NULL CONSTRAINT [Opening_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Opening_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Opening_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Opening_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[OpeningCourse] (
    [openingId] VARCHAR(30) NOT NULL,
    [courseId] VARCHAR(30) NOT NULL,
    CONSTRAINT [OpeningCourse_pkey] PRIMARY KEY CLUSTERED ([openingId],[courseId])
);

-- CreateTable
CREATE TABLE [dbo].[OpeningFieldOfStudy] (
    [openingId] VARCHAR(30) NOT NULL,
    [fieldOfStudyId] VARCHAR(30) NOT NULL,
    CONSTRAINT [OpeningFieldOfStudy_pkey] PRIMARY KEY CLUSTERED ([openingId],[fieldOfStudyId])
);

-- CreateTable
CREATE TABLE [dbo].[OpeningKeySubject] (
    [openingId] VARCHAR(30) NOT NULL,
    [keySubjectId] VARCHAR(30) NOT NULL,
    [weight] INT NOT NULL,
    CONSTRAINT [OpeningKeySubject_pkey] PRIMARY KEY CLUSTERED ([openingId],[keySubjectId])
);

-- CreateTable
CREATE TABLE [dbo].[OpeningSkill] (
    [openingId] VARCHAR(30) NOT NULL,
    [skillId] VARCHAR(30) NOT NULL,
    [required] BIT NOT NULL CONSTRAINT [OpeningSkill_required_df] DEFAULT 0,
    [weight] INT NOT NULL,
    CONSTRAINT [OpeningSkill_pkey] PRIMARY KEY CLUSTERED ([openingId],[skillId])
);

-- CreateTable
CREATE TABLE [dbo].[Application] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(20) NOT NULL,
    [candidateId] VARCHAR(30) NOT NULL,
    [openingId] VARCHAR(30) NOT NULL,
    [status] VARCHAR(15) NOT NULL CONSTRAINT [Application_status_df] DEFAULT 'DRAFT',
    [submittedAt] DATETIME2,
    [profileSnapshotJson] NVARCHAR(max),
    [averageUsed] DECIMAL(4,2),
    [averageSource] VARCHAR(12),
    [academicValidatedAt] DATETIME2,
    [academicValidatedById] VARCHAR(30),
    [eligibility] VARCHAR(10),
    [eligibilityReasonsJson] NVARCHAR(max),
    [flagsJson] NVARCHAR(max),
    [score] DECIMAL(5,1),
    [scoreBreakdownJson] NVARCHAR(max),
    [scoreComputedAt] DATETIME2,
    [decisionReason] VARCHAR(25),
    [decisionNotes] NVARCHAR(2000),
    [decidedById] VARCHAR(30),
    [decidedAt] DATETIME2,
    [candidateNotifiedAt] DATETIME2,
    [withdrawnAt] DATETIME2,
    [anonymizedAt] DATETIME2,
    [version] INT NOT NULL CONSTRAINT [Application_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Application_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Application_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Application_code_key] UNIQUE NONCLUSTERED ([code]),
    CONSTRAINT [Application_candidateId_openingId_key] UNIQUE NONCLUSTERED ([candidateId],[openingId])
);

-- CreateTable
CREATE TABLE [dbo].[ApplicationStatusHistory] (
    [id] VARCHAR(30) NOT NULL,
    [applicationId] VARCHAR(30) NOT NULL,
    [fromStatus] VARCHAR(15),
    [toStatus] VARCHAR(15) NOT NULL,
    [changedById] VARCHAR(30),
    [changedAt] DATETIME2 NOT NULL CONSTRAINT [ApplicationStatusHistory_changedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [comment] NVARCHAR(2000),
    CONSTRAINT [ApplicationStatusHistory_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ApplicationKeySubjectGrade] (
    [applicationId] VARCHAR(30) NOT NULL,
    [keySubjectId] VARCHAR(30) NOT NULL,
    [grade] DECIMAL(4,2),
    [notTaken] BIT NOT NULL CONSTRAINT [ApplicationKeySubjectGrade_notTaken_df] DEFAULT 0,
    [source] VARCHAR(10) NOT NULL,
    [matchedSubjectNames] NVARCHAR(1000),
    [updatedById] VARCHAR(30),
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ApplicationKeySubjectGrade_pkey] PRIMARY KEY CLUSTERED ([applicationId],[keySubjectId])
);

-- CreateTable
CREATE TABLE [dbo].[ApplicationRecommendation] (
    [id] VARCHAR(30) NOT NULL,
    [applicationId] VARCHAR(30) NOT NULL,
    [userId] VARCHAR(30) NOT NULL,
    [recommendation] VARCHAR(16) NOT NULL,
    [comment] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ApplicationRecommendation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ApplicationRecommendation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ApplicationRecommendation_applicationId_userId_key] UNIQUE NONCLUSTERED ([applicationId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[Interview] (
    [id] VARCHAR(30) NOT NULL,
    [applicationId] VARCHAR(30) NOT NULL,
    [scheduledAt] DATETIME2 NOT NULL,
    [durationMinutes] INT NOT NULL CONSTRAINT [Interview_durationMinutes_df] DEFAULT 30,
    [mode] VARCHAR(10) NOT NULL,
    [locationText] NVARCHAR(200),
    [onlineUrl] VARCHAR(500),
    [status] VARCHAR(10) NOT NULL CONSTRAINT [Interview_status_df] DEFAULT 'SCHEDULED',
    [recommendation] VARCHAR(16),
    [notes] NVARCHAR(4000),
    [icsUid] VARCHAR(100) NOT NULL,
    [icsSequence] INT NOT NULL CONSTRAINT [Interview_icsSequence_df] DEFAULT 0,
    [createdById] VARCHAR(30) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Interview_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Interview_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Interview_icsUid_key] UNIQUE NONCLUSTERED ([icsUid])
);

-- CreateTable
CREATE TABLE [dbo].[InterviewParticipant] (
    [interviewId] VARCHAR(30) NOT NULL,
    [userId] VARCHAR(30) NOT NULL,
    CONSTRAINT [InterviewParticipant_pkey] PRIMARY KEY CLUSTERED ([interviewId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[Offer] (
    [id] VARCHAR(30) NOT NULL,
    [applicationId] VARCHAR(30) NOT NULL,
    [departmentId] VARCHAR(30) NOT NULL,
    [locationId] VARCHAR(30) NOT NULL,
    [tutorUserId] VARCHAR(30) NOT NULL,
    [startDate] DATE NOT NULL,
    [endDate] DATE NOT NULL,
    [stipendAmount] DECIMAL(12,2),
    [notes] NVARCHAR(2000),
    [status] VARCHAR(10) NOT NULL CONSTRAINT [Offer_status_df] DEFAULT 'DRAFT',
    [sentAt] DATETIME2,
    [expiresAt] DATETIME2,
    [respondedAt] DATETIME2,
    [declineReason] NVARCHAR(500),
    [createdById] VARCHAR(30) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Offer_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Offer_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Offer_applicationId_key] UNIQUE NONCLUSTERED ([applicationId])
);

-- CreateTable
CREATE TABLE [dbo].[Internship] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(20) NOT NULL,
    [applicationId] VARCHAR(30),
    [internUserId] VARCHAR(30) NOT NULL,
    [tutorUserId] VARCHAR(30) NOT NULL,
    [coTutorUserId] VARCHAR(30),
    [departmentId] VARCHAR(30) NOT NULL,
    [locationId] VARCHAR(30) NOT NULL,
    [startDate] DATE NOT NULL,
    [plannedEndDate] DATE NOT NULL,
    [actualEndDate] DATE,
    [status] VARCHAR(20) NOT NULL CONSTRAINT [Internship_status_df] DEFAULT 'PLANNED',
    [stipendAmount] DECIMAL(12,2),
    [workSchedule] NVARCHAR(200),
    [outcome] VARCHAR(12) NOT NULL CONSTRAINT [Internship_outcome_df] DEFAULT 'PENDING',
    [outcomeDecidedById] VARCHAR(30),
    [outcomeDecidedAt] DATETIME2,
    [outcomeNotes] NVARCHAR(2000),
    [headAbsorptionRecommendation] VARCHAR(5),
    [terminationReason] VARCHAR(20),
    [terminationNotes] NVARCHAR(2000),
    [legalHold] BIT NOT NULL CONSTRAINT [Internship_legalHold_df] DEFAULT 0,
    [source] VARCHAR(6) NOT NULL CONSTRAINT [Internship_source_df] DEFAULT 'SYSTEM',
    [version] INT NOT NULL CONSTRAINT [Internship_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Internship_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Internship_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Internship_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[InternshipExtension] (
    [id] VARCHAR(30) NOT NULL,
    [internshipId] VARCHAR(30) NOT NULL,
    [previousEndDate] DATE NOT NULL,
    [newEndDate] DATE NOT NULL,
    [reason] NVARCHAR(500) NOT NULL,
    [approvedById] VARCHAR(30) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InternshipExtension_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [InternshipExtension_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[InternshipChecklistItem] (
    [id] VARCHAR(30) NOT NULL,
    [internshipId] VARCHAR(30) NOT NULL,
    [code] VARCHAR(30) NOT NULL,
    [label] NVARCHAR(200) NOT NULL,
    [ownerRole] VARCHAR(20) NOT NULL,
    [done] BIT NOT NULL CONSTRAINT [InternshipChecklistItem_done_df] DEFAULT 0,
    [doneAt] DATETIME2,
    [doneById] VARCHAR(30),
    [notes] NVARCHAR(500),
    CONSTRAINT [InternshipChecklistItem_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InternshipChecklistItem_internshipId_code_key] UNIQUE NONCLUSTERED ([internshipId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[InternshipPlan] (
    [id] VARCHAR(30) NOT NULL,
    [internshipId] VARCHAR(30) NOT NULL,
    [objectives] NVARCHAR(max) NOT NULL,
    [activities] NVARCHAR(max) NOT NULL,
    [competencies] NVARCHAR(max),
    [status] VARCHAR(12) NOT NULL CONSTRAINT [InternshipPlan_status_df] DEFAULT 'DRAFT',
    [submittedAt] DATETIME2,
    [acknowledgedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InternshipPlan_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [InternshipPlan_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InternshipPlan_internshipId_key] UNIQUE NONCLUSTERED ([internshipId])
);

-- CreateTable
CREATE TABLE [dbo].[DiaryEntry] (
    [id] VARCHAR(30) NOT NULL,
    [internshipId] VARCHAR(30) NOT NULL,
    [referenceMonth] VARCHAR(7) NOT NULL,
    [dueDate] DATE NOT NULL,
    [activities] NVARCHAR(4000),
    [learnings] NVARCHAR(4000),
    [difficulties] NVARCHAR(4000),
    [supportNeeded] NVARCHAR(4000),
    [status] VARCHAR(10) NOT NULL CONSTRAINT [DiaryEntry_status_df] DEFAULT 'DRAFT',
    [submittedAt] DATETIME2,
    [reviewedAt] DATETIME2,
    [reviewedById] VARCHAR(30),
    [tutorComment] NVARCHAR(2000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DiaryEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [DiaryEntry_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [DiaryEntry_internshipId_referenceMonth_key] UNIQUE NONCLUSTERED ([internshipId],[referenceMonth])
);

-- CreateTable
CREATE TABLE [dbo].[DiaryAttachment] (
    [id] VARCHAR(30) NOT NULL,
    [diaryEntryId] VARCHAR(30) NOT NULL,
    [fileId] VARCHAR(30) NOT NULL,
    CONSTRAINT [DiaryAttachment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [DiaryAttachment_fileId_key] UNIQUE NONCLUSTERED ([fileId])
);

-- CreateTable
CREATE TABLE [dbo].[InternshipCheckpoint] (
    [id] VARCHAR(30) NOT NULL,
    [internshipId] VARCHAR(30) NOT NULL,
    [sequence] INT NOT NULL,
    [dueDate] DATE NOT NULL,
    [progress] NVARCHAR(4000),
    [strengths] NVARCHAR(4000),
    [improvements] NVARCHAR(4000),
    [risks] NVARCHAR(4000),
    [recommendation] NVARCHAR(2000),
    [status] VARCHAR(12) NOT NULL CONSTRAINT [InternshipCheckpoint_status_df] DEFAULT 'PENDING',
    [submittedAt] DATETIME2,
    [submittedById] VARCHAR(30),
    [acknowledgedAt] DATETIME2,
    [internComment] NVARCHAR(2000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InternshipCheckpoint_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [InternshipCheckpoint_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InternshipCheckpoint_internshipId_sequence_key] UNIQUE NONCLUSTERED ([internshipId],[sequence])
);

-- CreateTable
CREATE TABLE [dbo].[InternshipDocument] (
    [id] VARCHAR(30) NOT NULL,
    [internshipId] VARCHAR(30) NOT NULL,
    [type] VARCHAR(16) NOT NULL,
    [fileId] VARCHAR(30) NOT NULL,
    [uploadedById] VARCHAR(30) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InternshipDocument_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [InternshipDocument_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InternshipDocument_fileId_key] UNIQUE NONCLUSTERED ([fileId])
);

-- CreateTable
CREATE TABLE [dbo].[EvaluationTemplate] (
    [id] VARCHAR(30) NOT NULL,
    [code] VARCHAR(20) NOT NULL,
    [version] INT NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [scaleMin] DECIMAL(5,2) NOT NULL,
    [scaleMax] DECIMAL(5,2) NOT NULL,
    [scaleStep] DECIMAL(5,2) NOT NULL,
    [scaleLabelsJson] NVARCHAR(max) NOT NULL,
    [bandsJson] NVARCHAR(max) NOT NULL,
    [isProvisional] BIT NOT NULL CONSTRAINT [EvaluationTemplate_isProvisional_df] DEFAULT 1,
    [active] BIT NOT NULL CONSTRAINT [EvaluationTemplate_active_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [EvaluationTemplate_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EvaluationTemplate_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EvaluationTemplate_code_version_key] UNIQUE NONCLUSTERED ([code],[version])
);

-- CreateTable
CREATE TABLE [dbo].[EvaluationTemplateItem] (
    [id] VARCHAR(30) NOT NULL,
    [templateId] VARCHAR(30) NOT NULL,
    [sortOrder] INT NOT NULL,
    [code] VARCHAR(20) NOT NULL,
    [label] NVARCHAR(200) NOT NULL,
    [description] NVARCHAR(1000),
    [groupName] NVARCHAR(100),
    CONSTRAINT [EvaluationTemplateItem_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EvaluationTemplateItem_templateId_code_key] UNIQUE NONCLUSTERED ([templateId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[Evaluation] (
    [id] VARCHAR(30) NOT NULL,
    [internshipId] VARCHAR(30) NOT NULL,
    [templateId] VARCHAR(30) NOT NULL,
    [kind] VARCHAR(10) NOT NULL CONSTRAINT [Evaluation_kind_df] DEFAULT 'FINAL',
    [revision] INT NOT NULL CONSTRAINT [Evaluation_revision_df] DEFAULT 1,
    [supersedesEvaluationId] VARCHAR(30),
    [status] VARCHAR(25) NOT NULL CONSTRAINT [Evaluation_status_df] DEFAULT 'SCHEDULED',
    [opensAt] DATE NOT NULL,
    [selfAssessmentDueDate] DATE NOT NULL,
    [dueDate] DATE NOT NULL,
    [finalDueDate] DATE NOT NULL,
    [selfSubmittedAt] DATETIME2,
    [selfMissing] BIT NOT NULL CONSTRAINT [Evaluation_selfMissing_df] DEFAULT 0,
    [selfGeneralComment] NVARCHAR(2000),
    [selfAverage] DECIMAL(5,2),
    [finalScore] DECIMAL(5,2),
    [classification] NVARCHAR(40),
    [tutorStrengths] NVARCHAR(4000),
    [tutorImprovements] NVARCHAR(4000),
    [tutorComments] NVARCHAR(4000),
    [absorptionRecommendation] VARCHAR(5),
    [tutorSubmittedAt] DATETIME2,
    [headReviewSkipped] BIT NOT NULL CONSTRAINT [Evaluation_headReviewSkipped_df] DEFAULT 0,
    [headComment] NVARCHAR(4000),
    [headApprovedAt] DATETIME2,
    [internComment] NVARCHAR(2000),
    [internAcknowledgedAt] DATETIME2,
    [internAckMissing] BIT NOT NULL CONSTRAINT [Evaluation_internAckMissing_df] DEFAULT 0,
    [hrComment] NVARCHAR(4000),
    [hrApprovedAt] DATETIME2,
    [returnReason] NVARCHAR(2000),
    [concludedAt] DATETIME2,
    [issuedDocumentId] VARCHAR(30),
    [source] VARCHAR(6) NOT NULL CONSTRAINT [Evaluation_source_df] DEFAULT 'SYSTEM',
    [version] INT NOT NULL CONSTRAINT [Evaluation_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Evaluation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Evaluation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[EvaluationScore] (
    [id] VARCHAR(30) NOT NULL,
    [evaluationId] VARCHAR(30) NOT NULL,
    [itemId] VARCHAR(30) NOT NULL,
    [source] VARCHAR(5) NOT NULL,
    [value] DECIMAL(5,2) NOT NULL,
    [comment] NVARCHAR(1000),
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [EvaluationScore_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EvaluationScore_evaluationId_itemId_source_key] UNIQUE NONCLUSTERED ([evaluationId],[itemId],[source])
);

-- CreateTable
CREATE TABLE [dbo].[EvaluationStatusHistory] (
    [id] VARCHAR(30) NOT NULL,
    [evaluationId] VARCHAR(30) NOT NULL,
    [fromStatus] VARCHAR(25),
    [toStatus] VARCHAR(25) NOT NULL,
    [changedById] VARCHAR(30),
    [changedAt] DATETIME2 NOT NULL CONSTRAINT [EvaluationStatusHistory_changedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [comment] NVARCHAR(2000),
    CONSTRAINT [EvaluationStatusHistory_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DocumentTemplate] (
    [id] VARCHAR(30) NOT NULL,
    [type] VARCHAR(25) NOT NULL,
    [version] INT NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [bodyMarkdown] NVARCHAR(max) NOT NULL,
    [placeholdersJson] NVARCHAR(max) NOT NULL,
    [status] VARCHAR(10) NOT NULL CONSTRAINT [DocumentTemplate_status_df] DEFAULT 'DRAFT',
    [legalApprovalNote] NVARCHAR(500),
    [approvedById] VARCHAR(30),
    [approvedAt] DATETIME2,
    [createdById] VARCHAR(30) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DocumentTemplate_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DocumentTemplate_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [DocumentTemplate_type_version_key] UNIQUE NONCLUSTERED ([type],[version])
);

-- CreateTable
CREATE TABLE [dbo].[Contract] (
    [id] VARCHAR(30) NOT NULL,
    [internshipId] VARCHAR(30) NOT NULL,
    [templateId] VARCHAR(30) NOT NULL,
    [dataSnapshotJson] NVARCHAR(max) NOT NULL,
    [contentHash] VARCHAR(64) NOT NULL,
    [status] VARCHAR(16) NOT NULL CONSTRAINT [Contract_status_df] DEFAULT 'DRAFT',
    [signingMethod] VARCHAR(10),
    [internRefusalComment] NVARCHAR(2000),
    [cancelReason] NVARCHAR(500),
    [sentAt] DATETIME2,
    [signedAt] DATETIME2,
    [issuedDocumentId] VARCHAR(30),
    [createdById] VARCHAR(30) NOT NULL,
    [version] INT NOT NULL CONSTRAINT [Contract_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Contract_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Contract_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SignatureEvent] (
    [id] VARCHAR(30) NOT NULL,
    [entityType] VARCHAR(15) NOT NULL,
    [entityId] VARCHAR(30) NOT NULL,
    [step] VARCHAR(20) NOT NULL,
    [signerUserId] VARCHAR(30) NOT NULL,
    [signerName] NVARCHAR(120) NOT NULL,
    [signerRoleLabel] NVARCHAR(80) NOT NULL,
    [contentHash] VARCHAR(64) NOT NULL,
    [statement] NVARCHAR(500) NOT NULL,
    [method] VARCHAR(12) NOT NULL,
    [otpVerifiedAt] DATETIME2,
    [ipAddress] VARCHAR(45) NOT NULL,
    [userAgent] NVARCHAR(500) NOT NULL,
    [imageFileId] VARCHAR(30) NOT NULL,
    [invalidatedAt] DATETIME2,
    [signedAt] DATETIME2 NOT NULL CONSTRAINT [SignatureEvent_signedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [SignatureEvent_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SignatureEvent_imageFileId_key] UNIQUE NONCLUSTERED ([imageFileId])
);

-- CreateTable
CREATE TABLE [dbo].[SignatureOtp] (
    [id] VARCHAR(30) NOT NULL,
    [userId] VARCHAR(30) NOT NULL,
    [entityType] VARCHAR(15) NOT NULL,
    [entityId] VARCHAR(30) NOT NULL,
    [step] VARCHAR(20) NOT NULL,
    [codeHash] VARCHAR(128) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [attempts] INT NOT NULL CONSTRAINT [SignatureOtp_attempts_df] DEFAULT 0,
    [consumedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SignatureOtp_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [SignatureOtp_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[IssuedDocument] (
    [id] VARCHAR(30) NOT NULL,
    [type] VARCHAR(25) NOT NULL,
    [entityType] VARCHAR(15) NOT NULL,
    [entityId] VARCHAR(30) NOT NULL,
    [revision] INT NOT NULL CONSTRAINT [IssuedDocument_revision_df] DEFAULT 1,
    [fileId] VARCHAR(30) NOT NULL,
    [sha256] VARCHAR(64) NOT NULL,
    [verificationCode] VARCHAR(12) NOT NULL,
    [holderInitials] NVARCHAR(20) NOT NULL,
    [signingMethod] VARCHAR(10) NOT NULL,
    [padesSigned] BIT NOT NULL CONSTRAINT [IssuedDocument_padesSigned_df] DEFAULT 0,
    [status] VARCHAR(10) NOT NULL CONSTRAINT [IssuedDocument_status_df] DEFAULT 'VALID',
    [statusReason] NVARCHAR(500),
    [statusChangedAt] DATETIME2,
    [issuedById] VARCHAR(30),
    [issuedAt] DATETIME2 NOT NULL CONSTRAINT [IssuedDocument_issuedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [IssuedDocument_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [IssuedDocument_fileId_key] UNIQUE NONCLUSTERED ([fileId]),
    CONSTRAINT [IssuedDocument_verificationCode_key] UNIQUE NONCLUSTERED ([verificationCode])
);

-- CreateTable
CREATE TABLE [dbo].[Notification] (
    [id] VARCHAR(30) NOT NULL,
    [templateCode] VARCHAR(6) NOT NULL,
    [variant] VARCHAR(30),
    [recipientUserId] VARCHAR(30),
    [recipientEmail] VARCHAR(254) NOT NULL,
    [payloadJson] NVARCHAR(max) NOT NULL,
    [idempotencyKey] VARCHAR(200) NOT NULL,
    [status] VARCHAR(10) NOT NULL CONSTRAINT [Notification_status_df] DEFAULT 'PENDING',
    [attempts] INT NOT NULL CONSTRAINT [Notification_attempts_df] DEFAULT 0,
    [nextAttemptAt] DATETIME2 NOT NULL CONSTRAINT [Notification_nextAttemptAt_df] DEFAULT CURRENT_TIMESTAMP,
    [lastError] NVARCHAR(2000),
    [providerMessageId] VARCHAR(200),
    [sentAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Notification_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Notification_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Notification_idempotencyKey_key] UNIQUE NONCLUSTERED ([idempotencyKey])
);

-- CreateTable
CREATE TABLE [dbo].[InAppNotification] (
    [id] VARCHAR(30) NOT NULL,
    [userId] VARCHAR(30) NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [body] NVARCHAR(1000) NOT NULL,
    [link] VARCHAR(500),
    [readAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InAppNotification_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [InAppNotification_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Job] (
    [id] VARCHAR(30) NOT NULL,
    [type] VARCHAR(60) NOT NULL,
    [payloadJson] NVARCHAR(max) NOT NULL,
    [runAt] DATETIME2 NOT NULL,
    [status] VARCHAR(10) NOT NULL CONSTRAINT [Job_status_df] DEFAULT 'PENDING',
    [attempts] INT NOT NULL CONSTRAINT [Job_attempts_df] DEFAULT 0,
    [maxAttempts] INT NOT NULL CONSTRAINT [Job_maxAttempts_df] DEFAULT 5,
    [uniqueKey] VARCHAR(200),
    [lockedAt] DATETIME2,
    [lockedBy] VARCHAR(100),
    [lastError] NVARCHAR(2000),
    [finishedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Job_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Job_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PrivacyNoticeVersion] (
    [id] VARCHAR(30) NOT NULL,
    [version] VARCHAR(20) NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [bodyMarkdown] NVARCHAR(max) NOT NULL,
    [status] VARCHAR(10) NOT NULL CONSTRAINT [PrivacyNoticeVersion_status_df] DEFAULT 'DRAFT',
    [publishedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PrivacyNoticeVersion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PrivacyNoticeVersion_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PrivacyNoticeVersion_version_key] UNIQUE NONCLUSTERED ([version])
);

-- CreateTable
CREATE TABLE [dbo].[ConsentRecord] (
    [id] VARCHAR(30) NOT NULL,
    [userId] VARCHAR(30) NOT NULL,
    [type] VARCHAR(20) NOT NULL,
    [noticeVersionId] VARCHAR(30),
    [granted] BIT NOT NULL,
    [ipAddress] VARCHAR(45),
    [userAgent] NVARCHAR(500),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ConsentRecord_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ConsentRecord_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DataSubjectRequest] (
    [id] VARCHAR(30) NOT NULL,
    [requesterUserId] VARCHAR(30) NOT NULL,
    [type] VARCHAR(15) NOT NULL,
    [status] VARCHAR(12) NOT NULL CONSTRAINT [DataSubjectRequest_status_df] DEFAULT 'OPEN',
    [details] NVARCHAR(2000),
    [dueDate] DATE NOT NULL,
    [resolvedById] VARCHAR(30),
    [resolvedAt] DATETIME2,
    [resolutionNotes] NVARCHAR(2000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DataSubjectRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DataSubjectRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RetentionRun] (
    [id] VARCHAR(30) NOT NULL,
    [startedAt] DATETIME2 NOT NULL CONSTRAINT [RetentionRun_startedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [finishedAt] DATETIME2,
    [dryRun] BIT NOT NULL,
    [status] VARCHAR(10) NOT NULL,
    [summaryJson] NVARCHAR(max),
    [triggeredBy] VARCHAR(30) NOT NULL,
    CONSTRAINT [RetentionRun_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [occurredAt] DATETIME2 NOT NULL CONSTRAINT [AuditLog_occurredAt_df] DEFAULT CURRENT_TIMESTAMP,
    [actorUserId] VARCHAR(30),
    [actorRoles] VARCHAR(200),
    [action] VARCHAR(40) NOT NULL,
    [entityType] VARCHAR(40),
    [entityId] VARCHAR(30),
    [summary] NVARCHAR(500),
    [diffJson] NVARCHAR(max),
    [ipAddress] VARCHAR(45),
    [userAgent] NVARCHAR(500),
    [correlationId] VARCHAR(40),
    [prevHash] VARCHAR(64),
    [hash] VARCHAR(64),
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AiRun] (
    [id] VARCHAR(30) NOT NULL,
    [purpose] VARCHAR(25) NOT NULL,
    [provider] VARCHAR(10) NOT NULL,
    [modelName] VARCHAR(100) NOT NULL,
    [promptVersion] VARCHAR(20) NOT NULL,
    [inputSha256] VARCHAR(64) NOT NULL,
    [status] VARCHAR(16) NOT NULL,
    [errorCode] VARCHAR(60),
    [latencyMs] INT,
    [inputTokens] INT,
    [outputTokens] INT,
    [rawOutputJson] NVARCHAR(max),
    [rawPurgedAt] DATETIME2,
    [requestedById] VARCHAR(30),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AiRun_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [finishedAt] DATETIME2,
    CONSTRAINT [AiRun_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[NlqQuery] (
    [id] VARCHAR(30) NOT NULL,
    [userId] VARCHAR(30) NOT NULL,
    [question] NVARCHAR(300) NOT NULL,
    [filterJson] NVARCHAR(max),
    [status] VARCHAR(10) NOT NULL,
    [resultCount] INT,
    [aiRunId] VARCHAR(30),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [NlqQuery_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [NlqQuery_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ImportBatch] (
    [id] VARCHAR(30) NOT NULL,
    [kind] VARCHAR(30) NOT NULL,
    [fileId] VARCHAR(30) NOT NULL,
    [dryRun] BIT NOT NULL,
    [status] VARCHAR(12) NOT NULL,
    [reportJson] NVARCHAR(max),
    [createdById] VARCHAR(30) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ImportBatch_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [finishedAt] DATETIME2,
    CONSTRAINT [ImportBatch_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ImportBatch_fileId_key] UNIQUE NONCLUSTERED ([fileId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Session_userId_idx] ON [dbo].[Session]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Account_userId_idx] ON [dbo].[Account]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Account_providerId_accountId_idx] ON [dbo].[Account]([providerId], [accountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Verification_identifier_idx] ON [dbo].[Verification]([identifier]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TwoFactor_userId_idx] ON [dbo].[TwoFactor]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoleAssignment_userId_role_idx] ON [dbo].[RoleAssignment]([userId], [role]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoleAssignment_departmentId_role_idx] ON [dbo].[RoleAssignment]([departmentId], [role]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StaffProfile_departmentId_idx] ON [dbo].[StaffProfile]([departmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Holiday_observedDate_idx] ON [dbo].[Holiday]([observedDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CandidateProfile_institutionId_idx] ON [dbo].[CandidateProfile]([institutionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CandidateProfile_courseId_idx] ON [dbo].[CandidateProfile]([courseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CandidateProfile_talentPoolConsent_idx] ON [dbo].[CandidateProfile]([talentPoolConsent]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StoredFile_sha256_idx] ON [dbo].[StoredFile]([sha256]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StoredFile_purpose_expiresAt_idx] ON [dbo].[StoredFile]([purpose], [expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CandidateDocument_candidateId_type_status_idx] ON [dbo].[CandidateDocument]([candidateId], [type], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Transcript_candidateId_idx] ON [dbo].[Transcript]([candidateId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TranscriptSubject_transcriptId_idx] ON [dbo].[TranscriptSubject]([transcriptId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Opening_status_applicationCloseAt_idx] ON [dbo].[Opening]([status], [applicationCloseAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Opening_departmentId_status_idx] ON [dbo].[Opening]([departmentId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Application_openingId_status_idx] ON [dbo].[Application]([openingId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Application_openingId_score_idx] ON [dbo].[Application]([openingId], [score]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ApplicationStatusHistory_applicationId_changedAt_idx] ON [dbo].[ApplicationStatusHistory]([applicationId], [changedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Interview_scheduledAt_idx] ON [dbo].[Interview]([scheduledAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InterviewParticipant_userId_idx] ON [dbo].[InterviewParticipant]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Offer_status_expiresAt_idx] ON [dbo].[Offer]([status], [expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Internship_tutorUserId_status_idx] ON [dbo].[Internship]([tutorUserId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Internship_coTutorUserId_idx] ON [dbo].[Internship]([coTutorUserId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Internship_internUserId_idx] ON [dbo].[Internship]([internUserId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Internship_departmentId_status_idx] ON [dbo].[Internship]([departmentId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Internship_status_plannedEndDate_idx] ON [dbo].[Internship]([status], [plannedEndDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DiaryEntry_status_dueDate_idx] ON [dbo].[DiaryEntry]([status], [dueDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InternshipCheckpoint_status_dueDate_idx] ON [dbo].[InternshipCheckpoint]([status], [dueDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Evaluation_status_dueDate_idx] ON [dbo].[Evaluation]([status], [dueDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Evaluation_internshipId_idx] ON [dbo].[Evaluation]([internshipId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EvaluationStatusHistory_evaluationId_changedAt_idx] ON [dbo].[EvaluationStatusHistory]([evaluationId], [changedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contract_internshipId_idx] ON [dbo].[Contract]([internshipId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SignatureEvent_entityType_entityId_idx] ON [dbo].[SignatureEvent]([entityType], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SignatureOtp_userId_entityType_entityId_idx] ON [dbo].[SignatureOtp]([userId], [entityType], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IssuedDocument_entityType_entityId_idx] ON [dbo].[IssuedDocument]([entityType], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Notification_status_nextAttemptAt_idx] ON [dbo].[Notification]([status], [nextAttemptAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InAppNotification_userId_readAt_idx] ON [dbo].[InAppNotification]([userId], [readAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Job_status_runAt_idx] ON [dbo].[Job]([status], [runAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ConsentRecord_userId_type_idx] ON [dbo].[ConsentRecord]([userId], [type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DataSubjectRequest_status_dueDate_idx] ON [dbo].[DataSubjectRequest]([status], [dueDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_entityType_entityId_idx] ON [dbo].[AuditLog]([entityType], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_actorUserId_occurredAt_idx] ON [dbo].[AuditLog]([actorUserId], [occurredAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_action_occurredAt_idx] ON [dbo].[AuditLog]([action], [occurredAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AiRun_purpose_inputSha256_idx] ON [dbo].[AiRun]([purpose], [inputSha256]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [NlqQuery_userId_createdAt_idx] ON [dbo].[NlqQuery]([userId], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[Session] ADD CONSTRAINT [Session_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Account] ADD CONSTRAINT [Account_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TwoFactor] ADD CONSTRAINT [TwoFactor_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RoleAssignment] ADD CONSTRAINT [RoleAssignment_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RoleAssignment] ADD CONSTRAINT [RoleAssignment_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StaffProfile] ADD CONSTRAINT [StaffProfile_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StaffProfile] ADD CONSTRAINT [StaffProfile_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Department] ADD CONSTRAINT [Department_locationId_fkey] FOREIGN KEY ([locationId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Course] ADD CONSTRAINT [Course_fieldOfStudyId_fkey] FOREIGN KEY ([fieldOfStudyId]) REFERENCES [dbo].[FieldOfStudy]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Holiday] ADD CONSTRAINT [Holiday_locationId_fkey] FOREIGN KEY ([locationId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CandidateProfile] ADD CONSTRAINT [CandidateProfile_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CandidateProfile] ADD CONSTRAINT [CandidateProfile_institutionId_fkey] FOREIGN KEY ([institutionId]) REFERENCES [dbo].[Institution]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CandidateProfile] ADD CONSTRAINT [CandidateProfile_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[Course]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CandidateSkill] ADD CONSTRAINT [CandidateSkill_candidateId_fkey] FOREIGN KEY ([candidateId]) REFERENCES [dbo].[CandidateProfile]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CandidateSkill] ADD CONSTRAINT [CandidateSkill_skillId_fkey] FOREIGN KEY ([skillId]) REFERENCES [dbo].[Skill]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CandidateDocument] ADD CONSTRAINT [CandidateDocument_candidateId_fkey] FOREIGN KEY ([candidateId]) REFERENCES [dbo].[CandidateProfile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CandidateDocument] ADD CONSTRAINT [CandidateDocument_fileId_fkey] FOREIGN KEY ([fileId]) REFERENCES [dbo].[StoredFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Transcript] ADD CONSTRAINT [Transcript_candidateId_fkey] FOREIGN KEY ([candidateId]) REFERENCES [dbo].[CandidateProfile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Transcript] ADD CONSTRAINT [Transcript_documentId_fkey] FOREIGN KEY ([documentId]) REFERENCES [dbo].[CandidateDocument]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Transcript] ADD CONSTRAINT [Transcript_aiRunId_fkey] FOREIGN KEY ([aiRunId]) REFERENCES [dbo].[AiRun]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TranscriptSubject] ADD CONSTRAINT [TranscriptSubject_transcriptId_fkey] FOREIGN KEY ([transcriptId]) REFERENCES [dbo].[Transcript]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TranscriptSubject] ADD CONSTRAINT [TranscriptSubject_keySubjectId_fkey] FOREIGN KEY ([keySubjectId]) REFERENCES [dbo].[KeySubject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Opening] ADD CONSTRAINT [Opening_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Opening] ADD CONSTRAINT [Opening_locationId_fkey] FOREIGN KEY ([locationId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Opening] ADD CONSTRAINT [Opening_cycleId_fkey] FOREIGN KEY ([cycleId]) REFERENCES [dbo].[RecruitmentCycle]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OpeningCourse] ADD CONSTRAINT [OpeningCourse_openingId_fkey] FOREIGN KEY ([openingId]) REFERENCES [dbo].[Opening]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OpeningCourse] ADD CONSTRAINT [OpeningCourse_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[Course]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OpeningFieldOfStudy] ADD CONSTRAINT [OpeningFieldOfStudy_openingId_fkey] FOREIGN KEY ([openingId]) REFERENCES [dbo].[Opening]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OpeningFieldOfStudy] ADD CONSTRAINT [OpeningFieldOfStudy_fieldOfStudyId_fkey] FOREIGN KEY ([fieldOfStudyId]) REFERENCES [dbo].[FieldOfStudy]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OpeningKeySubject] ADD CONSTRAINT [OpeningKeySubject_openingId_fkey] FOREIGN KEY ([openingId]) REFERENCES [dbo].[Opening]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OpeningKeySubject] ADD CONSTRAINT [OpeningKeySubject_keySubjectId_fkey] FOREIGN KEY ([keySubjectId]) REFERENCES [dbo].[KeySubject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OpeningSkill] ADD CONSTRAINT [OpeningSkill_openingId_fkey] FOREIGN KEY ([openingId]) REFERENCES [dbo].[Opening]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OpeningSkill] ADD CONSTRAINT [OpeningSkill_skillId_fkey] FOREIGN KEY ([skillId]) REFERENCES [dbo].[Skill]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Application] ADD CONSTRAINT [Application_candidateId_fkey] FOREIGN KEY ([candidateId]) REFERENCES [dbo].[CandidateProfile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Application] ADD CONSTRAINT [Application_openingId_fkey] FOREIGN KEY ([openingId]) REFERENCES [dbo].[Opening]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ApplicationStatusHistory] ADD CONSTRAINT [ApplicationStatusHistory_applicationId_fkey] FOREIGN KEY ([applicationId]) REFERENCES [dbo].[Application]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ApplicationKeySubjectGrade] ADD CONSTRAINT [ApplicationKeySubjectGrade_applicationId_fkey] FOREIGN KEY ([applicationId]) REFERENCES [dbo].[Application]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ApplicationKeySubjectGrade] ADD CONSTRAINT [ApplicationKeySubjectGrade_keySubjectId_fkey] FOREIGN KEY ([keySubjectId]) REFERENCES [dbo].[KeySubject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ApplicationRecommendation] ADD CONSTRAINT [ApplicationRecommendation_applicationId_fkey] FOREIGN KEY ([applicationId]) REFERENCES [dbo].[Application]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Interview] ADD CONSTRAINT [Interview_applicationId_fkey] FOREIGN KEY ([applicationId]) REFERENCES [dbo].[Application]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InterviewParticipant] ADD CONSTRAINT [InterviewParticipant_interviewId_fkey] FOREIGN KEY ([interviewId]) REFERENCES [dbo].[Interview]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Offer] ADD CONSTRAINT [Offer_applicationId_fkey] FOREIGN KEY ([applicationId]) REFERENCES [dbo].[Application]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Offer] ADD CONSTRAINT [Offer_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Offer] ADD CONSTRAINT [Offer_locationId_fkey] FOREIGN KEY ([locationId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Internship] ADD CONSTRAINT [Internship_applicationId_fkey] FOREIGN KEY ([applicationId]) REFERENCES [dbo].[Application]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Internship] ADD CONSTRAINT [Internship_internUserId_fkey] FOREIGN KEY ([internUserId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Internship] ADD CONSTRAINT [Internship_tutorUserId_fkey] FOREIGN KEY ([tutorUserId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Internship] ADD CONSTRAINT [Internship_coTutorUserId_fkey] FOREIGN KEY ([coTutorUserId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Internship] ADD CONSTRAINT [Internship_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Internship] ADD CONSTRAINT [Internship_locationId_fkey] FOREIGN KEY ([locationId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InternshipExtension] ADD CONSTRAINT [InternshipExtension_internshipId_fkey] FOREIGN KEY ([internshipId]) REFERENCES [dbo].[Internship]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InternshipChecklistItem] ADD CONSTRAINT [InternshipChecklistItem_internshipId_fkey] FOREIGN KEY ([internshipId]) REFERENCES [dbo].[Internship]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InternshipPlan] ADD CONSTRAINT [InternshipPlan_internshipId_fkey] FOREIGN KEY ([internshipId]) REFERENCES [dbo].[Internship]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DiaryEntry] ADD CONSTRAINT [DiaryEntry_internshipId_fkey] FOREIGN KEY ([internshipId]) REFERENCES [dbo].[Internship]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DiaryAttachment] ADD CONSTRAINT [DiaryAttachment_diaryEntryId_fkey] FOREIGN KEY ([diaryEntryId]) REFERENCES [dbo].[DiaryEntry]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DiaryAttachment] ADD CONSTRAINT [DiaryAttachment_fileId_fkey] FOREIGN KEY ([fileId]) REFERENCES [dbo].[StoredFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InternshipCheckpoint] ADD CONSTRAINT [InternshipCheckpoint_internshipId_fkey] FOREIGN KEY ([internshipId]) REFERENCES [dbo].[Internship]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InternshipDocument] ADD CONSTRAINT [InternshipDocument_internshipId_fkey] FOREIGN KEY ([internshipId]) REFERENCES [dbo].[Internship]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InternshipDocument] ADD CONSTRAINT [InternshipDocument_fileId_fkey] FOREIGN KEY ([fileId]) REFERENCES [dbo].[StoredFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EvaluationTemplateItem] ADD CONSTRAINT [EvaluationTemplateItem_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[EvaluationTemplate]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Evaluation] ADD CONSTRAINT [Evaluation_internshipId_fkey] FOREIGN KEY ([internshipId]) REFERENCES [dbo].[Internship]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Evaluation] ADD CONSTRAINT [Evaluation_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[EvaluationTemplate]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EvaluationScore] ADD CONSTRAINT [EvaluationScore_evaluationId_fkey] FOREIGN KEY ([evaluationId]) REFERENCES [dbo].[Evaluation]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EvaluationScore] ADD CONSTRAINT [EvaluationScore_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[EvaluationTemplateItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EvaluationStatusHistory] ADD CONSTRAINT [EvaluationStatusHistory_evaluationId_fkey] FOREIGN KEY ([evaluationId]) REFERENCES [dbo].[Evaluation]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contract] ADD CONSTRAINT [Contract_internshipId_fkey] FOREIGN KEY ([internshipId]) REFERENCES [dbo].[Internship]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contract] ADD CONSTRAINT [Contract_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[DocumentTemplate]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SignatureEvent] ADD CONSTRAINT [SignatureEvent_signerUserId_fkey] FOREIGN KEY ([signerUserId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SignatureEvent] ADD CONSTRAINT [SignatureEvent_imageFileId_fkey] FOREIGN KEY ([imageFileId]) REFERENCES [dbo].[StoredFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[IssuedDocument] ADD CONSTRAINT [IssuedDocument_fileId_fkey] FOREIGN KEY ([fileId]) REFERENCES [dbo].[StoredFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InAppNotification] ADD CONSTRAINT [InAppNotification_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ConsentRecord] ADD CONSTRAINT [ConsentRecord_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[AppUser]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ConsentRecord] ADD CONSTRAINT [ConsentRecord_noticeVersionId_fkey] FOREIGN KEY ([noticeVersionId]) REFERENCES [dbo].[PrivacyNoticeVersion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[NlqQuery] ADD CONSTRAINT [NlqQuery_aiRunId_fkey] FOREIGN KEY ([aiRunId]) REFERENCES [dbo].[AiRun]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportBatch] ADD CONSTRAINT [ImportBatch_fileId_fkey] FOREIGN KEY ([fileId]) REFERENCES [dbo].[StoredFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
