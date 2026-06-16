import dotenv from "dotenv";
import { createApp } from "./http/app";

dotenv.config();

async function bootstrap() {
  const app = createApp();
  const port = Number(process.env.PORT ?? 3333);
  const defaultHost = process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0";
  const host = process.env.HOST ?? defaultHost;
  await app.listen({ port, host });
  // eslint-disable-next-line no-console
  console.log(`API online em http://${host}:${port}`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
