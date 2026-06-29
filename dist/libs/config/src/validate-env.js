"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvironmentValidationError = void 0;
exports.validateEnv = validateEnv;
class EnvironmentValidationError extends Error {
    serviceName;
    issues;
    constructor(serviceName, issues) {
        super(`Invalid environment for ${serviceName}:\n` +
            issues.map((issue) => `  - ${issue}`).join('\n'));
        this.serviceName = serviceName;
        this.issues = issues;
        this.name = 'EnvironmentValidationError';
    }
}
exports.EnvironmentValidationError = EnvironmentValidationError;
function validateEnv(serviceName, schema, source = process.env) {
    const result = schema.safeParse(source);
    if (!result.success) {
        const issues = result.error.issues.map((issue) => {
            const path = issue.path.join('.') || '(root)';
            return `${path}: ${issue.message}`;
        });
        throw new EnvironmentValidationError(serviceName, issues);
    }
    return result.data;
}
//# sourceMappingURL=validate-env.js.map