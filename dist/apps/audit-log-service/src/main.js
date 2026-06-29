"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PORT = void 0;
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const observability_1 = require("../../../libs/observability/src");
const app_module_1 = require("./app.module");
exports.DEFAULT_PORT = 3007;
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { bufferLogs: true });
    const logger = app.get(observability_1.StructuredLogger);
    app.useLogger(logger);
    app.enableShutdownHooks();
    swagger_1.SwaggerModule.setup('docs', app, swagger_1.SwaggerModule.createDocument(app, new swagger_1.DocumentBuilder()
        .setTitle('Audit Log Service')
        .setDescription('Append-only, hash-chained evidence. Single writer, single replica.')
        .setVersion('0.1.0')
        .build()));
    const port = Number(process.env.PORT ?? exports.DEFAULT_PORT);
    await app.listen(port);
    logger.log(`${app_module_1.SERVICE} listening on port ${port}`, 'bootstrap');
}
void bootstrap();
//# sourceMappingURL=main.js.map