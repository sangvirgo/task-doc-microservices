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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const auth_context_1 = require("../../../../libs/auth-context/src");
const contracts_1 = require("../../../../libs/contracts/src");
const messaging_1 = require("../../../../libs/messaging/src");
const tasks_service_1 = require("./tasks.service");
const permission_client_1 = require("../permissions/permission.client");
const audit_client_1 = require("../audit/audit.client");
const createTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    assignee_id: zod_1.z.string().uuid().optional(),
    parent_task_id: zod_1.z.string().uuid().optional(),
    deadline: zod_1.z.string().datetime().optional(),
});
const updateStatusSchema = zod_1.z.object({
    status: zod_1.z.string().min(1),
    reason: zod_1.z.string().optional(),
});
const assignSchema = zod_1.z.object({
    assignee_id: zod_1.z.string().uuid(),
});
const blockSchema = zod_1.z.object({
    reason: zod_1.z.string().min(1),
});
const commentSchema = zod_1.z.object({
    content: zod_1.z.string().min(1),
});
const submissionSchema = zod_1.z.object({
    content: zod_1.z.string().min(1),
});
const reviewSchema = zod_1.z.object({
    approved: zod_1.z.boolean(),
    comment: zod_1.z.string().optional(),
});
let TasksController = class TasksController {
    tasksService;
    permissionClient;
    auditClient;
    eventPublisher;
    constructor(tasksService, permissionClient, auditClient, eventPublisher) {
        this.tasksService = tasksService;
        this.permissionClient = permissionClient;
        this.auditClient = auditClient;
        this.eventPublisher = eventPublisher;
    }
    async listTasks(creator_id, assignee_id, status, parent_task_id) {
        return this.tasksService.listTasks({
            creator_id,
            assignee_id,
            status,
            parent_task_id,
        });
    }
    async getTask(taskId, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const permCheck = await this.permissionClient.check({
            actor_id: user.userId,
            actor_role: user.role,
            resource_type: 'TASK',
            resource_id: taskId,
            action: 'TASK_PARTICIPATE',
        });
        if (!permCheck.allowed) {
            await this.auditClient.record({
                event_type: 'TASK_ACCESS_DENIED',
                actor_id: user.userId,
                resource_type: 'TASK',
                resource_id: taskId,
                payload: { action: 'TASK_PARTICIPATE', reason_code: permCheck.reason_code },
            });
            throw new common_1.ForbiddenException(`Cannot access task: ${permCheck.reason_code}`);
        }
        return this.tasksService.getTask(taskId);
    }
    async createTask(body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = createTaskSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.tasksService
            .createTask({
            title: parsed.data.title,
            description: parsed.data.description,
            creator_id: user.userId,
            assignee_id: parsed.data.assignee_id,
            parent_task_id: parsed.data.parent_task_id,
            deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
        })
            .then(async (task) => {
            await this.auditClient.record({
                event_type: 'TASK_CREATED',
                actor_id: user.userId,
                resource_type: 'TASK',
                resource_id: task.id,
                payload: { title: task.title, assignee_id: task.assignee_id },
            });
            void this.eventPublisher.publish((0, contracts_1.buildEventEnvelope)({
                event_id: (0, crypto_1.randomUUID)(),
                event_type: 'task.created',
                occurred_at: new Date().toISOString(),
                producer: 'task-management-service',
                correlation_id: (0, crypto_1.randomUUID)(),
                actor_id: user.userId,
                resource_type: 'TASK',
                resource_id: task.id,
                payload: { title: task.title, assignee_id: task.assignee_id },
            }));
            return task;
        });
    }
    async updateStatus(taskId, body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = updateStatusSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        const permCheck = await this.permissionClient.check({
            actor_id: user.userId,
            actor_role: user.role,
            resource_type: 'TASK',
            resource_id: taskId,
            action: 'TASK_UPDATE',
        });
        if (!permCheck.allowed) {
            throw new common_1.ForbiddenException(`Cannot modify task: ${permCheck.reason_code}`);
        }
        return this.tasksService.updateTaskStatus(taskId, parsed.data.status, user.userId, parsed.data.reason);
    }
    async assignTask(taskId, body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = assignSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        const permCheck = await this.permissionClient.check({
            actor_id: user.userId,
            actor_role: user.role,
            resource_type: 'TASK',
            resource_id: taskId,
            action: 'TASK_ASSIGN',
        });
        if (!permCheck.allowed) {
            throw new common_1.ForbiddenException(`Cannot modify task: ${permCheck.reason_code}`);
        }
        return this.tasksService.assignTask(taskId, parsed.data.assignee_id, user.userId);
    }
    async blockTask(taskId, body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = blockSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.tasksService.blockTask(taskId, parsed.data.reason, user.userId);
    }
    async unblockTask(taskId, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        return this.tasksService.unblockTask(taskId, user.userId);
    }
    async addParticipant(taskId, body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = zod_1.z
            .object({ user_id: zod_1.z.string().uuid(), role: zod_1.z.string().optional() })
            .safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.tasksService.addParticipant(taskId, parsed.data.user_id, parsed.data.role);
    }
    async getParticipants(taskId) {
        return this.tasksService.getParticipants(taskId);
    }
    async addComment(taskId, body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = commentSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.tasksService.addComment(taskId, user.userId, parsed.data.content);
    }
    async submitResult(taskId, body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = submissionSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.tasksService.submitTaskResult(taskId, user.userId, parsed.data.content);
    }
    async reviewSubmission(submissionId, body, user) {
        if (!user)
            throw new common_1.ForbiddenException('Authentication required');
        const parsed = reviewSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.issues);
        }
        return this.tasksService.reviewSubmission(submissionId, user.userId, parsed.data.approved, parsed.data.comment);
    }
    async getActivity(taskId) {
        return this.tasksService.getTaskActivity(taskId);
    }
};
exports.TasksController = TasksController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List tasks with filters' }),
    __param(0, (0, common_1.Query)('creator_id')),
    __param(1, (0, common_1.Query)('assignee_id')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('parent_task_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "listTasks", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a task by ID (permission-checked)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getTask", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new task' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "createTask", null);
__decorate([
    (0, common_1.Post)(':id/status'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Update task status' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)(':id/assign'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Assign a task to a user' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "assignTask", null);
__decorate([
    (0, common_1.Post)(':id/block'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Block a task' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "blockTask", null);
__decorate([
    (0, common_1.Post)(':id/unblock'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Unblock a task' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "unblockTask", null);
__decorate([
    (0, common_1.Post)(':id/participants'),
    (0, swagger_1.ApiOperation)({ summary: 'Add a participant to a task' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "addParticipant", null);
__decorate([
    (0, common_1.Get)(':id/participants'),
    (0, swagger_1.ApiOperation)({ summary: 'Get task participants' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getParticipants", null);
__decorate([
    (0, common_1.Post)(':id/comments'),
    (0, swagger_1.ApiOperation)({ summary: 'Add a comment to a task' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "addComment", null);
__decorate([
    (0, common_1.Post)(':id/submit'),
    (0, swagger_1.ApiOperation)({ summary: 'Submit task result for review' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "submitResult", null);
__decorate([
    (0, common_1.Post)('submissions/:submission_id/review'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Review a task submission' }),
    __param(0, (0, common_1.Param)('submission_id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, auth_context_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, void 0, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "reviewSubmission", null);
__decorate([
    (0, common_1.Get)(':id/activity'),
    (0, swagger_1.ApiOperation)({ summary: 'Get task activity log' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getActivity", null);
exports.TasksController = TasksController = __decorate([
    (0, swagger_1.ApiTags)('tasks'),
    (0, common_1.Controller)('tasks'),
    __param(3, (0, common_1.Inject)(messaging_1.EVENT_PUBLISHER)),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        permission_client_1.PermissionClient,
        audit_client_1.AuditClient, Object])
], TasksController);
//# sourceMappingURL=tasks.controller.js.map