-- CreateEnum
CREATE TYPE "EvidenceState" AS ENUM ('STATED', 'INFERRED', 'ESTIMATED', 'GAP');

-- CreateEnum
CREATE TYPE "EntityKind" AS ENUM ('ENGAGEMENT', 'PROCESS', 'PROCESS_STEP', 'PERSONA', 'SYSTEM', 'DATA_SOURCE', 'KNOWLEDGE_SOURCE', 'PAIN_POINT', 'EXCEPTION', 'METRIC', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "CaptureMode" AS ENUM ('WRITE_UP', 'LIVE');

-- CreateEnum
CREATE TYPE "SystemType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ApiAvailability" AS ENUM ('YES', 'NO', 'PARTIAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AccessMethod" AS ENUM ('API', 'RPA', 'COMPUTER_USE', 'MANUAL');

-- CreateEnum
CREATE TYPE "DataFormat" AS ENUM ('STRUCTURED', 'UNSTRUCTURED');

-- CreateEnum
CREATE TYPE "RetrievalReadiness" AS ENUM ('RETRIEVABLE_AS_IS', 'NEEDS_CLEANUP', 'TRIBAL_KNOWLEDGE');

-- CreateEnum
CREATE TYPE "RootCauseType" AS ENUM ('PROCESS', 'TECHNICAL', 'ORGANIZATIONAL');

-- CreateEnum
CREATE TYPE "TransformationLens" AS ENUM ('ELIMINATE', 'AUTOMATE', 'OPTIMIZE', 'VALUE_ADD');

-- CreateEnum
CREATE TYPE "SolutionClass" AS ENUM ('NO_CHANGE', 'PROCESS_SOP_CHANGE', 'RULES_ENGINE', 'RPA', 'SEARCH_RETRIEVAL', 'TRADITIONAL_ML', 'GENERATIVE_AI', 'AGENTIC_AI');

-- CreateEnum
CREATE TYPE "Band" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "StepSystemDirection" AS ENUM ('READ', 'WRITE');

-- CreateTable
CREATE TABLE "CaptureSession" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "mode" "CaptureMode" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "rawContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptureSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contributor" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provenance" (
    "id" TEXT NOT NULL,
    "entityKind" "EntityKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "attribute" TEXT,
    "evidenceState" "EvidenceState" NOT NULL,
    "captureSessionId" TEXT,
    "contributorId" TEXT,
    "note" TEXT,
    "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededById" TEXT,

    CONSTRAINT "Provenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "scope" TEXT,
    "boundaries" TEXT,
    "objectives" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "trigger" TEXT,
    "inputs" TEXT,
    "outputs" TEXT,
    "outcome" TEXT,
    "businessValue" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessStep" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "stage" TEXT,
    "subProcess" TEXT,
    "activity" TEXT NOT NULL,
    "entryTrigger" TEXT,
    "exitCriteria" TEXT,
    "dataConsumed" TEXT,
    "dataProduced" TEXT,
    "isEscalationPoint" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "responsibilities" TEXT,
    "goals" TEXT,
    "decisionAuthority" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepPersona" (
    "stepId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,

    CONSTRAINT "StepPersona_pkey" PRIMARY KEY ("stepId","personaId")
);

-- CreateTable
CREATE TABLE "SystemApplication" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SystemType",
    "dataHeld" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isWrite" BOOLEAN NOT NULL DEFAULT false,
    "apiAvailability" "ApiAvailability" NOT NULL DEFAULT 'UNKNOWN',
    "likelyAccessMethod" "AccessMethod",
    "dataFormat" "DataFormat",
    "ownerId" TEXT,
    "accessConstraints" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepSystem" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "direction" "StepSystemDirection" NOT NULL,

    CONSTRAINT "StepSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "DataFormat",
    "structure" TEXT,
    "ownership" TEXT,
    "entryPoint" TEXT,
    "exitPoint" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "contents" TEXT,
    "format" TEXT,
    "location" TEXT,
    "updateFrequency" TEXT,
    "retrievalReadiness" "RetrievalReadiness",
    "ownerId" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepKnowledgeSource" (
    "stepId" TEXT NOT NULL,
    "knowledgeSourceId" TEXT NOT NULL,

    CONSTRAINT "StepKnowledgeSource_pkey" PRIMARY KEY ("stepId","knowledgeSourceId")
);

-- CreateTable
CREATE TABLE "PainPoint" (
    "id" TEXT NOT NULL,
    "refCode" TEXT NOT NULL,
    "processId" TEXT,
    "stepId" TEXT,
    "description" TEXT NOT NULL,
    "operationalImpact" TEXT,
    "rootCause" "RootCauseType",
    "frequency" TEXT,
    "businessImpact" TEXT,
    "priority" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PainPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PainPointStakeholder" (
    "painPointId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,

    CONSTRAINT "PainPointStakeholder_pkey" PRIMARY KEY ("painPointId","personaId")
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" TEXT NOT NULL,
    "processId" TEXT,
    "stepId" TEXT,
    "scenario" TEXT NOT NULL,
    "frequency" TEXT,
    "currentResolutionMethod" TEXT,
    "resolvedBy" TEXT,
    "typicalResolutionTime" TEXT,
    "automationSuitability" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "processId" TEXT,
    "stepId" TEXT,
    "category" TEXT,
    "currentValue" TEXT,
    "proportionManual" TEXT,
    "target" TEXT,
    "potentialImpact" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "proposedSolution" TEXT,
    "benefits" TEXT,
    "risks" TEXT,
    "dependencies" TEXT,
    "transformationLens" "TransformationLens",
    "solutionClass" "SolutionClass",
    "solutionFitReasoning" TEXT,
    "alternativesConsidered" TEXT,
    "valueBand" "Band" NOT NULL DEFAULT 'UNKNOWN',
    "complexityBand" "Band" NOT NULL DEFAULT 'UNKNOWN',
    "confidenceBand" "Band" NOT NULL DEFAULT 'UNKNOWN',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityPainPoint" (
    "opportunityId" TEXT NOT NULL,
    "painPointId" TEXT NOT NULL,

    CONSTRAINT "OpportunityPainPoint_pkey" PRIMARY KEY ("opportunityId","painPointId")
);

-- CreateIndex
CREATE INDEX "CaptureSession_engagementId_idx" ON "CaptureSession"("engagementId");

-- CreateIndex
CREATE INDEX "Contributor_engagementId_idx" ON "Contributor"("engagementId");

-- CreateIndex
CREATE INDEX "Provenance_entityKind_entityId_idx" ON "Provenance"("entityKind", "entityId");

-- CreateIndex
CREATE INDEX "Provenance_entityKind_entityId_attribute_idx" ON "Provenance"("entityKind", "entityId", "attribute");

-- CreateIndex
CREATE INDEX "Process_engagementId_idx" ON "Process"("engagementId");

-- CreateIndex
CREATE INDEX "ProcessStep_processId_idx" ON "ProcessStep"("processId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessStep_processId_order_key" ON "ProcessStep"("processId", "order");

-- CreateIndex
CREATE INDEX "Persona_engagementId_idx" ON "Persona"("engagementId");

-- CreateIndex
CREATE INDEX "SystemApplication_engagementId_idx" ON "SystemApplication"("engagementId");

-- CreateIndex
CREATE INDEX "StepSystem_systemId_idx" ON "StepSystem"("systemId");

-- CreateIndex
CREATE UNIQUE INDEX "StepSystem_stepId_systemId_direction_key" ON "StepSystem"("stepId", "systemId", "direction");

-- CreateIndex
CREATE INDEX "DataSource_engagementId_idx" ON "DataSource"("engagementId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_engagementId_idx" ON "KnowledgeSource"("engagementId");

-- CreateIndex
CREATE INDEX "PainPoint_processId_idx" ON "PainPoint"("processId");

-- CreateIndex
CREATE INDEX "PainPoint_stepId_idx" ON "PainPoint"("stepId");

-- CreateIndex
CREATE INDEX "Exception_processId_idx" ON "Exception"("processId");

-- CreateIndex
CREATE INDEX "Exception_stepId_idx" ON "Exception"("stepId");

-- CreateIndex
CREATE INDEX "Metric_processId_idx" ON "Metric"("processId");

-- CreateIndex
CREATE INDEX "Metric_stepId_idx" ON "Metric"("stepId");

-- AddForeignKey
ALTER TABLE "CaptureSession" ADD CONSTRAINT "CaptureSession_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureSession" ADD CONSTRAINT "CaptureSession_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contributor" ADD CONSTRAINT "Contributor_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provenance" ADD CONSTRAINT "Provenance_captureSessionId_fkey" FOREIGN KEY ("captureSessionId") REFERENCES "CaptureSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provenance" ADD CONSTRAINT "Provenance_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepPersona" ADD CONSTRAINT "StepPersona_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepPersona" ADD CONSTRAINT "StepPersona_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemApplication" ADD CONSTRAINT "SystemApplication_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemApplication" ADD CONSTRAINT "SystemApplication_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepSystem" ADD CONSTRAINT "StepSystem_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepSystem" ADD CONSTRAINT "StepSystem_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "SystemApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepKnowledgeSource" ADD CONSTRAINT "StepKnowledgeSource_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepKnowledgeSource" ADD CONSTRAINT "StepKnowledgeSource_knowledgeSourceId_fkey" FOREIGN KEY ("knowledgeSourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PainPoint" ADD CONSTRAINT "PainPoint_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PainPoint" ADD CONSTRAINT "PainPoint_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProcessStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PainPointStakeholder" ADD CONSTRAINT "PainPointStakeholder_painPointId_fkey" FOREIGN KEY ("painPointId") REFERENCES "PainPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProcessStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProcessStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityPainPoint" ADD CONSTRAINT "OpportunityPainPoint_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityPainPoint" ADD CONSTRAINT "OpportunityPainPoint_painPointId_fkey" FOREIGN KEY ("painPointId") REFERENCES "PainPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
