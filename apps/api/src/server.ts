import "dotenv/config";
import { createApp } from "./app.js";
import { PrismaEventRepository } from "./prisma-event-repository.js";

const port = Number(process.env.PORT ?? 49828);
const app = createApp({ repository: new PrismaEventRepository() });

app.listen(port, () => {
  console.log(`Sarge API listening on http://localhost:${port}`);
});
