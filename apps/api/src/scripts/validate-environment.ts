import { parseApiEnvironment } from "@alexa-control/config";

const environment = parseApiEnvironment(process.env);
process.stdout.write(
  `${JSON.stringify({
    valid: true,
    deploymentMode: environment.DEPLOYMENT_MODE,
    host: environment.API_HOST,
    port: environment.PORT ?? environment.API_PORT,
    persistence: environment.STORE_MODE,
    redisConfigured: Boolean(
      (environment.REDIS_URL && environment.REDIS_TOKEN) ||
      (environment.REDIS_HOST && environment.REDIS_PASSWORD),
    ),
    publicBaseUrlConfigured: Boolean(environment.PUBLIC_BASE_URL),
  })}\n`,
);
