"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const task_prisma_service_1 = require("../prisma/task-prisma.service");
const VALID_STATUSES = ['CREATED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED', 'BLOCKED'];
let TasksService = class TasksService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createTask(data) {
        const task = await this.prisma.task.create({
            data: {
                title: data.title,
                description: data.description || null,
                creator_id: data.creator_id,
                assignee_id: data.assignee_id || null,
                parent_task_id: data.parent_task_id || null,
                deadline: data.deadline || null,
                status: 'CREATED',
            },
        });
        await this.prisma.taskParticipant.create({
            data: {
                task_id: task.id,
                user_id: data.creator_id,
                role: 'CREATOR',
            },
        });
        return this.toDto(task);
    }
    async getTask(id) {
        const task = await this.prisma.task.findUnique({ where: { id } });
        if (!task)
            throw new common_1.NotFoundException('Task not found');
        return this.toDto(task);
    }
    async listTasks(filters) {
        const tasks = await this.prisma.task.findMany({ where: filters });
        return tasks.map((t) => this.toDto(t));
    }
    async updateTaskStatus(id, to_status, changed_by, reason) {
        if (!VALID_STATUSES.includes(to_status)) {
            throw new common_1.BadRequestException(`Invalid status: ${to_status}`);
        }
        const task = await this.prisma.task.findUnique({ where: { id } });
        if (!task)
            throw new common_1.NotFoundException('Task not found');
        const updated = await this.prisma.task.update({
            where: { id },
            data: { status: to_status, previous_status: task.status },
        });
        await this.prisma.taskStatusHistory.create({
            data: {
                task_id: id,
                from_status: task.status,
                to_status,
                changed_by,
                reason: reason || null,
            },
        });
        await this.prisma.taskActivity.create({
            data: {
                task_id: id,
                activity_type: 'STATUS_CHANGE',
                actor_id: changed_by,
                summary: `Status changed from ${task.status} to ${to_status}`,
                metadata: { from_status: task.status, to_status, reason },
            },
        });
        return this.toDto(updated);
    }
    async assignTask(id, assignee_id, assigned_by) {
        const task = await this.prisma.task.findUnique({ where: { id } });
        if (!task)
            throw new common_1.NotFoundException('Task not found');
        const updated = await this.prisma.task.update({
            where: { id },
            data: { assignee_id },
        });
        await this.prisma.taskParticipant.upsert({
            where: { task_id_user_id: { task_id: id, user_id: assignee_id } },
            update: {},
            create: {
                task_id: id,
                user_id: assignee_id,
                role: 'ASSIGNEE',
            },
        });
        await this.prisma.taskActivity.create({
            data: {
                task_id: id,
                activity_type: 'ASSIGNMENT',
                actor_id: assigned_by,
                summary: `Task assigned to ${assignee_id}`,
            },
        });
        return this.toDto(updated);
    }
    async blockTask(id, blocked_reason, blocked_by) {
        const task = await this.prisma.task.findUnique({ where: { id } });
        if (!task)
            throw new common_1.NotFoundException('Task not found');
        const updated = await this.prisma.task.update({
            where: { id },
            data: { blocked: true, blocked_reason, status: 'BLOCKED' },
        });
        await this.prisma.taskActivity.create({
            data: {
                task_id: id,
                activity_type: 'BLOCKED',
                actor_id: blocked_by,
                summary: `Task blocked: ${blocked_reason}`,
            },
        });
        return this.toDto(updated);
    }
    async unblockTask(id, unblocked_by) {
        const task = await this.prisma.task.findUnique({ where: { id } });
        if (!task)
            throw new common_1.NotFoundException('Task not found');
        if (!task.blocked)
            throw new common_1.BadRequestException('Task is not blocked');
        const updated = await this.prisma.task.update({
            where: { id },
            data: { blocked: false, blocked_reason: null },
        });
        await this.prisma.taskActivity.create({
            data: {
                task_id: id,
                activity_type: 'UNBLOCKED',
                actor_id: unblocked_by,
                summary: 'Task unblocked',
            },
        });
        return this.toDto(updated);
    }
    async addParticipant(task_id, user_id, role = 'PARTICIPANT') {
        const task = await this.prisma.task.findUnique({ where: { id: task_id } });
        if (!task)
            throw new common_1.NotFoundException('Task not found');
        try {
            const participant = await this.prisma.taskParticipant.create({
                data: { task_id, user_id, role },
            });
            return this.participantToDto(participant);
        }
        catch {
            throw new common_1.ConflictException('User is already a participant');
        }
    }
    async getParticipants(task_id) {
        const participants = await this.prisma.taskParticipant.findMany({ where: { task_id } });
        return participants.map((p) => this.participantToDto(p));
    }
    async addComment(task_id, author_id, content) {
        const task = await this.prisma.task.findUnique({ where: { id: task_id } });
        if (!task)
            throw new common_1.NotFoundException('Task not found');
        const comment = await this.prisma.taskComment.create({
            data: { task_id, author_id, content },
        });
        await this.prisma.taskActivity.create({
            data: {
                task_id,
                activity_type: 'COMMENT',
                actor_id: author_id,
                summary: `Comment added: ${content.substring(0, 50)}`,
            },
        });
        return { id: comment.id, created_at: comment.created_at.toISOString() };
    }
    async submitTaskResult(task_id, author_id, content) {
        const task = await this.prisma.task.findUnique({ where: { id: task_id } });
        if (!task)
            throw new common_1.NotFoundException('Task not found');
        const submission = await this.prisma.taskSubmission.create({
            data: {
                task_id,
                author_id,
                content,
                status: 'PENDING',
            },
        });
        await this.prisma.taskActivity.create({
            data: {
                task_id,
                activity_type: 'SUBMISSION',
                actor_id: author_id,
                summary: 'Task result submitted for review',
            },
        });
        return {
            id: submission.id,
            status: submission.status,
            created_at: submission.created_at.toISOString(),
        };
    }
    async reviewSubmission(submission_id, reviewer_id, approved, comment) {
        const submission = await this.prisma.taskSubmission.findUnique({ where: { id: submission_id } });
        if (!submission)
            throw new common_1.NotFoundException('Submission not found');
        const newStatus = approved ? 'APPROVED' : 'REJECTED';
        const updated = await this.prisma.taskSubmission.update({
            where: { id: submission_id },
            data: {
                status: newStatus,
                reviewer_id,
                review_comment: comment || null,
                reviewed_at: new Date(),
            },
        });
        await this.prisma.taskActivity.create({
            data: {
                task_id: submission.task_id,
                activity_type: 'REVIEW_DECISION',
                actor_id: reviewer_id,
                summary: `Submission ${approved ? 'approved' : 'rejected'}`,
            },
        });
        if (approved) {
            await this.prisma.task.update({
                where: { id: submission.task_id },
                data: { result: submission.content },
            });
        }
        return { id: updated.id, status: updated.status };
    }
    async getTaskActivity(task_id) {
        const activities = await this.prisma.taskActivity.findMany({
            where: { task_id },
            orderBy: { created_at: 'asc' },
        });
        return activities.map((a) => ({
            id: a.id,
            activity_type: a.activity_type,
            actor_id: a.actor_id,
            summary: a.summary,
            created_at: a.created_at.toISOString(),
        }));
    }
    toDto(task) {
        return {
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            creator_id: task.creator_id,
            assignee_id: task.assignee_id,
            parent_task_id: task.parent_task_id,
            deadline: task.deadline?.toISOString() ?? null,
            blocked: task.blocked,
            blocked_reason: task.blocked_reason,
            result: task.result,
            created_at: task.created_at.toISOString(),
            updated_at: task.updated_at.toISOString(),
        };
    }
    participantToDto(p) {
        return {
            id: p.id,
            task_id: p.task_id,
            user_id: p.user_id,
            role: p.role,
            added_at: p.added_at.toISOString(),
        };
    }
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [task_prisma_service_1.TaskPrismaService])
], TasksService);
//# sourceMappingURL=tasks.service.js.map