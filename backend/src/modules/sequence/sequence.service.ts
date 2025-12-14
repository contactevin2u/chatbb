/**
 * Message Sequence Service
 *
 * Business logic for message sequences/flows
 */

import { MessageSequenceStatus, SequenceStepType } from '@prisma/client';
import { prisma } from '../../core/database/prisma';

export interface SequenceStepContent {
  text?: string;
  mediaUrl?: string;
  mediaFilename?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  delayMinutes?: number; // For DELAY type (legacy)
  delaySeconds?: number; // For DELAY type (preferred)
}

export interface CreateSequenceStepInput {
  order: number;
  type: SequenceStepType;
  content: SequenceStepContent;
}

export interface CreateSequenceInput {
  organizationId: string;
  name: string;
  shortcut?: string;
  description?: string;
  triggerType?: string;
  triggerConfig?: any;
  steps: CreateSequenceStepInput[];
}

export interface UpdateSequenceInput {
  name?: string;
  shortcut?: string | null;
  description?: string;
  status?: MessageSequenceStatus;
  triggerType?: string;
  triggerConfig?: any;
}

export class SequenceService {
  /**
   * List all sequences for an organization
   */
  async listSequences(organizationId: string, status?: MessageSequenceStatus) {
    const where: any = { organizationId };
    if (status) {
      where.status = status;
    }

    const sequences = await prisma.messageSequence.findMany({
      where,
      include: {
        steps: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { executions: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return sequences;
  }

  /**
   * Search sequences by shortcut prefix (for autocomplete in slash-command)
   */
  async searchByShortcut(organizationId: string, prefix: string, limit = 5) {
    const sequences = await prisma.messageSequence.findMany({
      where: {
        organizationId,
        shortcut: { startsWith: prefix.toLowerCase(), mode: 'insensitive' },
        status: { in: ['ACTIVE', 'DRAFT'] }, // Only show active/draft sequences
      },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          take: 1, // Just get first step for preview
        },
      },
      orderBy: [{ usageCount: 'desc' }, { shortcut: 'asc' }],
      take: limit,
    });

    return sequences;
  }

  /**
   * Get a sequence by ID
   */
  async getSequence(id: string, organizationId: string) {
    const sequence = await prisma.messageSequence.findFirst({
      where: { id, organizationId },
      include: {
        steps: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { executions: true },
        },
      },
    });

    if (!sequence) {
      throw new Error('Sequence not found');
    }

    return sequence;
  }

  /**
   * Create a new sequence with steps
   */
  async createSequence(input: CreateSequenceInput) {
    const { organizationId, name, shortcut, description, triggerType, triggerConfig, steps } = input;

    // Check for duplicate shortcut if provided
    if (shortcut) {
      const existing = await prisma.messageSequence.findFirst({
        where: {
          organizationId,
          shortcut: { equals: shortcut.toLowerCase(), mode: 'insensitive' },
        },
      });
      if (existing) {
        throw new Error(`Shortcut "${shortcut}" already exists`);
      }
    }

    const sequence = await prisma.messageSequence.create({
      data: {
        organizationId,
        name,
        shortcut: shortcut?.toLowerCase() || null,
        description,
        triggerType: triggerType || 'manual',
        triggerConfig: triggerConfig as any,
        steps: {
          create: steps.map((step) => ({
            order: step.order,
            type: step.type,
            content: step.content as any,
          })),
        },
      },
      include: {
        steps: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return sequence;
  }

  /**
   * Update a sequence
   */
  async updateSequence(id: string, organizationId: string, input: UpdateSequenceInput) {
    const sequence = await prisma.messageSequence.findFirst({
      where: { id, organizationId },
    });

    if (!sequence) {
      throw new Error('Sequence not found');
    }

    // Check for duplicate shortcut if changing
    if (input.shortcut !== undefined && input.shortcut !== null) {
      const shortcutLower = input.shortcut.toLowerCase();
      if (shortcutLower !== sequence.shortcut) {
        const existing = await prisma.messageSequence.findFirst({
          where: {
            organizationId,
            shortcut: { equals: shortcutLower, mode: 'insensitive' },
            id: { not: id },
          },
        });
        if (existing) {
          throw new Error(`Shortcut "${input.shortcut}" already exists`);
        }
      }
    }

    const updated = await prisma.messageSequence.update({
      where: { id },
      data: {
        name: input.name,
        shortcut: input.shortcut === null ? null : input.shortcut?.toLowerCase(),
        description: input.description,
        status: input.status,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig as any,
      },
      include: {
        steps: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return updated;
  }

  /**
   * Delete a sequence
   */
  async deleteSequence(id: string, organizationId: string) {
    const sequence = await prisma.messageSequence.findFirst({
      where: { id, organizationId },
    });

    if (!sequence) {
      throw new Error('Sequence not found');
    }

    // Stop any running executions
    await prisma.sequenceExecution.updateMany({
      where: { sequenceId: id, status: 'running' },
      data: { status: 'stopped' },
    });

    await prisma.messageSequence.delete({ where: { id } });
  }

  /**
   * Add a step to a sequence
   */
  async addStep(sequenceId: string, organizationId: string, input: CreateSequenceStepInput) {
    const sequence = await prisma.messageSequence.findFirst({
      where: { id: sequenceId, organizationId },
    });

    if (!sequence) {
      throw new Error('Sequence not found');
    }

    const step = await prisma.messageSequenceStep.create({
      data: {
        sequenceId,
        order: input.order,
        type: input.type,
        content: input.content as any,
      },
    });

    return step;
  }

  /**
   * Update a step
   */
  async updateStep(
    stepId: string,
    organizationId: string,
    input: Partial<CreateSequenceStepInput>
  ) {
    const step = await prisma.messageSequenceStep.findFirst({
      where: { id: stepId },
      include: {
        sequence: { select: { organizationId: true } },
      },
    });

    if (!step || step.sequence.organizationId !== organizationId) {
      throw new Error('Step not found');
    }

    const updated = await prisma.messageSequenceStep.update({
      where: { id: stepId },
      data: {
        order: input.order,
        type: input.type,
        content: input.content as any,
      },
    });

    return updated;
  }

  /**
   * Delete a step
   */
  async deleteStep(stepId: string, organizationId: string) {
    const step = await prisma.messageSequenceStep.findFirst({
      where: { id: stepId },
      include: {
        sequence: { select: { organizationId: true } },
      },
    });

    if (!step || step.sequence.organizationId !== organizationId) {
      throw new Error('Step not found');
    }

    await prisma.messageSequenceStep.delete({ where: { id: stepId } });
  }

  /**
   * Reorder steps in a sequence
   */
  async reorderSteps(sequenceId: string, organizationId: string, stepIds: string[]) {
    const sequence = await prisma.messageSequence.findFirst({
      where: { id: sequenceId, organizationId },
    });

    if (!sequence) {
      throw new Error('Sequence not found');
    }

    // Update order for each step
    await Promise.all(
      stepIds.map((stepId, index) =>
        prisma.messageSequenceStep.update({
          where: { id: stepId },
          data: { order: index },
        })
      )
    );

    return this.getSequence(sequenceId, organizationId);
  }

  /**
   * Start a sequence execution for a conversation
   * If the same sequence is already running, it will be stopped and restarted
   *
   * @param scheduledAt - Optional future time to START the sequence. If provided and in future,
   *                      sequence will be created with status "scheduled" and processed by worker
   *                      when the scheduled time arrives. DELAY steps within the sequence still work
   *                      normally once execution starts.
   */
  async startExecution(
    sequenceId: string,
    conversationId: string,
    organizationId: string,
    scheduledAt?: Date
  ) {
    const sequence = await prisma.messageSequence.findFirst({
      where: { id: sequenceId, organizationId, status: MessageSequenceStatus.ACTIVE },
      include: {
        steps: { orderBy: { order: 'asc' }, take: 1 },
      },
    });

    if (!sequence) {
      throw new Error('Sequence not found or not active');
    }

    // Stop any existing execution of the SAME sequence for this conversation (restart behavior)
    await prisma.sequenceExecution.updateMany({
      where: { sequenceId, conversationId, status: { in: ['running', 'scheduled'] } },
      data: { status: 'stopped' },
    });

    // Determine if this is a scheduled execution or immediate
    const isScheduled = scheduledAt && scheduledAt > new Date();

    // Calculate next step time based on first step (only for immediate execution)
    let nextStepAt: Date | null = isScheduled ? null : new Date();
    if (!isScheduled) {
      const firstStep = sequence.steps[0];
      if (firstStep?.type === SequenceStepType.DELAY) {
        const content = firstStep.content as any;
        nextStepAt = new Date(Date.now() + (content.delayMinutes || 1) * 60 * 1000);
      }
    }

    const execution = await prisma.sequenceExecution.create({
      data: {
        sequenceId,
        conversationId,
        currentStep: 0,
        status: isScheduled ? 'scheduled' : 'running',
        scheduledAt: isScheduled ? scheduledAt : null,
        nextStepAt,
      },
    });

    // Increment usage count
    await prisma.messageSequence.update({
      where: { id: sequenceId },
      data: { usageCount: { increment: 1 } },
    });

    return execution;
  }

  /**
   * Get scheduled sequence executions that are due to start
   * Used by worker to pick up and start scheduled sequences
   */
  async getScheduledExecutionsDue() {
    const now = new Date();

    const executions = await prisma.sequenceExecution.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: { lte: now },
      },
      include: {
        sequence: {
          include: {
            steps: { orderBy: { order: 'asc' } },
          },
        },
        conversation: {
          select: {
            id: true,
            channelId: true,
            contact: {
              select: { id: true, identifier: true },
            },
            channel: {
              select: { id: true, type: true, config: true },
            },
          },
        },
      },
      take: 100,
    });

    return executions;
  }

  /**
   * Mark a scheduled execution as running (when scheduled time arrives)
   */
  async startScheduledExecution(executionId: string) {
    const execution = await prisma.sequenceExecution.findUnique({
      where: { id: executionId },
      include: {
        sequence: {
          include: { steps: { orderBy: { order: 'asc' }, take: 1 } },
        },
      },
    });

    if (!execution || execution.status !== 'scheduled') {
      return null;
    }

    // Calculate next step time based on first step
    let nextStepAt: Date | null = new Date();
    const firstStep = execution.sequence.steps[0];
    if (firstStep?.type === SequenceStepType.DELAY) {
      const content = firstStep.content as any;
      nextStepAt = new Date(Date.now() + (content.delayMinutes || 1) * 60 * 1000);
    }

    const updated = await prisma.sequenceExecution.update({
      where: { id: executionId },
      data: {
        status: 'running',
        startedAt: new Date(),
        nextStepAt,
      },
    });

    return updated;
  }

  /**
   * Stop a sequence execution (works for both running and scheduled)
   */
  async stopExecution(executionId: string, organizationId: string) {
    const execution = await prisma.sequenceExecution.findFirst({
      where: { id: executionId },
      include: {
        sequence: { select: { organizationId: true } },
      },
    });

    if (!execution || execution.sequence.organizationId !== organizationId) {
      throw new Error('Execution not found');
    }

    if (execution.status !== 'running' && execution.status !== 'scheduled') {
      throw new Error('Execution is not running or scheduled');
    }

    await prisma.sequenceExecution.update({
      where: { id: executionId },
      data: { status: 'stopped' },
    });
  }

  /**
   * Get active executions for a conversation
   */
  async getConversationExecutions(conversationId: string, organizationId: string) {
    const executions = await prisma.sequenceExecution.findMany({
      where: {
        conversationId,
        sequence: { organizationId },
      },
      include: {
        sequence: {
          select: { id: true, name: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    return executions;
  }

  /**
   * Get pending executions that need to run their next step
   */
  async getPendingExecutions() {
    const now = new Date();

    const executions = await prisma.sequenceExecution.findMany({
      where: {
        status: 'running',
        nextStepAt: { lte: now },
      },
      include: {
        sequence: {
          include: {
            steps: { orderBy: { order: 'asc' } },
          },
        },
        conversation: {
          select: {
            id: true,
            channelId: true,
            contact: {
              select: { id: true, identifier: true },
            },
            channel: {
              select: { id: true, type: true, config: true },
            },
          },
        },
      },
      take: 100,
    });

    return executions;
  }

  /**
   * Advance execution to next step
   */
  async advanceExecution(executionId: string, success: boolean, errorMessage?: string) {
    const execution = await prisma.sequenceExecution.findFirst({
      where: { id: executionId },
      include: {
        sequence: {
          include: {
            steps: { orderBy: { order: 'asc' } },
          },
        },
      },
    });

    if (!execution) return;

    const nextStepIndex = execution.currentStep + 1;
    const nextStep = execution.sequence.steps[nextStepIndex];

    if (!nextStep) {
      // Sequence completed
      await prisma.sequenceExecution.update({
        where: { id: executionId },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });
      return;
    }

    // Calculate next step time
    let nextStepAt = new Date();
    if (nextStep.type === SequenceStepType.DELAY) {
      const content = nextStep.content as any;
      nextStepAt = new Date(Date.now() + (content.delayMinutes || 1) * 60 * 1000);
    }

    await prisma.sequenceExecution.update({
      where: { id: executionId },
      data: {
        currentStep: nextStepIndex,
        nextStepAt,
        ...(errorMessage && { errorMessage }),
      },
    });
  }
}

export const sequenceService = new SequenceService();
