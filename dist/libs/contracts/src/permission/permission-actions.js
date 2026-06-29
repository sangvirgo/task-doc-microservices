"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_FORBIDDEN_ACTIONS = exports.PERMISSION_ACTIONS = exports.PermissionAction = exports.ResourceType = void 0;
exports.isPermissionAction = isPermissionAction;
exports.isAdminForbiddenAction = isAdminForbiddenAction;
exports.ResourceType = {
    DOCUMENT: 'DOCUMENT',
    TASK: 'TASK',
    TASK_COMMENT: 'TASK_COMMENT',
    TRANSFER_PACKAGE: 'TRANSFER_PACKAGE',
};
exports.PermissionAction = {
    PREVIEW: 'PREVIEW',
    DOWNLOAD: 'DOWNLOAD',
    UPDATE: 'UPDATE',
    SHARE: 'SHARE',
    TRANSFER: 'TRANSFER',
    DISPOSE: 'DISPOSE',
    TASK_PARTICIPATE: 'TASK_PARTICIPATE',
    COMMENT_LIST: 'COMMENT_LIST',
    COMMENT_CREATE: 'COMMENT_CREATE',
    ARCHIVE_SUBMIT: 'ARCHIVE_SUBMIT',
    ARCHIVE_RECEIVE: 'ARCHIVE_RECEIVE',
    ARCHIVE_DECIDE: 'ARCHIVE_DECIDE',
    DISPOSAL_APPROVE: 'DISPOSAL_APPROVE',
};
exports.PERMISSION_ACTIONS = Object.values(exports.PermissionAction);
exports.ADMIN_FORBIDDEN_ACTIONS = new Set([
    exports.PermissionAction.TASK_PARTICIPATE,
    exports.PermissionAction.COMMENT_LIST,
    exports.PermissionAction.COMMENT_CREATE,
    exports.PermissionAction.PREVIEW,
    exports.PermissionAction.DOWNLOAD,
    exports.PermissionAction.UPDATE,
    exports.PermissionAction.SHARE,
    exports.PermissionAction.TRANSFER,
    exports.PermissionAction.ARCHIVE_SUBMIT,
    exports.PermissionAction.ARCHIVE_RECEIVE,
    exports.PermissionAction.ARCHIVE_DECIDE,
    exports.PermissionAction.DISPOSAL_APPROVE,
    exports.PermissionAction.DISPOSE,
]);
function isPermissionAction(value) {
    return exports.PERMISSION_ACTIONS.includes(value);
}
function isAdminForbiddenAction(action) {
    return exports.ADMIN_FORBIDDEN_ACTIONS.has(action);
}
//# sourceMappingURL=permission-actions.js.map